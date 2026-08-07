/**
 * MAR-541 — a SQL/warehouse WRITE goal must not be planned as a READ.
 *
 * `db_read` is read-only: `permissions.write` is `[]`, and MAR-254 already gave
 * the GENERIC forms ("from our database", "query the database") direction via
 * their own prepositions/verbs. But the bare PROVIDER names — `postgres`,
 * `postgresql`, `mysql`, `bigquery`, `snowflake` — and the two compound nouns
 * `"sql database"` / `"data warehouse"` carried no direction at all, the exact
 * gap MAR-538 closed for Airtable. This is that fix generalised, per MAR-541's
 * acceptance bar ("provider names are domain-unique" is not the same claim as
 * "provider names are directional").
 *
 * Every presence assertion below is paired with its absence twin: the read
 * direction must keep working untouched, and a write verb that does not point
 * AT a SQL/warehouse source must not be read as a database write.
 */
import { describe, expect, it } from "vitest";
import {
  hasDbReadIntent,
  hasDbWriteIntent,
  matchCapabilities,
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

describe("SQL/warehouse direction detection is preposition-anchored (MAR-541)", () => {
  const WRITES = [
    "write the processed rows into our Postgres database every night",
    "insert each new record into the mysql table",
    "sync data into our bigquery warehouse every night",
    "write new rows into our snowflake warehouse",
    "write records into our data warehouse nightly",
    "create a new row in our postgresql database after every signup",
  ];
  for (const goal of WRITES) {
    it(`reads write intent from: "${goal}"`, () => {
      expect(hasDbWriteIntent(goal.toLowerCase())).toBe(true);
    });
  }

  const NOT_WRITES = [
    // read direction — the source preposition, no destination
    "read the sales rows from our Postgres database and email me a summary",
    "pull last week's numbers from the mysql database every morning",
    // a write VERB whose destination is somewhere else entirely — the case a
    // bare verb-anywhere check would get wrong: Postgres is the SOURCE here.
    "save the Postgres records to a spreadsheet every morning",
    "store the snowflake rows in a CSV file",
    // the generic MAR-254 phrases already carry read direction and must stay
    // untouched by this fix
    "query the database for last week's numbers and email me the results",
  ];
  for (const goal of NOT_WRITES) {
    it(`does NOT read write intent from: "${goal}"`, () => {
      expect(hasDbWriteIntent(goal.toLowerCase())).toBe(false);
    });
  }

  it("recognises both directions in a read-then-write-back goal", () => {
    const goal =
      "read from our postgres database, transform it, and write the results back into postgres";
    expect(hasDbReadIntent(goal)).toBe(true);
    expect(hasDbWriteIntent(goal)).toBe(true);
  });

  it("RECORDED LIMIT — a write-typed SQL statement named inside the query noun phrase is not caught", () => {
    // "run an UPDATE sql query" has no wrapping write verb of its own ("run" is
    // not a write verb) — only "query", which independently satisfies the read
    // signal. This is not a regression: the bare "sql query" hint carried no
    // direction at all before this fix either. Asserted rather than hidden.
    const goal = "run an update sql query against our database every night";
    expect(hasDbWriteIntent(goal.toLowerCase())).toBe(false);
    expect(hasDbReadIntent(goal.toLowerCase())).toBe(true);
  });
});

// ── WRITE goals: no read-only component, and a destination that can write ────

describe("a SQL/warehouse WRITE goal drops db_read and gains a write destination (MAR-541)", () => {
  const WRITE_GOALS = [
    "write the processed rows into our Postgres database every night",
    "insert each new record into the mysql table",
    "sync data into our bigquery warehouse every night",
    "write new rows into our snowflake warehouse",
  ];

  for (const goal of WRITE_GOALS) {
    it(`selects file_storage, never db_read, for: "${goal}"`, () => {
      const ids = matchedIds(goal);
      expect(ids).not.toContain("db_read");
      expect(ids).toContain("file_storage");
    });

    it(`the composed route carries a real write step for: "${goal}"`, () => {
      const route = routeIds(goal);
      expect(route).not.toContain("db_read");
      expect(route).toContain("file_storage");
    });

    it(`the plan reports no gap for: "${goal}"`, () => {
      // The concrete harm the bug caused: a write goal silently planned as a
      // read reported coverage: full — nothing told the user anything was
      // wrong. The destination bump names the specific provider token
      // (e.g. "postgres-write phrase"), which coverage.ts's own DEMAND_NOUNS
      // list credits, the same way MAR-538's "airtable-write phrase" token
      // happens to.
      expect(plan(goal).coverage.unmatched_demand).toEqual([]);
    });
  }
});

// ── READ goals: unchanged ────────────────────────────────────────────────────

describe("a SQL/warehouse READ goal is untouched (MAR-541 absence fixtures)", () => {
  it("still selects db_read for the MAR-254 golden-path read goal", () => {
    const goal = "read the sales rows from our Postgres database and email me a summary";
    const ids = matchedIds(goal);
    expect(ids).toContain("db_read");
    expect(ids).not.toContain("file_storage");
    expect(routeIds(goal)).toContain("db_read");
  });

  it("still selects db_read for a scheduled read-and-report goal", () => {
    const goal = "pull last week's numbers from the mysql database every morning";
    expect(matchedIds(goal)).toContain("db_read");
  });

  it("keeps the read when the write lands somewhere other than the database", () => {
    // Postgres is the SOURCE; the spreadsheet is the destination. Both
    // components belong in the route — this is not a database write.
    const route = routeIds("save the Postgres records to a spreadsheet every morning");
    expect(route).toContain("db_read");
    expect(route).toContain("file_storage");
  });

  it("keeps BOTH halves of a read-then-write-back goal", () => {
    const route = routeIds(
      "read from our postgres database, transform it, and write the results back into postgres",
    );
    expect(route).toContain("db_read");
    expect(route).toContain("file_storage");
  });

  it("leaves the existing generic MAR-254 read phrases untouched", () => {
    const route = routeIds(
      "query the database for last week's numbers and email me the results",
    );
    expect(route).toContain("db_read");
  });
});
