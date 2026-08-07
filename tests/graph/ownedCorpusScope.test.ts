/**
 * MAR-525 sub-item 2b — the owned-corpus guardrail.
 *
 * MAR-513's gap list found `second_brain_assistant` stuck at `status: candidate`
 * with no fixture coverage. MAR-525 then found the deeper product gap: the
 * playbook's OWN goal shape did not merely miss its playbook, it was fully
 * shadowed by the unrelated, `status: published` `research_agent_citations`, so
 * a personal-notes goal came back as a public-web research pipeline with
 * `safety_review: pass` and risk 0 — and the guardrail that defines the pattern
 * ("Scope the vector index to the OWNED corpus only — never ingest public URLs
 * or third-party content") was silently dropped.
 *
 * Root cause, live-probed 2026-08-07: a second-brain goal states the ATTRIBUTION
 * half of the pattern by nature ("cites the source note for every claim"), and
 * "cite"/"citation" is a `research` DOMAIN_KEYWORD. That makes `source_retrieval`
 * — the research domain's EXTERNAL fetch, deliberately not a `knowledge`
 * component — eligible, and the composed candidate then looks exactly like
 * research_agent_citations (recall/precision clear the playbook floors).
 *
 * Promotion is NOT available as a fix: candidate-status entities are invisible to
 * every live tool by design (`DEFAULT_ALLOWED = published/validated`), and
 * `validate_playbook_candidate`'s DoD #4 requires real OrchestrateLab session
 * evidence an MCP-only change cannot manufacture. So the guardrail is read from
 * the GOAL, where the user stated it, and reported against the ROUTE.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { computeConstraintCoverage } from "../../src/graph/constraintCoverage.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import {
  OWNED_CORPUS_SIGNALS,
  detectConstraintSignals,
  hasOwnedCorpusScope,
} from "../../src/lib/constraintSignals.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

/** The `second_brain_assistant` playbook's own goal shape, in plain language. */
const SECOND_BRAIN_GOAL =
  "Build an assistant that answers questions from my personal notes vault and " +
  "cites the source note for every claim.";

/** `research_agent_citations`' own goal shape — the playbook that was shadowing. */
const PUBLIC_RESEARCH_GOAL =
  "Build a research agent that searches the public web for competitor pricing and " +
  "writes a summary with verified citations.";

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

describe("owned-corpus scope detection (MAR-525 2b)", () => {
  it("fires on possessive owned-corpus phrasing and reports the trigger", () => {
    const signals = detectConstraintSignals(SECOND_BRAIN_GOAL);
    expect(signals.owned_corpus.detected).toBe(true);
    expect(signals.owned_corpus.trigger).toBe("personal notes");
  });

  it("does NOT fire on a public-web research goal (absence fixture)", () => {
    expect(detectConstraintSignals(PUBLIC_RESEARCH_GOAL).owned_corpus.detected).toBe(false);
  });

  it("does NOT fire on RAG mechanism words alone — those say nothing about ownership", () => {
    // "vector store", "embeddings", "semantic search" establish the knowledge
    // DOMAIN but a RAG pipeline over public documentation is an ordinary goal.
    expect(hasOwnedCorpusScope("Build a RAG pipeline with embeddings over the public API docs")).toBe(
      false,
    );
    expect(hasOwnedCorpusScope("Add semantic search over our published help centre")).toBe(false);
  });

  it("yields when the goal ALSO asks for public sources outright", () => {
    expect(
      hasOwnedCorpusScope("Answer from my notes and also search the web for newer context"),
    ).toBe(false);
  });

  it("treats a NEGATED public-source mention as the guardrail, not a request for it", () => {
    // "Never index public web pages" restates the guardrail. A mention-based
    // escape list read this backwards and disabled the guardrail the sentence
    // asks for (caught live while probing, 2026-08-07).
    const goal =
      "Build an agent that answers my questions from my own Obsidian vault of personal " +
      "notes. Never index public web pages.";
    expect(hasOwnedCorpusScope(goal)).toBe(true);
    expect(hasOwnedCorpusScope("Answer from my notes but never search the web")).toBe(true);
  });
});

describe("owned-corpus goals route to the OWNED retrieval path (MAR-525 2b)", () => {
  it("drops the external fetch source_retrieval and keeps the vector index", () => {
    const ids = matchedIds(SECOND_BRAIN_GOAL);
    expect(ids).not.toContain("source_retrieval");
    expect(ids).toContain("vector_store");
    expect(ids).toContain("knowledge_ingestion");
  });

  it("leaves a genuine public-web research goal untouched", () => {
    const ids = matchedIds(PUBLIC_RESEARCH_GOAL);
    expect(ids).toContain("source_retrieval");
    expect(ids).not.toContain("knowledge_ingestion");
  });

  it("keeps source_retrieval on a mixed owned+public goal", () => {
    const ids = matchedIds(
      "Answer questions from my notes and also search the web for newer sources.",
    );
    expect(ids).toContain("source_retrieval");
  });

  /**
   * The load-bearing invariant. Every phrase that SUPPRESSES the external fetch
   * must also SELECT the owned-corpus retrieval path — otherwise the suppression
   * leaves a route that ranks and synthesises with nothing to read. That exact
   * hollow route was observed live before the KEYWORD_HINTS entries existed:
   * `source_ranking → research_synthesis → citation_checker → source_freshness_check`.
   */
  it("every owned-corpus phrase selects the owned-corpus retrieval path", () => {
    for (const phrase of OWNED_CORPUS_SIGNALS) {
      const ids = matchedIds(`Build an assistant that answers questions from ${phrase}.`);
      expect(ids, `"${phrase}" must select vector_store`).toContain("vector_store");
      expect(ids, `"${phrase}" must not select source_retrieval`).not.toContain("source_retrieval");
    }
  });
});

describe("the guardrail reaches the plan (MAR-525 2b)", () => {
  it("no longer routes the second-brain goal into research_agent_citations", () => {
    const p = plan(SECOND_BRAIN_GOAL);
    expect(p.plan_source).toBe("composed");
    expect(p.playbook?.id ?? null).toBeNull();
    const route = p.recommended_route.map((step) => step.component_id);
    expect(route).toContain("vector_store");
    expect(route).not.toContain("source_retrieval");
  });

  it("still routes the public-web research goal to research_agent_citations", () => {
    const p = plan(PUBLIC_RESEARCH_GOAL);
    expect(p.plan_source).toBe("playbook");
    expect(p.playbook?.id).toBe("research_agent_citations");
  });

  it("states the owned-corpus guardrail on the Layer-1 card", () => {
    const card = plan(SECOND_BRAIN_GOAL).summary_markdown;
    expect(card).toContain("the index stays scoped to your own content");
    expect(card).toContain("no public URLs or third-party pages are ingested");
  });

  it("names the guardrail as NOT carried when the route still ingests public content", () => {
    const p = plan(
      "Build a second brain over my notes that also scrapes competitor web pages every " +
        "morning into the same index.",
    );
    const route = p.recommended_route.map((step) => step.component_id);
    expect(route).toContain("data_scraper");
    expect(p.summary_markdown).toContain("owned-corpus-only NOT carried");
    expect(p.summary_markdown).toContain("data_scraper");
  });

  it("does NOT mention the guardrail on a goal that never named an owned corpus", () => {
    expect(plan(PUBLIC_RESEARCH_GOAL).summary_markdown).not.toContain("owned-corpus");
    expect(plan(PUBLIC_RESEARCH_GOAL).summary_markdown).not.toContain("your own content");
  });
});

describe("constraint coverage reports the guardrail against the route (MAR-525 2b)", () => {
  it("structural when no public-source component is present", () => {
    const cc = computeConstraintCoverage({
      goal: SECOND_BRAIN_GOAL,
      executionOrder: ["knowledge_ingestion", "vector_store", "source_ranking", "research_synthesis"],
      gatedWriteIds: [],
    });
    const check = cc.checks.find((c) => c.goal_phrase === "personal notes");
    expect(check?.status).toBe("structural");
    expect(check?.constraint_class).toBe("prohibition");
  });

  it("violated — and named — when the route ingests public content", () => {
    const cc = computeConstraintCoverage({
      goal: SECOND_BRAIN_GOAL,
      executionOrder: ["source_retrieval", "vector_store", "research_synthesis"],
      gatedWriteIds: [],
    });
    const check = cc.checks.find((c) => c.goal_phrase === "personal notes");
    expect(check?.status).toBe("violated");
    expect(check?.representation).toContain("source_retrieval");
    expect(cc.constraint_label).toBe("gaps");
  });

  it("emits no owned-corpus check at all when the goal never named one", () => {
    const cc = computeConstraintCoverage({
      goal: PUBLIC_RESEARCH_GOAL,
      executionOrder: ["source_retrieval", "source_ranking", "research_synthesis"],
      gatedWriteIds: [],
    });
    expect(cc.checks.every((c) => !c.representation.includes("owned-corpus"))).toBe(true);
  });
});
