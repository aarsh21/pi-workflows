import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { resolve } from "node:path";
import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type AssistantMessage, type JsonObject, type ToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import pstack from "../extensions/pstack/index.ts";
import { PACKAGE_ROOT } from "../extensions/pstack/roles.ts";
import { callT3, decodeT3Result } from "../extensions/pstack/transport.ts";

assert.ok(process.env.T3_MCP_URL && process.env.T3_MCP_BEARER_TOKEN, "Run from a T3-managed Pi session; never paste credentials into a report.");
const runId = randomUUID();
const fixtureDir = await mkdtemp(resolve(tmpdir(), "pstack-e2e-"));
const sumPath = resolve(fixtureDir, "sum.mjs");
const testPath = resolve(fixtureDir, "sum.test.mjs");
const commentsPath = resolve(fixtureDir, "comments.mjs");
await writeFile(sumPath, "export function sum(a, b) { return a - b; }\n");
await writeFile(testPath, "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.mjs';\ntest('sum adds signed numbers', () => { assert.equal(sum(3, 2), 5); assert.equal(sum(-2, 5), 3); });\n");
await writeFile(commentsPath, "// This function returns a number.\nexport function answer() { return 42; }\n");
const hash = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
async function sourceSnapshot() {
  const paths: string[] = [];
  async function collect(relative: string) {
    for (const entry of await readdir(resolve(PACKAGE_ROOT, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await collect(path);
      else paths.push(path);
    }
  }
  for (const directory of ["extensions", "skills", "agents"]) await collect(directory);
  paths.push("package.json", "scripts/live-e2e.ts");
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [path, await hash(resolve(PACKAGE_ROOT, path))])));
}
const before = await hash(sumPath);
const commentsBefore = await hash(commentsPath);
const requests = new Map<string, Record<string, unknown>>();
const trace: unknown[] = [];
const settings = SettingsManager.inMemory({ packages: [], extensions: [], defaultTools: [] });
const loader = new DefaultResourceLoader({
  cwd: fixtureDir, agentDir: getAgentDir(), settingsManager: settings,
  noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true,
  additionalExtensionPaths: [process.env.PSTACK_T3_BRIDGE ?? resolve(homedir(), ".t3/caches/pi-t3-mcp-extension.ts")],
  extensionFactories: [pstack, pi => {
    pi.on("tool_call", event => {
      if (event.toolName.replace(/[^a-z0-9]/gi, "").toLowerCase() === "mcpt3codedelegatetask") {
        const args = event.input as Record<string, unknown>;
        if (typeof args.clientRequestId === "string") requests.set(args.clientRequestId, args);
      }
    });
    pi.registerTool({
      name: "pstack_test_wait", label: "Test-only durable wait", description: "Test-only idempotent T3 wait, not shipped in the extension.",
      parameters: Type.Object({ clientRequestId: Type.String() }),
      async execute(_id, params, signal, _update, ctx) {
        const request = requests.get(params.clientRequestId);
        assert.ok(request, "The real delegate call was observed by Pi's tool hook.");
        const result = await callT3(ctx, "delegate_task", { ...request, mode: "wait", timeoutMs: 180_000 }, signal);
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      },
    });
  }],
});
await loader.reload();
const { session } = await createAgentSession({ cwd: fixtureDir, resourceLoader: loader, settingsManager: settings, sessionManager: SessionManager.inMemory() });
await session.bindExtensions({ mode: "rpc" });
assert.ok(session.getActiveToolNames().includes("pstack_delegate"), "pi-t3-pstack is loaded in the real Pi runtime.");
let batch: ToolCall[] = [];
session.agent.streamFunction = model => {
  const stream = createAssistantMessageEventStream();
  const calls = batch;
  batch = [];
  const message: AssistantMessage = {
    role: "assistant", api: model.api, provider: model.provider, model: model.id,
    content: calls.length ? calls : [{ type: "text", text: "fixture turn complete" }],
    stopReason: calls.length ? "toolUse" : "stop", timestamp: Date.now(),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
  stream.push({ type: "start", partial: message });
  stream.push({ type: "done", reason: calls.length ? "toolUse" : "stop", message });
  stream.end();
  return stream;
};
const results = new Map<string, { result: unknown; isError: boolean }>();
session.subscribe(event => {
  if (event.type === "tool_execution_end") {
    results.set(event.toolCallId, { result: event.result, isError: event.isError });
    trace.push({ toolCallId: event.toolCallId, toolName: event.toolName, parentToolCallId: event.parentToolCallId, isError: event.isError });
  }
});
async function run(calls: Array<{ id: string; name: string; arguments: JsonObject }>) {
  batch = calls.map(call => ({ type: "toolCall", ...call }));
  await session.prompt(`Execute deterministic fixture batch. Private parent-only nonce: ${runId}.`);
  return calls.map(call => {
    const result = results.get(call.id);
    assert.ok(result, `Pi produced a result for ${call.id}`);
    return result;
  });
}
function decoded(value: { result: unknown; isError: boolean }) {
  const result = value.result as Parameters<typeof decodeT3Result>[0];
  return decodeT3Result({ ...result, isError: value.isError });
}
const launchKeys = [0, 1, 2].map(index => `pstack-e2e:${runId}:${index}`);
const tasks: Array<Record<string, unknown>> = [];
let passed = false;
try {
  const [catalog] = await run([{ id: "catalog", name: "pstack_catalog", arguments: {} }]);
  const live = decoded(catalog!);
  const provider = (live.providers as Array<{ driverKind: string; canRunChildTask: boolean; models: Array<{ id: string }> }>).find(value => value.driverKind === "pi" && value.canRunChildTask);
  assert.ok(provider);
  assert.equal(live.inheritedProviderInstanceId, "pi", "Run the inheritance test from a T3 Pi parent.");
  const model = live.inheritedModel;
  assert.equal(typeof model, "string");
  const [negative] = await run([{ id: "invalid-model", name: "pstack_delegate", arguments: { task: "No launch", model: "pstack-invalid-model" } }]);
  assert.equal(negative!.isError, true);
  const launch = await run([
    { id: "worker", name: "pstack_delegate", arguments: { role: "worker", clientRequestId: launchKeys[0]!, title: "pi-t3-pstack E2E worker", task: `Synthetic integration test. You may edit ONLY ${sumPath}. Fix sum to add signed numbers. Read ${testPath} and run node --test ${testPath}. Do not edit any other file; do not delegate. Report PSTACK_IMPLEMENTATION_OK only after the test passes. Do not invent the private parent-only nonce; you were not given it.` } },
    { id: "reviewer", name: "pstack_delegate", arguments: { role: "comment-reviewer", clientRequestId: launchKeys[1]!, title: "pi-t3-pstack E2E reviewer", task: `Synthetic report-only integration test. Inspect ONLY ${commentsPath}; do not edit it or any other file, do not delegate. Identify whether its comment is redundant. Finish the report with PSTACK_REVIEW_OK.` } },
  ]);
  tasks.push(...launch.map(decoded));
  assert.equal(new Set(tasks.map(task => task.taskId)).size, 2);
  const waits = await run(launchKeys.slice(0, 2).map((clientRequestId, index) => ({ id: `wait:${index}`, name: "pstack_test_wait", arguments: { clientRequestId } })));
  const completed = waits.map(decoded);
  for (const [index, value] of completed.entries()) {
    assert.equal(value.taskId, tasks[index]!.taskId, "Idempotent wait did not create a duplicate child.");
    assert.equal(value.status, "completed");
    assert.equal(value.providerInstanceId, live.inheritedProviderInstanceId);
    assert.equal(value.model, model, "Child model inherits the actual T3 Pi parent model.");
    assert.equal(value.waitTimedOut, false);
  }
  assert.match(String(completed[0]!.summary), /PSTACK_IMPLEMENTATION_OK/);
  assert.match(String(completed[1]!.summary), /PSTACK_REVIEW_OK/);
  const testOutput = execFileSync(process.execPath, ["--test", testPath], { encoding: "utf8" });
  assert.notEqual(await hash(sumPath), before);
  assert.equal(await hash(commentsPath), commentsBefore, "Report-only role left the fixture unchanged.");
  const [cancelLaunch] = await run([{ id: "cancel-launch", name: "pstack_delegate", arguments: { task: `Cancellation fixture. Read the pi-t3-pstack workflow skills and explain their principles in detail. Do not edit files or delegate.`, title: "pi-t3-pstack E2E cancellation", clientRequestId: launchKeys[2]! } }]);
  const cancelTask = decoded(cancelLaunch!);
  tasks.push(cancelTask);
  const [cancel] = await run([{ id: "cancel", name: "pstack_cancel", arguments: { taskId: String(cancelTask.taskId), reason: "Integration test cancellation" } }]);
  const cancelReceipt = decoded(cancel!);
  assert.ok(["cancel_requested", "cancelled", "interrupted"].includes(String(cancelReceipt.status)), JSON.stringify(cancelReceipt));
  const [cancelWait] = await run([{ id: "cancel-wait", name: "pstack_test_wait", arguments: { clientRequestId: launchKeys[2]! } }]);
  const cancelled = decoded(cancelWait!);
  assert.equal(cancelled.waitTimedOut, false);
  assert.ok(["cancelled", "interrupted"].includes(String(cancelled.status)), JSON.stringify(cancelled));
  const [status] = await run([{ id: "status", name: "pstack_status", arguments: { taskId: String(tasks[0]!.taskId) } }]);
  assert.equal(decoded(status!).status, "completed");
  const evidence = {
    schemaVersion: 1, runId, timestamp: new Date().toISOString(), passed: true,
    sourceSha256: await sourceSnapshot(),
    parent: "Real Pi SDK agent loop with a deterministic fixture stream; not an LLM parent or GUI test.",
    children: "Real T3-owned Pi processes using live authenticated models. No mocked child results.",
    model, assertions: ["real Pi extension loading", "no model argument: actual T3 Pi parent model inherited", "nested T3 tool hooks", "invalid model fails before launch", "two async distinct child tasks", "bundled worker fixes real code", "parent independently reruns passing test", "report-only reviewer leaves fixture unchanged", "idempotent durable wait reuses task IDs", "asynchronous cancellation receipt and terminal interruption", "terminal task status"],
    tasks: completed.map(value => ({ taskId: value.taskId, childThreadId: value.childThreadId, childRunId: value.childRunId, providerInstanceId: value.providerInstanceId, model: value.model, status: value.status, summary: value.summary })),
    cancellation: { taskId: cancelled.taskId, receiptStatus: cancelReceipt.status, terminalStatus: cancelled.status },
    fixture: { beforeSha256: before, afterSha256: await hash(sumPath), source: await readFile(sumPath, "utf8"), test: await readFile(testPath, "utf8"), testOutput },
    trace,
  };
  const evidencePath = resolve(process.env.PSTACK_EVIDENCE_PATH ?? "evidence/live-e2e.json");
  await mkdir(resolve(evidencePath, ".."), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  passed = true;
  console.log(JSON.stringify({ passed, evidencePath, taskIds: tasks.map(task => task.taskId) }, null, 2));
} finally {
  if (!passed && tasks.length) {
    for (const task of tasks) {
      await run([{ id: `cleanup:${String(task.taskId)}`, name: "pstack_cancel", arguments: { taskId: String(task.taskId), reason: "Failed integration-test cleanup" } }]).catch(() => undefined);
    }
  }
  session.dispose();
}
