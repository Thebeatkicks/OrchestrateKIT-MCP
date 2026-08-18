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
  dashAiOperationId,
  dashBrokerOperations,
  dashOperationById,
  dashOperationIds,
  dashOperationsForComponent,
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
    // Re-checked against orchestratedash master `118d83b` (2026-08-18, MAR-692),
    // and now proven on every CI run by `pnpm dash:vocab:check` rather than by
    // this comment:
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

describe("MAR-692 — the operation catalogue, by id and access class", () => {
  it("holds DASH's fifteen operations, not the three it held for 598 commits", () => {
    /*
     * The number is asserted because it is the fact that went stale silently.
     * `pnpm dash:vocab:check` proves the CONTENT against DASH's running
     * `allOperations()`; this proves the mirror was not quietly narrowed on a
     * machine that had no orchestratedash checked out.
     */
    expect(dashOperationIds()).toHaveLength(15);
    expect(dashOperationIds()).toContain("gmail.search");
    expect(dashOperationIds()).toContain("openrouter.brief.compose");
  });

  it("answers null for an id DASH cannot resolve, exactly as DASH's operationById does", () => {
    /*
     * The `${provider}.${component_id}` shape the emitter used to write. Asserted
     * as an absence because that is the failure: DASH does not reject such a
     * manifest at import — it accepts it, and then answers `unknown_operation`
     * on every call the agent makes.
     */
    expect(dashOperationById("openrouter.research_synthesis")).toBeNull();
    expect(dashOperationById("gmail.email_read")).toBeNull();
    expect(dashOperationById("firecrawl.page_monitor")).toBeNull();
    expect(dashOperationById("openrouter.brief.compose")?.access).toBe("spend");
  });

  it("files every model call under spend and never under read or write", () => {
    /*
     * `spend` means the person's own account is charged and nothing appears
     * anywhere. A completion filed under `write` makes a permission card promise
     * something turns up in an account; under `read` it promises nothing is
     * charged. Both are wrong in the direction that matters — a card that
     * understates cost.
     */
    for (const operation of dashBrokerOperations()) {
      const isCompletion = /\.(chat\.completion|digest\.curate|brief\.compose)$/.test(operation.id);
      expect(isCompletion ? "spend" : operation.access, operation.id).toBe(operation.access);
      if (isCompletion) expect(operation.access, operation.id).toBe("spend");
    }
    expect(dashBrokerOperations().filter((o) => o.access === "spend")).toHaveLength(9);
  });

  it("builds each AI operation id DASH's way, and refuses one for a provider DASH has no profile for", () => {
    expect(dashAiOperationId("openrouter", "brief_compose")).toBe("openrouter.brief.compose");
    expect(dashAiOperationId("anthropic", "digest_curate")).toBe("anthropic.digest.curate");
    expect(dashAiOperationId("openai", "models_list")).toBe("openai.models.list");
    // The safe direction: a connection that declares less, never a capability
    // card promising an operation that would refuse.
    expect(dashAiOperationId("mistral", "chat_completion")).toBeNull();
  });
});

describe("MAR-692 — components map to operations DASH has, or to nothing", () => {
  it("routes a document-writing step through brief.compose, matching the proven scout", () => {
    /*
     * The ground truth is the competitor scout's hand-written manifest, the one
     * real agent that runs on DASH: it declares `openrouter.brief.compose` for
     * writing up what it found. `research_synthesis` is the registry component
     * whose outputs are that same thing — a document about a set of collected
     * items — so it is the one the emitter routes there.
     */
    expect(dashOperationsForComponent("openrouter", "research_synthesis")).toEqual([
      "openrouter.brief.compose",
    ]);
    expect(dashOperationsForComponent("anthropic", "report_generation")).toEqual([
      "anthropic.brief.compose",
    ]);
  });

  it("falls back to chat.completion, which is never wrong about what a model step does", () => {
    // The general "answer a question" spend. Under-specific is safe here; a
    // wrongly specific id is a real spend behind a card describing something else.
    expect(dashOperationsForComponent("openrouter", "copy_generation")).toEqual([
      "openrouter.chat.completion",
    ]);
    expect(dashOperationsForComponent("openrouter", "intent_classifier")).toEqual([
      "openrouter.chat.completion",
    ]);
  });

  it("gives an email SEND step nothing, because DASH has no send operation and never will", () => {
    /*
     * ADR 0002 invariant 6. The whole draft-only profile rests on there being no
     * operation built on `gmail.compose` that sends — so a capability claiming
     * one would render as "DASH can send mail for this agent" over a call that
     * cannot exist. An empty list is the honest answer, and
     * `agentDomConnections` downgrades a connection with no resolvable
     * operations to agent_managed rather than shipping an empty capability list
     * the schema would reject anyway.
     */
    expect(dashOperationsForComponent("google-gmail", "email_send")).toEqual([]);
    expect(dashOperationsForComponent("google-gmail", "optional_email_send")).toEqual([]);
    expect(dashOperationsForComponent("google-gmail", "email_read")).toEqual([
      "gmail.search",
      "gmail.message.read",
    ]);
    expect(dashOperationsForComponent("google-gmail", "gmail_draft_write")).toEqual([
      "gmail.draft.create",
    ]);
  });

  it("gives an unknown component and an unbrokered provider nothing", () => {
    expect(dashOperationsForComponent("google-gmail", "not_a_component")).toEqual([]);
    expect(dashOperationsForComponent("firecrawl", "page_monitor")).toEqual([]);
  });

  it("never returns an id its own operationById cannot resolve", () => {
    // The invariant every caller depends on: whatever comes out of here is
    // something DASH will look up successfully.
    const components = [
      "research_synthesis",
      "report_generation",
      "copy_generation",
      "email_read",
      "gmail_draft_write",
      "email_send",
      "page_monitor",
    ];
    for (const provider of ["openrouter", "anthropic", "openai", "google-gmail", "firecrawl"]) {
      for (const component of components) {
        for (const id of dashOperationsForComponent(provider, component)) {
          expect(dashOperationById(id), `${provider}/${component} -> ${id}`).not.toBeNull();
        }
      }
    }
  });
});
