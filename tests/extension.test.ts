import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import constellation, { externalWrite } from "../extensions/constellation/index.ts";
import { buildTask } from "../extensions/constellation/roles.ts";

function harness(responses: Record<string, unknown> = {}) {
  const tools = new Map<string, ToolDefinition>();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const api = {
    registerTool(tool: ToolDefinition) { tools.set(tool.name, tool); },
    registerCommand() {}, on() {},
  };
  constellation(api as unknown as ExtensionAPI);
  const ctx = {
    sessionManager: { getSessionId: () => "session:123" },
    tools: Object.keys(responses).map(name => ({ name })),
    executeTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { result: { content: [{ type: "text", text: JSON.stringify(responses[name]) }] }, isError: false };
    },
  } as unknown as ExtensionToolContext;
  return { tools, ctx, calls };
}
const capabilities = {
  inheritedProviderInstanceId: "pi", inheritedModel: "example/exact-model",
  providers: [{ providerInstanceId: "pi", driverKind: "pi", canRunChildTask: true, models: [{ id: "example/exact-model" }] }],
};

test("delegates with injected role, Pi target, async mode, and stable retry identity", async () => {
  const h = harness({ "mcp__t3-code__orchestrator_capabilities": capabilities, "mcp__t3-code__delegate_task": { taskId: "task:123", status: "running" } });
  const tool = h.tools.get("constellation_delegate")!;
  const result = await tool.execute("call:abc", { task: "Report exact marker", role: "comment-reviewer" }, undefined, undefined, h.ctx);
  assert.deepEqual(result.details, { taskId: "task:123", status: "running" });
  const args = h.calls[1]!.args;
  assert.deepEqual(args.target, { providerInstanceId: "pi", model: "example/exact-model" });
  assert.equal(args.mode, "async");
  assert.equal(args.role, "review");
  assert.equal(args.clientRequestId, "constellation:session:123:call:abc");
  assert.match(String(args.task), /Comment Sicko/);
  assert.match(String(args.task), /Report exact marker/);
  assert.doesNotMatch(String(args.task), /^---/);
  await tool.execute("call:abc", { task: "Report exact marker", clientRequestId: "retry-key" }, undefined, undefined, h.ctx);
  assert.equal(h.calls[3]!.args.clientRequestId, "retry-key");
});

test("fails closed outside T3 and never launches a detached fallback", async () => {
  const h = harness();
  await assert.rejects(h.tools.get("constellation_delegate")!.execute("1", { task: "Test" }, undefined, undefined, h.ctx), /Open Pi through T3/);
  assert.equal(h.calls.length, 0);
});

test("rejects missing task IDs and unavailable models without claiming success", async () => {
  const h = harness({ "mcp__t3-code__orchestrator_capabilities": capabilities, "mcp__t3-code__delegate_task": {} });
  const tool = h.tools.get("constellation_delegate")!;
  await assert.rejects(tool.execute("1", { task: "Test" }, undefined, undefined, h.ctx), /unconfirmed/);
  await assert.rejects(tool.execute("2", { task: "Test", model: "missing" }, undefined, undefined, h.ctx), /live catalog/);
  assert.equal(h.calls.filter(call => call.name.endsWith("delegate_task")).length, 1);
});

test("forwards task status and idempotent cancellation through Pi's nested tool pipeline", async () => {
  const h = harness({ "mcp__t3-code__task_status": { status: "completed", summary: "OK" }, "mcp__t3-code__task_cancel": { status: "cancelled" } });
  assert.deepEqual((await h.tools.get("constellation_status")!.execute("1", { taskId: "task:123" }, undefined, undefined, h.ctx)).details, { status: "completed", summary: "OK" });
  await h.tools.get("constellation_cancel")!.execute("2", { taskId: "task:456", reason: "test" }, undefined, undefined, h.ctx);
  assert.deepEqual(h.calls[1]!.args, { taskId: "task:456", reason: "test", clientRequestId: `constellation-cancel:${createHash("sha256").update("task:456").digest("hex")}:2` });
});

test("cancellation retry identities cannot collide across different tasks", async () => {
  const h = harness({ "mcp__t3-code__task_cancel": { status: "cancel_requested" } });
  const tool = h.tools.get("constellation_cancel")!;
  for (const taskId of ["task:A", "task:A", "task:B"]) {
    await tool.execute("same-call", { taskId }, undefined, undefined, h.ctx);
  }
  assert.equal(h.calls[0]!.args.clientRequestId, h.calls[1]!.args.clientRequestId);
  assert.notEqual(h.calls[0]!.args.clientRequestId, h.calls[2]!.args.clientRequestId);
});

test("bundled role paths cannot be selected arbitrarily", async () => {
  await assert.rejects(buildTask("worker", " "), /empty/);
  await assert.rejects(buildTask("../../secret" as "worker", "test"), /Unknown/);
  assert.match(await buildTask("worker", "test"), /poteto-mode/);
});

test("retains upstream external-write guardrail", () => {
  for (const command of ["git push", "gh repo fork owner/repo", "gh pr merge 1", "rm -rf dir", "terraform apply", "kubectl delete pod p", "git -C repo push", "gh --repo owner/repo pr merge 1", "kubectl -n ns delete pod p", "rm --verbose -fr dir"]) assert.ok(externalWrite(command), command);
  for (const command of ["git diff", "gh pr view 1", "ls", "npm test"]) assert.equal(externalWrite(command), undefined, command);
});
