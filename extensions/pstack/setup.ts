import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { getAgentDir, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { selectPiTarget, type Catalog } from "./transport.ts";

export const BUDGETS = {
  unlimited: "unlimited — keep max",
  large: "large — xhigh reasoning",
  medium: "medium — high reasoning",
  small: "small — medium reasoning",
} as const;
export type Budget = keyof typeof BUDGETS;
export type Role = "worker" | "comment-reviewer";
export interface SetupConfig {
  version: 1;
  budget: Budget;
  models: Record<Role, string>;
}
export const DEFAULT_CONFIG: SetupConfig = {
  version: 1, budget: "unlimited", models: { worker: "inherit-parent", "comment-reviewer": "inherit-parent" },
};
export const configPath = () => join(getAgentDir(), "pstack-config.json");

export async function loadConfig(path = configPath()): Promise<SetupConfig | undefined> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`Invalid pstack JSON at ${path}; repair it or remove it and run /setup-pstack.`); }
  if (value?.version !== 1 || !Object.hasOwn(BUDGETS, value.budget) ||
    !["worker", "comment-reviewer"].every(role => typeof value.models?.[role] === "string" && value.models[role].trim())) {
    throw new Error(`Invalid pstack configuration at ${path}; repair it or remove it and run /setup-pstack.`);
  }
  return value;
}

export async function saveConfig(config: SetupConfig, path = configPath()) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(config, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

export function configuredTarget(catalog: Catalog, config: SetupConfig | undefined, role: Role, model?: string, options?: Record<string, string | boolean>) {
  const chosen = model ?? config?.models[role];
  const target = selectPiTarget(catalog, chosen === "inherit-parent" || chosen === "auto" ? undefined : chosen);
  const entry = catalog.providers.find(provider => provider.providerInstanceId === target.providerInstanceId)!.models.find(candidate => candidate.id === target.model)!;
  const thinking = entry.options?.find(option => option.id === "thinking" && option.type !== "boolean");
  let defaults: Record<string, string | boolean> = {};
  if (config && thinking && options?.thinking === undefined) {
    const ladder = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    const ceiling = { unlimited: "max", large: "xhigh", medium: "high", small: "medium" }[config.budget];
    const effort = ladder.slice(0, ladder.indexOf(ceiling) + 1).reverse().find(level => thinking.options?.some(option => option.id === level));
    if (!effort) throw new Error(`No supported reasoning level at or below ${ceiling} for ${target.model}.`);
    defaults = { thinking: effort };
  }
  return selectPiTarget(catalog, target.model, Object.keys({ ...defaults, ...options }).length ? { ...defaults, ...options } : undefined);
}

export async function setup(ctx: ExtensionCommandContext, catalog: Catalog, current = DEFAULT_CONFIG): Promise<SetupConfig | undefined> {
  const budgetLabel = await ctx.ui.select(`pstack reasoning budget (current: ${current.budget})`, Object.values(BUDGETS));
  if (budgetLabel === undefined) return;
  const budget = (Object.keys(BUDGETS) as Budget[]).find(key => BUDGETS[key] === budgetLabel);
  if (!budget) throw new Error("Invalid budget selection.");
  // Resolve the instance before offering models; never mix identically named models from different providers.
  const providerId = selectPiTarget(catalog).providerInstanceId;
  const choices = ["inherit-parent", "auto", ...catalog.providers.find(provider => provider.providerInstanceId === providerId)!.models.filter(model => model.id !== "default").map(model => model.id)];
  const models = { ...current.models };
  for (const role of ["worker", "comment-reviewer"] as const) {
    const model = await ctx.ui.select(`pstack ${role} model (current: ${models[role]})`, choices);
    if (model === undefined) return;
    if (!choices.includes(model)) throw new Error(`Unavailable model ${model}.`);
    models[role] = model;
  }
  const candidate: SetupConfig = { version: 1, budget, models };
  const preview = ["worker", "comment-reviewer"].map(role => {
    const target = configuredTarget(catalog, candidate, role as Role);
    return `${role}: ${models[role as Role]} → ${target.model} (${String(target.options?.thinking ?? "no reasoning control advertised")})`;
  }).join("\n");
  if (!await ctx.ui.confirm("Save pstack configuration?", `${preview}\n\nBudget controls child reasoning, not a dollar/token cap. Explicit tool model/options override defaults. Applies to both aliases too.\n${configPath()}`)) return;
  return candidate;
}
