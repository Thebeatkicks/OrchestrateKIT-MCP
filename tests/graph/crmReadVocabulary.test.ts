/**
 * MAR-526 slice 1 — the CRM read step.
 *
 * MAR-513's gap-list item 3 found 14 components with live `capabilityMatcher`
 * vocabulary backing no route or playbook. `crm_record_read` was the worst of
 * the CRM three, because it was not merely uncovered — it was UNREACHABLE. It is
 * HINT_ONLY, and none of its hints ("crm record", "read the crm", "look up",
 * "contact record", "deal record") fire on the natural way a goal states a CRM
 * read. Live-probed 2026-08-07, before the fix:
 *
 *   "reads new leads from our CRM …"   → crm_note_write (the CRM WRITE) selected
 *                                         for the read step; crm_record_read absent
 *   "reads contacts from HubSpot …"    → the whole phrase reported as UNMATCHED
 *                                         demand, coverage "partial"
 *
 * A goal asking to READ was planned as a WRITE. The hints added for this slice
 * all name the CRM outright, so no bare object noun can drag a mailbox read
 * ("reads new leads from GMAIL" — email_lead_to_crm's own goal) into the CRM.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

const CRM_ENRICHMENT_GOAL =
  "Build an agent that reads new leads from our CRM every morning, enriches each one " +
  "with company size and industry from an enrichment provider, and updates the deal " +
  "stage after I approve.";

/** email_lead_to_crm's own goal — the mailbox read this must never claim. */
const MAILBOX_LEAD_GOAL =
  "Build an agent that reads new leads from Gmail, drafts a reply, updates the CRM, " +
  "and alerts sales in Slack after approval.";

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

describe("CRM read vocabulary reaches crm_record_read (MAR-526 slice 1)", () => {
  const READ_PHRASINGS = [
    "Read new leads from our CRM every morning and enrich each one.",
    "Pull the open deals from the CRM and enrich them.",
    "Read contacts from HubSpot and enrich them with firmographic data.",
    "Pull deals from Salesforce and score them.",
    "Look at the records in Pipedrive and enrich each contact.",
    "Enrich the CRM contacts we added this week.",
    "Score the CRM leads from last month.",
  ];

  for (const goal of READ_PHRASINGS) {
    it(`selects crm_record_read for: "${goal.slice(0, 48)}…"`, () => {
      expect(matchedIds(goal)).toContain("crm_record_read");
    });
  }

  it("does NOT claim a mailbox read as a CRM read (absence fixture)", () => {
    // "reads new leads from Gmail" — the source is the mailbox. The goal does
    // say "updates the CRM", which is a WRITE, and email_lead_to_crm owns it.
    expect(matchedIds(MAILBOX_LEAD_GOAL)).not.toContain("crm_record_read");
  });

  it("leaves the email_lead_to_crm playbook match intact", () => {
    const p = plan(MAILBOX_LEAD_GOAL);
    expect(p.plan_source).toBe("playbook");
    expect(p.playbook?.id).toBe("email_lead_to_crm");
  });

  it("does not fire on a goal that never mentions a CRM", () => {
    const ids = matchedIds(
      "Read the unread messages in my inbox and give me a five-bullet summary.",
    );
    expect(ids).not.toContain("crm_record_read");
    expect(ids).not.toContain("lead_enrichment");
    expect(ids).not.toContain("deal_stage_update");
  });
});

describe("the CRM enrichment goal composes a coherent gated path (MAR-526 slice 1)", () => {
  it("carries all three previously route-less CRM components", () => {
    const route = plan(CRM_ENRICHMENT_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toContain("crm_record_read");
    expect(route).toContain("lead_enrichment");
    expect(route).toContain("deal_stage_update");
  });

  it("reads from the CRM, not from a page scrape or a mailbox", () => {
    const route = plan(CRM_ENRICHMENT_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).not.toContain("data_scraper");
    expect(route).not.toContain("page_monitor");
    expect(route).not.toContain("email_read");
  });

  it("enforces the approval gate the deal-stage write requires", () => {
    // deal_stage_update declares `requires: human_approval_gate` in its own
    // component YAML — the gate is a registry fact here, not a heuristic.
    const p = plan(CRM_ENRICHMENT_GOAL);
    expect(p.enforced_approval_gates).toContain("human_approval_gate");
    expect(p.automation_clearance.level).toBe("L3");
    const route = p.recommended_route.map((step) => step.component_id);
    expect(route.indexOf("human_approval_gate")).toBeLessThan(route.indexOf("deal_stage_update"));
  });

  it("the read-only variant carries no write and no gate (absence fixture)", () => {
    const p = plan(
      "Build an agent that reads contacts from HubSpot, enriches them with firmographic " +
        "data, and shows me a scored list.",
    );
    const route = p.recommended_route.map((step) => step.component_id);
    expect(route).toContain("crm_record_read");
    expect(route).toContain("lead_enrichment");
    expect(route).not.toContain("deal_stage_update");
    expect(route).not.toContain("crm_note_write");
    expect(p.enforced_approval_gates).toEqual([]);
  });
});

describe("crm_lead_enrichment registry artifacts (MAR-526 slice 1)", () => {
  it("are status: beta, so they stay out of the default-loaded registry", () => {
    // DEFAULT_ALLOWED = published/validated (registryAssembly.ts). Naming the
    // pattern does not change plan_source; promotion needs Lab evidence
    // (validate_playbook_candidate DoD #4/#5) this repo cannot manufacture.
    expect(registry.playbooks.some((p) => p.id === "crm_lead_enrichment")).toBe(false);
    expect(registry.routes.some((r) => r.id === "crm_lead_enrichment_route_v1")).toBe(false);
    expect(plan(CRM_ENRICHMENT_GOAL).plan_source).toBe("composed");
  });

  it("the playbook's route reference resolves when beta entities are loaded", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const playbook = withBeta.playbooks.find((p) => p.id === "crm_lead_enrichment");
    expect(playbook).toBeDefined();
    expect(
      withBeta.routes.some((r) => r.id === playbook?.golden_path_route_id),
    ).toBe(true);
  });

  it("the route's components are exactly the live-composed shape", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "crm_lead_enrichment_route_v1");
    const composed = plan(CRM_ENRICHMENT_GOAL).recommended_route.map((step) => step.component_id);
    expect([...(route?.components ?? [])].sort()).toEqual([...composed].sort());
  });
});
