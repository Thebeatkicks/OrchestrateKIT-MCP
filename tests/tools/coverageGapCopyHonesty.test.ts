/**
 * MAR-788 — the unmatched_demand header must not overclaim about the registry.
 *
 * MAR-786's own packet note named the residual defect: the shared blurb under
 * `unmatched_demand` said "No registry component carries these steps", which is
 * true for a genuine registry gap (Zendesk, Postgres — nothing in the registry
 * does this at all) but FALSE for the case MAR-786 itself just added: a
 * notification ask with no channel named. The registry has notify components
 * (slack_notification, telegram_notification, optional_email_send, …) — none is
 * in the ROUTE only because nothing named a channel. The header cannot tell
 * "you didn't name a channel" from "the registry has no such component" (the
 * membership check that distinguishes them lives in coverage.ts's private
 * NOTIFY_USER branch, not in the public Coverage shape), so per CONTRIBUTING.md's
 * grounded-prose rule — "the condition that emits a sentence must be exactly as
 * narrow as the evidence justifying it" — the fix retreats to the one claim that
 * is true under both causes: nothing in THIS ROUTE carries the step, full stop.
 *
 * Fixtures for both causes, per the grounded-prose rule's "cover it both ways":
 *   - the channel-not-named case (MAR-786's own transcript goal)
 *   - the genuine-registry-gap case (MAR-250's standing Zendesk/SMS fixture)
 * Both must render the SAME accurate header/blurb — proof neither is overclaiming
 * the other's cause.
 */
import { describe, expect, it } from "vitest";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { composeRoute } from "../../src/graph/routeComposer.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function cardOf(goal: string): string {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  ).summary_markdown;
}

// MAR-786's own transcript goal: the route it plans (page_monitor → state_store)
// has no notify component, purely because no channel was named — the registry
// itself is not short a component class here.
const CHANNEL_NOT_NAMED_GOAL =
  "Watch the prices of a few things my family wants — my 14 year old wants a gaming laptop, " +
  "my wife wants a coffee machine — across a handful of shops, and tell me when one drops " +
  "below the price I set.";

// MAR-250's standing fixture: Zendesk and SMS delivery are not in the registry
// at all — a genuine registry gap, not a naming gap.
const REGISTRY_GAP_GOAL =
  "Every Monday morning, pull last week's support tickets from Zendesk and text me a summary via SMS.";

describe("MAR-788 — the gap header states only what both causes share", () => {
  it("never claims the registry has no such component (that is only true sometimes)", () => {
    for (const goal of [CHANNEL_NOT_NAMED_GOAL, REGISTRY_GAP_GOAL]) {
      const md = cardOf(goal);
      expect(md).not.toContain("No registry component carries these steps");
      expect(md).not.toContain("**Not covered by the registry:**");
    }
  });

  it("the channel-not-named case renders the shared, cause-neutral header", () => {
    const md = cardOf(CHANNEL_NOT_NAMED_GOAL);
    expect(md).toContain("**Not carried by this route:**");
    expect(md).toContain('"tell me when one drops below the price I set"');
    expect(md).toContain(
      "nothing in this route carries these steps yet",
    );
  });

  it("the genuine-registry-gap case renders the identical header — proof neither side overclaims", () => {
    const md = cardOf(REGISTRY_GAP_GOAL);
    expect(md).toContain("**Not carried by this route:**");
    expect(md.toLowerCase()).toContain("zendesk");
    expect(md).toContain(
      "nothing in this route carries these steps yet",
    );
  });

  it("compose_workflow_route's own warning is equally cause-neutral", () => {
    const result = composeRoute(
      { goal: CHANNEL_NOT_NAMED_GOAL, must_have_capabilities: [], must_avoid: [] },
      registry,
    );
    expect(result.warnings.join(" ")).not.toContain("NOT covered by any registry component");
    const gapWarning = result.warnings.find((w) => w.includes("does not carry"));
    expect(gapWarning).toBeDefined();
    expect(gapWarning).toContain("Goal steps this route does not carry:");
  });
});
