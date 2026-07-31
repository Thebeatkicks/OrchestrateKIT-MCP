/**
 * OrchestrateMCP — Cloudflare Worker entry (Streamable HTTP, stateless).
 *
 * Same 19 tools as the Node servers, served from a filesystem-free runtime.
 * The registry and docs index are baked into the bundle at build time
 * (see scripts/gen-registry-bundle.ts) and injected into the providers below,
 * so no module in this import graph touches node:fs.
 *
 * Free, always-on, globally distributed — this is the intended public endpoint.
 * Deploy with `pnpm deploy:worker` (wrangler).
 *
 * DUAL-ERA (MAR-448): `createMcpHandler` serves protocol revision 2026-07-28
 * and, via `legacy: 'stateless'`, every 2025-era client that connects today.
 * It returns a `{ fetch, close, notify, bus }` object — exactly the shape
 * Workers expect from `export default` — so the hand-rolled per-request
 * server+transport construction this file used to do is gone.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createOrchestrateMcpServer } from "./mcpServer.js";
import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import { CORS_HEADERS } from "./lib/cors.js";
import {
  setRegistryLoader,
  setBuildInfoProvider,
} from "./registry/registryProvider.js";
import {
  loadRegistryBundled,
  bundledBuildInfo,
} from "./registry/loadRegistryBundled.js";
import { setDocsIndexLoader } from "./docs-index/provider.js";
import { loadDocsIndexBundled } from "./docs-index/loadBundled.js";

// Wire the bundle-based data sources once per isolate.
setRegistryLoader(loadRegistryBundled);
setBuildInfoProvider(bundledBuildInfo);
setDocsIndexLoader(loadDocsIndexBundled);

function withCors(headers: HeadersInit = {}): Headers {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);
  return h;
}

// Built once per isolate, not per request — the handler is internally
// stateless and calls the factory itself for each serving unit.
// The SDK selects a runtime-appropriate JSON Schema validator on its own via
// the package's `workerd` export condition (@cfworker/json-schema rather than
// ajv), so nothing here has to pull a Node-only dependency into the bundle.
const mcpHandler = createMcpHandler(createOrchestrateMcpServer, {
  legacy: "stateless",
});

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors() });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          server: SERVER_NAME,
          version: SERVER_VERSION,
          transport: "streamable-http-worker",
          mcp_endpoint: `${url.origin}/mcp`,
        }),
        { status: 200, headers: withCors({ "Content-Type": "application/json" }) },
      );
    }

    if (url.pathname === "/mcp") {
      const response = await mcpHandler.fetch(request);
      // Re-emit with CORS headers (preserves SSE streaming body + status).
      return new Response(response.body, {
        status: response.status,
        headers: withCors(response.headers),
      });
    }

    return new Response(
      JSON.stringify({ error: "Not found", hint: "MCP endpoint is at /mcp" }),
      { status: 404, headers: withCors({ "Content-Type": "application/json" }) },
    );
  },
};
