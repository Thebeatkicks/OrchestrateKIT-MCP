/**
 * Wire harness for the protocol conformance fixtures (MAR-459).
 *
 * Every fixture drives the REAL `createMcpHandler` — the same object
 * `src/server-http.ts` and `src/worker.ts` serve — through its web-standard
 * `fetch` face. Nothing here stubs or re-implements a codec: if a request
 * shape is accepted by this harness it is accepted by the deployed endpoint,
 * and the revision-specific header and envelope rules below are the ones a
 * real client has to satisfy.
 *
 * The harness is deliberately dumb about what is CORRECT. It only knows how to
 * speak each era; the promises live in `conformanceMatrix.ts` and are asserted
 * in `conformance.test.ts`.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createOrchestrateMcpServer } from "../../src/mcpServer.js";

/** The first modern-era revision. Everything `>=` this string is modern-era. */
export const MODERN_REVISION = "2026-07-28";

export type Era = "legacy" | "modern";

/** Revision identifiers are ISO dates, so string order is chronological order. */
export function eraOf(revision: string): Era {
  return revision >= MODERN_REVISION ? "modern" : "legacy";
}

/**
 * One handler for the whole suite, matching production: `createMcpHandler` is
 * constructed once per process and is stateless per request internally.
 */
export const handler = createMcpHandler(createOrchestrateMcpServer, {
  legacy: "stateless",
});

export interface WireResponse {
  status: number;
  /** The single JSON-RPC message in the body, or `undefined` for an empty body. */
  body: Record<string, any> | undefined;
  /** Every JSON-RPC message in the body, in order — batches return more than one. */
  messages: Record<string, any>[];
  raw: string;
}

/** Read a handler response whether it came back as plain JSON or SSE frames. */
async function readResponse(res: Response): Promise<WireResponse> {
  const raw = await res.text();
  const messages = raw
    .split("\n")
    .map((line) => (line.startsWith("data: ") ? line.slice(6) : line))
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, any>);
  return { status: res.status, body: messages[0], messages, raw };
}

/** POST an arbitrary body with arbitrary headers — the escape hatch for negative transport cases. */
export async function postRaw(
  headers: Record<string, string>,
  body: string,
): Promise<WireResponse> {
  return readResponse(
    await handler.fetch(
      new Request("http://mcp.test/mcp", { method: "POST", headers, body }),
    ),
  );
}

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

/**
 * A 2025-era request.
 *
 * `MCP-Protocol-Version` carries the negotiated revision on every post-
 * handshake request; the SDK falls back to its default negotiated revision
 * when the header is absent, which is why the fixtures always send it — a
 * fixture for 2024-10-07 must actually be answered at 2024-10-07.
 */
export async function postLegacy(
  revision: string,
  method: string,
  params: Record<string, unknown> = {},
  id: number | string | null = 1,
): Promise<WireResponse> {
  const message: Record<string, unknown> = { jsonrpc: "2.0", method, params };
  if (id !== null) message.id = id;
  return postRaw(
    { ...DEFAULT_HEADERS, "MCP-Protocol-Version": revision },
    JSON.stringify(message),
  );
}

/** The 2025-era `initialize` handshake, which is the only place a client states its revision in the body. */
export async function initialize(revision: string): Promise<WireResponse> {
  return postLegacy(revision, "initialize", {
    protocolVersion: revision,
    capabilities: {},
    clientInfo: { name: "orchestratekit-conformance", version: "1.0" },
  });
}

/** The per-request `_meta` envelope every modern request must carry (SEP-2243). */
export function modernEnvelope(revision: string = MODERN_REVISION): Record<string, unknown> {
  return {
    "io.modelcontextprotocol/protocolVersion": revision,
    "io.modelcontextprotocol/clientInfo": {
      name: "orchestratekit-conformance",
      version: "1.0",
    },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

/**
 * The `Mcp-Name` header the modern era requires to AGREE with the body.
 *
 * For `tools/call` it must equal `params.name` and for `resources/read`
 * `params.uri`; methods that name nothing may send any label. Getting this
 * wrong is a -32020, which is itself pinned as a transport promise.
 */
function mcpNameFor(params: Record<string, unknown>): string {
  if (typeof params.name === "string") return params.name;
  if (typeof params.uri === "string") return params.uri;
  return "orchestratekit-conformance";
}

/** A 2026-07-28 request: envelope in `params._meta`, plus the agreeing MCP-* headers. */
export async function postModern(
  method: string,
  params: Record<string, unknown> = {},
  revision: string = MODERN_REVISION,
  overrides: { headers?: Record<string, string>; notification?: boolean } = {},
): Promise<WireResponse> {
  const message: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
    params: { ...params, _meta: modernEnvelope(revision) },
  };
  if (overrides.notification !== true) message.id = 1;
  return postRaw(
    {
      ...DEFAULT_HEADERS,
      "MCP-Protocol-Version": revision,
      "Mcp-Method": method,
      "Mcp-Name": mcpNameFor(params),
      ...overrides.headers,
    },
    JSON.stringify(message),
  );
}

/**
 * Issue `method` at `revision` in whichever era that revision belongs to.
 *
 * Fixtures that assert an era-shared promise (the tool surface, the error
 * vocabulary) use this so the SAME assertion runs against all six revisions
 * without the fixture knowing which wire it travelled on.
 */
export async function post(
  revision: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<WireResponse> {
  return eraOf(revision) === "modern"
    ? postModern(method, params, revision)
    : postLegacy(revision, method, params);
}

/** Send a notification (no `id`) at `revision`'s era. */
export async function notify(
  revision: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<WireResponse> {
  return eraOf(revision) === "modern"
    ? postModern(method, params, revision, { notification: true })
    : postLegacy(revision, method, params, null);
}

/** POST a JSON-RPC batch at `revision`'s era. */
export async function postBatch(
  revision: string,
  methods: string[],
): Promise<WireResponse> {
  const modern = eraOf(revision) === "modern";
  const batch = methods.map((method, index) => ({
    jsonrpc: "2.0",
    id: index + 1,
    method,
    params: modern ? { _meta: modernEnvelope(revision) } : {},
  }));
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    "MCP-Protocol-Version": revision,
  };
  if (modern) {
    headers["Mcp-Method"] = methods[0] ?? "ping";
    headers["Mcp-Name"] = "orchestratekit-conformance";
  }
  return postRaw(headers, JSON.stringify(batch));
}

/** A bare non-POST request to the MCP endpoint — the 2025 session verbs. */
export async function requestMethod(httpMethod: string): Promise<Response> {
  return handler.fetch(
    new Request("http://mcp.test/mcp", {
      method: httpMethod,
      headers: { Accept: "text/event-stream" },
    }),
  );
}

/** The tool names a result carries, in wire order. */
export function toolNames(response: WireResponse): string[] {
  return (response.body?.result?.tools ?? []).map((tool: { name: string }) => tool.name);
}
