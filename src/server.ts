/**
 * OrchestrateMCP — stdio entry (MAR-448).
 *
 * Serves BOTH protocol eras from one process via `serveStdio`:
 *  - modern (2026-07-28): no handshake, per-request `_meta` envelope,
 *    `server/discover` for up-front version selection.
 *  - legacy (2025-11-25 and earlier): the `initialize` handshake, unchanged.
 *
 * `legacy: 'serve'` is the SDK default and is left implicit-by-choice below
 * (passed explicitly for the reader's benefit). It is what keeps every client
 * shipping today working: the opening exchange selects the era, one instance
 * from the factory is pinned for the connection, and everything after passes
 * straight through.
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import { createOrchestrateMcpServer } from "./mcpServer.js";
import { bootstrapNodeRegistry } from "./registry/nodeRegistryBootstrap.js";
import { logger } from "./lib/logger.js";

function main(): void {
  bootstrapNodeRegistry();

  const handle = serveStdio(createOrchestrateMcpServer, {
    legacy: "serve",
    onerror: (err) => logger.error("stdio serving error", err),
  });

  logger.info(`${SERVER_NAME} v${SERVER_VERSION} running on stdio (2026-07-28 + legacy)`);

  const shutdown = (): void => {
    void handle.close().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

try {
  main();
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
}
