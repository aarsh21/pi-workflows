import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PACKAGE_ROOT } from "../extensions/constellation/roles.ts";

async function markdownFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await markdownFiles(path));
    else if (entry.name.endsWith(".md")) paths.push(path);
  }
  return paths;
}

test("bundled workflow resources do not route to obsolete Herdr APIs or model files", async () => {
  for (const directory of ["skills", "agents"]) {
    for (const path of await markdownFiles(resolve(PACKAGE_ROOT, directory))) {
      const text = await readFile(path, "utf8");
      assert.doesNotMatch(text, /pstack\/models\.json|herdr-agents\/config\.json|subagents_write_task_models|\bsubagent\s*\(|`subagent`|inherit-parent/, path);
    }
  }
});

test("plan validator accepts the migrated model-omission phrase rather than obsolete aliases", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "constellation-plan-"));
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
