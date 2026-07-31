/**
 * Shared CORS headers for the two HTTP entries (MAR-448).
 *
 * OrchestrateMCP is read-only advisory data with no secrets and no auth, so
 * `*` is the correct origin policy.
 *
 * The allow-list tracks protocol revision 2026-07-28:
 *  - `Mcp-Method` / `Mcp-Name` are REQUIRED on Streamable HTTP POSTs (SEP-2243).
 *    Browser clients fail preflight without them on this list.
 *  - `MCP-Protocol-Version` carries the per-request revision.
 *  - `Mcp-Session-Id` is GONE: protocol sessions were removed (SEP-2567).
 *  - `DELETE` is dropped with it — that verb only ever terminated a session.
 *    `GET` stays for /health, not for MCP: the 2025 SSE GET endpoint was
 *    replaced by `subscriptions/listen`, which this server does not implement
 *    (a build-time frozen registry has nothing to notify about).
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Authorization",
    "MCP-Protocol-Version",
    "Mcp-Method",
    "Mcp-Name",
  ].join(", "),
};
