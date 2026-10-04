export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
}

export interface ToolContext {
  tools: readonly { name: string }[];
  executeTool(name: string, args: unknown, options?: { signal?: AbortSignal }): Promise<{ result: ToolResult; isError: boolean }>; 
}

export type T3Operation = "orchestrator_capabilities" | "delegate_task" | "task_status" | "task_cancel";

export function resolveT3Tool(tools: readonly { name: string }[], operation: T3Operation): string {
  const matches = tools.filter(({ name }) => {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized === `mcpt3code${operation.replaceAll("_", "")}` ||
      normalized === `t3code${operation.replaceAll("_", "")}`;
  });
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `T3 Code tool ${operation} is unavailable. Start Pi through T3 Code with its Pi provider enabled. Constellation never launches Herdr or detached children.`
      : `Ambiguous T3 Code tool ${operation}; refusing to choose between multiple servers.`);
  }
  return matches[0]!.name;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkedResult(value: Record<string, unknown>): Record<string, unknown> {
  if (value._tag === "OrchestratorMcpFailure") {
    throw new Error(`T3 Code ${String(value.code)}: ${String(value.message)}`);
  }
  return value;
}

export function decodeT3Result(result: ToolResult): Record<string, unknown> {
  const text = result.content.filter(part => part.type === "text").map(part => part.text ?? "").join("\n");
  if (result.isError) throw new Error(text || "T3 Code returned a tool error.");
  if (isObject(result.structuredContent)) return checkedResult(result.structuredContent);
  let value: unknown;
  try { value = JSON.parse(text); } catch { /* The bridge can emit duplicate JSON. */ }
  if (isObject(value)) return checkedResult(value);
  const candidates = text.split("\n").filter(line => line.trim().startsWith("{"));
  for (const candidate of candidates) {
    let parsed: unknown;
    try { parsed = JSON.parse(candidate); } catch { /* Ignore diagnostic lines. */ }
    if (isObject(parsed)) return checkedResult(parsed);
  }
  throw new Error("T3 Code returned an invalid JSON object; no success was inferred.");
}

export async function callT3(ctx: ToolContext, operation: T3Operation, args: unknown, signal?: AbortSignal) {
  const name = resolveT3Tool(ctx.tools, operation);
  const outcome = await ctx.executeTool(name, args, { signal });
  return decodeT3Result({ ...outcome.result, isError: outcome.isError || outcome.result.isError });
}

export interface Catalog {
  inheritedProviderInstanceId?: string;
  inheritedModel?: string;
  providers: Array<{
    providerInstanceId: string;
    driverKind: string;
    canRunChildTask: boolean;
    models: Array<{ id: string; options?: Array<{ id: string; type?: string; options?: Array<{ id: string }> }> }>;
  }>;
}

export function parseCatalog(value: Record<string, unknown>): Catalog {
  if (!Array.isArray(value.providers) || value.providers.some(provider =>
    !isObject(provider) || typeof provider.providerInstanceId !== "string" ||
    typeof provider.driverKind !== "string" || typeof provider.canRunChildTask !== "boolean" ||
    !Array.isArray(provider.models) || provider.models.some(model => !isObject(model) || typeof model.id !== "string")
  )) throw new Error("T3 Code returned an invalid provider catalog.");
  return value as unknown as Catalog;
}

export function selectPiTarget(catalog: Catalog, model?: string, options?: Record<string, string | boolean>) {
  const enabled = catalog.providers.filter(provider => provider.driverKind === "pi" && provider.canRunChildTask);
  const inherited = enabled.find(provider => provider.providerInstanceId === catalog.inheritedProviderInstanceId);
  if (!inherited && enabled.length > 1) throw new Error("Multiple Pi providers are available without an inherited Pi instance; select Pi in the T3 composer first.");
  const provider = inherited ?? enabled[0];
  if (!provider) throw new Error("No enabled Pi provider can run T3 child tasks. Enable Pi in T3 Code Settings.");
  const selectedModel = model ?? (inherited ? catalog.inheritedModel : undefined) ?? "default";
  const entry = provider.models.find(candidate => candidate.id === selectedModel);
  if (!entry) throw new Error(`Pi model ${selectedModel} is not in T3's live catalog. Use constellation_catalog to choose an exact ID.`);
  for (const [id, value] of Object.entries(options ?? {})) {
    const option = entry.options?.find(candidate => candidate.id === id);
    if (!option || (option.type === "boolean" ? typeof value !== "boolean" : typeof value !== "string") ||
      (option.options && !option.options.some(candidate => candidate.id === value))) {
      throw new Error(`Unsupported Pi model option ${id}=${String(value)} for ${selectedModel}.`);
    }
  }
  return { providerInstanceId: provider.providerInstanceId, model: selectedModel, ...(options ? { options } : {}) };
}
