/**
 * MAR-526 slice 2 — Stripe and Airtable data sources.
 *
 * MAR-513's gap-list item 3 found 14 components with live `capabilityMatcher`
 * vocabulary backing no route or playbook. Unlike slice 1's `crm_record_read`
 * (which was UNREACHABLE), `stripe_data_read` and `airtable_lookup` were
 * already reachable — a goal naming Stripe/Airtable correctly selects the
 * specific component, never the generic `data_scraper` fallback the docs
 * also market for these sources. This slice is pure golden-path naming: a
 * named route + playbook for each, not a matcher fix.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

const STRIPE_GOAL =
  "every morning, unattended, pull churn data from Stripe and post an at-risk-accounts " +
  "summary to Slack";

const AIRTABLE_GOAL =
  "every morning, unattended, read records from our Airtable base and post a summary " +
  "report to Slack";

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

describe("Stripe vocabulary reaches stripe_data_read, not the generic scraper (MAR-526 slice 2)", () => {
  const STRIPE_PHRASINGS = [
    "Pull subscription data from Stripe and post it to Slack.",
    "Read billing records from Stripe every morning.",
    "Fetch churn data from Stripe and flag at-risk accounts.",
  ];

  for (const goal of STRIPE_PHRASINGS) {
    it(`selects stripe_data_read for: "${goal}"`, () => {
      expect(matchedIds(goal)).toContain("stripe_data_read");
    });
  }

  it("does not fire on a goal that never mentions Stripe/billing/subscription", () => {
    const ids = matchedIds("Read the unread messages in my inbox and summarise them.");
    expect(ids).not.toContain("stripe_data_read");
  });

  it("the churn-report goal composes the specific integration, not data_scraper", () => {
    const route = plan(STRIPE_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toContain("stripe_data_read");
    expect(route).not.toContain("data_scraper");
  });
});

describe("Airtable vocabulary reaches airtable_lookup, not the generic scraper (MAR-526 slice 2)", () => {
  const AIRTABLE_PHRASINGS = [
    "Read records from our Airtable base and post a summary to Slack.",
    "Pull rows from Airtable every morning.",
  ];

  for (const goal of AIRTABLE_PHRASINGS) {
    it(`selects airtable_lookup for: "${goal}"`, () => {
      expect(matchedIds(goal)).toContain("airtable_lookup");
    });
  }

  it("does not fire on a goal that never mentions Airtable", () => {
    const ids = matchedIds("Read the unread messages in my inbox and summarise them.");
    expect(ids).not.toContain("airtable_lookup");
  });

  it("the summary-report goal composes the specific integration, not data_scraper", () => {
    const route = plan(AIRTABLE_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toContain("airtable_lookup");
    expect(route).not.toContain("data_scraper");
  });
});

describe("both golden paths are unattended-advisory, not enforced (MAR-132)", () => {
  it("Stripe: the goal's 'unattended' phrasing keeps the gate present but advisory", () => {
    const p = plan(STRIPE_GOAL);
    const route = p.recommended_route.map((step) => step.component_id);
    expect(route).toContain("human_approval_gate");
    expect(p.enforced_approval_gates).toEqual([]);
    expect(p.automation_clearance.level).toBe("L2");
  });

  it("Airtable: the goal's 'unattended' phrasing keeps the gate present but advisory", () => {
    const p = plan(AIRTABLE_GOAL);
    const route = p.recommended_route.map((step) => step.component_id);
    expect(route).toContain("human_approval_gate");
    expect(p.enforced_approval_gates).toEqual([]);
    expect(p.automation_clearance.level).toBe("L2");
  });
});

describe("stripe_data_report / airtable_data_report registry artifacts (MAR-526 slice 2)", () => {
  it("are status: beta, so they stay out of the default-loaded registry", () => {
    expect(registry.playbooks.some((p) => p.id === "stripe_data_report")).toBe(false);
    expect(registry.routes.some((r) => r.id === "stripe_data_report_route_v1")).toBe(false);
    expect(registry.playbooks.some((p) => p.id === "airtable_data_report")).toBe(false);
    expect(registry.routes.some((r) => r.id === "airtable_data_report_route_v1")).toBe(false);
    expect(plan(STRIPE_GOAL).plan_source).toBe("composed");
    expect(plan(AIRTABLE_GOAL).plan_source).toBe("composed");
  });

  it("both playbooks' route references resolve when beta entities are loaded", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    for (const [pbId, routeId] of [
      ["stripe_data_report", "stripe_data_report_route_v1"],
      ["airtable_data_report", "airtable_data_report_route_v1"],
    ]) {
      const playbook = withBeta.playbooks.find((p) => p.id === pbId);
      expect(playbook).toBeDefined();
      expect(withBeta.routes.some((r) => r.id === playbook?.golden_path_route_id)).toBe(true);
      expect(playbook?.golden_path_route_id).toBe(routeId);
    }
  });

  it("the Stripe route's components are exactly the live-composed shape", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "stripe_data_report_route_v1");
    const composed = plan(STRIPE_GOAL).recommended_route.map((step) => step.component_id);
    expect([...(route?.components ?? [])].sort()).toEqual([...composed].sort());
  });

  it("the Airtable route is a leaner, noise-free subset of the live-composed shape", () => {
    // threshold_router and reviewer_notification also ride in on this goal —
    // compose noise from airtable_lookup's own summary text overlapping
    // threshold_router's "routing logic" vocabulary. Deliberately excluded
    // from the registered route, same precedent as chat_triggered_assistant_route_v1.
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "airtable_data_report_route_v1");
    const composed = new Set(plan(AIRTABLE_GOAL).recommended_route.map((step) => step.component_id));
    for (const componentId of route?.components ?? []) {
      expect(composed.has(componentId)).toBe(true);
    }
    expect(route?.components).not.toContain("threshold_router");
    expect(route?.components).not.toContain("reviewer_notification");
  });
});
