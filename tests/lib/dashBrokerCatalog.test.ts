/**
 * MAR-493 / MAR-494 — the DASH-facing vocabulary and brokered set.
 *
 * These assert claims about a *different repository*, which no type check and no
 * schema check can make for us: MAR-477 found the seam blocked by two field
 * values while every shape matched and every test passed. So each claim here is
 * paired with its absence — what must be named, and what must NOT be, because
 * over-claiming is the failure that produces a connection rendering as "DASH
 * holds this" whose every call is then refused.
 */
import { describe, it, expect } from "vitest";
import {
  dashManifestProvider,
  dashBrokersConnection,
  dashBrokeredConnectionIds,
  dashNamedConnectionIds,
  AI_PROVIDER_IDS,
} from "../../src/lib/dashBrokerCatalog.js";

describe("MAR-493 — provider vocabulary is DASH's, not the MCP's", () => {
  it("names Gmail the way DASH's broker profile keys on it", () => {
    // orchestratedash lib/broker/providers.ts: connection_provider: "google-gmail".
    // "gmail" resolved no profile, which was the whole MAR-477 refusal.
    expect(dashManifestProvider("gmail")).toBe("google-gmail");
  });

  it("names Google Calendar the way DASH's OAuth map keys on it", () => {
    // orchestratedash lib/oauth/providers.ts: FLOW_BY_MANIFEST_PROVIDER.
    expect(dashManifestProvider("google_calendar")).toBe("google-calendar");
  });

  it("passes an unmapped connection through unchanged rather than guessing", () => {
    // The honest failure. DASH refuses an unknown provider with "DASH has no
    // sign-in for this"; a transform would invent "google-sheets" and "hub-spot"
    // and turn that clean refusal into a wrong guess.
    for (const id of ["hubspot", "slack", "sendgrid", "google_sheets", "perplexity"]) {
      expect(dashManifestProvider(id)).toBe(id);
    }
  });

  it("maps nothing it has not been told about", () => {
    expect(dashNamedConnectionIds()).toEqual(["gmail", "google_calendar"]);
  });

  it("is total — an unknown id is an answer, never a throw", () => {
    expect(dashManifestProvider("")).toBe("");
    expect(dashManifestProvider("a-provider-invented-tomorrow")).toBe(
      "a-provider-invented-tomorrow",
    );
  });
});

describe("MAR-494 — brokered is a narrower claim than named", () => {
  it("says DASH brokers Gmail", () => {
    // orchestratedash lib/broker/operations.ts defines gmail.search,
    // gmail.message.read and gmail.draft.create, all connection_provider
    // "google-gmail".
    expect(dashBrokersConnection("gmail")).toBe(true);
  });

  it("does NOT say DASH brokers Google Calendar, though DASH can name it", () => {
    // The pair that proves the two questions are different. Calendar has an
    // OAuth flow on the DASH side but no broker profile and no operations, so
    // claiming it would produce a row that renders as connected and grants
    // nothing — `no_broker_profile` on every call.
    expect(dashManifestProvider("google_calendar")).toBe("google-calendar");
    expect(dashBrokersConnection("google_calendar")).toBe(false);
  });

  it("claims nothing for services DASH has no broker profile for", () => {
    for (const id of ["hubspot", "slack", "sendgrid", "google_sheets", "firecrawl"]) {
      expect(dashBrokersConnection(id), `${id} must not be claimed as brokered`).toBe(false);
    }
  });

  it("is exactly the set that was checked against DASH, and no wider", () => {
    // Deliberately an equality rather than a contains. Widening this set is a
    // claim about another repository, and it should not be possible to do it
    // without a failing test asking whether anyone verified it.
    expect(dashBrokeredConnectionIds()).toEqual(["gmail"]);
  });

  it("is a subset of what the vocabulary can name", () => {
    // A connection DASH brokers under a name DASH does not recognise is
    // incoherent: the profile lookup would fail on the provider string before
    // ownership ever mattered.
    for (const id of dashBrokeredConnectionIds()) {
      expect(dashNamedConnectionIds()).toContain(id);
    }
  });
});

describe("MAR-582/F14 — AI_PROVIDER_IDS is DASH's own vocabulary, pinned by value", () => {
  it("names exactly the three providers orchestratedash's lib/ai/providers.ts holds a key for", () => {
    // Checked against orchestratedash master `5ad6d70` (2026-08-10):
    // export const AI_PROVIDER_IDS = ["openrouter", "anthropic", "openai"] as const;
    expect(AI_PROVIDER_IDS).toEqual(["openrouter", "anthropic", "openai"]);
  });

  it("the two MCP-selectable llm_provider values both name a real DASH AI provider", () => {
    // "deterministic_first" is deliberately absent from AI_PROVIDER_IDS — it is
    // the caller declining a model provider, not naming one DASH holds a key
    // for, and observabilityContract.ts's aiProviderConnection treats it as
    // absence rather than as a fourth provider.
    for (const provider of ["anthropic", "openrouter"]) {
      expect(AI_PROVIDER_IDS as readonly string[]).toContain(provider);
    }
  });
});
