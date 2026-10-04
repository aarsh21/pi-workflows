import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { formatSkillsForPrompt, loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { buildTask, PACKAGE_ROOT, ROLES } from "../extensions/pstack/roles.ts";

async function markdownFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await markdownFiles(path));
    else if (entry.name.endsWith(".md")) paths.push(path);
  }
  return paths;
}

test("bundled workflow resources do not route to obsolete delegation APIs or model files", async () => {
  for (const directory of ["skills", "agents"]) {
    for (const path of await markdownFiles(resolve(PACKAGE_ROOT, directory))) {
      const text = await readFile(path, "utf8");
      assert.doesNotMatch(text, /pstack\/models\.json|herdr-agents\/config\.json|subagents_write_task_models|\bsubagent\s*\(|`subagent`|inherit-parent/, path);
    }
  }
});

test("Pi discovers the worker skill and includes its path in the skill catalog", () => {
  const { skills } = loadSkillsFromDir({ dir: resolve(PACKAGE_ROOT, "skills"), source: "package" });
  const workerSkill = skills.find(skill => skill.name === "poteto-mode");
  assert.ok(workerSkill);
  assert.equal(workerSkill.disableModelInvocation, false);
  const catalog = formatSkillsForPrompt(skills);
  assert.match(catalog, /<name>poteto-mode<\/name>/);
  assert.ok(catalog.includes(workerSkill.filePath));
});

test("roles and skill discovery work after installation in another directory", async t => {
  const relocatedRoot = await mkdtemp(resolve(tmpdir(), "pi workflows portable-"));
  t.after(() => rm(relocatedRoot, { recursive: true, force: true }));
  await mkdir(resolve(relocatedRoot, "extensions/pstack"), { recursive: true });
  await cp(resolve(PACKAGE_ROOT, "extensions/pstack/roles.ts"), resolve(relocatedRoot, "extensions/pstack/roles.ts"));
  await cp(resolve(PACKAGE_ROOT, "agents"), resolve(relocatedRoot, "agents"), { recursive: true });
  await cp(resolve(PACKAGE_ROOT, "skills"), resolve(relocatedRoot, "skills"), { recursive: true });
  await writeFile(resolve(relocatedRoot, "package.json"), '{"type":"module"}');
  const relocated = await import(pathToFileURL(resolve(relocatedRoot, "extensions/pstack/roles.ts")).href);
  assert.equal(relocated.PACKAGE_ROOT, relocatedRoot);
  for (const role of Object.keys(ROLES)) {
    const prompt = await relocated.buildTask(role, "Read the assigned file.");
    assert.ok(prompt.includes("Read the assigned file."));
    assert.ok(!prompt.includes(PACKAGE_ROOT));
    assert.ok(!prompt.includes(relocatedRoot));
  }
  const { skills } = loadSkillsFromDir({ dir: resolve(relocatedRoot, "skills"), source: "package" });
  const workerSkill = skills.find(skill => skill.name === "poteto-mode");
  assert.ok(workerSkill);
  assert.ok(workerSkill.filePath.startsWith(relocatedRoot));
  assert.ok(formatSkillsForPrompt(skills).includes(workerSkill.filePath));
});

test("child prompts give plain delegation instructions without legacy backend references", async () => {
  for (const role of Object.keys(ROLES) as Array<keyof typeof ROLES>) {
    const prompt = await buildTask(role, "Read the assigned file.");
    assert.match(prompt, /Use T3 Code for delegation\. Create additional agents only if the task asks you to\./);
    assert.doesNotMatch(prompt, /herdr|detached Pi|worktree sandbox|constellation|Bundled skills are at|You are the .* agent/i);
    assert.match(prompt, /You share its checkout\./);
  }
});

test("plan validator accepts the migrated model-omission phrase rather than obsolete aliases", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "pstack-plan-"));
  const path = resolve(directory, "plan.md");
  const rule = "Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.";
  const prefix = "# Plan\n## Program checklist\n## PR 1\n**Verify, live.** " + rule + " ";
  const suffix = "\n## Close the program\n## Appendix Prototype evidence\n";
  await writeFile(path, prefix + "Ten lanes with `model` omitted by default at the PR head" + suffix);
  const accepted = spawnSync(process.execPath, [resolve(PACKAGE_ROOT, "skills/poteto-mode/scripts/check-plan.mjs"), path], { encoding: "utf8" });
  assert.equal(accepted.status, 1, "Incomplete fixture still fails other plan requirements.");
  assert.doesNotMatch(accepted.stderr, /Verify, live lacks/);
  await writeFile(path, prefix + "Ten lanes on `inherit-parent` at the PR head" + suffix);
  const rejected = spawnSync(process.execPath, [resolve(PACKAGE_ROOT, "skills/poteto-mode/scripts/check-plan.mjs"), path], { encoding: "utf8" });
  assert.match(rejected.stderr, /Verify, live lacks "Ten lanes with `model` omitted/);
});
