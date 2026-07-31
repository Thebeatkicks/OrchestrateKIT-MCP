/**
 * Shared `McpServer` factory (MAR-448).
 *
 * The v2 serving entries — `serveStdio` (stdio) and `createMcpHandler` (HTTP,
 * Worker) — are both driven by a FACTORY rather than a single long-lived
 * instance: they call it once per serving unit (one stdio connection, one HTTP
 * request) and own the protocol-era decision themselves. Defining the surface
 * once here means the same 19 tools and playbook resources are served to BOTH
 * eras — 2026-07-28 clients and 2025-era `initialize` clients — with no
 * per-era registration drift.
 *
 * This replaces the "fresh McpServer + transport per request" boilerplate the
 * HTTP and Worker entries used to hand-roll: the factory model IS that pattern,
 * now owned by the SDK.
 */
import type { McpRequestContext, ServerOptions } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { SERVER_NAME, SERVER_VERSION, SERVER_INSTRUCTIONS } from "./config.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";

/**
 * How long a client may reuse a cacheable list/read result.
 *
 * One hour is chosen against what actually varies: the registry is a
 * BUILD-TIME FROZEN snapshot (`scripts/gen-registry-bundle.ts` bakes it into
 * `registryBundle.generated.ts`, and `health_check.build.content_fingerprint`
 * is constant for the life of a deployment). Within one deployment the tool
 * list, the resource list and every playbook body are immutable, so the only
 * staleness this can produce is across a redeploy: for up to an hour after a
 * release a client may still hold the previous build's list. That is
 * acceptable for advisory content and is the whole point of the hint — the
 * SDK's default is `ttlMs: 0`, which is strictly more pessimistic than what
 * this server can honestly promise.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * `cacheScope: "public"` — OrchestrateMCP is read-only advisory data with no
 * secrets and no per-caller variation, so a shared intermediary caching a
 * response for one client and serving it to another is correct, not a leak.
 * That matters concretely here: the public endpoint is a free Cloudflare
 * Worker with globally distributed clients.
 *
 * `prompts/list` is absent deliberately — this server registers no prompts.
 *
 * NOTE: these values reach the wire ONLY on 2026-07-28 responses. The SDK
 * carries the hint on a symbol-keyed property that is never serialized, and
 * the 2025-era codec has no cache code path at all, so this cannot change what
 * a legacy client sees.
 */
export const CACHE_HINTS: ServerOptions["cacheHints"] = {
  "tools/list": { ttlMs: CACHE_TTL_MS, cacheScope: "public" },
  "resources/list": { ttlMs: CACHE_TTL_MS, cacheScope: "public" },
  "resources/templates/list": { ttlMs: CACHE_TTL_MS, cacheScope: "public" },
  "resources/read": { ttlMs: CACHE_TTL_MS, cacheScope: "public" },
  "server/discover": { ttlMs: CACHE_TTL_MS, cacheScope: "public" },
};

/**
 * Build a fully-registered server instance.
 *
 * Accepts (and ignores) the SDK's `McpRequestContext` so it is directly
 * assignable to `McpServerFactory`. The context carries `era`, `authInfo` and
 * `requestInfo`; OrchestrateMCP varies by none of them — it is stateless,
 * unauthenticated, read-only advice, and both eras get the identical surface.
 */
export function createOrchestrateMcpServer(_ctx?: McpRequestContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS, cacheHints: CACHE_HINTS },
  );

  registerTools(server);
  registerResources(server);

  return server;
}
