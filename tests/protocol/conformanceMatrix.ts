/**
 * The named protocol conformance matrix (MAR-459).
 *
 * This module is the SOURCE of `docs/PROTOCOL_CONFORMANCE.md`. It declares
 * three things and nothing else:
 *
 *   1. `PINNED_REVISIONS` — every protocol revision OrchestrateMCP claims to
 *      serve. `conformance.test.ts` asserts this list against what the live
 *      handler actually negotiates, so a revision appearing in or disappearing
 *      from the SDK's supported set fails CI instead of silently widening or
 *      narrowing the claim.
 *   2. `BEHAVIORS` — the named behaviors a revision can promise. Named, not
 *      counted: this matrix reports which behaviors are proven at which
 *      revision, and deliberately publishes no coverage percentage, because
 *      "percent of the lifecycle" has no defined denominator.
 *   3. `MATRIX` — one explicit declaration per (revision × behavior) cell.
 *
 * ── The three-state rule (MAR-460's trap, which applies here too) ──
 *
 * A revision with NO fixture and a revision with a FAILING fixture are
 * different states, and neither is "conformant". A declaration is therefore
 * never a result:
 *
 *   declared `pinned`          → the cell's outcome comes from whether the
 *                                bound fixture RAN and PASSED. A pinned cell
 *                                whose fixture did not run resolves to
 *                                `unproven`, never to `conformant`.
 *   declared `not_pinned`      → no fixture exists. Renders as its own cell
 *                                with a required reason. Never `conformant`,
 *                                never `failing`.
 *   declared `not_in_revision` → the revision does not define the behavior at
 *                                all, so there is nothing to pin.
 *
 * `resolveCell` is the only way to turn a declaration into an outcome, and it
 * cannot produce `conformant` without a passing fixture.
 */

export type Era = "legacy" | "modern";

export interface Revision {
  /** The wire revision identifier, e.g. `2026-07-28`. */
  id: string;
  era: Era;
  /** How a client reaches this revision. */
  reached_by: string;
  /**
   * The commit that made this revision servable by the deployed code — the
   * MERGED half of supported / merged / conformance-proven.
   */
  merged_in: string;
}

/**
 * Every revision OrchestrateMCP claims to serve, oldest first.
 *
 * The five legacy revisions are the SDK's `SUPPORTED_PROTOCOL_VERSIONS` — the
 * set `initialize` will negotiate — and `2026-07-28` is what `server/discover`
 * advertises. `src/mcpServer.ts` passes no `supportedProtocolVersions`
 * override, so this list IS the server's claim; `conformance.test.ts` proves
 * the two agree.
 */
export const PINNED_REVISIONS: readonly Revision[] = [
  {
    id: "2024-10-07",
    era: "legacy",
    reached_by: "`initialize` handshake",
    merged_in: "14aa04b",
  },
  {
    id: "2024-11-05",
    era: "legacy",
    reached_by: "`initialize` handshake",
    merged_in: "14aa04b",
  },
  {
    id: "2025-03-26",
    era: "legacy",
    reached_by: "`initialize` handshake",
    merged_in: "14aa04b",
  },
  {
    id: "2025-06-18",
    era: "legacy",
    reached_by: "`initialize` handshake",
    merged_in: "14aa04b",
  },
  {
    id: "2025-11-25",
    era: "legacy",
    reached_by: "`initialize` handshake (the legacy default)",
    merged_in: "14aa04b",
  },
  {
    id: "2026-07-28",
    era: "modern",
    reached_by: "`server/discover` + per-request `_meta` envelope",
    merged_in: "14aa04b",
  },
] as const;

/** The pinned legacy-era revisions — what `initialize` will negotiate. */
export const LEGACY_ERA_REVISIONS: readonly string[] = PINNED_REVISIONS.filter(
  (revision) => revision.era === "legacy",
).map((revision) => revision.id);

/** The pinned modern-era revisions — what `server/discover` advertises. */
export const MODERN_ERA_REVISIONS: readonly string[] = PINNED_REVISIONS.filter(
  (revision) => revision.era === "modern",
).map((revision) => revision.id);

export interface Behavior {
  id: string;
  title: string;
  /** What a client may rely on at a revision where this cell is conformant. */
  promise: string;
}

/**
 * The behaviors a revision can promise, in the order a client meets them:
 * negotiate, learn the surface, use it, survive its edges.
 */
export const BEHAVIORS: readonly Behavior[] = [
  {
    id: "negotiation",
    title: "Revision negotiation",
    promise:
      "A client asking for this revision is answered AT this revision, and the server names the revision back rather than silently serving another one.",
  },
  {
    id: "capabilities",
    title: "Capability negotiation",
    promise:
      "The advertised capability set is exactly `tools` + `resources` (both `listChanged`), and never claims prompts, logging, completions or tasks.",
  },
  {
    id: "capability-honesty",
    title: "Undeclared capabilities stay unserved",
    promise:
      "Every method behind a capability this server does not advertise answers `-32601` rather than half-implementing it.",
  },
  {
    id: "tools-surface",
    title: "Tool surface",
    promise:
      "Byte-for-byte the same tool definitions, in the same curated registration order, as every other supported revision — no revision sees a different surface.",
  },
  {
    id: "tool-schemas",
    title: "Tool schemas",
    promise:
      "Every tool carries a JSON-Schema 2020-12 `inputSchema`, and a tool that declares an `outputSchema` returns `structuredContent` alongside its text content.",
  },
  {
    id: "errors",
    title: "Error vocabulary",
    promise:
      "Unknown method `-32601`, unknown tool `-32602`, unknown resource `-32602`, and invalid tool arguments as an `isError` TOOL RESULT rather than a JSON-RPC error.",
  },
  {
    id: "era-fields",
    title: "Era-specific result fields",
    promise:
      "`resultType`, `_meta.serverInfo`, `ttlMs` and `cacheScope` appear on 2026-07-28 results and on no legacy result.",
  },
  {
    id: "cancellation",
    title: "Cancellation",
    promise:
      "`notifications/cancelled` is accepted with `202` and an empty body, an unknown request id is ignored rather than answered, and the endpoint keeps serving afterwards.",
  },
  {
    id: "batching",
    title: "JSON-RPC batching",
    promise:
      "Legacy revisions answer every member of a batch; 2026-07-28 refuses batched requests with `-32600` naming the revision.",
  },
  {
    id: "transport",
    title: "Streamable HTTP transport",
    promise:
      "Session verbs are refused (`GET`/`DELETE` → 405); `Content-Type` and JSON well-formedness are enforced, with `-32700` for unparseable bodies and `-32600` for parseable non-JSON-RPC ones; the legacy era demands the dual `Accept: application/json, text/event-stream` while 2026-07-28 answers plain JSON and does not gate on `Accept`; and on 2026-07-28 the MCP-* header/body agreement, envelope completeness and unsupported-revision rules hold.",
  },
  {
    id: "tasks",
    title: "MCP Tasks (long-running work)",
    promise:
      "`tasks/*` and task-augmented `tools/call` serve long-running work as first-class, resumable tasks.",
  },
  {
    id: "apps",
    title: "MCP Apps (UI card rendering)",
    promise:
      "Tool results carry a UI resource a host can render as an interactive card.",
  },
] as const;

export type CellDeclaration =
  | { readonly state: "pinned" }
  | { readonly state: "not_pinned"; readonly reason: string }
  | { readonly state: "not_in_revision"; readonly reason: string };

const PINNED: CellDeclaration = { state: "pinned" };

/**
 * MCP Tasks and MCP Apps arrived with the modern era, so there is nothing for
 * a 2025-era client to conform to.
 */
function notInRevision(surface: string): CellDeclaration {
  return {
    state: "not_in_revision",
    reason: `${surface} does not exist before 2026-07-28.`,
  };
}

/**
 * The two deferred surfaces.
 *
 * Both are real parts of 2026-07-28 that OrchestrateMCP does not serve today,
 * and MAR-459 scopes them behind the core matrix. They are declared, not
 * omitted, precisely so the published matrix cannot read as if the modern
 * revision were fully proven.
 *
 * Note what IS pinned in their place: the `capability-honesty` cell proves
 * `tasks/*` answers `-32601`, so "not served" is itself locked. What is
 * unpinned is SERVING them.
 */
const TASKS_DEFERRED: CellDeclaration = {
  state: "not_pinned",
  reason:
    "No tasks capability is served and none is fixtured. MAR-459 defers evaluating MCP Tasks until cancellation semantics are stable.",
};

const APPS_DEFERRED: CellDeclaration = {
  state: "not_pinned",
  reason:
    "No UI resource is served and none is fixtured. MAR-459 defers evaluating MCP Apps card rendering until the core matrix is green.",
};

/** Every (revision × behavior) cell, explicitly declared. */
export const MATRIX: Readonly<Record<string, Readonly<Record<string, CellDeclaration>>>> =
  Object.fromEntries(
    PINNED_REVISIONS.map((revision) => [
      revision.id,
      Object.fromEntries(
        BEHAVIORS.map((behavior) => {
          if (behavior.id === "tasks") {
            return [
              behavior.id,
              revision.era === "modern" ? TASKS_DEFERRED : notInRevision("MCP Tasks"),
            ];
          }
          if (behavior.id === "apps") {
            return [
              behavior.id,
              revision.era === "modern" ? APPS_DEFERRED : notInRevision("MCP Apps"),
            ];
          }
          return [behavior.id, PINNED];
        }),
      ),
    ]),
  );

/**
 * What a cell resolves to once the fixtures have (or have not) run.
 *
 * `unproven` is the state that keeps the matrix honest: a cell declared
 * `pinned` whose fixture never executed is NOT conformant, and it is not
 * "not pinned" either — it is a broken gate, and the gate fails on it.
 */
export type CellOutcome =
  | "conformant"
  | "failing"
  | "unproven"
  | "not_pinned"
  | "not_in_revision";

export interface FixtureResult {
  /** Whether a fixture bound to this cell executed at all. */
  ran: boolean;
  /** Whether every fixture bound to this cell passed. Meaningless when `ran` is false. */
  passed: boolean;
}

export function cellKey(revisionId: string, behaviorId: string): string {
  return `${revisionId}::${behaviorId}`;
}

/**
 * The token every conformance fixture embeds in its test name so the gate can
 * bind a test result back to a matrix cell without a hand-maintained mapping.
 */
export function fixtureToken(revisionId: string, behaviorId: string): string {
  return `[conformance ${revisionId} ${behaviorId}]`;
}

const TOKEN_PATTERN = /\[conformance (\S+) (\S+)\]/;

/** Recover the cell a test name is bound to, or `undefined` for an unbound test. */
export function parseFixtureToken(
  testName: string,
): { revisionId: string; behaviorId: string } | undefined {
  const match = TOKEN_PATTERN.exec(testName);
  if (match === null) return undefined;
  return { revisionId: match[1] as string, behaviorId: match[2] as string };
}

export function declarationFor(revisionId: string, behaviorId: string): CellDeclaration {
  const row = MATRIX[revisionId];
  if (row === undefined) throw new Error(`no matrix row for revision ${revisionId}`);
  const cell = row[behaviorId];
  if (cell === undefined) {
    throw new Error(`no matrix cell for ${revisionId} × ${behaviorId}`);
  }
  return cell;
}

/**
 * Turn one declaration plus one fixture result into a published outcome.
 *
 * The whole three-state rule lives here: `conformant` is reachable ONLY from a
 * pinned declaration whose fixture ran and passed. Absence of a fixture never
 * becomes evidence in either direction.
 */
export function resolveCell(
  declaration: CellDeclaration,
  result: FixtureResult | undefined,
): CellOutcome {
  if (declaration.state === "not_pinned") return "not_pinned";
  if (declaration.state === "not_in_revision") return "not_in_revision";
  if (result === undefined || !result.ran) return "unproven";
  return result.passed ? "conformant" : "failing";
}

/** Resolve the whole matrix against a set of fixture results, keyed by `cellKey`. */
export function resolveMatrix(
  results: ReadonlyMap<string, FixtureResult>,
): Map<string, CellOutcome> {
  const outcomes = new Map<string, CellOutcome>();
  for (const revision of PINNED_REVISIONS) {
    for (const behavior of BEHAVIORS) {
      const key = cellKey(revision.id, behavior.id);
      outcomes.set(key, resolveCell(declarationFor(revision.id, behavior.id), results.get(key)));
    }
  }
  return outcomes;
}

/**
 * The outcome map the COMMITTED document is rendered from: every pinned cell
 * conformant.
 *
 * This is the green baseline, not a claim that the fixtures passed — the
 * fixtures passing is asserted by the fixtures themselves and by the gate.
 * Keeping the committed document at the green baseline means a red cell shows
 * up as a failing gate with a rendered diff, not as a silently updated doc.
 */
export function greenBaseline(): Map<string, CellOutcome> {
  const results = new Map<string, FixtureResult>();
  for (const revision of PINNED_REVISIONS) {
    for (const behavior of BEHAVIORS) {
      if (declarationFor(revision.id, behavior.id).state === "pinned") {
        results.set(cellKey(revision.id, behavior.id), { ran: true, passed: true });
      }
    }
  }
  return resolveMatrix(results);
}

const SYMBOLS: Record<CellOutcome, string> = {
  conformant: "✅",
  failing: "❌",
  unproven: "⚠️",
  not_pinned: "◻️",
  not_in_revision: "–",
};

const LEGEND: Record<CellOutcome, string> = {
  conformant: "a pinned fixture for this revision asserts this behavior and it passed",
  failing: "a pinned fixture for this revision asserts this behavior and it FAILED",
  unproven:
    "declared pinned, but no fixture executed — the gate treats this as a broken pin, never as conformance",
  not_pinned: "no fixture exists for this behavior at this revision (see the note under the table)",
  not_in_revision: "this revision does not define the behavior, so there is nothing to pin",
};

export function symbolFor(outcome: CellOutcome): string {
  return SYMBOLS[outcome];
}

/** Short revision label for the table header — the year-month keeps the table readable. */
function columnLabel(revision: Revision): string {
  return revision.id;
}

/**
 * Render the published matrix document.
 *
 * The entire file is generated so `--check` can compare byte for byte; there
 * is no hand-edited region to drift.
 */
export function renderMatrixMarkdown(outcomes: ReadonlyMap<string, CellOutcome>): string {
  const lines: string[] = [];

  lines.push("# OrchestrateMCP protocol conformance matrix");
  lines.push("");
  lines.push(
    "<!-- GENERATED FILE — do not edit by hand.",
    "     Source: tests/protocol/conformanceMatrix.ts",
    "     Regenerate: pnpm exec tsx scripts/conformance-matrix.ts --write -->",
  );
  lines.push("");
  lines.push(
    "This matrix names every MCP protocol revision OrchestrateMCP claims to serve and,",
    "for each one, the specific behaviors a client may rely on. It reports NAMED CELLS,",
    "not a coverage percentage — \"percent of the protocol lifecycle\" has no defined",
    "denominator, so this document does not quote one.",
  );
  lines.push("");

  lines.push("## Supported, merged, conformance-proven");
  lines.push("");
  lines.push(
    "These are three different claims and this document keeps them apart:",
  );
  lines.push("");
  lines.push(
    "- **Supported** — the server will negotiate this revision. `src/mcpServer.ts` sets no",
    "  `supportedProtocolVersions` override, so the claim is the SDK's negotiated set;",
    "  `tests/protocol/conformance.test.ts` asserts the list below against the live handler,",
    "  so a revision the SDK adds or drops fails CI instead of quietly changing the claim.",
    "- **Merged** — the commit implementing the serving path is an ancestor of `master`.",
    "- **Conformance-proven** — a pinned fixture drives the real `createMcpHandler` at that",
    "  revision and passes in CI. This is the only column that can say a behavior works.",
  );
  lines.push("");
  lines.push("| Revision | Era | Reached by | Merged in |");
  lines.push("| --- | --- | --- | --- |");
  for (const revision of PINNED_REVISIONS) {
    lines.push(
      `| \`${revision.id}\` | ${revision.era} | ${revision.reached_by} | \`${revision.merged_in}\` |`,
    );
  }
  lines.push("");

  lines.push("## Matrix");
  lines.push("");
  lines.push(`| Behavior | ${PINNED_REVISIONS.map(columnLabel).join(" | ")} |`);
  lines.push(`| --- | ${PINNED_REVISIONS.map(() => "---").join(" | ")} |`);
  for (const behavior of BEHAVIORS) {
    const cells = PINNED_REVISIONS.map((revision) => {
      const outcome = outcomes.get(cellKey(revision.id, behavior.id));
      return outcome === undefined ? "?" : symbolFor(outcome);
    });
    lines.push(`| ${behavior.title} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("### Legend");
  lines.push("");
  for (const outcome of Object.keys(SYMBOLS) as CellOutcome[]) {
    lines.push(`- ${SYMBOLS[outcome]} **${outcome}** — ${LEGEND[outcome]}`);
  }
  lines.push("");
  lines.push(
    "`◻️` and `❌` are deliberately different cells. A behavior with no fixture is not",
    "evidence that the behavior works, and it is not evidence that it is broken; it is",
    "the absence of evidence, and it renders as its own state.",
  );
  lines.push("");

  lines.push("## What each behavior promises");
  lines.push("");
  for (const behavior of BEHAVIORS) {
    lines.push(`### ${behavior.title}`);
    lines.push("");
    lines.push(behavior.promise);
    lines.push("");
  }

  const unpinned: string[] = [];
  for (const revision of PINNED_REVISIONS) {
    for (const behavior of BEHAVIORS) {
      const declaration = declarationFor(revision.id, behavior.id);
      if (declaration.state === "not_pinned") {
        unpinned.push(`- \`${revision.id}\` × **${behavior.title}** — ${declaration.reason}`);
      }
    }
  }
  if (unpinned.length > 0) {
    lines.push("## Not pinned, and why");
    lines.push("");
    lines.push(
      "Each cell below is a behavior the revision defines and OrchestrateMCP does not",
      "prove. They are listed so the matrix cannot be read as covering them.",
    );
    lines.push("");
    lines.push(...unpinned);
    lines.push("");
  }

  lines.push("## Known leniencies");
  lines.push("");
  lines.push(
    "Recorded so they cannot drift silently. None of these breaks a client:",
  );
  lines.push("");
  lines.push(
    "- **Batching after 2025-06-18.** The 2025-06-18 revision removed JSON-RPC batching from",
    "  the specification, but this server still answers a batch from any legacy client. That",
    "  is leniency toward older clients, not a broken promise to newer ones; the pinned",
    "  `batching` fixtures assert it stays that way, and that 2026-07-28 refuses batches.",
    "- **`outputSchema` before 2025-06-18.** `outputSchema` and `structuredContent` entered",
    "  the specification in 2025-06-18, and this server sends them to 2024-era clients too.",
    "  Unknown fields are ignorable by specification, so this is additive; the",
    "  `tool-schemas` fixtures pin it at every revision rather than leaving it incidental.",
    "- **Unknown legacy revision.** A legacy `initialize` naming an unrecognised revision is",
    "  answered at `2025-11-25` rather than refused, which is what the 2025-era handshake",
    "  prescribes. The modern era does the opposite and refuses with `-32022`; both are pinned.",
  );
  lines.push("");

  lines.push("## Reproducing this");
  lines.push("");
  lines.push("```");
  lines.push("pnpm exec vitest run tests/protocol          # the fixtures");
  lines.push("pnpm exec tsx scripts/conformance-matrix.ts --check   # the gate + this document");
  lines.push("```");
  lines.push("");
  lines.push(
    "The gate runs the fixtures, binds each result back to its cell, and fails when a",
    "supported revision drifts, when a pinned cell has no executing fixture, when a",
    "pinned fixture fails, or when this document no longer matches the source. CI runs",
    "it as a named step in `.github/workflows/ci.yml`.",
  );
  lines.push("");

  return lines.join("\n");
}
