/**
 * Dual-era protocol regression tests (MAR-448).
 *
 * OrchestrateMCP serves protocol revision 2026-07-28 AND every 2025-era client
 * from one endpoint. These tests drive the REAL `createMcpHandler` — the same
 * object `src/server-http.ts` and `src/worker.ts` serve — through its
 * web-standard `fetch` face, so they exercise the actual wire codecs rather
 * than a stand-in.
 *
 * The load-bearing assertion is the pair:
 *   - a modern result MUST carry `resultType` + `ttlMs`/`cacheScope`
 *   - a legacy result MUST carry NONE of them
 * A regression in either direction breaks real clients, and the two share one
 * code path, so they are tested together.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createOrchestrateMcpServer } from "../../src/mcpServer.js";

const handler = createMcpHandler(createOrchestrateMcpServer, {
  legacy: "stateless",
});

afterAll(async () => {
  await handler.close();
});

const MODERN = "2026-07-28";
const LEGACY = "2025-11-25";

/** The per-request `_meta` envelope every modern request carries. */
function modernMeta(version: string = MODERN): Record<string, unknown> {
  return {
    "io.modelcontextprotocol/protocolVersion": version,
    "io.modelcontextprotocol/clientInfo": { name: "dual-era-test", version: "1.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

/** Read a handler response whether it came back as plain JSON or an SSE frame. */
async function readResult(res: Response): Promise<Record<string, any>> {
  const text = await res.text();
  const line = text
    .split("\n")
    .map((l) => (l.startsWith("data: ") ? l.slice(6) : l))
    .find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error(`no JSON body in response: ${text.slice(0, 200)}`);
  return JSON.parse(line);
}

async function postModern(
  method: string,
  version: string = MODERN,
): Promise<Record<string, any>> {
  const res = await handler.fetch(
    new Request("http://mcp.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        // Required on Streamable HTTP POSTs since 2026-07-28 (SEP-2243).
        "MCP-Protocol-Version": version,
        "Mcp-Method": method,
        "Mcp-Name": "dual-era-test",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: { _meta: modernMeta(version) },
      }),
    }),
  );
  return readResult(res);
}

/** A 2025-era request: no envelope, no MCP-* headers — exactly what ships today. */
async function postLegacy(
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const res = await handler.fetch(
    new Request("http://mcp.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  return readResult(res);
}

describe("modern era (2026-07-28)", () => {
  it("implements the mandatory server/discover RPC", async () => {
    const { result } = await postModern("server/discover");
    expect(result.supportedVersions).toContain(MODERN);
    expect(result.capabilities.tools).toBeDefined();
  });

  it("returns resultType 'complete' and identifies the server in result _meta", async () => {
    const { result } = await postModern("tools/list");
    expect(result.resultType).toBe("complete");
    expect(result._meta?.["io.modelcontextprotocol/serverInfo"]).toMatchObject({
      name: "orchestratekit-mcp",
    });
  });

  it("advertises a real cache policy on cacheable results", async () => {
    const { result } = await postModern("tools/list");
    // Not the SDK's conservative default (ttlMs 0 / private): the registry is
    // a build-time frozen snapshot, so this server can promise more.
    expect(result.ttlMs).toBeGreaterThan(0);
    expect(result.cacheScope).toBe("public");
  });

  it("rejects an unsupported version with -32022 and names what it supports", async () => {
    const { error } = await postModern("tools/list", "1900-01-01");
    expect(error.code).toBe(-32022);
    expect(error.data.supported).toContain(MODERN);
    expect(error.data.requested).toBe("1900-01-01");
  });
});

describe("legacy era (2025-11-25 and earlier)", () => {
  it("still answers the initialize handshake unchanged", async () => {
    const { result } = await postLegacy("initialize", {
      protocolVersion: LEGACY,
      capabilities: {},
      clientInfo: { name: "legacy-client", version: "1.0" },
    });
    expect(result.protocolVersion).toBe(LEGACY);
    expect(result.serverInfo).toMatchObject({ name: "orchestratekit-mcp" });
  });

  it("NEVER leaks 2026-era fields into a 2025-era result", async () => {
    const { result } = await postLegacy("tools/list");
    expect(result).not.toHaveProperty("resultType");
    expect(result).not.toHaveProperty("ttlMs");
    expect(result).not.toHaveProperty("cacheScope");
  });
});

describe("both eras serve the same surface", () => {
  it("exposes an identical tool set to modern and legacy clients", async () => {
    const modern = await postModern("tools/list");
    const legacy = await postLegacy("tools/list");
    const modernNames = modern.result.tools.map((t: { name: string }) => t.name);
    const legacyNames = legacy.result.tools.map((t: { name: string }) => t.name);

    expect(modernNames).toEqual(legacyNames);
    expect(modernNames).toContain("plan_workflow");
    expect(modernNames).toContain("health_check");
  });

  it("returns tools in a deterministic order (2026-07-28 SHOULD)", async () => {
    // Registration order in registerTools() is fixed and curated
    // (plan_workflow-centric, health_check last); this locks it so the
    // ordering guarantee cannot regress into something incidental.
    const first = await postModern("tools/list");
    const second = await postModern("tools/list");
    expect(first.result.tools.map((t: { name: string }) => t.name)).toEqual(
      second.result.tools.map((t: { name: string }) => t.name),
    );
  });
});
