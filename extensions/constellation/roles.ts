import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const ROLES = {
  worker: { file: "poteto-agent.md", description: "Implementation and investigation using the verified p-stack workflow." },
  "comment-reviewer": { file: "comment-sicko.md", description: "Report-only comment and suppression review. Instructions are not a sandbox." },
} as const;
export type Role = keyof typeof ROLES;

export async function buildTask(role: Role, task: string): Promise<string> {
  if (!task.trim()) throw new Error("A delegated task cannot be empty.");
  const definition = ROLES[role];
  if (!definition) throw new Error(`Unknown Constellation role: ${role}`);
  const markdown = await readFile(resolve(PACKAGE_ROOT, "agents", definition.file), "utf8");
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  return [
    `You are a T3 Code-owned Pi child running the Constellation ${role} role.`,
    `Bundled skills are at ${resolve(PACKAGE_ROOT, "skills")}. Read referenced SKILL.md files from that directory.`,
    "Use T3 Code orchestration only. Do not launch Herdr or detached Pi children. Do not delegate further unless this task explicitly asks you to.",
    "This is a fresh-context task, not a worktree sandbox. Respect the explicit file scope and verification requirements below.",
    "Role instructions:", body, "User task:", task,
  ].join("\n\n");
}
