/**
 * MAR-550 — a spreadsheet READ goal must not be planned as a WRITE.
 *
 * The MIRROR of the MAR-538/541 bug family. Those fixed READ-only components
 * (`airtable_lookup`, `db_read`, `stripe_data_read`) reached by WRITE goals.
 * `file_storage` is the same class inverted: WRITE-only (`permissions.read` is
 * `[]`, every capability is append/write/persist/save/upsert), reached by a READ
 * goal through its bare object-noun hints (`spreadsheet`, `csv`, `google sheet`,
 * `database table`). MAR-541's sweep scoped itself to `permissions.write: []`
 * components and so never looked at this one — confirmed by re-probing master
 * `f6e486f` AFTER that sweep merged:
 *
 *   "read a local .xlsx spreadsheet and update specific rows and cells in place"
 *     → file_storage → reviewer_notification → auth_failure_handler → audit_log
 *
 * Every presence assertion below is paired with its absence twin, per the
 * MAR-538/539 regression bar: the write direction must keep working untouched,
 * and a read verb that does not point at a storage object must not be read as a
 * file read.
 */
import { describe, expect, it } from "vitest";
import {
  hasLocalFileReadIntent,
  hasStorageReadIntent,
  hasStorageWriteIntent,
  matchCapabilities,
  matchesWordAligned,
} from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function matchedIds(goal: string): string[] {
  return matchCapabilities(goal, [], [], registry.components, registry.edges).matches.map(
    (match) => match.component.id,
  );
}

function plan(goal: string) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
}

function routeIds(goal: string): string[] {
  return plan(goal).recommended_route.map((step) => step.component_id);
}

// ── Direction detection, in isolation ────────────────────────────────────────

describe("storage direction detection is preposition-anchored (MAR-550)", () => {
  const READS = [
    // the issue's own probe goal — note the period in ".xlsx", which the first
    // cut of this fix could not cross at all
    "read a local .xlsx spreadsheet and update specific rows and cells in place",
    "read the rows from a local CSV file and summarise them",
    "load a spreadsheet from disk, clean the messy rows, and write the result back",
    "open the attached excel file and extract the achievement records",
    "take the attached spreadsheet and check every row against the expected columns",
  ];
  for (const goal of READS) {
    it(`reads read intent from: "${goal}"`, () => {
      expect(hasLocalFileReadIntent(goal.toLowerCase())).toBe(true);
      expect(hasStorageReadIntent(goal.toLowerCase())).toBe(true);
    });
  }

  const NOT_READS = [
    // write direction — the destination preposition, no source
    "every morning export the report rows to a spreadsheet",
    "save the results to a CSV file each night",
    // a READ verb whose object is not a storage artifact at all
    "read my unread emails and draft a reply for each one, do not send",
    "read records from our Airtable base and post a summary report to Slack",
    "scan the codebase and summarize the architecture",
    // the ambient-noun case the read object deliberately excludes: "files" and
    // "table" alone are code / document / research vocabulary, not a file read
    "review the changed files in the pull request and comment on risky changes",
  ];
  for (const goal of NOT_READS) {
    it(`does NOT read read intent from: "${goal}"`, () => {
      expect(hasLocalFileReadIntent(goal.toLowerCase())).toBe(false);
      expect(hasStorageReadIntent(goal.toLowerCase())).toBe(false);
    });
  }

  it("a Google Sheets read is storage-read but NOT a local-file read", () => {
    // The two widths exist for exactly this goal: reading a Google Sheet is not
    // writing to one (so file_storage must go), but it is a SaaS API source that
    // local_file_read cannot serve either (so nothing replaces it).
    const goal = "read the rows from our google sheet and post a summary to slack";
    expect(hasStorageReadIntent(goal)).toBe(true);
    expect(hasLocalFileReadIntent(goal)).toBe(false);
  });

  it("a direction-carrying write hint counts as a write even with no destination noun", () => {
    // "save them" names no object, so a preposition anchor alone cannot see it —
    // and a goal that reads a file and then says "save them" must keep its
    // destination rather than losing it to the read suppression.
    const goal = "read the rows from the attached spreadsheet and save them";
    expect(hasStorageWriteIntent(goal)).toBe(true);
    expect(hasStorageReadIntent(goal)).toBe(true);
  });
});

// ── The bug: a READ goal planned as a WRITE ──────────────────────────────────

describe("a spreadsheet READ goal no longer selects the write-only file_storage (MAR-550)", () => {
  const GOAL = "read a local .xlsx spreadsheet and update specific rows and cells in place";

  it("drops file_storage and selects the read component instead", () => {
    const ids = matchedIds(GOAL);
    expect(ids).not.toContain("file_storage");
    expect(ids).toContain("local_file_read");
  });

  it("the route has a real read step and no write step", () => {
    const ids = routeIds(GOAL);
    expect(ids).toContain("local_file_read");
    expect(ids).not.toContain("file_storage");
  });

  it("acceptance bar #3 — reviewer_notification's spurious match is gone", () => {
    // It scored on "read" landing inside "**read**y for their review" and on
    // "specific" inside "a **specific** human reviewer". Notifying a reviewer is
    // not reading a file, and the goal never asks for a review.
    expect(matchedIds(GOAL)).not.toContain("reviewer_notification");
    expect(routeIds(GOAL)).not.toContain("reviewer_notification");
  });

  it("the cell-level edit the registry cannot do is still reported as a gap", () => {
    // The honest half of the original probe, which must survive the fix.
    expect(plan(GOAL).coverage.unmatched_demand).toContain("update specific rows");
  });

  it("the read claims the user's OWN artifact word, so the read is not itself a gap", () => {
    const matches = matchCapabilities(GOAL, [], [], registry.components, registry.edges);
    const read = matches.matches.find((m) => m.component.id === "local_file_read");
    expect(read?.matched_tokens.join(" ")).toContain("spreadsheet");
  });
});

// ── Absence twins: the write direction is untouched ──────────────────────────

describe("storage WRITE goals keep file_storage (MAR-550 absence fixtures)", () => {
  const WRITES: Array<[string, string]> = [
    ["every morning export the report rows to a spreadsheet", "spreadsheet"],
    ["save the results to a CSV file each night", "csv"],
    // MAR-541's own fix must not regress: the SQL-write destination bump
    ["write the processed rows into our Postgres database every night", "postgres-write phrase"],
    // MAR-538's own fix must not regress: the Airtable-write destination bump
    ["read rows from our database and write the output to an Airtable base", "airtable-write phrase"],
  ];
  for (const [goal, token] of WRITES) {
    it(`keeps file_storage on: "${goal}"`, () => {
      expect(routeIds(goal)).toContain("file_storage");
      const match = matchCapabilities(goal, [], [], registry.components, registry.edges)
        .matches.find((m) => m.component.id === "file_storage");
      expect(match?.matched_tokens).toContain(token);
    });
  }

  it("a read AND a write in one goal keeps both halves", () => {
    const ids = routeIds("read the rows from a local CSV file and save them to a Google Sheet");
    expect(ids).toContain("local_file_read");
    expect(ids).toContain("file_storage");
  });
});

// ── The honest refusal: a source with no component gains nothing ─────────────

describe("a Google Sheets READ is refused honestly rather than substituted (MAR-550)", () => {
  const GOAL = "read the rows from our Google Sheet and post a summary to Slack";

  it("loses the write component and gains no wrong replacement", () => {
    const ids = routeIds(GOAL);
    expect(ids).not.toContain("file_storage");
    expect(ids).not.toContain("local_file_read");
  });

  it("and says so — the read surfaces as unmatched demand instead of vanishing", () => {
    expect(plan(GOAL).coverage.unmatched_demand.join(" ")).toContain("Google Sheet");
  });
});

// ── The outbound fetchers do not belong on a local-file read ─────────────────

describe("web fetchers stay off a local-file read (MAR-550)", () => {
  it("source_retrieval and data_scraper are dropped when the source is a local file", () => {
    const ids = routeIds("read the rows from a local CSV file and summarise them");
    expect(ids).not.toContain("source_retrieval");
    expect(ids).not.toContain("data_scraper");
    expect(ids).toContain("local_file_read");
  });

  it("but a goal that names a web source too keeps them", () => {
    const ids = matchedIds(
      "read the attached CSV of competitor urls, scrape each product page, and save the prices",
    );
    expect(ids).toContain("data_scraper");
  });
});

// ── Word-aligned fuzzy matching (acceptance bar #3's mechanism) ──────────────

describe("summary matching is word-aligned, not bare substring (MAR-550)", () => {
  it("rejects a token that lands inside a longer, unrelated word", () => {
    expect(matchesWordAligned("ready for their review", "read")).toBe(false);
    expect(matchesWordAligned("a specific human reviewer or approver", "approve")).toBe(false);
  });

  it("still accepts ordinary inflection, which is what the fuzzy pass is for", () => {
    expect(matchesWordAligned("parses invoices and receipts", "invoice")).toBe(true);
    expect(matchesWordAligned("structured text extraction", "extract")).toBe(true);
    expect(matchesWordAligned("monitoring a page for changes", "monitor")).toBe(true);
  });

  it("treats `_` as a word separator, so capability ids still match", () => {
    expect(matchesWordAligned("write_to_spreadsheet", "spreadsheet")).toBe(true);
  });

  it("still matches a plain whole word", () => {
    expect(matchesWordAligned("notifies a specific human reviewer", "human")).toBe(true);
  });
});

// ── Recorded limits, asserted rather than hidden (MAR-529 discipline) ────────

describe("MAR-550 recorded limits", () => {
  it("a write-BACK with no named destination loses file_storage, and coverage does not report it", () => {
    // Both halves are stated on purpose. Suppression is right on its own terms —
    // file_storage appends to a destination and cannot edit rows in place. But
    // the write-back does NOT then surface as a gap: the clause "write the
    // result back" carries the demand verb "write", and `audit_log`
    // independently claims that same word, so the clause reads as covered.
    // A coverage-lexicon limitation, not something this fix introduced.
    const goal = "load a spreadsheet from disk, clean the messy rows, and write the result back";
    expect(routeIds(goal)).not.toContain("file_storage");
    expect(plan(goal).coverage.unmatched_demand.join(" ")).not.toContain("write the result back");
  });

  it("a filename period no longer splits a clause into a fabricated gap", () => {
    // "load a local .xlsx spreadsheet, validate …" used to split at the dot and
    // report the fragment "load a local" as an uncovered step.
    const goal =
      "load a local .xlsx spreadsheet, validate and normalise every row, and save the result to a new spreadsheet";
    expect(plan(goal).coverage.unmatched_demand).not.toContain("load a local");
  });
});
