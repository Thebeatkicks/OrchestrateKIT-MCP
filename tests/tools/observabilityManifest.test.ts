/**
 * MAR-296 / DASH-02 — agent.manifest.json emission + observability wiring.
 *
 * The manifest export_build_brief emits must validate against the version-pinned
 * DASH v2 schema (tests/fixtures/dash/agent.manifest.v2.schema.json, semantically
 * identical to orchestratedash's canonical contract). This is the cross-repo
 * tripwire: the MCP emitter and DASH receiver share no code.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildAgentManifest } from "../../src/lib/observabilityContract.js";
import { exportBuildBrief } from "../../src/tools/exportBuildBrief.js";
import {
  planWorkflow,
  type PlacementAxis,
  type RuntimeOption,
  type RuntimeRequirements,
  type TriggerExplanation,
} from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

// ajv ships dual CJS/ESM; its default export interop diverges between esbuild
// (vitest) and tsc under NodeNext. Load the CJS entry via createRequire so both
// toolchains see the same constructable class — the standard NodeNext escape.
const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-var-requires */
const Ajv2020 = require("ajv/dist/2020.js") as new (opts?: object) => {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: unknown };
};
const addFormats = require("ajv-formats") as (ajv: object) => void;
/* eslint-enable @typescript-eslint/no-var-requires */

const registry = loadRegistry();

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/dash/agent.manifest.v2.schema.json",
);
const manifestSchema = JSON.parse(readFileSync(schemaPath, "utf-8"));

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateManifest = ajv.compile(manifestSchema);

type BuildTarget = "cowork" | "cursor" | "chatgpt_gpt" | "code";

function planAndBrief(
  goal: string,
  opts: {
    build_target?: BuildTarget;
    output_location?: string;
    runtime_requirements?: RuntimeRequirements;
    runtime_recommendation?: RuntimeOption;
    control_surface?: PlacementAxis;
    interaction_surface?: PlacementAxis;
    trigger_explanation?: TriggerExplanation;
  } = {},
) {
  const plan = planWorkflow({ goal, must_have_capabilities: [], must_avoid: [] }, registry);
  const wizard = plan.goal_to_product_wizard;
  return exportBuildBrief({
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
    runtime_requirements: opts.runtime_requirements ?? wizard.runtime_requirements,
    runtime_recommendation: opts.runtime_recommendation ?? wizard.runtime_recommendation,
    control_surface: opts.control_surface ?? wizard.control_surface,
    interaction_surface: opts.interaction_surface ?? wizard.interaction_surface,
    trigger_explanation: opts.trigger_explanation ?? wizard.trigger_explanation,
    handoff_targets: ["prompt"],
    playbook_id: plan.playbook?.id ?? "",
    route_id: plan.playbook?.route_id ?? "",
    build_target: opts.build_target ?? "code",
    output_location: opts.output_location ?? "",
    generated_at: "2026-07-05T00:00:00Z", // deterministic for assertions
    llm_provider: "anthropic",
  });
}

const LEAD_GOAL =
  "read emails, detect sales leads and write a note to the CRM for each lead";

const LOCAL_RUNNER_REQUIREMENTS: RuntimeRequirements = {
  trigger_mode: "manual",
  operation_mode: "interactive",
  expected_duration: "long-running",
  persistent_state_needed: true,
  durable_approval_needed: true,
  must_run_while_user_offline: false,
  must_run_while_computer_off: false,
  data_sensitivity: "high",
  estimated_operational_complexity: "medium",
};

const LOCAL_RUNNER_RUNTIME: RuntimeOption = {
  id: "dash_agent_runner_local",
  label: "DASH Agent Runner on this computer",
  runtime_class: "local_process",
  reason: "Run the generated code as a local process under the separately installed runner.",
  offline_behavior:
    "Continues after the DASH window closes while this computer and runner remain on.",
  continues_when_dash_closed: true,
  appropriate_when: "The agent should run locally while this computer is on.",
  limitation: "Stops while the computer is asleep or off.",
  availability: "requires setup",
  install_action: null,
};

const DASH_CONTROL_SURFACE: PlacementAxis = {
  recommended: {
    id: "dash_agent_runner_control",
    label: "DASH Agent Runner control adapter",
    appropriate_when: "Control a compatible locally registered process.",
    limitation: "Unavailable while the computer or runner is off.",
    availability: "requires setup",
  },
  alternatives: [],
};

const DASH_INTERACTION_SURFACE: PlacementAxis = {
  recommended: {
    id: "dash_workspace",
    label: "DASH agent workspace",
    appropriate_when: "Inspect safe state and submit declared commands.",
    limitation: "Last safe state is read-only while the runner is unavailable.",
    availability: "requires setup",
  },
  alternatives: [],
};

const MANUAL_RUNNER_TRIGGER: TriggerExplanation = {
  mode: "manual",
  label: "Manual run request",
  what_wakes_it_up: "The runner starts a registered process when a person requests a run.",
  offline_behavior: "No run starts while the computer or runner is off.",
  limitation: "No schedule or inbound event is configured.",
};

const REMOTE_AGENT_RUNTIME: RuntimeOption = {
  id: "managed_durable_background_runtime",
  label: "Managed background worker",
  runtime_class: "managed_durable_background",
  reason: "A remote agent-managed worker owns execution and its provider connections.",
  offline_behavior: "Runs independently of DASH according to the selected runtime.",
  continues_when_dash_closed: true,
  appropriate_when: "The agent needs a durable remote runtime.",
  limitation: "Requires a separately selected and configured runtime provider.",
  availability: "requires setup",
  install_action: null,
};

describe("MAR-426 — agent_manifest validates against the pinned DASH manifest-v2 schema", () => {
  it("playbook plan → manifest conforms", () => {
    const b = planAndBrief(LEAD_GOAL, { output_location: "HubSpot notes + Gmail drafts" });
    const valid = validateManifest(b.agent_manifest);
    expect(validateManifest.errors ?? null, JSON.stringify(validateManifest.errors)).toBeNull();
    expect(valid).toBe(true);
    expect(b.agent_manifest.manifest_version).toBe(2);
    expect(b.agent_manifest.agent_dom.dom_version).toBe(1);
  });

  it("composed plan → manifest conforms with empty playbook_id/route_id", () => {
    const b = planAndBrief(
      "Every Monday, pull last week's signups from our analytics API and post a summary to Slack.",
    );
    expect(b.agent_manifest.agent.plan_source).toBe("composed");
    expect(b.agent_manifest.agent.playbook_id).toBe("");
    expect(b.agent_manifest.agent.route_id).toBe("");
    expect(validateManifest(b.agent_manifest)).toBe(true);
  });

  it("conforms for ALL FOUR build_targets, and each renders the §9 wiring section", () => {
    const targets: BuildTarget[] = ["cowork", "cursor", "chatgpt_gpt", "code"];
    for (const t of targets) {
      const b = planAndBrief(LEAD_GOAL, { build_target: t });
      expect(validateManifest(b.agent_manifest), `manifest invalid for ${t}`).toBe(true);
      expect(b.agent_manifest.agent.build_target).toBe(t);
      expect(b.sections.s9_observability).toContain("§9 Observability wiring");
      expect(b.sections.s9_observability).toContain(`build_target: \`${t}\``);
      expect(b.brief_markdown).toContain("§9 Observability wiring");
      // MAR-396: every target still explains how the built agent is observed, but
      // the ASSISTANT-surface targets cannot emit DASH run events — no code runs
      // that could. They carry the honest equivalent (the surface's own history)
      // plus the explicit statement that an external monitor cannot see this
      // agent. §9 itself and the v2 agent_manifest remain present for all four.
      if (t === "cowork" || t === "chatgpt_gpt") {
        expect(b.handoffs.prompt, t).toContain("## How you'll know it ran");
        expect(b.handoffs.prompt, t).toContain("cannot see it");
      } else {
        expect(b.handoffs.prompt, t).toContain("§9 Observability wiring");
      }
    }
  });
});

describe("MAR-426 — runner-hosted and agent-managed Agent DOM profiles", () => {
  it("emits the local runner-hosted canonical profile with only the seven Agent DOM verbs", () => {
    const b = planAndBrief(LEAD_GOAL, {
      build_target: "code",
      output_location: "HubSpot notes + Gmail drafts",
      runtime_requirements: LOCAL_RUNNER_REQUIREMENTS,
      runtime_recommendation: LOCAL_RUNNER_RUNTIME,
      control_surface: DASH_CONTROL_SURFACE,
      interaction_surface: DASH_INTERACTION_SURFACE,
      trigger_explanation: MANUAL_RUNNER_TRIGGER,
    });

    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.runtime).toMatchObject({
      class: "local_process",
      availability: "on_demand",
      continues_when_dash_closed: true,
    });
    expect(b.agent_manifest.agent_dom.locations.runtime.kind).toBe("local");
    expect(b.agent_manifest.agent_dom.locations.control[0]?.kind).toBe("dash");
    expect(b.agent_manifest.agent_dom.control).toMatchObject({
      supported: true,
      command_version: 1,
      commands: ["approve", "reject", "choose", "retry", "pause", "resume", "cancel"],
    });
    expect(b.agent_manifest.agent_dom.control.commands).not.toEqual(
      expect.arrayContaining(["start", "stop", "trigger"]),
    );
    expect(b.sections.s9_observability).toContain("separately installed DASH Agent Runner");
    expect(b.sections.s9_observability).toContain("computer");
  });

  it("emits a remote agent-managed profile through the same v2 shape", () => {
    const b = planAndBrief(
      "When an inbound webhook arrives, validate its JSON and record a local audit entry.",
      {
      runtime_requirements: {
        ...LOCAL_RUNNER_REQUIREMENTS,
        trigger_mode: "event",
        operation_mode: "event-driven",
        must_run_while_user_offline: true,
      },
      runtime_recommendation: REMOTE_AGENT_RUNTIME,
      trigger_explanation: {
        mode: "event",
        label: "Provider event",
        what_wakes_it_up: "The configured provider sends an event to the remote worker.",
        offline_behavior: "Runs while the user's computer and DASH window are closed.",
        limitation: "Requires provider-side event setup.",
      },
      },
    );
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.runtime.class).toBe("managed_worker");
    expect(b.agent_manifest.agent_dom.locations.runtime.kind).toBe("remote");
    expect(b.agent_manifest.agent_dom.connections.length).toBeGreaterThan(0);
    expect(
      b.agent_manifest.agent_dom.connections.some(
        (connection) => connection.ownership === "agent_managed",
      ),
    ).toBe(true);
  });

  it("pairs command/connection presence with a client-session read-only absence profile", () => {
    const b = planAndBrief(
      "summarize the text I paste in this chat when I ask, with no tools or external accounts",
      { build_target: "cowork" },
    );
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.runtime.class).toBe("client_session");
    expect(b.agent_manifest.agent_dom.runtime.continues_when_dash_closed).toBe(false);
    expect(b.agent_manifest.agent_dom.control).toMatchObject({
      supported: false,
      commands: [],
    });
    expect(b.sections.s9_observability).toContain("Not runner-hostable");

    const noConnectionManifest = buildAgentManifest({
      goal: "Transform supplied text locally",
      plan_source: "composed",
      playbook_id: "",
      route_id: "",
      build_target: "cowork",
      route_steps: [{ step: 1, component_id: "local_transform" }],
      automation_clearance: "L0",
      enforced_approval_gates: [],
      output_location: "Current client",
      registry_fingerprint: "absence-fixture",
      generated_at: "2026-07-26T00:00:00Z",
      connections: [],
    });
    expect(noConnectionManifest.agent_dom.connections).toEqual([]);
  });

  it("contains connection requirements and ownership metadata, never credential values", () => {
    const b = planAndBrief(LEAD_GOAL, {
      runtime_requirements: LOCAL_RUNNER_REQUIREMENTS,
      runtime_recommendation: LOCAL_RUNNER_RUNTIME,
      control_surface: DASH_CONTROL_SURFACE,
      interaction_surface: DASH_INTERACTION_SURFACE,
      trigger_explanation: MANUAL_RUNNER_TRIGGER,
    });
    const forbidden = new Set([
      "value",
      "secret",
      "password",
      "token",
      "access_token",
      "refresh_token",
      "client_secret",
      "api_key",
      "credential_value",
    ]);
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          expect(forbidden.has(key), `forbidden manifest key: ${key}`).toBe(false);
          visit(nested);
        }
      }
    };
    visit(b.agent_manifest.agent_dom.connections);
  });
});

describe("MAR-296 — manifest content is deterministic + registry-grounded", () => {
  it("derives irreversible_components from high/critical-risk route steps (L3 CRM)", () => {
    const b = planAndBrief(LEAD_GOAL);
    // crm_note_write is a high-risk write in this route → gate-compliance target.
    expect(b.agent_manifest.safety_contract.irreversible_components).toContain("crm_note_write");
    expect(b.agent_manifest.safety_contract.automation_clearance).toMatch(/^L[0-4]$/);
    // §9 names the irreversible step for gate compliance
    expect(b.sections.s9_observability).toContain("Gate compliance");
    expect(b.sections.s9_observability).toContain("crm_note_write");
  });

  it("manifest planned_route mirrors the plan's route order + coerces enums", () => {
    const b = planAndBrief(LEAD_GOAL);
    const routeIds = b.agent_manifest.planned_route.map((s) => s.component_id);
    expect(routeIds.length).toBeGreaterThan(0);
    for (const s of b.agent_manifest.planned_route) {
      expect(["low", "medium", "high", "critical"]).toContain(s.risk_level);
      expect(["none", "small", "standard", "frontier"]).toContain(s.model_tier);
    }
  });

  it("carries the full v1 event set + env-var wiring", () => {
    const b = planAndBrief(LEAD_GOAL);
    expect(b.agent_manifest.monitoring.events).toEqual([
      "run_started",
      "step_started",
      "step_completed",
      "gate_requested",
      "gate_resolved",
      "run_completed",
      "run_failed",
    ]);
    expect(b.agent_manifest.monitoring.endpoint_env).toBe("DASH_INGEST_URL");
    expect(b.agent_manifest.monitoring.token_env).toBe("DASH_INGEST_TOKEN");
  });

  it("registry_fingerprint defaults to the bundle content fingerprint (16 hex)", () => {
    const b = planAndBrief(LEAD_GOAL);
    expect(b.agent_manifest.provenance.registry_fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(b.agent_manifest.provenance.generated_by).toContain("export_build_brief");
  });

  it("agent.name slugs the playbook id (underscores → hyphens)", () => {
    const b = planAndBrief(LEAD_GOAL);
    // lead goal routes to email_lead_to_crm → slug email-lead-to-crm
    expect(b.agent_manifest.agent.name).toBe("email-lead-to-crm");
  });

  it("echoes output_location into monitoring", () => {
    const b = planAndBrief(LEAD_GOAL, { output_location: "HubSpot notes + Gmail drafts" });
    expect(b.agent_manifest.monitoring.output_location).toBe("HubSpot notes + Gmail drafts");
  });
});

describe("MAR-296 — plan_workflow observability block", () => {
  it("is present, advisory-tagged, and lists irreversible gate targets", () => {
    const plan = planWorkflow(
      { goal: LEAD_GOAL, must_have_capabilities: [], must_avoid: [] },
      registry,
    );
    expect(plan.observability.recommended_events).toHaveLength(7);
    expect(plan.observability.endpoint_env).toBe("DASH_INGEST_URL");
    expect(plan.observability.gate_events_required_for).toContain("crm_note_write");
    expect(plan.provenance.field_tags.observability).toBe("advisory");
  });

  it("a read-only route has no gate targets", () => {
    const plan = planWorkflow(
      { goal: "scan a GitHub pull request and post a read-only review comment, never edit code", must_have_capabilities: [], must_avoid: [] },
      registry,
    );
    expect(plan.observability.gate_events_required_for).toHaveLength(0);
    expect(plan.observability.note).toContain("No irreversible steps");
  });
});
