import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import constellation from "../extensions/constellation/index.ts";

function harness(hasUI = true, approved = true) {
  const hooks = new Map<string, (event: Record<string, unknown>, ctx: typeof context) => unknown>();
  const commands = new Map<string, { handler: (args: string, ctx: typeof context) => unknown }>();
  const entries: Array<{ type: string; customType: string; data: { enabled: boolean } }> = [];
  const messages: string[] = [];
  const context = {
    hasUI, sessionManager: { getBranch: () => entries },
    ui: { setStatus() {}, notify() {}, confirm: async () => approved },
  };
  const api = {
    registerTool() {}, registerCommand(name: string, definition: { handler: (args: string, ctx: typeof context) => unknown }) { commands.set(name, definition); },
    on(name: string, handler: (event: Record<string, unknown>, ctx: typeof context) => unknown) { hooks.set(name, handler); },
    appendEntry(customType: string, data: { enabled: boolean }) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message: string) { messages.push(message); },
    getAllTools: () => [],
  };
  constellation(api as unknown as ExtensionAPI);
  return { hooks, commands, entries, messages, context };
}

test("branded command and compatibility alias expand the skill and persist mode", async () => {
  const h = harness();
  await h.commands.get("constellation")!.handler("Fix the bug", h.context);
  assert.deepEqual(h.messages, ["/skill:constellation-mode Fix the bug"]);
  assert.equal(h.entries[0]!.data.enabled, true);
  await h.commands.get("poteto-mode")!.handler("off", h.context);
  assert.equal(h.entries[1]!.data.enabled, false);
  const prompt = h.hooks.get("before_agent_start")!({ systemPrompt: "base" }, h.context) as { systemPrompt: string };
  assert.doesNotMatch(prompt.systemPrompt, /Mode is enabled/);
  assert.match(prompt.systemPrompt, /T3 Code/);
});

test("restores the last mode entry from the active session branch", () => {
  const h = harness();
  h.entries.push({ type: "custom", customType: "constellation-mode", data: { enabled: false } }, { type: "custom", customType: "constellation-mode", data: { enabled: true } });
  h.hooks.get("session_start")!({}, h.context);
  const prompt = h.hooks.get("before_agent_start")!({ systemPrompt: "base" }, h.context) as { systemPrompt: string };
  assert.match(prompt.systemPrompt, /Constellation Mode is enabled/);
  assert.match(prompt.systemPrompt, /^base/);
});

test("both explicit mode skills activate sticky mode but ordinary input does not", () => {
  for (const skill of ["constellation-mode", "poteto-mode"]) {
    const h = harness();
    h.hooks.get("input")!({ text: "ordinary message" }, h.context);
    assert.equal(h.entries.length, 0);
    h.hooks.get("input")!({ text: `/skill:${skill} test` }, h.context);
    assert.equal(h.entries[0]!.data.enabled, true);
  }
});

test("noninteractive irreversible shell calls fail closed", async () => {
  const h = harness(false);
  const result = await h.hooks.get("tool_call")!({ toolName: "bash", input: { command: "git push" } }, h.context) as { block: boolean; reason: string };
  assert.equal(result.block, true);
  assert.match(result.reason, /non-interactive/);
});

test("declined approval blocks and approved RPC-compatible confirmation allows", async () => {
  for (const approved of [false, true]) {
    const h = harness(true, approved);
    const result = await h.hooks.get("tool_call")!({ toolName: "bash", input: { command: "git push" } }, h.context);
    assert.equal(result === undefined, approved);
  }
});

test("connectivity command reports missing registration without launching model work", async () => {
  const h = harness();
  await h.commands.get("constellation-check")!.handler("", h.context);
  assert.equal(h.messages.length, 0);
});
