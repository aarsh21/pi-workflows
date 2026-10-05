import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { BUDGETS, configuredTarget, DEFAULT_CONFIG, loadConfig, saveConfig, setup } from "../extensions/pstack/setup.ts";
import type { Catalog } from "../extensions/pstack/transport.ts";

const catalog: Catalog = {
  inheritedProviderInstanceId: "pi", inheritedModel: "parent",
  providers: [{ providerInstanceId: "pi", driverKind: "pi", canRunChildTask: true, models: [
    { id: "parent", options: [{ id: "thinking", type: "select", options: ["medium", "high", "xhigh", "max"].map(id => ({ id })) }] },
    { id: "alternate", options: [{ id: "thinking", type: "select", options: ["low", "medium", "high"].map(id => ({ id })) }] },
    { id: "plain" },
  ] }],
};

test("all budget presets resolve only advertised effort, clamping downward", () => {
  for (const [budget, expected] of [["unlimited", "max"], ["large", "xhigh"], ["medium", "high"], ["small", "medium"]] as const) {
    const config = { ...DEFAULT_CONFIG, budget };
    assert.equal(configuredTarget(catalog, config, "worker").options?.thinking, expected);
    assert.equal(configuredTarget(catalog, config, "worker", "alternate").options?.thinking, budget === "small" ? "medium" : "high");
  }
});

test("role defaults, aliases, explicit overrides, and absent reasoning controls", () => {
  const config = { ...DEFAULT_CONFIG, budget: "small" as const, models: { worker: "alternate", "comment-reviewer": "auto" } };
  assert.equal(configuredTarget(catalog, config, "worker").model, "alternate");
  assert.equal(configuredTarget(catalog, config, "comment-reviewer").model, "parent");
  assert.deepEqual(configuredTarget(catalog, config, "worker", "parent", { thinking: "max" }).options, { thinking: "max" });
  assert.equal(configuredTarget(catalog, config, "worker", "plain").options, undefined);
  assert.equal(configuredTarget(catalog, undefined, "worker").options, undefined);
  assert.throws(() => configuredTarget(catalog, config, "worker", "missing"), /live catalog/);
  assert.throws(() => configuredTarget(catalog, config, "worker", "parent", { thinking: "invalid" }), /Unsupported/);
  const noAffordable = structuredClone(catalog);
  noAffordable.providers[0]!.models[0]!.options![0]!.options = [{ id: "max" }];
  assert.throws(() => configuredTarget(noAffordable, config, "comment-reviewer"), /No supported reasoning/);
  assert.equal(configuredTarget(noAffordable, config, "comment-reviewer", undefined, { thinking: "max" }).options?.thinking, "max");
});

test("durable config replaces atomically, reloads, and rejects corrupt data", async t => {
  const directory = await mkdtemp(join(tmpdir(), "pstack-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "nested/config.json");
  assert.equal(await loadConfig(path), undefined);
  await saveConfig(DEFAULT_CONFIG, path);
  assert.deepEqual(await loadConfig(path), DEFAULT_CONFIG);
  const next = { ...DEFAULT_CONFIG, budget: "small" as const };
  await saveConfig(next, path);
  assert.deepEqual(await loadConfig(path), next);
  await writeFile(path, '{"version":2}');
  await assert.rejects(loadConfig(path), /Invalid pstack/);
  assert.equal(await readFile(path, "utf8"), '{"version":2}');
  await writeFile(path, '{broken');
  await assert.rejects(loadConfig(path), /Invalid pstack JSON.*config.json.*setup-pstack/);
});

test("dialog cancellation at each step is non-mutating; confirmed choices are validated", async () => {
  for (const cancelAt of [0, 1, 2, 3, 4]) {
    let index = 0;
    const selected = [BUDGETS.small, "alternate", "inherit-parent"];
    const ctx = { ui: {
      select: async (_title: string, options: string[]) => {
        const value = selected[index];
        assert.ok(options.includes(value!));
        return index++ === cancelAt ? undefined : value;
      },
      confirm: async () => index++ !== cancelAt,
    } } as unknown as ExtensionCommandContext;
    const candidate = await setup(ctx, catalog);
    if (cancelAt < 4) assert.equal(candidate, undefined);
    else assert.deepEqual(candidate, { version: 1, budget: "small", models: { worker: "alternate", "comment-reviewer": "inherit-parent" } });
  }
});
