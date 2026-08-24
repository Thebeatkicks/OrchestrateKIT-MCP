/**
 * MAR-742/F3 + F5 — a recommendation carries its cost, and the card names what
 * it left out.
 *
 * F3, reported case: a family price-watch goal — about a dozen products,
 * checked hourly, which the transcript sized at ~8,600 fetches/month — was
 * recommended Firecrawl. Firecrawl's free tier is 500 pages/month. The number
 * was not missing from the codebase: it sat in `INTEGRATION_CATALOG.page_monitor
 * .gotchas[2]`, and the card never renders `gotchas`. So the one fact that
 * disqualifies the recommendation was in the structured output and out of the
 * user's sight.
 *
 * Two halves, both asserted here:
 *   1. the meter travels with the recommendation, onto the card; and
 *   2. a rendering service is not the DEFAULT shape for reading a page. Nothing
 *      in that goal says the pages need a browser, and most shop pages carry the
 *      price in the JSON endpoint the page itself calls — no API key, no quota.
 *
 * Both are paired with their absence twins: a goal that DOES state a rendering
 * need gets the rendering service and its meter, and the meter is not quoted at
 * someone who is being pointed at a plain fetch.
 *
 * F5: the compact card names `delivery_mode: "full"`. `output_depth` is a
 * different axis and does not produce the issue package, so a reader had no way
 * to tell "not included here" from "does not exist".
 */
import { describe, expect, it } from "vitest";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function plan(goal: string, output_depth: "brief" | "technical" = "brief") {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth },
    registry,
  );
}

const PRICE_WATCH =
  "Watch the prices of a few things my family wants across a handful of shops and tell me " +
  "when one drops below the price I set. Check about a dozen products every hour.";

const PRICE_WATCH_RENDERED =
  `${PRICE_WATCH} The shop pages are javascript-heavy and only render in the browser.`;

function pageMonitorNeed(goal: string) {
  return plan(goal, "technical").what_you_need.find((n) => n.component_id === "page_monitor");
}

describe("the default shape for reading a page is a plain fetch (MAR-742/F3)", () => {
  it("a price-watch goal that states no rendering need is pointed at plain HTTP", () => {
    const need = pageMonitorNeed(PRICE_WATCH);
    expect(need).toBeDefined();
    expect(need!.recommended_shape_id).toBe("plain_fetch");
    expect(need!.recommended_shape).toMatch(/plain HTTP/i);
    expect(need!.recommended_shape).toMatch(/no API key/i);
  });

  it("the card names the plain fetch rather than a list of rendering services", () => {
    const md = plan(PRICE_WATCH).summary_markdown;
    const connections = md.split("\n").find((l) => l.startsWith("**Connections:**"))!;
    expect(connections).toContain("plain HTTP");
    expect(connections).not.toContain("Firecrawl");
  });

  it("no quota is quoted at a user who is not being pointed at a metered product", () => {
    // The mirror-image dishonesty: a page quota is meaningless to someone
    // fetching pages themselves, and quoting it would imply a limit they do
    // not have.
    const need = pageMonitorNeed(PRICE_WATCH);
    expect(need!.quota_assumption).toBeUndefined();
    expect(plan(PRICE_WATCH).summary_markdown).not.toContain("**Usage assumption:**");
  });
});

describe("the absence twin — a stated rendering need gets the service, with its meter (MAR-742/F3)", () => {
  it("a javascript-rendered goal keeps the rendering service", () => {
    const need = pageMonitorNeed(PRICE_WATCH_RENDERED);
    expect(need!.recommended_shape_id).toBe("rendering_service");
    expect(need!.recommended_shape).toMatch(/browser/i);
  });

  it("and the card carries the free-tier meter with it", () => {
    const md = plan(PRICE_WATCH_RENDERED).summary_markdown;
    expect(md).toContain("Firecrawl");
    expect(md).toContain("**Usage assumption:**");
    expect(md).toContain("500 pages/month");
  });

  it("the meter is structured, not a sentence buried in gotchas", () => {
    const need = pageMonitorNeed(PRICE_WATCH_RENDERED);
    expect(need!.quota_assumption).toEqual({
      product: "Firecrawl",
      note: "Firecrawl's free tier is 500 pages/month",
    });
  });
});

describe("§11 Connect is not handed a product that does not exist (MAR-742/F3)", () => {
  it("the plain-fetch default never becomes a connection to authorize", () => {
    // The fetch-first default is deliberately NOT expressed by reordering
    // `product_examples`: that list is what the connection contract turns into
    // an acquisition row, and a plain HTTP fetch is not a provider you sign in
    // to. Getting this wrong produced a "Plain HTTP fetch connection server
    // (broker-backed)" row offering to hold a credential for nothing.
    const need = pageMonitorNeed(PRICE_WATCH);
    expect(need!.product_examples[0]).toBe("Firecrawl");
    for (const requirement of plan(PRICE_WATCH, "technical").connection_contract ?? []) {
      expect(requirement.connection_id).not.toMatch(/fetch/i);
      expect(requirement.label).not.toMatch(/plain http/i);
    }
  });
});

describe("the compact card names the delivery it leaves out (MAR-742/F5)", () => {
  it("a build-shaped goal's card points at delivery_mode: full", () => {
    const r = plan(PRICE_WATCH);
    // premise: this is a goal with something to deploy, so there IS an issue
    // package to be missing.
    expect(r.goal_to_product_wizard.runtime_requirements.must_run_while_user_offline).toBe(
      true,
    );
    expect(r.summary_markdown).toContain("export_build_brief");
    expect(r.summary_markdown).toContain('delivery_mode: "full"');
    expect(r.summary_markdown).toContain("issue package");
  });

  it("a one-shot goal is NOT nagged toward it", () => {
    // Absence twin, and MAR-385's rule: a goal the chat can finish in one go has
    // no issue package to disclose, so naming one would be a nag rather than a
    // disclosure.
    const r = plan("summarize my inbox for me now");
    expect(r.goal_to_product_wizard.runtime_requirements.must_run_while_user_offline).toBe(
      false,
    );
    expect(r.summary_markdown).not.toContain("export_build_brief");
  });

  it("the deeper layers do not repeat it — the continue menu already owns that fork", () => {
    // MAR-397 AC3: the tool is the sole menu author, and one menu only.
    expect(plan(PRICE_WATCH, "technical").summary_markdown).not.toContain(
      'delivery_mode: "full"',
    );
  });
});
