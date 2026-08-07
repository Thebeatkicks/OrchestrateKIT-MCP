/**
 * MAR-538 — an Airtable WRITE goal must not be planned as a READ.
 *
 * `airtable_lookup` is read-only: `permissions.write` is `[]`, its Connect entry
 * is labelled "Airtable — read base", and its required scopes are
 * `data.records:read` / `schema.bases:read`. The bare `airtable` KEYWORD_HINT
 * carried no direction, so a goal asking to write INTO a base selected it anyway
 * and the plan told the user to provision a read-only token for a task needing
 * writes — the mirror of MAR-526 slice 1's `crm_record_read` finding.
 *
 * Every presence assertion below is paired with its absence twin: the read
 * direction must keep working untouched, and a write verb that does not point AT
 * Airtable must not be read as an Airtable write.
 */
import { describe, expect, it } from "vitest";
import {
  hasAirtableReadIntent,
  hasAirtableWriteIntent,
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

describe("Airtable direction detection is preposition-anchored (MAR-538)", () => {
  const WRITES = [
    "every morning, unattended, read rows from our database and write the output to an Airtable base",
    "take the extracted invoice fields and create a new record in our Airtable base",
    "append each new lead to our Airtable table",
    "update the status field in Airtable when a deal closes",
    "insert the parsed rows into the Airtable base every hour",
  ];
  for (const goal of WRITES) {
    it(`reads write intent from: "${goal}"`, () => {
      expect(hasAirtableWriteIntent(goal.toLowerCase())).toBe(true);
    });
  }

  const NOT_WRITES = [
    // read direction — the source preposition, no destination
    "read records from our Airtable base and post a summary report to Slack",
    "pull the rows from our Airtable base every morning and summarise them",
    // a write VERB whose destination is somewhere else entirely. This is the case
    // a bare verb-anywhere check would get wrong: Airtable is the SOURCE here.
    "save the Airtable records to a spreadsheet every morning",
    "store the Airtable rows in a CSV file",
    // no write verb at all, despite the "in <base>" preposition
    "look up the customer in our Airtable base before replying",
  ];
  for (const goal of NOT_WRITES) {
    it(`does NOT read write intent from: "${goal}"`, () => {
      expect(hasAirtableWriteIntent(goal.toLowerCase())).toBe(false);
    });
  }

  it("recognises both directions in a read-then-write-back goal", () => {
    const goal =
      "read new rows from our airtable base, enrich them, and write the result back to an airtable base";
    expect(hasAirtableReadIntent(goal)).toBe(true);
    expect(hasAirtableWriteIntent(goal)).toBe(true);
  });
});

// ── WRITE goals: no read-only component, and a destination that can write ────

describe("an Airtable WRITE goal drops airtable_lookup and gains a write destination (MAR-538)", () => {
  const WRITE_GOALS = [
    "every morning, unattended, read rows from our database and write the output to an Airtable base",
    "take the extracted invoice fields and create a new record in our Airtable base",
    "append each new lead to our Airtable table",
    "update the status field in Airtable when a deal closes",
  ];

  for (const goal of WRITE_GOALS) {
    it(`selects file_storage, never airtable_lookup, for: "${goal}"`, () => {
      const ids = matchedIds(goal);
      expect(ids).not.toContain("airtable_lookup");
      expect(ids).toContain("file_storage");
    });

    it(`the composed route carries a real write step for: "${goal}"`, () => {
      const route = routeIds(goal);
      expect(route).not.toContain("airtable_lookup");
      expect(route).toContain("file_storage");
    });
  }

  it("does not substitute a CRM write for the destination the goal named", () => {
    // "lead" / "deal" establish crm_sales, and crm_note_write (a HubSpot /
    // Salesforce note) used to become the only write in the route — a write to a
    // system the user never named, which is the same class of bug one layer over.
    for (const goal of [
      "append each new lead to our Airtable table",
      "update the status field in Airtable when a deal closes",
    ]) {
      const route = routeIds(goal);
      expect(route).not.toContain("crm_note_write");
      expect(route).not.toContain("deal_stage_update");
    }
  });

  it("keeps the CRM write when the goal names a CRM alongside Airtable", () => {
    const route = routeIds(
      "when a deal closes in HubSpot, write a note on the CRM record and append the row to our Airtable table",
    );
    expect(route).toContain("crm_note_write");
    expect(route).toContain("file_storage");
  });
});

// ── READ goals: unchanged ────────────────────────────────────────────────────

describe("an Airtable READ goal is untouched (MAR-538 absence fixtures)", () => {
  it("still selects airtable_lookup for the slice-2 golden-path read goal", () => {
    const goal = "read records from our Airtable base and post a summary report to Slack";
    const ids = matchedIds(goal);
    expect(ids).toContain("airtable_lookup");
    expect(ids).not.toContain("file_storage");
    expect(routeIds(goal)).toContain("airtable_lookup");
  });

  it("still selects airtable_lookup for a scheduled read-and-summarise goal", () => {
    const goal = "pull the rows from our Airtable base every morning and summarise them";
    expect(matchedIds(goal)).toContain("airtable_lookup");
  });

  it("keeps the read when the write lands somewhere other than Airtable", () => {
    // Airtable is the SOURCE; the spreadsheet is the destination. Both components
    // belong in the route — this is not an Airtable write.
    const route = routeIds("save the Airtable records to a spreadsheet every morning");
    expect(route).toContain("airtable_lookup");
    expect(route).toContain("file_storage");
  });

  it("keeps BOTH halves of a read-then-write-back goal", () => {
    const route = routeIds(
      "read new rows from our Airtable base, enrich them, and write the result back to an Airtable base",
    );
    expect(route).toContain("airtable_lookup");
    expect(route).toContain("file_storage");
  });
});

// ── The plan the user actually reads ─────────────────────────────────────────

describe("the Airtable write plan provisions a write credential, not a read one (MAR-538)", () => {
  const WRITE_GOAL =
    "every morning, unattended, read rows from our database and write the output to an Airtable base";

  it("stops asking for Airtable READ-ONLY scopes on a write goal", () => {
    // The concrete harm the bug caused: the plan's own connection contract told
    // the user to provision `data.records:read` / `schema.bases:read` for a task
    // that has to write. A read-only token makes the built agent fail on its
    // first write, after the user has done all the setup work.
    const scopes = plan(WRITE_GOAL).connection_contract.flatMap((c) => c.scopes ?? []);
    expect(scopes).not.toContain("data.records:read");
    expect(scopes).not.toContain("schema.bases:read");
  });

  it("serves the write through a component whose connection grants a write", () => {
    const contract = plan(WRITE_GOAL).connection_contract;
    const storage = contract.find((c) => c.serves_components.includes("file_storage"));
    expect(storage).toBeDefined();
    expect(storage?.grants).toContain("write");
  });

  it("RECORDED LIMIT — the connection row is labelled by file_storage's first product example, not the destination the goal named", () => {
    // file_storage has no entry in COMPONENT_CONNECTIONS, so connectionContract
    // falls back to `product_examples[0]` — "Google Sheets" — for every storage
    // destination alike. An Airtable goal therefore reads a row labelled "Google
    // Sheets" (its `raw_oauth` path text does name the Airtable API key, so the
    // contract is not silent about it, just mislabelled at the top).
    //
    // This is pre-existing MAR-244 behaviour affecting MAR-526 slice 3's golden
    // path too, NOT something this fix introduced — but this fix routes Airtable
    // writes here, so it is newly reachable and is asserted rather than hidden.
    // Fixing it means making the fallback destination-aware, which couples the
    // matcher's goal reading to the connection contract; that is its own change
    // with its own blast radius (DASH broker vocabulary, connection counts,
    // scope_assessment sizing, benchmark fingerprints). Tracked on MAR-538.
    const contract = plan(WRITE_GOAL).connection_contract;
    const storage = contract.find((c) => c.serves_components.includes("file_storage"));
    expect(storage?.label).toBe("Google Sheets");
  });
});
