# OrchestrateMCP protocol conformance matrix

<!-- GENERATED FILE — do not edit by hand.
     Source: tests/protocol/conformanceMatrix.ts
     Regenerate: pnpm exec tsx scripts/conformance-matrix.ts --write -->

This matrix names every MCP protocol revision OrchestrateMCP claims to serve and,
for each one, the specific behaviors a client may rely on. It reports NAMED CELLS,
not a coverage percentage — "percent of the protocol lifecycle" has no defined
denominator, so this document does not quote one.

## Supported, merged, conformance-proven

These are three different claims and this document keeps them apart:

- **Supported** — the server will negotiate this revision. `src/mcpServer.ts` sets no
  `supportedProtocolVersions` override, so the claim is the SDK's negotiated set;
  `tests/protocol/conformance.test.ts` asserts the list below against the live handler,
  so a revision the SDK adds or drops fails CI instead of quietly changing the claim.
- **Merged** — the commit implementing the serving path is an ancestor of `master`.
- **Conformance-proven** — a pinned fixture drives the real `createMcpHandler` at that
  revision and passes in CI. This is the only column that can say a behavior works.

| Revision | Era | Reached by | Merged in |
| --- | --- | --- | --- |
| `2024-10-07` | legacy | `initialize` handshake | `14aa04b` |
| `2024-11-05` | legacy | `initialize` handshake | `14aa04b` |
| `2025-03-26` | legacy | `initialize` handshake | `14aa04b` |
| `2025-06-18` | legacy | `initialize` handshake | `14aa04b` |
| `2025-11-25` | legacy | `initialize` handshake (the legacy default) | `14aa04b` |
| `2026-07-28` | modern | `server/discover` + per-request `_meta` envelope | `14aa04b` |

## Matrix

| Behavior | 2024-10-07 | 2024-11-05 | 2025-03-26 | 2025-06-18 | 2025-11-25 | 2026-07-28 |
| --- | --- | --- | --- | --- | --- | --- |
| Revision negotiation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Capability negotiation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Undeclared capabilities stay unserved | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tool surface | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tool schemas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Error vocabulary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Era-specific result fields | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cancellation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON-RPC batching | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streamable HTTP transport | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MCP Tasks (long-running work) | – | – | – | – | – | ◻️ |
| MCP Apps (UI card rendering) | – | – | – | – | – | ◻️ |

### Legend

- ✅ **conformant** — a pinned fixture for this revision asserts this behavior and it passed
- ❌ **failing** — a pinned fixture for this revision asserts this behavior and it FAILED
- ⚠️ **unproven** — declared pinned, but no fixture executed — the gate treats this as a broken pin, never as conformance
- ◻️ **not_pinned** — no fixture exists for this behavior at this revision (see the note under the table)
- – **not_in_revision** — this revision does not define the behavior, so there is nothing to pin

`◻️` and `❌` are deliberately different cells. A behavior with no fixture is not
evidence that the behavior works, and it is not evidence that it is broken; it is
the absence of evidence, and it renders as its own state.

## What each behavior promises

### Revision negotiation

A client asking for this revision is answered AT this revision, and the server names the revision back rather than silently serving another one.

### Capability negotiation

The advertised capability set is exactly `tools` + `resources` (both `listChanged`), and never claims prompts, logging, completions or tasks.

### Undeclared capabilities stay unserved

Every method behind a capability this server does not advertise answers `-32601` rather than half-implementing it.

### Tool surface

Byte-for-byte the same tool definitions, in the same curated registration order, as every other supported revision — no revision sees a different surface.

### Tool schemas

Every tool carries a JSON-Schema 2020-12 `inputSchema`, and a tool that declares an `outputSchema` returns `structuredContent` alongside its text content.

### Error vocabulary

Unknown method `-32601`, unknown tool `-32602`, unknown resource `-32602`, and invalid tool arguments as an `isError` TOOL RESULT rather than a JSON-RPC error.

### Era-specific result fields

`resultType`, `_meta.serverInfo`, `ttlMs` and `cacheScope` appear on 2026-07-28 results and on no legacy result.

### Cancellation

`notifications/cancelled` is accepted with `202` and an empty body, an unknown request id is ignored rather than answered, and the endpoint keeps serving afterwards.

### JSON-RPC batching

Legacy revisions answer every member of a batch; 2026-07-28 refuses batched requests with `-32600` naming the revision.

### Streamable HTTP transport

Session verbs are refused (`GET`/`DELETE` → 405); `Content-Type` and JSON well-formedness are enforced, with `-32700` for unparseable bodies and `-32600` for parseable non-JSON-RPC ones; the legacy era demands the dual `Accept: application/json, text/event-stream` while 2026-07-28 answers plain JSON and does not gate on `Accept`; and on 2026-07-28 the MCP-* header/body agreement, envelope completeness and unsupported-revision rules hold.

### MCP Tasks (long-running work)

`tasks/*` and task-augmented `tools/call` serve long-running work as first-class, resumable tasks.

### MCP Apps (UI card rendering)

Tool results carry a UI resource a host can render as an interactive card.

## Not pinned, and why

Each cell below is a behavior the revision defines and OrchestrateMCP does not
prove. They are listed so the matrix cannot be read as covering them.

- `2026-07-28` × **MCP Tasks (long-running work)** — No tasks capability is served and none is fixtured. MAR-459 defers evaluating MCP Tasks until cancellation semantics are stable.
- `2026-07-28` × **MCP Apps (UI card rendering)** — No UI resource is served and none is fixtured. MAR-459 defers evaluating MCP Apps card rendering until the core matrix is green.

## Known leniencies

Recorded so they cannot drift silently. None of these breaks a client:

- **Batching after 2025-06-18.** The 2025-06-18 revision removed JSON-RPC batching from
  the specification, but this server still answers a batch from any legacy client. That
  is leniency toward older clients, not a broken promise to newer ones; the pinned
  `batching` fixtures assert it stays that way, and that 2026-07-28 refuses batches.
- **`outputSchema` before 2025-06-18.** `outputSchema` and `structuredContent` entered
  the specification in 2025-06-18, and this server sends them to 2024-era clients too.
  Unknown fields are ignorable by specification, so this is additive; the
  `tool-schemas` fixtures pin it at every revision rather than leaving it incidental.
- **Unknown legacy revision.** A legacy `initialize` naming an unrecognised revision is
  answered at `2025-11-25` rather than refused, which is what the 2025-era handshake
  prescribes. The modern era does the opposite and refuses with `-32022`; both are pinned.

## Reproducing this

```
pnpm exec vitest run tests/protocol          # the fixtures
pnpm exec tsx scripts/conformance-matrix.ts --check   # the gate + this document
```

The gate runs the fixtures, binds each result back to its cell, and fails when a
supported revision drifts, when a pinned cell has no executing fixture, when a
pinned fixture fails, or when this document no longer matches the source. CI runs
it as a named step in `.github/workflows/ci.yml`.
