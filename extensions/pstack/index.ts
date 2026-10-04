import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { buildTask, ROLES } from "./roles.ts";
import { callT3, parseCatalog, resolveT3Tool, selectPiTarget } from "./transport.ts";

const MODE_ENTRY = "pstack-mode";
const GUIDANCE = `Use pstack_delegate to start a Pi child through T3 Code. Omit model to inherit your Pi model. pstack_catalog lists available models and options. Keep the returned taskId for pstack_status or pstack_cancel. After launch, end your turn or do other work. T3 sends the completion result automatically. Do not poll or sleep while waiting. Start a new task for each review round. Include the original brief, prior findings, responses, and unresolved objections. Children share your checkout. Give parallel writers separate file scopes.`;

export function externalWrite(command: string): string | undefined {
  const patterns: Array<[RegExp, string]> = [
    [/\bgit\b[^\n;&|]*\bpush\b/, "git push"],
    [/\bgh\b[^\n;&|]*\b(pr\s+(create|edit|merge|close)|repo\s+(create|fork|delete|edit))\b/, "GitHub mutation"],
    [/\bgt\b[^\n;&|]*\b(submit|merge|create)\b/, "Graphite mutation"],
    [/\b(terraform|tofu)\b[^\n;&|]*\b(apply|destroy)\b/, "infrastructure mutation"],
    [/\bkubectl\b[^\n;&|]*\b(apply|delete|rollout)\b/, "Kubernetes mutation"],
    [/\b(vercel|flyctl|railway)\b[^\n;&|]*\b(deploy|promote)\b/, "deployment"],
    [/\brm\b[^\n;&|]*(\s-[A-Za-z]*r[A-Za-z]*\b|--recursive\b)/, "recursive deletion"],
  ];
  return patterns.find(([pattern]) => pattern.test(command))?.[1];
}

function output(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value };
}

export default function pstack(pi: ExtensionAPI) {
  let enabled = false;
  pi.registerTool({
    name: "pstack_catalog", label: "pi-t3-pstack catalog",
    description: "Read T3 Code's live provider and model catalog. Choose exact Pi model IDs and supported options before delegation.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal, _update, ctx) {
      return output(await callT3(ctx, "orchestrator_capabilities", {}, signal));
    },
  });
  pi.registerTool({
    name: "pstack_roles", label: "pi-t3-pstack roles",
    description: "List bundled pi-t3-pstack roles. Role instructions are not enforced permission boundaries.",
    parameters: Type.Object({}),
    async execute() { return output(ROLES); },
  });
  pi.registerTool({
    name: "pstack_delegate", label: "pi-t3-pstack delegate",
    description: "Launch one asynchronous T3-owned Pi child with a bundled role. Returns taskId; T3 delivers completion automatically. Run independent calls in parallel, never poll. All children share the caller checkout; use disjoint write scopes. A new review round must include its full brief and prior findings.",
    parameters: Type.Object({
      task: Type.String({ minLength: 1 }),
      title: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
      role: Type.Optional(Type.Union([Type.Literal("worker"), Type.Literal("comment-reviewer")])),
      model: Type.Optional(Type.String({ minLength: 1 })),
      options: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Boolean()]))),
      clientRequestId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    }),
    async execute(toolCallId, params, signal, _update, ctx) {
      const role = params.role ?? "worker";
      const task = await buildTask(role, params.task);
      const catalog = parseCatalog(await callT3(ctx, "orchestrator_capabilities", {}, signal));
      const target = selectPiTarget(catalog, params.model, params.options);
      const value = await callT3(ctx, "delegate_task", {
        task, title: params.title ?? `pi-t3-pstack ${role}`,
        role: role === "comment-reviewer" ? "review" : "implementation",
        target, mode: "async", clientRequestId: params.clientRequestId ?? `pstack:${ctx.sessionManager.getSessionId()}:${toolCallId}`,
      }, signal);
      if (typeof value.taskId !== "string" || !value.taskId) throw new Error("T3 did not return a taskId; launch outcome is unconfirmed. Retry with the same clientRequestId.");
      return output(value);
    },
  });
  pi.registerTool({
    name: "pstack_status", label: "pi-t3-pstack status",
    description: "Read a T3 task only when its result is needed mid-turn. Normal completion is automatically delivered; do not poll.",
    parameters: Type.Object({ taskId: Type.String({ minLength: 1 }) }),
    async execute(_id, params, signal, _update, ctx) {
      return output(await callT3(ctx, "task_status", params, signal));
    },
  });
  pi.registerTool({
    name: "pstack_cancel", label: "pi-t3-pstack cancel",
    description: "Cancel an active T3-owned child task by taskId and suppress its automatic delivery. Terminal tasks remain readable.",
    parameters: Type.Object({ taskId: Type.String({ minLength: 1 }), reason: Type.Optional(Type.String({ maxLength: 2000 })) }),
    async execute(toolCallId, params, signal, _update, ctx) {
      return output(await callT3(ctx, "task_cancel", { ...params, clientRequestId: `pstack-cancel:${createHash("sha256").update(params.taskId).digest("hex")}:${toolCallId}` }, signal));
    },
  });
  pi.on("session_start", (_event, ctx) => {
    enabled = false;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === MODE_ENTRY) {
        enabled = Boolean((entry.data as { enabled?: boolean } | undefined)?.enabled);
      }
    }
    if (ctx.hasUI) ctx.ui.setStatus(MODE_ENTRY, enabled ? "pi-t3-pstack" : undefined);
  });
  pi.on("input", event => {
    if (/^\/skill:(pstack-mode|poteto-mode)(?:\s|$)/.test(event.text)) {
      enabled = true;
      pi.appendEntry(MODE_ENTRY, { enabled: true });
    }
    return { action: "continue" } as const;
  });
  pi.on("before_agent_start", event => ({
    systemPrompt: `${event.systemPrompt}\n\n${GUIDANCE}${enabled ? `\np-stack mode is enabled. Follow the pstack-mode workflow.` : ""}`,
  }));
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const operation = externalWrite((event.input as { command?: string }).command ?? "");
    if (!operation) return;
    if (!ctx.hasUI) return { block: true, reason: `${operation} requires explicit confirmation; non-interactive Pi cannot request it.` };
    if (!await ctx.ui.confirm("Confirm external or irreversible action", `Allow ${operation}?\n\n${(event.input as { command: string }).command}`)) {
      return { block: true, reason: `User declined ${operation}.` };
    }
  });
  const handler = async (args: string, ctx: ExtensionCommandContext) => {
    if (/^(off|disable|stop)$/i.test(args.trim())) {
      enabled = false;
      pi.appendEntry(MODE_ENTRY, { enabled: false });
      if (ctx.hasUI) ctx.ui.setStatus(MODE_ENTRY, undefined);
      return;
    }
    enabled = true;
    pi.appendEntry(MODE_ENTRY, { enabled: true });
    if (ctx.hasUI) ctx.ui.setStatus(MODE_ENTRY, "pi-t3-pstack");
    pi.sendUserMessage(`/skill:pstack-mode${args.trim() ? ` ${args.trim()}` : ""}`);
  };
  pi.registerCommand("pstack", { description: "Enable the T3-native workflow: /pstack [task] | /pstack off", handler });
  pi.registerCommand("poteto-mode", { description: "Compatibility alias for /pstack [task] | /pstack off", handler });
  pi.registerCommand("pstack-check", {
    description: "Check that T3 orchestration tools are registered; use pstack_catalog to verify live Pi availability.",
    handler: async (_args, ctx) => {
      try {
        for (const operation of ["orchestrator_capabilities", "delegate_task", "task_status", "task_cancel"] as const) {
          resolveT3Tool(pi.getAllTools(), operation);
        }
        if (ctx.hasUI) ctx.ui.notify("pi-t3-pstack T3 tools are registered. Use pstack_catalog to check live Pi availability.", "info");
      } catch (error) {
        if (ctx.hasUI) ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
