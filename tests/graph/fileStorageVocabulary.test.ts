/**
 * MAR-526 slice 3 — the generic export destination.
 *
 * MAR-513's gap-list item 3 found 14 components with live `capabilityMatcher`
 * vocabulary backing no route or playbook. `file_storage` ("spreadsheet",
 * "google sheet", "csv", "save/store/append it to") was already reachable —
 * a goal asking to export/save data correctly selects it. This slice is pure
 * golden-path naming: file_storage is scheduled_data_report's "save it"
 * sibling, paired with db_read (the already-covered source), not one of the
 * slice-2 sources.
 *
 * NOTE — found but out of scope: "Write the output to an Airtable base"
 * selects airtable_lookup (a READ-only component), not file_storage, because
 * the bare "airtable" keyword unconditionally maps to airtable_lookup
 * (capabilityMatcher.ts) and no airtable-write component exists at all, even
 * though file_storage's own summary claims Airtable as a valid destination.
 * A WRITE goal selecting a READ-only component is the same class of bug as
 * MAR-526 slice 1's crm_record_read finding, mirrored — but it does not
 * block this slice's own goal (a database → spreadsheet/CSV export composes
 * cleanly), so it is filed as a follow-up rather than fixed here.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

const DB_EXPORT_GOAL =
  "every morning, unattended, read rows from our database and save them to a Google Sheet";

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

describe("export vocabulary reaches file_storage (MAR-526 slice 3)", () => {
  const EXPORT_PHRASINGS = [
    "Save the results to a Google Sheet.",
    "Append the rows to a CSV file.",
    "Store the extracted records in a spreadsheet.",
  ];

  for (const goal of EXPORT_PHRASINGS) {
    it(`selects file_storage for: "${goal}"`, () => {
      expect(matchedIds(goal)).toContain("file_storage");
    });
  }

  it("does not fire on a goal with no storage/export destination", () => {
    const ids = matchedIds("Read the unread messages in my inbox and summarise them in this chat.");
    expect(ids).not.toContain("file_storage");
  });

  it("the DB-export goal composes db_read + file_storage, not a Slack notify", () => {
    const route = plan(DB_EXPORT_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toContain("db_read");
    expect(route).toContain("file_storage");
    expect(route).not.toContain("slack_notification");
  });
});

describe("scheduled_data_export carries no enforced gate (file_storage is not policy-gated)", () => {
  it("the write lands with automation_clearance L3 but no enforced_approval_gates", () => {
    const p = plan(DB_EXPORT_GOAL);
    expect(p.enforced_approval_gates).toEqual([]);
    expect(p.automation_clearance.level).toBe("L3");
  });
});

describe("scheduled_data_export / scheduled_data_export_route_v1 registry artifacts (MAR-526 slice 3)", () => {
  it("are status: beta, so they stay out of the default-loaded registry", () => {
    expect(registry.playbooks.some((p) => p.id === "scheduled_data_export")).toBe(false);
    expect(registry.routes.some((r) => r.id === "scheduled_data_export_route_v1")).toBe(false);
    expect(plan(DB_EXPORT_GOAL).plan_source).toBe("composed");
  });

  it("the playbook's route reference resolves when beta entities are loaded", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const playbook = withBeta.playbooks.find((p) => p.id === "scheduled_data_export");
    expect(playbook).toBeDefined();
    expect(withBeta.routes.some((r) => r.id === playbook?.golden_path_route_id)).toBe(true);
  });

  it("the route's components are exactly the live-composed shape", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "scheduled_data_export_route_v1");
    const composed = plan(DB_EXPORT_GOAL).recommended_route.map((step) => step.component_id);
    expect([...(route?.components ?? [])].sort()).toEqual([...composed].sort());
  });
});
