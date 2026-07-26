import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportBuildBrief } from "../../src/tools/exportBuildBrief.js";

const fixturePath = path.resolve(
  "tests/fixtures/dash/conformance/v2/mar-426.runner-hosted.agent.manifest.json",
);

describe("MAR-426 canonical runner-hosted fixture", () => {
  it("is the exact manifest emitted by export_build_brief", () => {
    const brief = exportBuildBrief({
      goal: "Read HubSpot contacts on request and write a local JSON report.",
      plan_source: "composed",
      route_status: "candidate",
      recommended_route: [
        {
          step: 1,
          component_id: "crm_record_read",
          component_name: "CRM record read",
          purpose: "Read the selected HubSpot contacts.",
          risk_level: "low",
          model_tier: "none",
        },
        {
          step: 2,
          component_id: "audit_log",
          component_name: "Audit log",
          purpose: "Record safe run metadata locally.",
          risk_level: "low",
          model_tier: "none",
        },
      ],
      safety_review: {
        status: "pass",
        risk_score: 8,
        blocking_issues: [],
        warnings: [],
        approval_gates_required: [],
      },
      automation_clearance: {
        level: "L1",
        autonomous_allowed: true,
        reason: "Read-only provider access with a local report.",
        required_controls: ["least-privilege"],
        highest_action_components: ["audit_log"],
      },
      enforced_approval_gates: [],
      untested_edges: [],
      avoid_when_violations: [],
      evals_to_add: [],
      design_notes: [],
      handoff_targets: ["prompt"],
      playbook_id: "",
      route_id: "",
      build_target: "code",
      output_location: "Local JSON report",
      agent_name: "hubspot-contact-reporter",
      generated_at: "2026-07-26T20:00:00.000Z",
      runtime_requirements: {
        trigger_mode: "manual",
        operation_mode: "interactive",
        expected_duration: "short",
        persistent_state_needed: false,
        durable_approval_needed: false,
        must_run_while_user_offline: false,
        data_sensitivity: "medium",
        estimated_operational_complexity: "low",
      },
      runtime_recommendation: {
        id: "dash_agent_runner_local",
        label: "DASH Agent Runner on this computer",
        runtime_class: "local_process",
        reason:
          "Run the generated code as a local process under the separately installed runner.",
        offline_behavior:
          "Continues after the DASH window closes while this computer and runner remain on.",
        continues_when_dash_closed: true,
        appropriate_when: "The agent should run locally while this computer is on.",
        limitation: "Stops while the computer is asleep or off.",
        availability: "requires setup",
        install_action: null,
      },
      control_surface: {
        recommended: {
          id: "dash_agent_runner_control",
          label: "DASH Agent Runner control adapter",
          appropriate_when: "Control a compatible locally registered process.",
          limitation: "Unavailable while the computer or runner is off.",
          availability: "requires setup",
        },
        alternatives: [],
      },
      interaction_surface: {
        recommended: {
          id: "dash_workspace",
          label: "DASH agent workspace",
          appropriate_when: "Inspect safe state and submit declared commands.",
          limitation: "Last safe state is read-only while the runner is unavailable.",
          availability: "requires setup",
        },
        alternatives: [],
      },
      trigger_explanation: {
        mode: "manual",
        label: "Manual run request",
        what_wakes_it_up:
          "The runner starts a registered process when a person requests a run.",
        offline_behavior: "No run starts while the computer or runner is off.",
        limitation: "No schedule or inbound event is configured.",
      },
    });

    expect("agent_manifest" in brief).toBe(true);
    if (!("agent_manifest" in brief)) return;
    expect(brief.agent_manifest).toEqual(
      JSON.parse(readFileSync(fixturePath, "utf8")),
    );
  });
});
