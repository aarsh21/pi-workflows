import { test } from "node:test";
import assert from "node:assert/strict";
import { callT3, decodeT3Result, parseCatalog, resolveT3Tool, selectPiTarget } from "../extensions/constellation/transport.ts";

const catalog = {
  inheritedProviderInstanceId: "pi", inheritedModel: "openai-codex/gpt-5.5",
  providers: [{ providerInstanceId: "pi", driverKind: "pi", canRunChildTask: true, models: [
    { id: "default" }, { id: "openai-codex/gpt-5.5", options: [{ id: "thinking", type: "select", options: [{ id: "low" }] }] },
  ] }],
};

test("resolves T3 names without picking an unrelated delegate tool", () => {
  for (const name of ["mcp__t3-code__delegate_task", "mcp__t3_code__delegate_task", "t3-code:delegate_task"]) {
    assert.equal(resolveT3Tool([{ name: "mcp__other__delegate_task" }, { name }], "delegate_task"), name);
  }
  assert.throws(() => resolveT3Tool([{ name: "delegate_task" }], "delegate_task"), /unavailable/);
  assert.throws(() => resolveT3Tool([{ name: "mcp__t3-code__delegate_task" }, { name: "t3-code:delegate_task" }], "delegate_task"), /Ambiguous/);
});

test("decodes real T3 bridge duplicate JSON and rejects malformed/error results", () => {
  const value = { taskId: "task:1", summary: 'a quote " and newline\n' };
  const text = JSON.stringify(value);
  assert.deepEqual(decodeT3Result({ content: [{ type: "text", text: `${text}\n${text}` }] }), value);
  assert.deepEqual(decodeT3Result({ content: [], structuredContent: value }), value);
  assert.throws(() => decodeT3Result({ content: [{ type: "text", text: "permission denied" }], isError: true }), /permission denied/);
  assert.throws(() => decodeT3Result({ content: [{ type: "text", text: "null" }] }), /invalid JSON/);
  const failure = { _tag: "OrchestratorMcpFailure", code: "task_not_cancellable", message: "denied" };
  const failureText = JSON.stringify(failure);
  assert.throws(() => decodeT3Result({ content: [{ type: "text", text: `${failureText}\n${failureText}` }] }), /task_not_cancellable/);
  assert.throws(() => decodeT3Result({ content: [], structuredContent: failure }), /task_not_cancellable/);
});

test("unwraps Pi's nested outcome and carries nested permission errors", async () => {
  const tools = [{ name: "mcp__t3-code__task_status" }];
  const calls: unknown[] = [];
  const controller = new AbortController();
  const ctx = { tools, executeTool: async (...args: unknown[]) => {
    calls.push(args); return { result: { content: [{ type: "text", text: '{"status":"completed"}' }] }, isError: false };
  } };
  assert.deepEqual(await callT3(ctx, "task_status", { taskId: "1" }, controller.signal), { status: "completed" });
  assert.deepEqual(calls[0], [tools[0]!.name, { taskId: "1" }, { signal: controller.signal }]);
  await assert.rejects(callT3({ tools, executeTool: async () => ({ result: { content: [{ type: "text", text: "blocked by hook" }] }, isError: true }) }, "task_status", {}), /blocked by hook/);
});

test("selects inherited Pi instance/model and validates live options", () => {
  assert.deepEqual(selectPiTarget(catalog), { providerInstanceId: "pi", model: "openai-codex/gpt-5.5" });
  assert.deepEqual(selectPiTarget(catalog, undefined, { thinking: "low" }), { providerInstanceId: "pi", model: "openai-codex/gpt-5.5", options: { thinking: "low" } });
  assert.throws(() => selectPiTarget(catalog, "not-a-model"), /live catalog/);
  assert.throws(() => selectPiTarget(catalog, undefined, { thinking: "ultra" }), /Unsupported/);
  assert.throws(() => selectPiTarget(catalog, undefined, { surprise: true }), /Unsupported/);
  assert.throws(() => selectPiTarget({ providers: [] }), /No enabled Pi/);
});

test("does not inherit another provider's model or choose an ambiguous Pi instance", () => {
  assert.deepEqual(selectPiTarget({ ...catalog, inheritedProviderInstanceId: "claude" }), { providerInstanceId: "pi", model: "default" });
  assert.throws(() => selectPiTarget({ ...catalog, inheritedProviderInstanceId: "claude", providers: [...catalog.providers, { ...catalog.providers[0]!, providerInstanceId: "pi-2" }] }), /Multiple Pi/);
});

test("rejects malformed catalogs at the boundary", () => {
  assert.deepEqual(parseCatalog(catalog), catalog);
  for (const providers of [null, [{}], [{ ...catalog.providers[0], models: [{}] }]]) {
    assert.throws(() => parseCatalog({ providers }), /invalid provider/);
  }
});
