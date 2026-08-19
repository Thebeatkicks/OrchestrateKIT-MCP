/**
 * MAR-692 — a model step must go through DASH, or say plainly that it does not.
 *
 * ## The observation this file is written against
 *
 * `export_build_brief` was called for real on 2026-08-18 with the competitor
 * scout's own goal, the exact `plan_workflow` output, `llm_provider: openrouter`
 * and `dash_broker_available: true`. The 145 KB brief that came back routed
 * every model step **around DASH**: the connect section told the builder to mint
 * an `OPENROUTER_API_KEY` at openrouter.ai and keep it in the agent's own
 * `.env`, and the word `spend` appeared nowhere in the whole artifact.
 *
 * That is worse than the refusal MAR-689 predicted. An agent refused at the
 * broker fails loudly. An agent holding its own key runs, spends the user's
 * money on every run, and DASH has no record of any of it.
 *
 * ## What the tests below pin, and why each one
 *
 * Re-run against master the connection does appear — the observed brief came
 * from a hosted build predating MAR-596 — and it was wrong three ways, each of
 * which is one test here:
 *
 *   1. its capability was `openrouter.research_synthesis`, a plan component id
 *      dressed as an operation id, which DASH's `operationById` cannot resolve;
 *   2. it was `access: "read"`, for the one class of operation that charges the
 *      user's own account;
 *   3. the raw `.env` key was emitted beside it regardless, so even a correct
 *      connection row led to a builder who never asks the broker.
 *
 * The fourth test is the one that keeps this honest rather than merely green:
 * on a runtime DASH genuinely cannot broker for, the key really does live with
 * the agent, and the brief has to say so in words rather than let silence imply
 * supervision.
 */
import { describe, it, expect } from "vitest";

import { exportBuildBrief } from "../../src/tools/exportBuildBrief.js";
import {
  planWorkflow,
  type PlacementAxis,
  type RuntimeOption,
  type TriggerExplanation,
} from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import { dashOperationById } from "../../src/lib/dashBrokerCatalog.js";
import type { AnyBuildBriefOutput, CompactBuildBriefOutput } from "../../src/tools/exportBuildBrief.js";

/**
 * Narrow away `needs_input`, loudly.
 *
 * `export_build_brief` returns a needs-input card when a route has model steps
 * and no `llm_provider` — every call below supplies one, so a needs-input here
 * would mean the plan lost its model step and every assertion after it would
 * pass vacuously. Throwing names that rather than letting the suite go green on
 * a route it is not testing.
 */
function brief(result: AnyBuildBriefOutput): CompactBuildBriefOutput {
  if ("status" in result && result.status === "needs_input") {
    throw new Error(
      `export_build_brief returned needs_input: ${JSON.stringify(result).slice(0, 300)}`,
    );
  }
  return result as CompactBuildBriefOutput;
}

const registry = loadRegistry({ includeBeta: true, includeCandidates: true, strict: false });

/**
 * The competitor scout's own goal string, verbatim.
 *
 * The same one MAR-689 §3.3 and MAR-692's step 0 used, so this suite is written
 * against the plan the MCP actually returns for the flagship agent rather than
 * against a route assembled to make the test pass. Its step 3 is
 * `research_synthesis` at `model_tier: frontier`.
 */
const SCOUT_GOAL =
  "Watches public sources for what competing agent products ship and for what people " +
  "praise, complain about and ask for, and writes a briefing where every claim links to " +
  "where it came from.";

/** A runtime on the same computer as DASH — the one DASH's broker can reach. */
const DASH_LOCAL_RUNTIME: RuntimeOption = {
  id: "dash_agent_runner_local",
  label: "DASH Agent Runner on this computer",
  runtime_class: "local_process",
  reason: "Run the generated code as a local process under the separately installed runner.",
  offline_behavior: "Continues after the DASH window closes while this computer is on.",
  continues_when_dash_closed: true,
  appropriate_when: "The agent should run locally while this computer is on.",
  limitation: "Stops while the computer is asleep or off.",
  availability: "requires setup",
  install_action: null,
};

/**
 * A managed worker — the runtime `plan_workflow` actually recommends for this
 * goal, and the reason the honest-absence branch is not hypothetical.
 */
const REMOTE_RUNTIME: RuntimeOption = {
  ...DASH_LOCAL_RUNTIME,
  id: "managed_background_worker",
  label: "Managed background worker",
  runtime_class: "managed_durable_background",
  reason: "Run the agent as a hosted background process.",
};

const CONTROL_SURFACE: PlacementAxis = {
  recommended: {
    id: "dash_agent_runner_control",
    label: "DASH Agent Runner control adapter",
    appropriate_when: "Control a compatible locally registered process.",
    limitation: "Unavailable while the computer or runner is off.",
    availability: "requires setup",
  },
  alternatives: [],
};

const INTERACTION_SURFACE: PlacementAxis = {
  recommended: {
    id: "dash_workspace",
    label: "DASH agent workspace",
    appropriate_when: "Inspect safe state and submit declared commands.",
    limitation: "Last safe state is read-only while the runner is unavailable.",
    availability: "requires setup",
  },
  alternatives: [],
};

const TRIGGER: TriggerExplanation = {
  mode: "manual",
  label: "Manual run request",
  what_wakes_it_up: "The runner starts a registered process when a person requests a run.",
  offline_behavior: "No run starts while the computer or runner is off.",
  limitation: "No schedule or inbound event is configured.",
};

function scoutBrief(opts: {
  runtime: RuntimeOption;
  dash_broker_available?: boolean;
  llm_provider?: "openrouter" | "anthropic" | "deterministic_first";
  delivery_mode?: "full" | "compact";
}) {
  const plan = planWorkflow(
    { goal: SCOUT_GOAL, must_have_capabilities: [], must_avoid: [] },
    registry,
  );
  const wizard = plan.goal_to_product_wizard;
  return brief(exportBuildBrief({
    goal: plan.goal,
    plan_source: plan.plan_source,
    route_status: plan.route_status,
    recommended_route: plan.recommended_route,
    safety_review: plan.safety_review,
    automation_clearance: plan.automation_clearance,
    enforced_approval_gates: plan.enforced_approval_gates,
    untested_edges: plan.untested_edges,
    avoid_when_violations: plan.avoid_when_violations,
    evals_to_add: plan.evals_to_add,
    design_notes: plan.design_notes,
    worker_pipeline: plan.worker_pipeline,
    loop_guidance: plan.loop_guidance,
    approval_gate_advisory: plan.approval_gate_advisory,
    runtime_requirements: wizard.runtime_requirements,
    runtime_recommendation: opts.runtime,
    control_surface: CONTROL_SURFACE,
    interaction_surface: INTERACTION_SURFACE,
    trigger_explanation: TRIGGER,
    handoff_targets: ["prompt"],
    playbook_id: plan.playbook?.id ?? "",
    route_id: plan.playbook?.route_id ?? "",
    build_target: "code",
    output_location: "",
    delivery_mode: opts.delivery_mode ?? "full",
    dash_broker_available: opts.dash_broker_available,
    llm_provider: opts.llm_provider ?? "openrouter",
    generated_at: "2026-08-18T00:00:00Z",
  }));
}

describe("MAR-692 — the model-provider connection DASH can actually resolve", () => {
  it("the plan under test really does carry a frontier model step", () => {
    // If this ever stops holding, every assertion below passes vacuously —
    // which is exactly how the F14 emission looked correct while emitting
    // nothing at all.
    const brief = scoutBrief({ runtime: DASH_LOCAL_RUNTIME, dash_broker_available: true });
    expect(
      brief.agent_manifest.planned_route.some((step) => step.model_tier === "frontier"),
    ).toBe(true);
  });

  it("declares operation ids DASH resolves, never ${provider}.${component_id}", () => {
    const brief = scoutBrief({ runtime: DASH_LOCAL_RUNTIME, dash_broker_available: true });
    const ai = brief.agent_manifest.agent_dom.connections.find((c) => c.id === "openrouter");
    expect(ai, "no model-provider connection was declared for a frontier step").toBeDefined();
    expect(ai?.ownership).toBe("dash_managed");

    const ids = (ai?.capabilities ?? []).map((capability) => capability.id);
    expect(ids).toContain("openrouter.models.list");
    expect(ids).toContain("openrouter.brief.compose");
    // The observed id. Asserted as an absence, because a manifest carrying it
    // imports cleanly and then fails on every call with `unknown_operation`.
    expect(ids).not.toContain("openrouter.research_synthesis");
    for (const id of ids) {
      expect(dashOperationById(id), `${id} resolves nothing in DASH's catalogue`).not.toBeNull();
    }
  });

  it("files the model call as spend — the class that says the user's account is charged", () => {
    const brief = scoutBrief({ runtime: DASH_LOCAL_RUNTIME, dash_broker_available: true });
    const ai = brief.agent_manifest.agent_dom.connections.find((c) => c.id === "openrouter");
    const compose = ai?.capabilities.find((c) => c.id === "openrouter.brief.compose");
    expect(compose?.access).toBe("spend");
    // models.list costs nothing and must not be dressed as a spend either — the
    // access class is read off DASH's catalogue, not guessed per connection.
    expect(ai?.capabilities.find((c) => c.id === "openrouter.models.list")?.access).toBe("read");
  });

  it("emits a v1 Connect requirement, so DASH draws a button rather than an inert row", () => {
    const brief = scoutBrief({ runtime: DASH_LOCAL_RUNTIME, dash_broker_available: true });
    const requirements = brief.agent_manifest.agent_dom.connection_requirements;
    expect(requirements?.requirements.some((r) => "connection_id" in r && r.connection_id === "openrouter")).toBe(true);
  });

  it("emits NO raw API key when DASH holds it — the observed .env path, closed", () => {
    /*
     * The assertion the observed brief would have failed. A credential entry
     * becomes an env var in the generated `.env` and a step in `connect.mjs`
     * that opens the provider's key page; emitting it beside a `dash_managed`
     * connection is a manifest and a connect contract contradicting each other
     * on the same page, and a builder follows the instructions.
     */
    const brief = scoutBrief({ runtime: DASH_LOCAL_RUNTIME, dash_broker_available: true });
    expect(brief.connect.credential_manifest.map((c) => c.env)).not.toContain("OPENROUTER_API_KEY");
    expect(JSON.stringify(brief)).not.toContain("OPENROUTER_API_KEY");
    expect(brief.sections.s11_connect).toContain("DASH's vault holds the key");
  });

  it("says out loud that DASH cannot see the spend when the runtime is remote", () => {
    /*
     * The honest-absence branch, and it is not a lesser outcome to be tidied
     * away later. `lib/manifest-constraints.ts` in orchestratedash REFUSES at
     * import any manifest pairing a remote runtime with a `dash_managed`
     * connection — the broker cannot reach a process it did not spawn (ADR
     * 0006). So on this runtime the key genuinely lives with the agent, the
     * `.env` entry is correct, and what the brief owes the reader is the
     * consequence in words: the spend is real and DASH has no record of it.
     */
    const brief = scoutBrief({ runtime: REMOTE_RUNTIME, dash_broker_available: true });
    const ai = brief.agent_manifest.agent_dom.connections.find((c) => c.id === "openrouter");
    expect(ai?.ownership).toBe("agent_managed");
    expect(brief.connect.credential_manifest.map((c) => c.env)).toContain("OPENROUTER_API_KEY");
    expect(brief.sections.s11_connect).toContain("DASH has no record of any of it");
    expect(brief.sections.s11_connect).toContain("ADR 0006");
    // Even unbrokered, the ids stay DASH's — the agent may still be moved to a
    // local runtime, and a component id here would be a latent unknown_operation.
    for (const capability of ai?.capabilities ?? []) {
      expect(dashOperationById(capability.id), capability.id).not.toBeNull();
    }
  });

  it("declares nothing when the caller declined a provider, and says why", () => {
    const brief = scoutBrief({
      runtime: DASH_LOCAL_RUNTIME,
      dash_broker_available: true,
      llm_provider: "deterministic_first",
    });
    expect(
      brief.agent_manifest.agent_dom.connections.some((c) => c.provider === "openrouter"),
    ).toBe(false);
    expect(brief.sections.s11_connect).toContain("no model provider was chosen");
  });

  it("declares nothing when DASH was never claimed to be present", () => {
    const brief = scoutBrief({ runtime: DASH_LOCAL_RUNTIME });
    expect(
      brief.agent_manifest.agent_dom.connections.some((c) => c.provider === "openrouter"),
    ).toBe(false);
    // ...and the key goes back to the .env, which is the honest path with no DASH.
    expect(brief.connect.credential_manifest.map((c) => c.env)).toContain("OPENROUTER_API_KEY");
  });
});

describe("MAR-692 — a brokered Gmail connection names Gmail operations", () => {
  it("resolves a mail-reading step to gmail.search + gmail.message.read", () => {
    /*
     * Not only the AI connection was writing `${connection_id}.${component_id}`.
     * Gmail's capabilities were `gmail.email_read`, which DASH resolves no more
     * than it resolves `openrouter.research_synthesis` — the same defect on the
     * one connection the round trip had been proven against.
     */
    const plan = planWorkflow(
      {
        goal: "read emails, detect sales leads and write a note to the CRM for each lead",
        must_have_capabilities: [],
        must_avoid: [],
      },
      registry,
    );
    const wizard = plan.goal_to_product_wizard;
    const b = brief(exportBuildBrief({
      goal: plan.goal,
      plan_source: plan.plan_source,
      route_status: plan.route_status,
      recommended_route: plan.recommended_route,
      safety_review: plan.safety_review,
      automation_clearance: plan.automation_clearance,
      enforced_approval_gates: plan.enforced_approval_gates,
      untested_edges: plan.untested_edges,
      avoid_when_violations: plan.avoid_when_violations,
      evals_to_add: plan.evals_to_add,
      design_notes: plan.design_notes,
      worker_pipeline: plan.worker_pipeline,
      loop_guidance: plan.loop_guidance,
      approval_gate_advisory: plan.approval_gate_advisory,
      runtime_requirements: wizard.runtime_requirements,
      runtime_recommendation: DASH_LOCAL_RUNTIME,
      control_surface: CONTROL_SURFACE,
      interaction_surface: INTERACTION_SURFACE,
      trigger_explanation: TRIGGER,
      handoff_targets: ["prompt"],
      playbook_id: plan.playbook?.id ?? "",
      route_id: plan.playbook?.route_id ?? "",
      build_target: "code",
      output_location: "",
      dash_broker_available: true,
      llm_provider: "anthropic",
      generated_at: "2026-08-18T00:00:00Z",
    }));
    const gmail = b.agent_manifest.agent_dom.connections.find((c) => c.id === "gmail");
    expect(gmail?.ownership).toBe("dash_managed");
    const ids = (gmail?.capabilities ?? []).map((capability) => capability.id);
    expect(ids).not.toContain("gmail.email_read");
    for (const id of ids) {
      expect(dashOperationById(id), `${id} resolves nothing in DASH's catalogue`).not.toBeNull();
    }
  });
});

describe("MAR-692 — the brief tells a builder what DASH will accept as output", () => {
  it("carries the contract in COMPACT delivery, which is the mode people use", () => {
    /*
     * The observed MAR-692 export was compact. A contract that appears only in
     * `full` is a contract the agent-building LLM does not read, which is the
     * failure this item exists to fix rather than a smaller version of it. It
     * costs ~22.7 KB and `exportBuildBrief.test.ts` records why that trade was
     * taken against the response-size budget.
     */
    const brief = scoutBrief({
      runtime: DASH_LOCAL_RUNTIME,
      dash_broker_available: true,
      delivery_mode: "compact",
    });
    expect(brief.run_artifact_contract.schema.$id).toBe(
      "https://orchestratemcp.dev/orchestratedash/contracts/run-artifact.schema.json",
    );
    expect(brief.run_artifact_contract.source_commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("plans a digest AND a brief for a document-writing route, in that order", () => {
    /*
     * ADR 0025, Henrik's rule on reopening decision 2: "One RAW and one curated.
     * Don't mix them." The order is the assertion — DASH grades a run's
     * grounding over the digest's `items`, so a run that emitted only a
     * well-written brief would have improved its own verdict by writing well.
     */
    const brief = scoutBrief({ runtime: DASH_LOCAL_RUNTIME, dash_broker_available: true });
    expect(brief.run_artifact_contract.planned_kinds).toEqual(["digest", "brief"]);
    expect(brief.sections.s9_observability).toContain("the run-artifact contract");
    expect(brief.sections.s9_observability).toContain('`kind: "brief"`');
  });

  it("teaches the three things a brief gets wrong silently", () => {
    const s9 = scoutBrief({ runtime: DASH_LOCAL_RUNTIME, dash_broker_available: true }).sections
      .s9_observability;
    // 1. the channel frame — an artifact sent any other way is never seen
    expect(s9).toContain('`{"type":"artifact"');
    // 2. per-paragraph, zero-based indexes into the digest
    expect(s9).toContain("zero-based positions into the digest's `items` array");
    expect(s9).toContain("bound to the paragraph");
    // 3. the fingerprint, as source rather than as a description of source
    expect(s9).toContain("derived_from");
    expect(s9).toContain("function fingerprintItems");
    expect(s9).toContain("no citations at all");
  });

  it("says nothing about a brief when the route writes no document", () => {
    /*
     * Honest absence, the same discipline the panel and connection_requirements
     * keep. A plan whose model step is a classifier produces a digest, and
     * telling its builder how to write a `document` would be instructions for an
     * artifact this agent never emits.
     */
    const plan = planWorkflow(
      {
        goal: "read emails, detect sales leads and write a note to the CRM for each lead",
        must_have_capabilities: [],
        must_avoid: [],
      },
      registry,
    );
    const wizard = plan.goal_to_product_wizard;
    const b = brief(exportBuildBrief({
      goal: plan.goal,
      plan_source: plan.plan_source,
      route_status: plan.route_status,
      recommended_route: plan.recommended_route,
      safety_review: plan.safety_review,
      automation_clearance: plan.automation_clearance,
      enforced_approval_gates: plan.enforced_approval_gates,
      untested_edges: plan.untested_edges,
      avoid_when_violations: plan.avoid_when_violations,
      evals_to_add: plan.evals_to_add,
      design_notes: plan.design_notes,
      worker_pipeline: plan.worker_pipeline,
      loop_guidance: plan.loop_guidance,
      approval_gate_advisory: plan.approval_gate_advisory,
      runtime_requirements: wizard.runtime_requirements,
      runtime_recommendation: DASH_LOCAL_RUNTIME,
      control_surface: CONTROL_SURFACE,
      interaction_surface: INTERACTION_SURFACE,
      trigger_explanation: TRIGGER,
      handoff_targets: ["prompt"],
      playbook_id: plan.playbook?.id ?? "",
      route_id: plan.playbook?.route_id ?? "",
      build_target: "code",
      output_location: "",
      dash_broker_available: true,
      llm_provider: "anthropic",
      generated_at: "2026-08-18T00:00:00Z",
    }));
    expect(b.run_artifact_contract.planned_kinds).toEqual(["digest"]);
    expect(b.sections.s9_observability).not.toContain('`kind: "brief"`');
    // ...and the contract still travels, because the digest branch is in it too.
    expect(b.run_artifact_contract.schema.properties).toBeDefined();
  });
});
