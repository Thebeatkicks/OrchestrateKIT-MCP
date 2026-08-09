import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ARTIFACT_ISSUE_FIELD_ORDER,
  exportBuildBrief,
  InputShape,
  type ExportBuildBriefInput,
} from "../../src/tools/exportBuildBrief.js";
import { ExportBuildBriefOutputShape } from "../../src/tools/outputSchemas.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";

const registry = loadRegistry();
const InputSchema = z.object(InputShape);

function cloneForSchemaMutation<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * MAR-460 runner-eligibility inputs. Deliberately excludes `delivery_mode` so
 * `planAndBrief` keeps resolving to the full-output overload of
 * `exportBuildBrief` — the compact path has its own helper below.
 */
type RunnerExtras = Pick<
  ExportBuildBriefInput,
  "runner_posture" | "runner_reachable" | "runner_capability_profile"
>;

/** The plan → brief input, shared by the full and compact helpers. */
function briefInput(
  goal: string,
  handoff_targets: ("prompt" | "linear" | "obsidian")[] = ["prompt"],
  build_target?: "cowork" | "cursor" | "chatgpt_gpt" | "code",
  extra: RunnerExtras = {},
): Omit<ExportBuildBriefInput, "delivery_mode"> {
  const plan = planWorkflow(
    {
      goal,
      must_have_capabilities: [],
      must_avoid: [],
      ...(build_target ? { build_target } : {}),
    },
    registry,
  );
  const wizard = plan.goal_to_product_wizard;
  return {
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
    runtime_recommendation: wizard.runtime_recommendation,
    control_surface: wizard.control_surface,
    interaction_surface: wizard.interaction_surface,
    trigger_explanation: wizard.trigger_explanation,
    handoff_targets,
    build_target,
    llm_provider: "anthropic",
    ...extra,
  };
}

/** Run plan_workflow and pipe result straight into export_build_brief. */
function planAndBrief(
  goal: string,
  handoff_targets: ("prompt" | "linear" | "obsidian")[] = ["prompt"],
  build_target?: "cowork" | "cursor" | "chatgpt_gpt" | "code",
  extra: RunnerExtras = {},
) {
  return exportBuildBrief(briefInput(goal, handoff_targets, build_target, extra));
}

const P0_02_DOGFOOD_GOAL =
  "Build an email and calendar assistant that reads unread Gmail meeting requests, " +
  "checks my real Google Calendar, drafts a reply with two available 30-minute slots, " +
  "and only after I approve creates one Calendar event and one Gmail draft. Never send " +
  "the email. I will be present for approval and I want visible run logs.";

describe("export_build_brief — structure (MAR-205)", () => {
  it("returns all 9 sections + brief_markdown + provenance_tag", () => {
    const b = planAndBrief("read emails, detect leads and write a note to the CRM for each lead");
    expect(b.brief_markdown).toBeTruthy();
    expect(b.provenance_tag).toBe("registry-grounded");
    expect(b.sections.s0_constraints).toBeTruthy();
    expect(b.sections.s1_summary).toBeTruthy();
    expect(b.sections.s2_route).toBeTruthy();
    expect(b.sections.s3_worker_contracts).toBeTruthy();
    expect(b.sections.s5_safety).toBeTruthy();
    expect(b.sections.s6_do_not_add).toBeTruthy();
    expect(b.sections.s7_review_loopback).toBeTruthy();
    expect(b.sections.s8_definition_of_done).toBeTruthy();
  });

  it("brief_markdown is provenance-tagged at the top", () => {
    const b = planAndBrief("scan a GitHub PR and post a review comment read-only");
    expect(b.brief_markdown).toContain("🟢");
    expect(b.brief_markdown).toContain("🔵");
    expect(b.brief_markdown).toContain("registry-grounded");
  });

  it("grounding_note mentions no LLM calls", () => {
    const b = planAndBrief("read emails, detect leads and write a note to the CRM for each lead");
    expect(b.grounding_note).toContain("no LLM calls");
    expect(b.grounding_note).toContain("🟢");
  });
});

describe("export_build_brief — P0-02 no-outbound send exclusion", () => {
  it("keeps excluded send components out of manifest, connect artifacts, and brief output", () => {
    const plan = planWorkflow(
      { goal: P0_02_DOGFOOD_GOAL, must_have_capabilities: [], must_avoid: [] },
      registry,
    );
    const staleRoute = [
      ...plan.recommended_route,
      {
        step: plan.recommended_route.length + 1,
        component_id: "optional_email_send",
        component_name: "Optional Email Send",
        purpose: "Send the approved email.",
        model_tier: "none",
        risk_level: "high",
      },
    ];

    const brief = exportBuildBrief({
      goal: plan.goal,
      plan_source: plan.plan_source,
      route_status: plan.route_status,
      recommended_route: staleRoute,
      safety_review: plan.safety_review,
      automation_clearance: {
        ...plan.automation_clearance,
        highest_action_components: [
          ...plan.automation_clearance.highest_action_components,
          "optional_email_send",
        ],
      },
      enforced_approval_gates: plan.enforced_approval_gates,
      untested_edges: plan.untested_edges,
      avoid_when_violations: plan.avoid_when_violations,
      evals_to_add: plan.evals_to_add,
      design_notes: plan.design_notes,
      worker_pipeline: plan.worker_pipeline,
      loop_guidance: plan.loop_guidance,
      approval_gate_advisory: plan.approval_gate_advisory,
      handoff_targets: ["prompt"],
      llm_provider: "anthropic",
      generated_at: "2026-07-16T00:00:00.000Z",
      registry_fingerprint: "0123456789abcdef",
    });

    const serialized = JSON.stringify(brief);
    expect(serialized).not.toContain("optional_email_send");
    expect(serialized).not.toContain("Optional Email Send");
    expect(serialized).not.toContain("Mail Send");
    expect(serialized).not.toContain("external email send");
    expect(brief.agent_manifest.planned_route.map((s) => s.component_id)).not.toContain(
      "optional_email_send",
    );
    expect(brief.agent_manifest.safety_contract.irreversible_components).toEqual([
      "calendar_write",
    ]);
    expect(brief.connect.credential_manifest.flatMap((c) => c.required_by)).not.toContain(
      "optional_email_send",
    );
    expect(brief.sections.s5_safety).toContain("Driven by: `calendar_write`");
  });
});

/**
 * MCP tool ZOD schema regression (found live, 2026-07-05, deployed build
 * 555705d0). `exportBuildBrief()` the core function is called directly by
 * every test above — it bypasses the InputShape validation the MCP tool
 * wrapper (registerExportBuildBrief) actually enforces on the wire. That gap
 * let a real incompatibility ship: MAR-256 made plan_workflow.worker_pipeline
 * `null` at guided/brief/standard depth (not just omitted), but MAR-255's
 * exportBuildBrief input schema only accepted an object or `undefined` —
 * a straight pass-through of a default-depth plan into export_build_brief
 * failed with "Expected object, received null" on live. Assert against the
 * ACTUAL exported zod schema so this class of gap can't recur silently.
 */
describe("export_build_brief — input schema accepts plan_workflow's literal outputs (MAR-256/255 integration)", () => {
  it("accepts worker_pipeline: null (the default-depth plan_workflow shape)", () => {
    const plan = planWorkflow(
      { goal: "read emails, detect leads and write a note to the CRM for each lead", must_have_capabilities: [], must_avoid: [] },
      registry,
    );
    expect(plan.worker_pipeline).toBeNull(); // sanity: default depth is null (MAR-256)
    const parsed = InputSchema.safeParse({
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
      runtime_requirements: plan.goal_to_product_wizard.runtime_requirements,
      runtime_recommendation: plan.goal_to_product_wizard.runtime_recommendation,
      control_surface: plan.goal_to_product_wizard.control_surface,
      interaction_surface: plan.goal_to_product_wizard.interaction_surface,
      trigger_explanation: plan.goal_to_product_wizard.trigger_explanation,
      handoff_targets: ["prompt"],
      llm_provider: "anthropic",
    });
    expect(parsed.success, parsed.success ? "" : JSON.stringify((parsed as { error: unknown }).error)).toBe(true);
    if (parsed.success) {
      expect(parsed.data.runtime_recommendation?.continues_when_dash_closed).toBe(
        plan.goal_to_product_wizard.runtime_recommendation.continues_when_dash_closed,
      );
    }
  });

  it("still accepts worker_pipeline entirely omitted (back-compat)", () => {
    const parsed = InputSchema.safeParse({
      goal: "x".repeat(10),
      plan_source: "composed",
      route_status: "candidate",
      recommended_route: [{ step: 1, component_id: "email_read" }],
      safety_review: { status: "pass", risk_score: 0 },
      automation_clearance: { level: "L0", autonomous_allowed: true, reason: "x" },
      handoff_targets: ["prompt"],
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults the additive computer-off fact for pre-MAR-427 runtime inputs", () => {
    const plan = planWorkflow(
      {
        goal: "When I ask in chat, summarize the documents I select.",
        must_have_capabilities: [],
        must_avoid: [],
      },
      registry,
    );
    const legacyRequirements = {
      ...plan.goal_to_product_wizard.runtime_requirements,
    } as Partial<typeof plan.goal_to_product_wizard.runtime_requirements>;
    delete legacyRequirements.must_run_while_computer_off;
    const parsed = InputSchema.safeParse({
      goal: plan.goal,
      plan_source: plan.plan_source,
      route_status: plan.route_status,
      recommended_route: plan.recommended_route,
      safety_review: plan.safety_review,
      automation_clearance: plan.automation_clearance,
      runtime_requirements: legacyRequirements,
      handoff_targets: ["prompt"],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.runtime_requirements?.must_run_while_computer_off).toBe(
        false,
      );
    }
  });
});

/**
 * ADR 0008 slice 4 (MAR-555) — the `.strict()` boundary on `agent_panel`.
 *
 * `exportBuildBrief()` the function takes the panel on trust; the zod layer
 * the MCP tool wrapper enforces is the only thing standing between a caller's
 * typo and a manifest DASH refuses at import. DASH's own schema does not
 * forbid unknown keys, so every `.strict()` refusal below is a deliberate
 * narrowing on the `TaskInputRoleInputShape` precedent: a key DASH will never
 * read is a caller believing it declared something.
 *
 * tests/tools/dashBrokerRoundTrip.test.ts holds the other half — the same
 * refusals re-derived from DASH's pinned schema, so neither layer is the only
 * one standing.
 */
describe("MAR-555 — agent_panel is validated at the tool boundary, not on trust", () => {
  function parsePanel(agent_panel: unknown) {
    return InputSchema.safeParse({
      goal: "x".repeat(10),
      plan_source: "composed",
      route_status: "candidate",
      recommended_route: [{ step: 1, component_id: "email_read" }],
      safety_review: { status: "pass", risk_score: 0 },
      automation_clearance: { level: "L0", autonomous_allowed: true, reason: "x" },
      handoff_targets: ["prompt"],
      agent_panel,
    });
  }

  it("omitting it entirely is valid — absence is the honest default, not a missing field", () => {
    const parsed = parsePanel(undefined);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.agent_panel).toBeUndefined();
  });

  it("accepts each of the five v1 section types", () => {
    const cases: Record<string, unknown> = {
      report: { id: "d", type: "report", label: "Digest", artifact_role: "digest" },
      outputs: { id: "o", type: "outputs", label: "Outputs" },
      table: {
        id: "t",
        type: "table",
        label: "Rows",
        source_role: "rows",
        columns: [{ key: "name", label: "Name", kind: "text" }],
      },
      metrics: {
        id: "m",
        type: "metrics",
        label: "Activity",
        items: [{ id: "runs", label: "Runs", source: { kind: "dash_fact", fact: "run_count" } }],
      },
      note: { id: "n", type: "note", label: "Note", text: "Nothing is sent." },
    };
    for (const [name, section] of Object.entries(cases)) {
      const parsed = parsePanel({ panel_version: 1, sections: [section] });
      expect(
        parsed.success,
        parsed.success ? "" : `${name}: ${JSON.stringify((parsed as { error: unknown }).error)}`,
      ).toBe(true);
    }
  });

  it("refuses a section type outside the closed v1 vocabulary", () => {
    // A typo'd type is refused loudly rather than dropped at render — a
    // half-drawn panel is a guess presented as a fact.
    expect(
      parsePanel({ panel_version: 1, sections: [{ id: "c", type: "chart", label: "Chart" }] })
        .success,
    ).toBe(false);
  });

  it("refuses a v1 section that omits the binding its own type requires", () => {
    expect(
      parsePanel({ panel_version: 1, sections: [{ id: "d", type: "report", label: "Digest" }] })
        .success,
    ).toBe(false);
  });

  it("refuses an unknown key inside a section, which DASH's own schema would have allowed", () => {
    expect(
      parsePanel({
        panel_version: 1,
        sections: [
          { id: "n", type: "note", label: "Note", text: "hi", url: "https://example.com" },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses bindings that could spell a path, a traversal or a URL", () => {
    for (const role of ["../digest", "digest/latest", "https://x", "Digest"]) {
      expect(
        parsePanel({
          panel_version: 1,
          sections: [{ id: "d", type: "report", label: "Digest", artifact_role: role }],
        }).success,
        role,
      ).toBe(false);
    }
  });

  it("holds every bound the schema declares: 8 sections, 8 columns, a 400-char note", () => {
    const section = (i: number) => ({ id: `n${i}`, type: "note", label: "N", text: "x" });
    expect(
      parsePanel({ panel_version: 1, sections: [1, 2, 3, 4, 5, 6, 7, 8].map(section) }).success,
    ).toBe(true);
    expect(
      parsePanel({ panel_version: 1, sections: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(section) }).success,
    ).toBe(false);
    expect(parsePanel({ panel_version: 1, sections: [] }).success).toBe(false);
    expect(
      parsePanel({
        panel_version: 1,
        sections: [{ id: "n", type: "note", label: "N", text: "x".repeat(400) }],
      }).success,
    ).toBe(true);
    expect(
      parsePanel({
        panel_version: 1,
        sections: [{ id: "n", type: "note", label: "N", text: "x".repeat(401) }],
      }).success,
    ).toBe(false);
    const column = (i: number) => ({ key: `c${i}`, label: "C", kind: "text" });
    expect(
      parsePanel({
        panel_version: 1,
        sections: [
          {
            id: "t",
            type: "table",
            label: "Rows",
            source_role: "rows",
            columns: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(column),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("a newer panel version is accepted structurally, and version 1 does not rot into leniency", () => {
    // The versioning rule, both directions. An unknown version travels intact
    // so DASH can render it as one stated card; the same opaque section under
    // `panel_version: 1` is still refused, because that is the version whose
    // vocabulary is closed.
    const opaque = { id: "conversation", type: "conversation", label: "Talk to it" };
    expect(parsePanel({ panel_version: 2, sections: [opaque] }).success).toBe(true);
    expect(parsePanel({ panel_version: 1, sections: [opaque] }).success).toBe(false);
    expect(parsePanel({ panel_version: 0, sections: [opaque] }).success).toBe(false);
  });
});

/**
 * MAR-569 — the `.strict()` boundary on `connection_requirements`.
 *
 * Same split as `agent_panel` (MAR-555): this file holds the zod-layer
 * refusals, tests/tools/dashBrokerRoundTrip.test.ts re-derives the same
 * refusals against DASH's pinned schema so neither layer is the only one
 * standing. What this file cannot check is the cross-field join — whether a
 * requirement's connection_id actually names a connection this export
 * declares — because zod validates this field in isolation from its sibling
 * `recommended_route`; that check lives in
 * src/lib/observabilityContract.ts#validateConnectionRequirementsJoin and is
 * proven against real emitted output in dashBrokerRoundTrip.test.ts's
 * "THE TRAP" cases.
 */
describe("MAR-569 — connection_requirements is validated at the tool boundary, not on trust", () => {
  function parseConnectionRequirements(connection_requirements: unknown) {
    return InputSchema.safeParse({
      goal: "x".repeat(10),
      plan_source: "composed",
      route_status: "candidate",
      recommended_route: [{ step: 1, component_id: "email_read" }],
      safety_review: { status: "pass", risk_score: 0 },
      automation_clearance: { level: "L0", autonomous_allowed: true, reason: "x" },
      handoff_targets: ["prompt"],
      connection_requirements,
    });
  }

  it("omitting it entirely is valid — absence is the honest default, not a missing field", () => {
    const parsed = parseConnectionRequirements(undefined);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.connection_requirements).toBeUndefined();
  });

  it("accepts a minimal v1 requirement (id, name, connector_kind, connection_id only)", () => {
    const parsed = parseConnectionRequirements({
      requirements_version: 1,
      requirements: [{ id: "gmail_signin", name: "Your Gmail", connector_kind: "google_oauth_broker", connection_id: "gmail" }],
    });
    expect(parsed.success, parsed.success ? "" : JSON.stringify((parsed as { error: unknown }).error)).toBe(true);
  });

  it("accepts both closed v1 connector kinds, and every optional member together", () => {
    for (const connector_kind of ["google_oauth_broker", "api_key"] as const) {
      const parsed = parseConnectionRequirements({
        requirements_version: 1,
        requirements: [
          {
            id: "req",
            name: "A thing",
            connector_kind,
            connection_id: "gmail",
            operations: ["gmail.search", "gmail.draft.create"],
            optional: true,
            why: "So the agent can search and draft.",
          },
        ],
      });
      expect(parsed.success, connector_kind).toBe(true);
    }
  });

  it("refuses a connector_kind outside the closed v1 vocabulary — mcp_server was deliberately dropped", () => {
    // The exact kind Henrik ruled out (MAR-569 comment thread): MAR-498's
    // wizard connects an SSH deploy host, not an MCP server, and DASH has no
    // MCP-server connect flow. A typo'd (or aspirational) kind is refused
    // loudly rather than drawn as a dead Connect button.
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [{ id: "r", name: "A host", connector_kind: "mcp_server", connection_id: "gmail" }],
      }).success,
    ).toBe(false);
  });

  it("refuses a requirement missing connection_id — both v1 kinds act on a declared connection", () => {
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [{ id: "r", name: "Your Gmail", connector_kind: "google_oauth_broker" }],
      }).success,
    ).toBe(false);
  });

  it("refuses an id outside technical vocabulary — uppercase, spaces, or punctuation", () => {
    for (const id of ["Gmail", "gmail signin", "gmail-signin", ""]) {
      expect(
        parseConnectionRequirements({
          requirements_version: 1,
          requirements: [{ id, name: "Your Gmail", connector_kind: "google_oauth_broker", connection_id: "gmail" }],
        }).success,
        JSON.stringify(id),
      ).toBe(false);
    }
  });

  it("refuses an unknown key, including every credential-shaped member name a value would go under", () => {
    // DASH's own reader (lib/connection-spec.ts) repeats this guard rather
    // than trusting Ajv's propertyNames error; the .strict() zod boundary here
    // forbids ANY unknown key, which is a strictly stronger guarantee that
    // subsumes DASH's named list (value/secret/password/token/access_token/
    // refresh_token/client_secret/api_key/credential_value) without restating it.
    for (const member of ["value", "secret", "token", "api_key", "url"]) {
      expect(
        parseConnectionRequirements({
          requirements_version: 1,
          requirements: [
            {
              id: "r",
              name: "Your Gmail",
              connector_kind: "google_oauth_broker",
              connection_id: "gmail",
              [member]: "x",
            },
          ],
        }).success,
        member,
      ).toBe(false);
    }
  });

  it("refuses operations that repeat an entry, or an operation id outside its own pattern", () => {
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [
          {
            id: "r",
            name: "Your Gmail",
            connector_kind: "google_oauth_broker",
            connection_id: "gmail",
            operations: ["gmail.search", "gmail.search"],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [
          {
            id: "r",
            name: "Your Gmail",
            connector_kind: "google_oauth_broker",
            connection_id: "gmail",
            operations: ["Gmail.Search"],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("holds every bound the schema declares: 12 requirements, 12 operations, a 400-char why", () => {
    const requirement = (i: number) => ({
      id: `r${i}`,
      name: "A thing",
      connector_kind: "google_oauth_broker" as const,
      connection_id: "gmail",
    });
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: Array.from({ length: 12 }, (_, i) => requirement(i)),
      }).success,
    ).toBe(true);
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: Array.from({ length: 13 }, (_, i) => requirement(i)),
      }).success,
    ).toBe(false);
    expect(parseConnectionRequirements({ requirements_version: 1, requirements: [] }).success).toBe(false);

    const ops12 = Array.from({ length: 12 }, (_, i) => `op${i}`);
    const ops13 = Array.from({ length: 13 }, (_, i) => `op${i}`);
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [{ ...requirement(0), operations: ops12 }],
      }).success,
    ).toBe(true);
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [{ ...requirement(0), operations: ops13 }],
      }).success,
    ).toBe(false);

    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [{ ...requirement(0), why: "x".repeat(400) }],
      }).success,
    ).toBe(true);
    expect(
      parseConnectionRequirements({
        requirements_version: 1,
        requirements: [{ ...requirement(0), why: "x".repeat(401) }],
      }).success,
    ).toBe(false);
  });

  it("a newer requirements_version is accepted structurally, and version 1 does not rot into leniency", () => {
    // The versioning rule, both directions — the same one AgentPanelInputShape
    // enforces for panel_version. An opaque requirement (open connector_kind,
    // no connection_id) travels intact under any version other than 1; the
    // same shape under requirements_version: 1 is refused, because that is the
    // version whose vocabulary and connection-link rule are closed.
    const opaque = { id: "notion_signin", name: "A Notion workspace", connector_kind: "mcp_server" };
    expect(
      parseConnectionRequirements({ requirements_version: 2, requirements: [opaque] }).success,
    ).toBe(true);
    expect(
      parseConnectionRequirements({ requirements_version: 1, requirements: [opaque] }).success,
    ).toBe(false);
    expect(
      parseConnectionRequirements({ requirements_version: 0, requirements: [opaque] }).success,
    ).toBe(false);
  });
});

describe("MAR-460 — the exported brief shows the runner-eligibility decision and its evidence", () => {
  const RUNNER_GOAL =
    "Build a local agent that watches my Gmail for meeting requests continuously. " +
    "The separately installed DASH Agent Runner is available. Keep running after the " +
    "DASH window closes while this computer remains on.";

  const FULL_PROFILE = {
    runtime_location: { supported: true, evidence: "runner registration: local process" },
    credential_custody: { supported: true, evidence: "runner registration: OS keychain" },
    network_exposure: { supported: true, evidence: "runner registration: loopback only" },
    lifecycle_control: { supported: true, evidence: "runner lifecycle API" },
    cancellation: { supported: true, evidence: "runner lifecycle API: cancel" },
    audit_trail: { supported: true, evidence: "telemetry-v1 run events" },
    approval_enforcement: { supported: true, evidence: "gate_requested/gate_resolved events" },
  } as const;

  it("fails closed when the export declares no capability evidence at all", () => {
    const brief = planAndBrief(RUNNER_GOAL, ["prompt"], "code");
    expect(brief.runner_eligibility.decision).toBe("needs_evidence");
    expect(brief.runner_eligibility.posture).toBe("public");
    expect(brief.sections.s9_observability).toContain("Public-runner eligibility");
    expect(brief.sections.s9_observability).toContain("needs_evidence");
    // The old unconditional "can validate and host" claim is now conditioned.
    expect(brief.sections.s9_observability).toContain("eligibility check below");
  });

  it("reaches eligible only with a complete, sourced profile — and shows the sources", () => {
    const brief = planAndBrief(RUNNER_GOAL, ["prompt"], "code", {
      runner_capability_profile: { ...FULL_PROFILE },
    });
    expect(brief.runner_eligibility.decision).toBe("eligible");
    expect(brief.sections.s9_observability).toContain("eligible");
    expect(brief.sections.s9_observability).toContain("telemetry-v1 run events");
  });

  it("separates a refused capability from an unstated one in the exported brief", () => {
    const refused = planAndBrief(RUNNER_GOAL, ["prompt"], "code", {
      runner_capability_profile: {
        ...FULL_PROFILE,
        cancellation: { supported: false, evidence: "runner has no cancel endpoint" },
      },
    });
    expect(refused.runner_eligibility.decision).toBe("ineligible");
    expect(refused.runner_eligibility.refuted_dimensions).toEqual(["cancellation"]);

    const { cancellation: _omitted, ...withoutCancellation } = FULL_PROFILE;
    const unstated = planAndBrief(RUNNER_GOAL, ["prompt"], "code", {
      runner_capability_profile: withoutCancellation,
    });
    expect(unstated.runner_eligibility.decision).toBe("needs_evidence");
    expect(unstated.runner_eligibility.missing_evidence).toEqual(["cancellation"]);
    expect(unstated.runner_eligibility.refuted_dimensions).toEqual([]);

    expect(refused.sections.s9_observability).not.toBe(unstated.sections.s9_observability);
  });

  it("does not let a reachable runner buy eligibility in the export", () => {
    const brief = planAndBrief(RUNNER_GOAL, ["prompt"], "code", { runner_reachable: true });
    expect(brief.runner_eligibility.decision).toBe("needs_evidence");
    expect(brief.sections.s9_observability).toContain("Reachability is not eligibility");
  });

  it("honours a narrower declared posture without inventing public requirements", () => {
    const { network_exposure: _omitted, ...withoutExposure } = FULL_PROFILE;
    const attended = planAndBrief(RUNNER_GOAL, ["prompt"], "code", {
      runner_posture: "unattended",
      runner_capability_profile: withoutExposure,
    });
    expect(attended.runner_eligibility.decision).toBe("eligible");

    // Absence sibling: the same profile under the default posture still fails.
    const asPublic = planAndBrief(RUNNER_GOAL, ["prompt"], "code", {
      runner_capability_profile: withoutExposure,
    });
    expect(asPublic.runner_eligibility.decision).toBe("needs_evidence");
  });

  it("carries the decision through the compact delivery, not just the full one", () => {
    // A fail-closed gate that only the full response carries would be absent
    // from the response the wizard actually asks for.
    const compact = exportBuildBrief({
      ...briefInput(RUNNER_GOAL, ["prompt"], "code"),
      delivery_mode: "compact",
    });
    expect(compact.runner_eligibility.decision).toBe("needs_evidence");
    expect(compact.delivery.omitted_fields).not.toContain("runner_eligibility");
  });

  it("keeps the eligibility block out of a non-runner-hostable build target", () => {
    // Absence fixture: a Cowork assistant has no runner to judge, so asserting
    // eligibility there would be a claim about a thing that does not exist.
    const brief = planAndBrief(
      "When I ask in chat, summarize my unread inbox in Cowork. Never run in the background.",
      ["prompt"],
      "cowork",
    );
    expect(brief.sections.s9_observability).toContain("Not runner-hostable");
    expect(brief.sections.s9_observability).not.toContain("Public-runner eligibility");
  });
});

describe("MAR-427 — confirmed DASH placement reaches the manifest-v2 handoff", () => {
  const LOCAL_DASH_GOAL =
    "Build a local agent that watches my Gmail for meeting requests continuously. " +
    "The separately installed DASH Agent Runner is available. Keep running after the " +
    "DASH window closes while this computer remains on.";

  it("emits the selected runner/control pair without turning DASH into the runtime", () => {
    const brief = planAndBrief(LOCAL_DASH_GOAL, ["prompt"], "code");

    expect(brief.agent_manifest.agent_dom.runtime).toMatchObject({
      class: "local_process",
      label: "DASH Agent Runner",
      continues_when_dash_closed: true,
    });
    expect(brief.agent_manifest.agent_dom.locations.control[0]).toMatchObject({
      id: "dash_control",
      label: "DASH",
      kind: "dash",
    });
    expect(brief.agent_manifest.agent_dom.locations.runtime.label).toBe(
      "DASH Agent Runner",
    );
    expect(brief.agent_manifest.agent_dom.locations.interaction[0]?.label).not.toBe(
      "DASH",
    );
    expect(brief.agent_manifest.agent_dom.control.commands).not.toEqual(
      expect.arrayContaining(["start", "stop", "trigger"]),
    );
    expect(brief.sections.s9_observability).toContain(
      "separately installed DASH Agent Runner",
    );
    expect(brief.sections.s9_observability).toContain("closing the DASH window");
    expect(brief.sections.s9_observability).toMatch(/asleep or off/i);
  });

  it("pairs the runner-hostable presence with a Cowork non-hostable absence", () => {
    const brief = planAndBrief(
      "When I ask in chat, summarize my unread inbox in Cowork. Never run in the background.",
      ["prompt"],
      "cowork",
    );

    expect(brief.agent_manifest.agent_dom.runtime.class).toBe("client_session");
    expect(brief.agent_manifest.agent_dom.runtime.label).not.toContain(
      "DASH Agent Runner",
    );
    expect(
      brief.agent_manifest.agent_dom.locations.control.map((location) => location.kind),
    ).not.toContain("dash");
    expect(brief.agent_manifest.agent_dom.control.commands).toEqual([]);
    expect(brief.sections.s9_observability).toContain("Not runner-hostable");
  });
});

describe("export_build_brief — §0 constraints (MAR-205, shared detection MAR-255)", () => {
  it("detects explicit read-only constraint", () => {
    const b = planAndBrief("scan a GitHub PR, read-only, never write anything");
    expect(b.sections.s0_constraints).toContain("read-only");
  });

  it("detects unattended constraint", () => {
    const b = planAndBrief(
      "fan out documents to processors and roll back if any fail, fully automated, no human in the loop",
    );
    expect(b.sections.s0_constraints).toContain("unattended");
  });

  it("states 'no constraint detected' when goal has none", () => {
    const b = planAndBrief("read emails and draft a CRM note for each lead");
    expect(b.sections.s0_constraints).toContain("No explicit");
  });

  // MAR-255 acceptance 1: the G1 audit goal — the brief used to open with
  // "No explicit … constraint detected" on it (live, 2026-07-01) while the
  // planner had already enforced the gate on the same phrasing.
  it("G1 audit goal → §0 lists draft-only + attended with trigger phrases", () => {
    const b = planAndBrief(
      "Every morning, read unread customer support emails, classify them by urgency, and draft " +
        "replies for my approval — never send anything automatically. A human reviews every draft.",
    );
    expect(b.sections.s0_constraints).toContain("draft-only");
    expect(b.sections.s0_constraints).toContain('trigger: "never send anything automatically"');
    expect(b.sections.s0_constraints).toContain("attended");
    expect(b.sections.s0_constraints).toContain('trigger: "for my approval"');
    expect(b.sections.s0_constraints).not.toContain("No explicit");
  });

  it("conflicting constraints are both listed with a ⚠️ marker (MAR-255)", () => {
    const b = planAndBrief(
      "Runs unattended on a schedule, but a human reviews every draft before it goes out",
    );
    expect(b.sections.s0_constraints).toContain("Conflicting constraints");
    expect(b.sections.s0_constraints).toContain("unattended");
    expect(b.sections.s0_constraints).toContain("attended");
  });
});

describe("export_build_brief — §3/§4 round-trip inputs + numbering (MAR-255)", () => {
  const GOAL = "read emails, detect leads and write a note to the CRM for each lead";

  it("omitting worker_pipeline yields the pointer line, not 'No worker pipeline in registry'", () => {
    // default-depth plan → worker_pipeline null (MAR-256), so the brief must
    // point at the round-trip instead of making a false registry claim.
    const b = planAndBrief(GOAL);
    expect(b.sections.s3_worker_contracts).toContain("Not included in this call");
    expect(b.sections.s3_worker_contracts).toContain("output_depth");
    expect(b.sections.s3_worker_contracts).not.toContain("No worker pipeline in registry");
  });

  it("passing worker_pipeline from a technical-depth plan renders the §3 contracts", () => {
    const plan = planWorkflow(
      { goal: GOAL, must_have_capabilities: [], must_avoid: [], output_depth: "technical" },
      registry,
    );
    expect(plan.worker_pipeline).not.toBeNull();
    const b = exportBuildBrief({
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
      handoff_targets: ["prompt"],
      llm_provider: "anthropic",
    });
    expect(b.sections.s3_worker_contracts).toContain("Pipeline:");
    expect(b.sections.s3_worker_contracts).toContain("`planner`");
    expect(b.sections.s3_worker_contracts).toContain("`tester`");
  });

  it("§4 always renders — an explicit 'no loop' line instead of a §3→§5 numbering hole", () => {
    const b = planAndBrief(GOAL);
    expect(b.sections.s4_loop_contract).toContain("§4 Loop contract");
    expect(b.sections.s4_loop_contract).toContain("No loop in this plan");
    // the assembled brief has continuous numbering
    expect(b.brief_markdown).toContain("§3");
    expect(b.brief_markdown).toContain("§4");
    expect(b.brief_markdown).toContain("§5");
  });
});

describe("export_build_brief — §2 route is grounded (MAR-205 + MAR-206)", () => {
  it("s2_route contains component IDs from the plan", () => {
    const plan = planWorkflow(
      { goal: "read emails, detect leads and write a note to the CRM for each lead", must_have_capabilities: [], must_avoid: [] },
      registry,
    );
    const brief = exportBuildBrief({
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
      handoff_targets: ["prompt"],
      llm_provider: "anthropic",
    });
    for (const step of plan.recommended_route) {
      expect(brief.sections.s2_route).toContain(step.component_id);
    }
  });

  it("s2_route labels are 🟢 grounded in the header", () => {
    const b = planAndBrief("read emails and draft a CRM note for each lead");
    expect(b.sections.s2_route).toContain("🟢");
  });

  it("design_notes from MAR-211/212 appear in s2_route when present", () => {
    const b = planAndBrief(
      "fan out a batch of documents to parallel processors and roll back with saga compensation",
    );
    // design_notes include the fan-out note (MAR-212) — should surface in s2
    if (b.sections.s2_route.includes("Design notes")) {
      expect(b.sections.s2_route).toContain("parallel");
    }
  });
});

describe("export_build_brief — §4 loop contract (MAR-205, always rendered since MAR-255)", () => {
  it("s4_loop_contract is the explicit 'no loop' line for non-loop routes", () => {
    const b = planAndBrief("read emails, detect leads and write a CRM note");
    expect(b.sections.s4_loop_contract).toContain("No loop in this plan");
    expect(b.sections.s4_loop_contract).not.toContain("max_iterations");
  });

  it("fan-out route does NOT get the worker-build-loop contract (MAR-209 integration)", () => {
    const b = planAndBrief(
      "fan out a batch of documents to parallel processors, validate each, " +
      "roll back with saga compensation if any fails",
    );
    // loop_guidance is null for fan-out routes (MAR-209) — §4 renders the
    // explicit absence line, never the bounded-iteration contract.
    expect(b.sections.s4_loop_contract).toContain("No loop in this plan");
    expect(b.sections.s4_loop_contract).not.toContain("max_iterations");
  });
});

describe("export_build_brief — §5 safety (MAR-205)", () => {
  it("L3 CRM route has clearance level in §5 and DoD gate in §8", () => {
    const b = planAndBrief("read emails, detect leads and write a note to the CRM for each lead");
    expect(b.sections.s5_safety).toContain("L3");
    expect(b.sections.s8_definition_of_done).toContain("L3");
  });

  it("untested edges appear as risk questions in §5", () => {
    // Force an untested edge by passing one manually
    const plan = planWorkflow(
      { goal: "read emails and write a CRM note", must_have_capabilities: [], must_avoid: [] },
      registry,
    );
    const brief = exportBuildBrief({
      goal: plan.goal,
      plan_source: plan.plan_source,
      route_status: plan.route_status,
      recommended_route: plan.recommended_route,
      safety_review: plan.safety_review,
      automation_clearance: plan.automation_clearance,
      enforced_approval_gates: plan.enforced_approval_gates,
      untested_edges: [{ id: "email_read__produces__crm_note_write", severity: "high" }],
      avoid_when_violations: plan.avoid_when_violations,
      evals_to_add: plan.evals_to_add,
      design_notes: plan.design_notes,
      worker_pipeline: plan.worker_pipeline,
      loop_guidance: plan.loop_guidance,
      approval_gate_advisory: plan.approval_gate_advisory,
      handoff_targets: ["prompt"],
      llm_provider: "anthropic",
    });
    expect(brief.sections.s5_safety).toContain("email_read__produces__crm_note_write");
    expect(brief.sections.s5_safety).toContain("HIGH");
    expect(brief.sections.s8_definition_of_done).toContain("high-severity");
  });
});

describe("export_build_brief — §8 definition of done (MAR-205)", () => {
  it("validated playbook route checks route box", () => {
    const b = planAndBrief("read emails, check my calendar and draft a reply for each meeting request");
    if (b.sections.s1_summary.includes("validated")) {
      expect(b.sections.s8_definition_of_done).toContain("[x] Route is validated");
    }
  });

  it("always includes the five operational gates", () => {
    const b = planAndBrief("read emails and draft a CRM note");
    const dod = b.sections.s8_definition_of_done;
    expect(dod).toContain("least-privilege");
    expect(dod).toContain("Dry-run");
    expect(dod).toContain("Idempotency");
    expect(dod).toContain("Kill switch");
    expect(dod).toContain("Audit log");
  });
});

describe("export_build_brief — handoff targets (MAR-205)", () => {
  it("prompt handoff is present when requested", () => {
    const b = planAndBrief("read emails and draft a CRM note", ["prompt"]);
    expect(b.handoffs.prompt).toBeTruthy();
    expect(b.handoffs.linear).toBeUndefined();
    expect(b.handoffs.obsidian).toBeUndefined();
  });

  it("linear handoff is present when requested", () => {
    const b = planAndBrief("read emails and draft a CRM note", ["linear"]);
    expect(b.handoffs.linear).toContain("## Build brief");
    expect(b.handoffs.linear).toContain("Generated by OrchestrateMCP");
  });

  it("obsidian handoff has YAML frontmatter", () => {
    const b = planAndBrief("read emails and draft a CRM note", ["obsidian"]);
    expect(b.handoffs.obsidian).toContain("tags: [orchestratekit");
    expect(b.handoffs.obsidian).toContain("plan_source:");
  });

  it("multiple targets can be requested at once", () => {
    const b = planAndBrief("read emails and draft a CRM note", ["prompt", "linear", "obsidian"]);
    expect(b.handoffs.prompt).toBeTruthy();
    expect(b.handoffs.linear).toBeTruthy();
    expect(b.handoffs.obsidian).toBeTruthy();
  });
});

describe("export_build_brief delivery contract (PKG-W0-BRIEF-SIZE)", () => {
  const GOAL =
    "Build an agent that reads new leads from Gmail, drafts a reply, updates CRM, and alerts sales in Slack after approval.";

  function deliveryPair() {
    const plan = planWorkflow(
      { goal: GOAL, must_have_capabilities: [], must_avoid: [], output_depth: "technical" },
      registry,
    );
    const handoffTargets: ("prompt" | "linear" | "obsidian")[] = ["prompt", "linear", "obsidian"];
    const input = {
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
      handoff_targets: handoffTargets,
      generated_at: "2026-07-13T00:00:00.000Z",
      llm_provider: "anthropic" as const,
    };
    return {
      omitted: exportBuildBrief(input),
      compact: exportBuildBrief({ ...input, delivery_mode: "compact" }),
      full: exportBuildBrief({ ...input, delivery_mode: "full" }),
    };
  }

  it("keeps omission backward-compatible with full delivery", () => {
    const { omitted, full } = deliveryPair();
    expect(omitted.delivery.mode).toBe("full");
    expect(omitted.artifact_package).toEqual(full.artifact_package);
    expect(omitted.brief_markdown).toBe(full.brief_markdown);
    expect(omitted.handoffs).toEqual(full.handoffs);
  });

  it("compact omits only the large artifact package and duplicated handoffs", () => {
    const { compact, full } = deliveryPair();
    expect(compact).not.toHaveProperty("artifact_package");
    expect(compact.delivery.omitted_fields).toContain("artifact_package");
    expect(compact.delivery.artifact_fingerprint).toBe(full.delivery.artifact_fingerprint);
    expect(compact.delivery.artifact_bytes).toBe(full.delivery.artifact_bytes);
    expect(compact.artifact_index).toEqual(full.artifact_index);
    expect(compact.sections).toEqual(full.sections);
    expect(compact.agent_manifest).toEqual(full.agent_manifest);
    expect(compact.connect).toEqual(full.connect);
  });

  it("keeps safety, Definition of Done, Connect, and deterministic full replay inline", () => {
    const { compact } = deliveryPair();
    expect(compact.brief_markdown).toContain(compact.sections.s5_safety);
    expect(compact.brief_markdown).toContain(compact.sections.s8_definition_of_done);
    expect(compact.brief_markdown).toContain(compact.sections.s11_connect);
    expect(compact.brief_markdown).toContain(compact.delivery.full_request.instruction);
    expect(compact.connect.connect_script).toBeTruthy();
    expect(compact.agent_manifest).toBeTruthy();
  });

  /**
   * MAR-460 raised this ceiling from 90 KB to 96 KB. The canonical compact
   * response was already at 90,621 bytes — 98.3% of the old budget — so the
   * public-runner eligibility decision (~4.7 KB: the `runner_eligibility`
   * findings plus the §9 block, which compact carries in both `sections` and
   * `brief_markdown`) could not fit without dropping the per-dimension evidence
   * MAR-460 exists to publish.
   *
   * The trade was made deliberately in that direction: this budget protects
   * client context, and 96 KB serves that as well as 90 KB did, whereas a
   * fail-closed gate whose evidence is hidden to save bytes is not worth
   * shipping. The 4x compact/full ratio below is the assertion that still does
   * the real structural work.
   */
  it("keeps the canonical compact response below 96 KB and at least 4x smaller", () => {
    const { compact, full } = deliveryPair();
    const compactBytes = new TextEncoder().encode(JSON.stringify(compact)).byteLength;
    const fullBytes = new TextEncoder().encode(JSON.stringify(full)).byteLength;
    expect(compactBytes).toBeLessThan(96 * 1024);
    expect(fullBytes / compactBytes).toBeGreaterThan(4);
  });
});

describe("export_build_brief - Tier 2 artifact compiler (MAR-249)", () => {
  it("emits epic -> milestones -> Linear issue templates with the full field set", () => {
    const b = planAndBrief(
      "Build an agent that reads new leads from Gmail, drafts a reply, updates CRM, and alerts sales in Slack after approval.",
      ["prompt", "linear"],
    );
    const pkg = b.artifact_package;

    expect(pkg.compiler).toBe("export_build_brief.artifact_compiler.v1");
    expect(() => ExportBuildBriefOutputShape.parse(b)).not.toThrow();
    expect(pkg.status).toBe("compiled");
    expect(pkg.epic.title).toContain("Build workflow");
    expect(pkg.milestones.map((m) => m.id)).toEqual(["M1", "M2", "M3"]);
    expect(pkg.linear_issue_templates.length).toBeGreaterThan(2);
    expect(pkg.field_order).toEqual([...ARTIFACT_ISSUE_FIELD_ORDER]);

    for (const issue of pkg.linear_issue_templates) {
      expect(Object.keys(issue.fields).sort()).toEqual([...ARTIFACT_ISSUE_FIELD_ORDER].sort());
      expect(issue.markdown).toContain("### Claude-Code/Cursor prompt");
      expect(issue.markdown).toContain("### Acceptance criteria");
      expect(issue.markdown).toContain("### Files likely affected");
    }
  });

  it("renders issue Markdown headings in the canonical artifact field order", () => {
    const b = planAndBrief(
      "Build an agent that reads new leads from Gmail, drafts a reply, updates CRM, and alerts sales in Slack after approval.",
      ["linear"],
    );
    const expectedHeadings = [
      "Title",
      "Goal",
      "User story",
      "Context",
      "Inputs",
      "Outputs",
      "Required tools",
      "Data model",
      "Step-by-step implementation",
      "Edge cases",
      "Failure modes",
      "Security",
      "Approval gates",
      "Acceptance criteria",
      "Test cases",
      "Definition of Done",
      "Claude-Code/Cursor prompt",
      "Files likely affected",
      "Non-goals",
    ];

    expect(b.artifact_package.field_order).toEqual([...ARTIFACT_ISSUE_FIELD_ORDER]);
    for (const issue of b.artifact_package.linear_issue_templates) {
      const headings = [...issue.markdown.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
      expect(headings).toEqual(expectedHeadings);
    }
  });

  it("keeps the aggregate Linear template bundle in artifact issue order", () => {
    const b = planAndBrief(
      "Build an agent that reads new leads from Gmail, drafts a reply, updates CRM, and alerts sales in Slack after approval.",
      ["linear"],
    );
    const aggregate = b.artifact_package.linear_issue_template_markdown;
    const aggregateIssueIds = [...aggregate.matchAll(/^## (ISSUE-\d{3}) /gm)].map((match) => match[1]);

    expect(aggregateIssueIds).toEqual(b.artifact_package.linear_issue_templates.map((issue) => issue.id));

    let previousIndex = -1;
    for (const issue of b.artifact_package.linear_issue_templates) {
      const index = aggregate.indexOf(issue.markdown);
      expect(index).toBeGreaterThan(previousIndex);
      expect(aggregate.lastIndexOf(issue.markdown)).toBe(index);
      previousIndex = index;
    }
  });

  it("keeps milestone issue ids in sync with generated artifact templates", () => {
    const b = planAndBrief(
      "Build an agent that reads new leads from Gmail, drafts a reply, updates CRM, and alerts sales in Slack after approval.",
      ["linear"],
    );
    const templates = b.artifact_package.linear_issue_templates;

    for (const milestone of b.artifact_package.milestones) {
      expect(milestone.issue_ids).toEqual(
        templates
          .filter((template) => template.milestone_id === milestone.id)
          .map((template) => template.id),
      );
    }
    expect(b.artifact_package.milestones.flatMap((milestone) => milestone.issue_ids)).toEqual(
      templates.map((template) => template.id),
    );
  });

  it("includes build-ready prompt and paste-ready Linear templates without external writes", () => {
    const b = planAndBrief(
      "Scan a GitHub PR, summarize risks, and draft a reviewer notification for human approval.",
      ["prompt", "linear", "obsidian"],
    );

    expect(b.artifact_package.build_prompt).toContain("You are implementing a confirmed OrchestrateMCP plan");
    expect(b.artifact_package.linear_issue_template_markdown).toContain("## ISSUE-001");
    expect(b.artifact_package.few_shot_example.markdown).toContain("EXAMPLE-001");
    expect(b.handoffs.prompt).toContain("Use these Linear-style issue templates as the execution plan");
    expect(b.handoffs.linear).toContain("no Linear write was performed");
    expect(b.handoffs.obsidian).toContain("tags: [orchestratekit");
    expect(b.brief_markdown).toContain("Tier 2 artifact compiler");
    expect(b.brief_markdown).toContain("did not write to Linear, Obsidian");
  });

  it("embeds the exact artifact compiler package in builder handoffs", () => {
    const b = planAndBrief(
      "Scan a GitHub PR, summarize risks, and draft a reviewer notification for human approval.",
      ["prompt", "linear"],
    );

    expect(b.handoffs.prompt).toBeDefined();
    expect(b.handoffs.linear).toBeDefined();
    expect(b.handoffs.prompt).toContain(b.artifact_package.build_prompt);
    expect(b.handoffs.linear).toContain(b.artifact_package.linear_issue_template_markdown);
  });

  it("preserves the stateless compiler directive in builder handoffs", () => {
    const b = planAndBrief(
      "Scan a GitHub PR, summarize risks, and draft a reviewer notification for human approval.",
      ["prompt", "linear"],
    );
    const noWriteDirective = b.artifact_package.directives.find((directive) =>
      directive.includes("Do not write to Linear, Obsidian"),
    );

    expect(noWriteDirective).toBeDefined();
    expect(b.artifact_package.build_prompt).toContain(noWriteDirective);
    expect(b.artifact_package.linear_issue_template_markdown).toContain(noWriteDirective);
    expect(b.handoffs.prompt).toContain(noWriteDirective);
    expect(b.handoffs.linear).toContain(noWriteDirective);
  });

  it("directs client LLMs to clarify, confirm scope, and mark unknowns instead of guessing", () => {
    const b = planAndBrief("Read emails and draft CRM follow-ups", ["linear"]);
    const directives = b.artifact_package.directives.join("\n");

    expect(directives).toContain("Ask at least 3 targeted clarifying questions");
    expect(directives).toContain("Do not emit final implementation issues until the human confirms the scope");
    expect(directives).toContain("write UNKNOWN and ask the human");
    expect(directives).toContain("Do not write to Linear, Obsidian");
  });

  it("output schema locks compiler metadata clients rely on", () => {
    const b = planAndBrief("Read emails and draft CRM follow-ups", ["linear"]);

    expect(ExportBuildBriefOutputShape.safeParse(b).success).toBe(true);

    const withoutScopeConfirmation = cloneForSchemaMutation(b);
    delete (withoutScopeConfirmation.artifact_package as Partial<typeof b.artifact_package>).scope_confirmation;
    expect(ExportBuildBriefOutputShape.safeParse(withoutScopeConfirmation).success).toBe(false);

    const withBadFieldOrder = cloneForSchemaMutation(b);
    withBadFieldOrder.artifact_package.field_order = [
      ...withBadFieldOrder.artifact_package.field_order,
      "made_up_field",
    ] as typeof b.artifact_package.field_order;
    expect(ExportBuildBriefOutputShape.safeParse(withBadFieldOrder).success).toBe(false);

    const withoutFewShotNote = cloneForSchemaMutation(b);
    delete (withoutFewShotNote.artifact_package.few_shot_example as Partial<typeof b.artifact_package.few_shot_example>).note;
    expect(ExportBuildBriefOutputShape.safeParse(withoutFewShotNote).success).toBe(false);
  });
});
