/**
 * Tests for the conformance matrix itself (MAR-459).
 *
 * `conformance.test.ts` proves the SERVER. This file proves the INSTRUMENT:
 * that a missing fixture can never publish as conformance, that a failing
 * fixture and an absent one are different published states, and that the
 * committed document is the rendering of the source rather than prose someone
 * updated by hand.
 *
 * Everything here is pure — no handler, no vitest subprocess — so the gate's
 * own logic is proven by `pnpm verify` without running the gate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PINNED_REVISIONS,
  BEHAVIORS,
  MATRIX,
  cellKey,
  declarationFor,
  fixtureToken,
  parseFixtureToken,
  resolveCell,
  resolveMatrix,
  renderMatrixMarkdown,
  greenBaseline,
  symbolFor,
  type FixtureResult,
} from "./conformanceMatrix.js";
import {
  collectFixtureResults,
  computeGateFailures,
  computeUnboundFailures,
  MATRIX_DOC_PATH,
  type VitestJsonReport,
} from "../../scripts/conformance-matrix.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A report in which every pinned cell has one passing fixture. */
function fullyPassingReport(): VitestJsonReport {
  return {
    testResults: [
      {
        assertionResults: PINNED_REVISIONS.flatMap((revision) =>
          BEHAVIORS.filter(
            (behavior) => declarationFor(revision.id, behavior.id).state === "pinned",
          ).map((behavior) => ({
            fullName: `revision ${revision.id} ${fixtureToken(revision.id, behavior.id)} something`,
            status: "passed",
          })),
        ),
      },
    ],
  };
}

describe("cell declarations", () => {
  it("declares every revision × behavior cell", () => {
    for (const revision of PINNED_REVISIONS) {
      for (const behavior of BEHAVIORS) {
        expect(MATRIX[revision.id]?.[behavior.id], cellKey(revision.id, behavior.id)).toBeDefined();
      }
    }
  });

  it("gives every unpinned cell a reason, so absence is never unexplained", () => {
    for (const revision of PINNED_REVISIONS) {
      for (const behavior of BEHAVIORS) {
        const declaration = declarationFor(revision.id, behavior.id);
        if (declaration.state === "pinned") continue;
        expect(declaration.reason.length, cellKey(revision.id, behavior.id)).toBeGreaterThan(0);
      }
    }
  });

  it("uses unique revision and behavior ids", () => {
    expect(new Set(PINNED_REVISIONS.map((r) => r.id)).size).toBe(PINNED_REVISIONS.length);
    expect(new Set(BEHAVIORS.map((b) => b.id)).size).toBe(BEHAVIORS.length);
  });
});

describe("resolveCell keeps the three states apart", () => {
  const ranAndPassed: FixtureResult = { ran: true, passed: true };

  it("only reaches conformant through a pinned fixture that ran and passed", () => {
    expect(resolveCell({ state: "pinned" }, ranAndPassed)).toBe("conformant");
  });

  it("never publishes a pinned cell with no fixture as conformant", () => {
    // The MAR-460 trap: "not yet pinned" must not render as "conformant".
    expect(resolveCell({ state: "pinned" }, undefined)).toBe("unproven");
    expect(resolveCell({ state: "pinned" }, { ran: false, passed: true })).toBe("unproven");
  });

  it("distinguishes a failing fixture from an absent one", () => {
    const failing = resolveCell({ state: "pinned" }, { ran: true, passed: false });
    const absent = resolveCell({ state: "not_pinned", reason: "deferred" }, undefined);
    expect(failing).toBe("failing");
    expect(absent).toBe("not_pinned");
    expect(failing).not.toBe(absent);
    expect(symbolFor(failing)).not.toBe(symbolFor(absent));
  });

  it("cannot turn an unpinned cell into a result, whatever a fixture claims", () => {
    // A stray fixture bound to an unpinned cell must not silently green it —
    // the gate reports that binding as an orphan instead.
    expect(resolveCell({ state: "not_pinned", reason: "deferred" }, ranAndPassed)).toBe(
      "not_pinned",
    );
    expect(resolveCell({ state: "not_in_revision", reason: "n/a" }, ranAndPassed)).toBe(
      "not_in_revision",
    );
  });
});

describe("fixture tokens", () => {
  it("round-trips a cell through its token", () => {
    expect(parseFixtureToken(`[conformance 2026-07-28 transport] enforces things`)).toEqual({
      revisionId: "2026-07-28",
      behaviorId: "transport",
    });
  });

  it("ignores test names that carry no token", () => {
    expect(parseFixtureToken("some unrelated test")).toBeUndefined();
  });
});

describe("collectFixtureResults", () => {
  it("binds every pinned cell from a passing report", () => {
    const results = collectFixtureResults(fullyPassingReport());
    for (const revision of PINNED_REVISIONS) {
      for (const behavior of BEHAVIORS) {
        const key = cellKey(revision.id, behavior.id);
        const expected = declarationFor(revision.id, behavior.id).state === "pinned";
        expect(results.has(key), key).toBe(expected);
      }
    }
  });

  it("treats a skipped fixture as not having run", () => {
    const results = collectFixtureResults({
      testResults: [
        {
          assertionResults: [
            { fullName: `${fixtureToken("2026-07-28", "transport")} x`, status: "skipped" },
          ],
        },
      ],
    });
    expect(results.get(cellKey("2026-07-28", "transport"))).toEqual({ ran: false, passed: false });
    // …and therefore resolves to unproven, not conformant.
    expect(resolveCell({ state: "pinned" }, results.get(cellKey("2026-07-28", "transport")))).toBe(
      "unproven",
    );
  });

  it("fails a cell when any fixture bound to it fails", () => {
    const results = collectFixtureResults({
      testResults: [
        {
          assertionResults: [
            { fullName: `${fixtureToken("2025-11-25", "errors")} a`, status: "passed" },
            { fullName: `${fixtureToken("2025-11-25", "errors")} b`, status: "failed" },
          ],
        },
      ],
    });
    expect(results.get(cellKey("2025-11-25", "errors"))).toEqual({ ran: true, passed: false });
  });
});

describe("computeGateFailures", () => {
  it("passes a fully pinned, fully passing run", () => {
    const results = collectFixtureResults(fullyPassingReport());
    expect(computeGateFailures(resolveMatrix(results), results)).toEqual([]);
  });

  it("fails when a pinned cell has no executing fixture", () => {
    const report = fullyPassingReport();
    const dropped = fixtureToken("2024-10-07", "cancellation");
    report.testResults![0]!.assertionResults = report.testResults![0]!.assertionResults!.filter(
      (assertion) => !assertion.fullName!.includes(dropped),
    );
    const results = collectFixtureResults(report);
    const failures = computeGateFailures(resolveMatrix(results), results);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(cellKey("2024-10-07", "cancellation"));
    expect(failures[0]).toContain("no fixture executed");
  });

  it("fails when a pinned fixture fails, and names the revision and behavior", () => {
    const report = fullyPassingReport();
    const target = fixtureToken("2025-06-18", "era-fields");
    for (const assertion of report.testResults![0]!.assertionResults!) {
      if (assertion.fullName!.includes(target)) assertion.status = "failed";
    }
    const results = collectFixtureResults(report);
    const failures = computeGateFailures(resolveMatrix(results), results);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("2025-06-18");
    expect(failures[0]).toContain("Era-specific result fields");
  });

  it("fails on a fixture bound to a cell that is not declared pinned", () => {
    const report = fullyPassingReport();
    report.testResults![0]!.assertionResults!.push({
      fullName: `${fixtureToken("2026-07-28", "tasks")} pretends tasks are proven`,
      status: "passed",
    });
    const results = collectFixtureResults(report);
    const failures = computeGateFailures(resolveMatrix(results), results);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("not declared pinned");
  });

  it("fails on a fixture bound to a revision the matrix does not pin", () => {
    const report = fullyPassingReport();
    report.testResults![0]!.assertionResults!.push({
      fullName: `${fixtureToken("2099-01-01", "transport")} from the future`,
      status: "passed",
    });
    const results = collectFixtureResults(report);
    const failures = computeGateFailures(resolveMatrix(results), results);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("not a pinned revision");
  });
});

describe("computeUnboundFailures", () => {
  it("catches a failing check that maps to no cell, such as revision drift", () => {
    // The `claimed revisions` assertions are how a revision the SDK adds or
    // drops turns the gate red. They are bound to no cell, so the gate has to
    // look for them separately or the drift would fail vitest invisibly.
    const failures = computeUnboundFailures({
      testResults: [
        {
          assertionResults: [
            {
              fullName: "claimed revisions (MAR-459) pins exactly the legacy revisions",
              status: "failed",
            },
          ],
        },
      ],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("claimed revisions");
  });

  it("ignores cell-bound failures, which computeGateFailures already reports", () => {
    expect(
      computeUnboundFailures({
        testResults: [
          {
            assertionResults: [
              { fullName: `${fixtureToken("2025-11-25", "errors")} x`, status: "failed" },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("ignores passing checks", () => {
    expect(computeUnboundFailures(fullyPassingReport())).toEqual([]);
  });
});

describe("the published document", () => {
  // Normalized the same way `scripts/conformance-matrix.ts` normalizes it: a
  // Windows checkout with `core.autocrlf=true` rewrites this LF-generated file
  // to CRLF on disk, which is a checkout artifact, not a hand edit. The same
  // pattern already exists in `src/benchmark/publicBenchmark.ts` and
  // `tests/lib/connectContract.test.ts` (MAR-496).
  const committed = readFileSync(join(ROOT, MATRIX_DOC_PATH), "utf8").replace(/\r\n/g, "\n");

  it("is exactly the rendering of the matrix source at the green baseline", () => {
    // If this fails, the document was hand-edited or the source moved:
    // regenerate with `pnpm exec tsx scripts/conformance-matrix.ts --write`.
    expect(committed).toBe(renderMatrixMarkdown(greenBaseline()));
  });

  it("names every pinned revision", () => {
    for (const revision of PINNED_REVISIONS) {
      expect(committed, revision.id).toContain(revision.id);
    }
  });

  it("quotes no coverage percentage", () => {
    // MAR-459's exit evidence forbids an undefined lifecycle-coverage number.
    expect(committed).not.toMatch(/\d+(\.\d+)?\s*%/);
  });

  it("explains every unpinned cell in the document body", () => {
    for (const revision of PINNED_REVISIONS) {
      for (const behavior of BEHAVIORS) {
        const declaration = declarationFor(revision.id, behavior.id);
        if (declaration.state !== "not_pinned") continue;
        expect(committed, cellKey(revision.id, behavior.id)).toContain(declaration.reason);
      }
    }
  });

  it("renders a failing cell differently from an unpinned one", () => {
    const results = new Map<string, FixtureResult>();
    for (const revision of PINNED_REVISIONS) {
      for (const behavior of BEHAVIORS) {
        if (declarationFor(revision.id, behavior.id).state === "pinned") {
          results.set(cellKey(revision.id, behavior.id), { ran: true, passed: true });
        }
      }
    }
    results.set(cellKey("2026-07-28", "transport"), { ran: true, passed: false });
    const rendered = renderMatrixMarkdown(resolveMatrix(results));

    const transportRow = rendered
      .split("\n")
      .find((line) => line.startsWith("| Streamable HTTP transport |"));
    const tasksRow = rendered.split("\n").find((line) => line.startsWith("| MCP Tasks"));

    expect(transportRow).toContain(symbolFor("failing"));
    expect(transportRow).not.toContain(symbolFor("not_pinned"));
    expect(tasksRow).toContain(symbolFor("not_pinned"));
    expect(tasksRow).not.toContain(symbolFor("failing"));
  });
});
