/**
 * MAR-551 — `auth_failure_handler` silently absorbed "keep the OAuth token
 * refreshed".
 *
 * The one must-fix on that issue. Reactive recovery is not proactive lifecycle:
 * `auth_failure_handler`'s declared INPUT is a "failure signal from an external
 * integration step (HTTP 401/403, expired token, missing scope)" — it runs after
 * a call has already failed. Nothing in the registry schedules a refresh before
 * expiry. The plan reported the ask as covered anyway, because the component
 * fuzzy-matched the bare word "token" out of its `detect_token_expiry`
 * capability, and one claimed word inside a clause clears the whole clause.
 *
 * That is a coverage overclaim — a guarantee asserted with no fixture behind it,
 * the shape MAR-540 records for approval binding — and it had to be corrected
 * whether or not a lifecycle component is ever built.
 *
 * Presence paired with absence: a goal that only wants failure recovery must not
 * gain a spurious gap.
 */
import { describe, expect, it } from "vitest";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function plan(goal: string) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
}

describe("a proactive token-refresh ask is reported, not absorbed (MAR-551)", () => {
  const QUICKBOOKS_GOAL =
    "pull invoices from the QuickBooks API on a schedule, keeping the OAuth token refreshed, " +
    "and email a PDF report";

  it("reports the lifecycle ask the route does not carry", () => {
    const gaps = plan(QUICKBOOKS_GOAL).coverage.unmatched_demand;
    expect(gaps.join(" ")).toContain("OAuth token refreshed");
  });

  it("auth_failure_handler is still in the route — it is present, just not sufficient", () => {
    // The fix is about what the plan CLAIMS, not about removing recovery. A
    // route that reacts to expiry is better than one that does not; it simply
    // does not deliver a pre-expiry refresh, and must not say it does.
    const ids = plan(QUICKBOOKS_GOAL).recommended_route.map((s) => s.component_id);
    expect(ids).toContain("auth_failure_handler");
  });

  const OTHER_PHRASINGS = [
    "sync our Shopify orders nightly and refresh the OAuth token before it expires",
    "keep the API token refreshed so the nightly sync never fails",
    "rotate the token on a schedule so the unattended run never hits a 401",
  ];
  for (const goal of OTHER_PHRASINGS) {
    it(`reports it for: "${goal.slice(0, 60)}…"`, () => {
      expect(plan(goal).coverage.unmatched_demand.length).toBeGreaterThan(0);
    });
  }
});

describe("a goal that only wants failure recovery gains no spurious gap (MAR-551)", () => {
  it("the same QuickBooks goal without the lifecycle clause is unchanged", () => {
    const r = plan(
      "pull invoices from the QuickBooks API on a schedule and email a PDF report",
    );
    expect(r.coverage.unmatched_demand).toEqual([]);
    expect(r.recommended_route.map((s) => s.component_id)).toContain("auth_failure_handler");
  });

  it("an ordinary unattended goal is not flagged just for having credentials", () => {
    const r = plan(
      "every morning, unattended, read rows from our database and post a summary to Slack",
    );
    expect(r.coverage.unmatched_demand.join(" ")).not.toContain("token");
  });
});

describe("the other two MAR-551 asks were already honest (MAR-551 regression guard)", () => {
  it("a Notion write is reported as unmatched demand — no component exists", () => {
    const r = plan("capture Telegram poll responses and write the results into a Notion database");
    expect(r.coverage.unmatched_demand.join(" ")).toContain("Notion");
    expect(registry.components.some((c) => c.id.includes("notion"))).toBe(false);
  });

  it("EDI 850 generation is reported as unmatched demand — no component exists", () => {
    const r = plan("batch-extract purchase order PDFs and generate EDI 850 files for the ERP");
    expect(r.coverage.unmatched_demand.join(" ")).toContain("EDI 850");
    // `code_editing` contains the letters "edi"; match the concept, not the substring.
    expect(
      registry.components.some(
        (c) => c.id.startsWith("edi") || /\bedi\b|interchange/i.test(c.summary),
      ),
    ).toBe(false);
  });
});
