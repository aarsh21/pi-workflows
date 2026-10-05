import { decodeT3Result, parseCatalog, type ToolResult } from "./transport.ts";

// Command contexts in Pi 1.0 do not expose executeTool. This read-only client uses
// the same session-scoped transport as T3's injected bridge; launches still use nested tools.
export async function commandCatalog() {
  const endpoint = process.env.T3_MCP_URL;
  const token = process.env.T3_MCP_BEARER_TOKEN;
  if (!endpoint || !token) throw new Error("T3 Code catalog is unavailable. Open Pi through T3 Code; no configuration was changed.");
  const signal = AbortSignal.timeout(15_000);
  let sessionId: string | undefined;
  let id = 0;
  async function request(method: string, params: unknown, notification = false): Promise<unknown> {
    const response = await fetch(endpoint!, {
      method: "POST", signal,
      headers: {
        accept: "application/json, text/event-stream", "content-type": "application/json",
        authorization: token!.startsWith("Bearer ") ? token! : `Bearer ${token}`,
        "mcp-protocol-version": "2025-06-18", ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: ++id }), method, params }),
    });
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    if (!response.ok) throw new Error(`T3 catalog request failed (HTTP ${response.status}); no configuration was changed.`);
    if (notification) { await response.body?.cancel(); return; }
    const body = await response.text();
    const messages = response.headers.get("content-type")?.includes("text/event-stream")
      ? body.split("\n").filter(line => line.startsWith("data:")).map(line => JSON.parse(line.slice(5)))
      : [JSON.parse(body)];
    const message = messages.find(value => value.id === id);
    if (!message || message.error) throw new Error("T3 catalog returned an invalid or failed JSON-RPC response.");
    return message.result;
  }
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pi-workflows-setup", version: "1" } });
  await request("notifications/initialized", {}, true);
  const result = await request("tools/call", { name: "orchestrator_capabilities", arguments: {} });
  return parseCatalog(decodeT3Result(result as ToolResult));
}
