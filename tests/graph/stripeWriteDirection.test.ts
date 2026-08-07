/**
 * MAR-541 — a Stripe money-moving goal must not be planned as a READ.
 *
 * `stripe_data_read` is read-only: `permissions.write` is `[]`, its Connect
 * entry grants only `customers:read`/`subscriptions:read`/`charges:read`. The
 * bare `stripe`/`billing`/`subscription` KEYWORD_HINTS carried no direction, so
 * "issue the refund in Stripe after I approve it" composed a route whose only
 * Stripe step READS data, with a human_approval_gate guarding an action that
 * was not in the route at all.
 *
 * Unlike Airtable and the SQL sources (MAR-538, this issue's other half), there
 * is NO write component to repoint this to — `file_storage` is a storage
 * destination, not a payments API, and the registry has no Stripe-write
 * component. The acceptance bar is explicit: refuse honestly, never
 * substitute. So the fix here is suppression only, and every WRITE assertion
 * below checks the write is reported as a gap (`coverage.unmatched_demand`),
 * not that some other component silently stands in for it.
 *
 * Every presence assertion is paired with its absence twin: the read direction
 * (the MAR-526 slice-2 golden path) must keep working untouched.
 */
import { describe, expect, it } from "vitest";
import {
  hasStripeReadIntent,
  hasStripeWriteIntent,
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

describe("Stripe direction detection is verb-object-anchored (MAR-541)", () => {
  const WRITES = [
    "when a customer asks for a refund, issue the refund in Stripe after I approve it",
    "create a new subscription in Stripe when the signup form is submitted",
    "cancel the customer's stripe subscription when they request it",
    "process the customer's payment in stripe once the order ships",
  ];
  for (const goal of WRITES) {
    it(`reads write intent from: "${goal}"`, () => {
      expect(hasStripeWriteIntent(goal.toLowerCase())).toBe(true);
    });
  }

  const NOT_WRITES = [
    // a genuine read/analytics goal — no money-moving verb+object pair
    "pull churn data from Stripe and post a summary to Slack",
    "pull the subscription status from Stripe and notify the team on Slack if it's past due",
    "look up the subscription details in stripe before responding to the customer",
    // a write verb present, but no Stripe money-object near it
    "update the customer's shipping address and email them a confirmation",
  ];
  for (const goal of NOT_WRITES) {
    it(`does NOT read write intent from: "${goal}"`, () => {
      expect(hasStripeWriteIntent(goal.toLowerCase())).toBe(false);
    });
  }

  it("recognises read intent independently of write intent", () => {
    const readGoal = "pull the subscription status from Stripe and notify the team on Slack";
    expect(hasStripeReadIntent(readGoal)).toBe(true);
  });
});

// ── WRITE goals: no read-only component standing in, and an honest gap ───────

describe("a Stripe money-moving goal drops stripe_data_read and reports an honest gap (MAR-541)", () => {
  const WRITE_GOALS = [
    "when a customer asks for a refund, issue the refund in Stripe after I approve it",
    "create a new subscription in Stripe when the signup form is submitted",
  ];

  for (const goal of WRITE_GOALS) {
    it(`never selects stripe_data_read for: "${goal}"`, () => {
      expect(matchedIds(goal)).not.toContain("stripe_data_read");
    });

    it(`the composed route carries no stripe_data_read for: "${goal}"`, () => {
      expect(routeIds(goal)).not.toContain("stripe_data_read");
    });

    it(`the write is reported as an honest gap, not silently satisfied, for: "${goal}"`, () => {
      // The concrete harm this bug caused: coverage.unmatched_demand stayed
      // empty because stripe_data_read's own hint match claimed the "stripe"
      // token, and groupNounUnits folded the adjacent money noun into the
      // same claimed unit. Suppressing the false match un-claims "stripe" so
      // the same grouping now correctly reports the gap.
      expect(plan(goal).coverage.unmatched_demand.length).toBeGreaterThan(0);
    });
  }

  it("the refund goal's approval gate is not falsely satisfied by a route with no write in it", () => {
    // MAR-540's overclaim reached from this direction: enforced_approval_gates
    // must not describe a plan where the only Stripe step is a read. This
    // assertion does not require MAR-540's own fix (binding an approval to the
    // exact action) — only that the write itself is never silently dropped,
    // which the unmatched_demand assertion above already locks.
    const goal = "when a customer asks for a refund, issue the refund in Stripe after I approve it";
    expect(routeIds(goal)).not.toContain("stripe_data_read");
  });
});

// ── READ goals: unchanged ────────────────────────────────────────────────────

describe("a Stripe READ goal is untouched (MAR-541 absence fixtures)", () => {
  it("still selects stripe_data_read for the MAR-526 slice-2 golden-path read goal", () => {
    const goal = "pull churn data from Stripe and post a summary to Slack";
    const ids = matchedIds(goal);
    expect(ids).toContain("stripe_data_read");
    expect(routeIds(goal)).toContain("stripe_data_read");
    expect(plan(goal).coverage.unmatched_demand).toEqual([]);
  });

  it("still selects stripe_data_read for a subscription-status lookup goal", () => {
    const goal = "pull the subscription status from Stripe and notify the team on Slack if it's past due";
    expect(matchedIds(goal)).toContain("stripe_data_read");
  });

  it("still selects stripe_data_read for an in-conversation lookup goal", () => {
    const goal = "look up the subscription details in stripe before responding to the customer";
    expect(matchedIds(goal)).toContain("stripe_data_read");
  });
});
