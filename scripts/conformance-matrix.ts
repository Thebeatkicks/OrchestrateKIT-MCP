/**
 * Protocol conformance gate (MAR-459).
 *
 * Runs the conformance fixtures, binds every result back to a cell of
 * `tests/protocol/conformanceMatrix.ts`, and publishes
 * `docs/PROTOCOL_CONFORMANCE.md`.
 *
 *   pnpm exec tsx scripts/conformance-matrix.ts --check   # CI gate
 *   pnpm exec tsx scripts/conformance-matrix.ts --write   # regenerate the document
 *
 * Four failures, any of which exits 1:
 *
 *   1. A pinned cell whose fixture did not run. This is the failure the gate
 *      exists for: without it, deleting or skipping a fixture would leave the
 *      published matrix claiming ✅ for a behavior nothing tests. An unproven
 *      cell is never rendered as conformant and never as not-pinned — it gets
 *      its own state and it fails the build.
 *   2. A pinned cell whose fixture failed.
 *   3. A fixture bound to a cell the matrix does not declare pinned — an
 *      orphan, which means the matrix and the fixtures have drifted apart.
 *   4. `docs/PROTOCOL_CONFORMANCE.md` out of sync with the source.
 *
 * Revision drift itself — the SDK gaining or losing a supported revision —
 * fails inside the fixtures (`claimed revisions`), which surfaces here as (2).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PINNED_REVISIONS,
  BEHAVIORS,
  cellKey,
  declarationFor,
  parseFixtureToken,
  resolveMatrix,
  renderMatrixMarkdown,
  symbolFor,
  type CellOutcome,
  type FixtureResult,
} from "../tests/protocol/conformanceMatrix.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MATRIX_DOC_PATH = join("docs", "PROTOCOL_CONFORMANCE.md");
const FIXTURE_SUITE = join("tests", "protocol", "conformance.test.ts");

/** The shape this gate consumes from vitest's JSON reporter. */
export interface VitestJsonReport {
  testResults?: {
    assertionResults?: { fullName?: string; status?: string }[];
  }[];
}

/**
 * Bind every fixture in a vitest JSON report back to its matrix cell.
 *
 * Pure so it can be tested without running vitest. A cell is `passed` only if
 * EVERY fixture bound to it passed, and a skipped/todo fixture counts as not
 * having run — a skip must not be able to publish a green cell.
 */
export function collectFixtureResults(report: VitestJsonReport): Map<string, FixtureResult> {
  const results = new Map<string, FixtureResult>();
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const bound = parseFixtureToken(assertion.fullName ?? "");
      if (bound === undefined) continue;
      const key = cellKey(bound.revisionId, bound.behaviorId);
      const ran = assertion.status === "passed" || assertion.status === "failed";
      const passed = assertion.status === "passed";
      const previous = results.get(key);
      results.set(
        key,
        previous === undefined
          ? { ran, passed }
          : { ran: previous.ran || ran, passed: previous.passed && passed },
      );
    }
  }
  return results;
}

/**
 * Failed tests in the fixture suite that are bound to no cell — most
 * importantly the `claimed revisions` assertions, which are what turns a
 * revision appearing in or disappearing from the server's supported set into a
 * red gate. Without this, a cell-less failure would run, fail vitest, and be
 * invisible to a gate that only reads bound cells. Pure.
 */
export function computeUnboundFailures(report: VitestJsonReport): string[] {
  const failures: string[] = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const name = assertion.fullName ?? "";
      if (assertion.status !== "failed") continue;
      if (parseFixtureToken(name) !== undefined) continue;
      failures.push(`${FIXTURE_SUITE} failed a check bound to no cell: "${name}".`);
    }
  }
  return failures;
}

/**
 * Every reason the gate should fail, given resolved outcomes and the raw
 * fixture bindings. Pure.
 */
export function computeGateFailures(
  outcomes: ReadonlyMap<string, CellOutcome>,
  results: ReadonlyMap<string, FixtureResult>,
): string[] {
  const failures: string[] = [];

  for (const revision of PINNED_REVISIONS) {
    for (const behavior of BEHAVIORS) {
      const key = cellKey(revision.id, behavior.id);
      const outcome = outcomes.get(key);
      if (outcome === "unproven") {
        failures.push(
          `${key} is declared pinned but no fixture executed. Add a fixture whose name ` +
            `contains "[conformance ${revision.id} ${behavior.id}]" in ${FIXTURE_SUITE}, ` +
            `or declare the cell not_pinned with a reason — it must not publish as conformant.`,
        );
      }
      if (outcome === "failing") {
        failures.push(
          `${key} is pinned and its fixture FAILED. Protocol revision ${revision.id} no longer ` +
            `honours "${behavior.title}".`,
        );
      }
    }
  }

  for (const key of results.keys()) {
    const [revisionId, behaviorId] = key.split("::") as [string, string];
    const known = PINNED_REVISIONS.some((revision) => revision.id === revisionId);
    if (!known) {
      failures.push(
        `a fixture is bound to ${key}, but ${revisionId} is not a pinned revision. ` +
          `Add it to PINNED_REVISIONS or fix the fixture token.`,
      );
      continue;
    }
    if (declarationFor(revisionId, behaviorId).state !== "pinned") {
      failures.push(
        `a fixture is bound to ${key}, but that cell is not declared pinned. ` +
          `A cell cannot be both fixtured and unpinned.`,
      );
    }
  }

  return failures;
}

/** The matrix as a terminal table, so a red CI step shows WHICH cell went red. */
export function renderConsoleMatrix(outcomes: ReadonlyMap<string, CellOutcome>): string {
  const width = Math.max(...BEHAVIORS.map((behavior) => behavior.title.length));
  const lines = [
    `${"behavior".padEnd(width)}  ${PINNED_REVISIONS.map((r) => r.id).join("  ")}`,
  ];
  for (const behavior of BEHAVIORS) {
    const cells = PINNED_REVISIONS.map((revision) => {
      const outcome = outcomes.get(cellKey(revision.id, behavior.id));
      return (outcome === undefined ? "?" : symbolFor(outcome)).padEnd(revision.id.length);
    });
    lines.push(`${behavior.title.padEnd(width)}  ${cells.join("  ")}`);
  }
  return lines.join("\n");
}

function runFixtures(): VitestJsonReport {
  const outputDir = mkdtempSync(join(tmpdir(), "conformance-"));
  const outputFile = join(outputDir, "report.json");
  try {
    // Windows resolves pnpm/vitest shims as .cmd, which CreateProcess can only
    // launch through a shell; every argument here is a static literal.
    const execOptions = {
      cwd: ROOT,
      stdio: "pipe" as const,
      ...(process.platform === "win32" ? { shell: true } : {}),
    };
    try {
      execFileSync(
        "pnpm",
        ["exec", "vitest", "run", FIXTURE_SUITE, "--reporter=json", `--outputFile=${outputFile}`],
        execOptions,
      );
    } catch {
      // A failing fixture makes vitest exit non-zero. That is a RESULT, not a
      // crash: the report still exists and the failing cells belong in the
      // published matrix. Only a missing report is fatal.
      if (!existsSync(outputFile)) {
        throw new Error(
          `vitest produced no JSON report at ${outputFile}. Run \`pnpm exec vitest run ${FIXTURE_SUITE}\` to see why.`,
        );
      }
    }
    return JSON.parse(readFileSync(outputFile, "utf8")) as VitestJsonReport;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const mode = process.argv.includes("--write") ? "write" : "check";

  const report = runFixtures();
  const results = collectFixtureResults(report);
  const outcomes = resolveMatrix(results);
  const failures = [
    ...computeGateFailures(outcomes, results),
    ...computeUnboundFailures(report),
  ];
  const document = renderMatrixMarkdown(outcomes);
  const documentPath = join(ROOT, MATRIX_DOC_PATH);

  process.stderr.write(`\n${renderConsoleMatrix(outcomes)}\n\n`);

  if (mode === "write") {
    writeFileSync(documentPath, document, "utf8");
    process.stderr.write(`✓ wrote ${MATRIX_DOC_PATH}\n`);
    if (failures.length > 0) {
      process.stderr.write("\n✗ protocol conformance gate FAILED (MAR-459):\n");
      for (const failure of failures) process.stderr.write(`  • ${failure}\n`);
      process.exit(1);
    }
    return;
  }

  // Normalize CRLF the same way `pnpm test`'s conformanceMatrix.test.ts does:
  // a Windows checkout with `core.autocrlf=true` rewrites this LF-generated
  // file to CRLF on disk, which is a checkout artifact, not drift (MAR-496).
  const committed = existsSync(documentPath)
    ? readFileSync(documentPath, "utf8").replace(/\r\n/g, "\n")
    : undefined;
  if (committed !== document) {
    failures.push(
      `${MATRIX_DOC_PATH} does not match the matrix source. ` +
        `Regenerate it with \`pnpm exec tsx scripts/conformance-matrix.ts --write\`.`,
    );
  }

  if (failures.length > 0) {
    process.stderr.write("\n✗ protocol conformance gate FAILED (MAR-459):\n");
    for (const failure of failures) process.stderr.write(`  • ${failure}\n`);
    process.stderr.write("\n");
    process.exit(1);
  }

  const proven = [...outcomes.values()].filter((outcome) => outcome === "conformant").length;
  const unpinned = [...outcomes.values()].filter((outcome) => outcome === "not_pinned").length;
  process.stderr.write(
    `✓ protocol conformance gate passed: ${PINNED_REVISIONS.length} pinned revisions ` +
      `(${PINNED_REVISIONS.map((revision) => revision.id).join(", ")}), ` +
      `${proven} conformant cells, ${unpinned} declared not-pinned, 0 failing, ` +
      `${MATRIX_DOC_PATH} in sync.\n`,
  );
}

// Only run the gate when executed directly — importing this module (from
// tests, to reach collectFixtureResults / computeGateFailures) must not spawn
// vitest, write the document, or process.exit.
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}
