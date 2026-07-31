/**
 * MAR-111 / MAR-448: OrchestrateMCP — HTTP (Streamable HTTP) transport server.
 *
 * Exposes the same 19 tools as the stdio server over MCP Streamable HTTP so
 * remote clients (ChatGPT Actions, Claude Cowork, Cursor remote, etc.) can
 * connect without a local process spawn.
 *
 * Usage:
 *   pnpm start:http             # listens on http://127.0.0.1:3001/mcp
 *   PORT=4000 pnpm start:http   # custom port
 *   HOST=0.0.0.0 pnpm start:http   # bind all interfaces (behind ngrok/tunnel)
 *
 * DUAL-ERA. One endpoint serves both protocol eras:
 *  - 2026-07-28 requests (per-request `_meta` envelope) are served statelessly
 *    per this revision, including the mandatory `server/discover`.
 *  - 2025-era requests (`initialize` handshake) are served by
 *    `legacy: 'stateless'` — a fresh instance from the same factory per
 *    request, which is exactly the pattern this file used to hand-roll.
 *
 * Because legacy serving is stateless, GET and DELETE on /mcp (2025 session
 * operations) are answered 405 by the handler — sessions were removed from the
 * protocol in 2026-07-28 and this server never used them.
 *
 * Security note: this server has no auth built in. When exposing via a tunnel
 * (ngrok / Cloudflare Tunnel / etc.), add an API-key header check or OAuth
 * layer in front — the MCP spec supports bearer tokens via the Authorization
 * header, but OrchestrateMCP has no secrets to protect (read-only advisory).
 */

import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import { createOrchestrateMcpServer } from "./mcpServer.js";
import { bootstrapNodeRegistry } from "./registry/nodeRegistryBootstrap.js";
import { CORS_HEADERS } from "./lib/cors.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.PORT ?? 3001);
// When a hosting platform injects PORT (Railway, Render, Fly, etc.) we must
// bind all interfaces so the platform's router can reach us. Locally (no PORT
// injected) we keep 127.0.0.1 — the tunnel connects via loopback. HOST always
// wins if explicitly set.
const HOST =
  process.env.HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");

async function main(): Promise<void> {
  bootstrapNodeRegistry();

  // One handler for the process: it is stateless per request internally, so
  // unlike the 2025-era wiring there is no per-request construction here.
  const mcpHandler = createMcpHandler(createOrchestrateMcpServer, {
    legacy: "stateless",
    onerror: (err) => logger.error("MCP handler error", err),
  });
  const handleMcp = toNodeHandler(mcpHandler, {
    onerror: (err) => logger.error("Node adapter error", err),
  });

  const httpServer = createServer(async (req, res) => {
    // CORS — allow all origins (OrchestrateMCP is read-only advisory; no secrets)
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(key, value);
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = req.url ?? "/";

    // Health check endpoint — useful for tunnel health probes and uptime monitoring.
    if (url === "/" || url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          status: "ok",
          server: SERVER_NAME,
          version: SERVER_VERSION,
          transport: "streamable-http",
          mcp_endpoint: `http://${HOST}:${PORT}/mcp`,
        }),
      );
      return;
    }

    if (url === "/mcp") {
      await handleMcp(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        error: "Not found",
        hint: `MCP endpoint is at /mcp`,
      }),
    );
  });

  httpServer.listen(PORT, HOST, () => {
    process.stderr.write(
      `${SERVER_NAME} v${SERVER_VERSION} HTTP MCP server (2026-07-28 + legacy)\n` +
        `  MCP endpoint: http://${HOST}:${PORT}/mcp\n` +
        `  Health check: http://${HOST}:${PORT}/health\n`,
    );
  });

  const shutdown = (): void => {
    httpServer.close();
    void mcpHandler.close().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
