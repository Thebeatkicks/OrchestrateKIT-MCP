import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import { validatePlaybookCandidate } from "../../src/tools/validatePlaybookCandidate.js";

/**
 * MAR-169 — validate_playbook_candidate. The playbook-factory gate: read-only,
 * deterministic, stateless. Certifies the STRUCTURAL Definition of Done up to
 * `beta`; never certifies validated/published (those need Lab evidence).
 */
const registry = loadRegistry({ includeBeta: true });

function dod(r: ReturnType<typeof validatePlaybookCandidate>, id: number) {
  return r.dod.find((d) => d.id === id);
}

const FULL_CANDIDATE = `id: my_candidate
version: "0.1.0"
status: draft
title: My Candidate
summary: A well-formed candidate playbook for testing.
workflow_type: data
golden_path_route_id: ""
components: [data_scraper, data_normalizer, deduplication, schema_validation, state_store]
edges: [data_scraper__produces__data_normalizer, data_normalizer__produces__deduplication]
stack_id: default_orchestratekit_stack
risk_level: medium
deterministic_steps: [data_scraper, data_normalizer]
failure_modes: [a, b, c, d, e]
evals: [a, b, c, d, e]
sources:
  - title: test source
    source_type: internal_note
`;

describe("validate_playbook_candidate — happy path", () => {
  it("a real registry playbook qualifies for beta, needs Lab evidence for more", () => {
    const yaml = readFileSync("registry/playbooks/data_extraction_enrichment.playbook.yaml", "utf8");
    const r = validatePlaybookCandidate(yaml, registry);
    expect(r.status).toBe("ok");
    expect(r.qualifies_for).toBe("beta");
    expect(r.blocking).toHaveLength(0);
    // the two evidence items (sessions + benchmark) are unverifiable, never faked
    expect(r.evidence_required.length).toBe(2);
    expect(dod(r, 4)!.ok).toBe("unverifiable");
    expect(dod(r, 5)!.ok).toBe("unverifiable");
  });

  it("a complete hand-written candidate qualifies for beta", () => {
    const r = validatePlaybookCandidate(FULL_CANDIDATE, registry);
    expect(r.status).toBe("ok");
    expect(r.qualifies_for).toBe("beta");
    expect(r.missing_components).toHaveLength(0);
    expect(r.invalid_edges).toHaveLength(0);
  });
});

describe("validate_playbook_candidate — structural failures", () => {
  it("flags unknown components and invalid edges", () => {
    const yaml = FULL_CANDIDATE.replace("state_store]", "ghost_component]").replace(
      "edges: [data_scraper__produces__data_normalizer, data_normalizer__produces__deduplication]",
      "edges: [no_such_edge]",
    );
    const r = validatePlaybookCandidate(yaml, registry);
    expect(r.missing_components).toContain("ghost_component");
    expect(r.invalid_edges).toContain("no_such_edge");
    expect(r.qualifies_for).toBe("draft"); // refs broken ⇒ cannot be candidate
    expect(dod(r, 6)!.ok).toBe(false);
    expect(dod(r, 7)!.ok).toBe(false);
  });

  it("too few evals/failure modes blocks beta but can still be a candidate", () => {
    const yaml = FULL_CANDIDATE.replace("evals: [a, b, c, d, e]", "evals: [a]").replace(
      "failure_modes: [a, b, c, d, e]",
      "failure_modes: [a]",
    );
    const r = validatePlaybookCandidate(yaml, registry);
    expect(r.qualifies_for).toBe("candidate"); // refs ok, but not beta
    expect(dod(r, 2)!.ok).toBe(false);
    expect(dod(r, 3)!.ok).toBe(false);
    expect(r.blocking.length).toBeGreaterThan(0);
  });

  it("a gated external write without an approval policy fails DoD #8", () => {
    const yaml = `id: risky
version: "0.1.0"
status: draft
title: Risky
summary: A candidate that writes to a CRM with no approval policy.
workflow_type: crm
golden_path_route_id: ""
components: [email_read, intent_classifier, crm_note_write, audit_log, state_store]
edges: []
stack_id: default_orchestratekit_stack
risk_level: high
deterministic_steps: [audit_log]
failure_modes: [a, b, c, d, e]
evals: [a, b, c, d, e]
sources:
  - title: t
    source_type: internal_note
`;
    const r = validatePlaybookCandidate(yaml, registry);
    expect(dod(r, 8)!.ok).toBe(false);
    expect(r.qualifies_for).toBe("draft"); // #8 blocks candidate
  });

  it("a no-write pipeline needs no approval policy (DoD #8 passes on risk alone)", () => {
    const r = validatePlaybookCandidate(FULL_CANDIDATE, registry);
    expect(dod(r, 8)!.ok).toBe(true);
  });
});

describe("validate_playbook_candidate — MAR-530 atomic-pair certification", () => {
  const ROUTE_YAML = `id: my_candidate_route
name: My Candidate Route
status: beta
summary: test route
components: [data_scraper, data_normalizer, deduplication, schema_validation, state_store]
edges: [data_scraper__produces__data_normalizer, data_normalizer__produces__deduplication]
risk_level: medium
confidence: 0.6
failure_modes: [a, b, c]
evals: [a, b]
`;
  const PAIR_CANDIDATE = FULL_CANDIDATE.replace(
    'golden_path_route_id: ""',
    "golden_path_route_id: my_candidate_route",
  );

  it("with no route_yaml, behaves exactly as before and prompts for the pair", () => {
    const r = validatePlaybookCandidate(PAIR_CANDIDATE, registry);
    expect(r.route).toBeUndefined();
    expect(r.pair_qualifies_for).toBeUndefined();
    expect(r.summary_markdown).toMatch(/Pass `route_yaml`/);
  });

  it("certifies the pair when both sides qualify and statuses agree", () => {
    const pbBeta = PAIR_CANDIDATE.replace("status: draft", "status: beta");
    const r = validatePlaybookCandidate(pbBeta, registry, ROUTE_YAML);
    expect(r.route).toBeDefined();
    expect(r.route!.status).toBe("ok");
    expect(r.route!.route_id).toBe("my_candidate_route");
    expect(r.route!.qualifies_for).toBe("beta");
    expect(r.pair_status_mismatch).toBe(false);
    expect(r.pair_qualifies_for).toBe("beta");
  });

  it("refuses with a sentence — never a throw — when the playbook is already ahead of its route", () => {
    const pbBeta = PAIR_CANDIDATE.replace("status: draft", "status: beta");
    const laggingRoute = ROUTE_YAML.replace("status: beta", "status: candidate");
    let r!: ReturnType<typeof validatePlaybookCandidate>;
    expect(() => {
      r = validatePlaybookCandidate(pbBeta, registry, laggingRoute);
    }).not.toThrow();
    expect(r.pair_status_mismatch).toBe(true);
    expect(r.blocking.some((b) => b.includes("can go visible without its golden-path route's declared status"))).toBe(true);
  });

  it("reports the route side broken when route_yaml fails structural checks", () => {
    const brokenRoute = ROUTE_YAML.replace("state_store]", "ghost_component]");
    const r = validatePlaybookCandidate(PAIR_CANDIDATE, registry, brokenRoute);
    expect(r.route!.qualifies_for).toBeNull();
    expect(r.route!.missing_components).toContain("ghost_component");
    expect(r.pair_qualifies_for).toBeNull();
  });

  it("a published playbook against a merely-validated route is NOT a mismatch (both load with zero flags)", () => {
    const pbPublished = PAIR_CANDIDATE.replace("status: draft", "status: published");
    const validatedRoute = ROUTE_YAML.replace("status: beta", "status: validated");
    const r = validatePlaybookCandidate(pbPublished, registry, validatedRoute);
    expect(r.pair_status_mismatch).toBe(false);
  });

  it("reports invalid route YAML without throwing", () => {
    const r = validatePlaybookCandidate(PAIR_CANDIDATE, registry, "::: not : yaml : [");
    expect(r.route!.status).toBe("invalid_yaml");
    expect(r.pair_qualifies_for).toBeNull();
    expect(r.blocking.some((b) => b.includes("route candidate invalid"))).toBe(true);
  });
});

describe("validate_playbook_candidate — parse / schema errors", () => {
  it("returns invalid_yaml for non-YAML", () => {
    const r = validatePlaybookCandidate("::: not : yaml : [", registry);
    expect(r.status).toBe("invalid_yaml");
    expect(r.qualifies_for).toBeNull();
  });

  it("returns schema_invalid for a missing required field", () => {
    const r = validatePlaybookCandidate("id: x\nsummary: y\n", registry);
    expect(r.status).toBe("schema_invalid");
    expect(r.playbook_id).toBeNull();
  });
});
