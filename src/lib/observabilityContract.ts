/**
 * DASH manifest-v2 + telemetry-v1 shared constants and deterministic manifest
 * builder (MAR-296 / DASH-02, MAR-426 / CONTRACT-01).
 *
 * Single source for BOTH plan_workflow's advisory `observability` block and
 * export_build_brief's emitted `agent.manifest.json`, so the two can never
 * disagree about the event set or which components need gate events. Mirrors
 * orchestratedash `contracts/agent.manifest.v2.schema.json`, whose semantic
 * content is committed here as a version-pinned test fixture and validated in
 * CI — the same dual-update discipline as the matcher corpus. Telemetry run
 * events remain v1.
 *
 * The MCP stays stateless: nothing here makes a network call or talks to DASH.
 * The manifest is data placed in the build brief, exactly like the registry
 * fixture — deterministic from the plan (route, safety contract, provenance
 * fingerprint) plus the user-stated output_location.
 */

import type { CredentialRequirement } from "./connectContract.js";
import type { ConnectionRequirement } from "./connectionContract.js";
import type {
  PlacementAxis,
  RuntimeOption,
  RuntimeRequirements,
  TriggerExplanation,
} from "../tools/planWorkflow.js";

/** Contract version — bumped in lockstep with orchestratedash's schemas. */
export const MANIFEST_VERSION = 2 as const;

/** The v1 run-event set every DASH-monitored agent emits (contract-frozen). */
export const DASH_RUN_EVENTS = [
  "run_started",
  "step_started",
  "step_completed",
  "gate_requested",
  "gate_resolved",
  "run_completed",
  "run_failed",
] as const;

/** Env-var names the built agent reads its ingest URL + bearer token from. */
export const DASH_ENDPOINT_ENV = "DASH_INGEST_URL";
export const DASH_TOKEN_ENV = "DASH_INGEST_TOKEN";

export const MANIFEST_GENERATED_BY = "orchestratekit-mcp export_build_brief";

export type ManifestRisk = "low" | "medium" | "high" | "critical";
export type ManifestTier = "none" | "small" | "standard" | "frontier";
export type ManifestClearance = "L0" | "L1" | "L2" | "L3" | "L4";
export type ManifestBuildTarget = "cowork" | "cursor" | "chatgpt_gpt" | "code";
export type AgentDomRuntimeClass =
  | "local_process"
  | "managed_worker"
  | "scheduled_job"
  | "workflow_platform"
  | "client_session"
  | "other";
export type AgentDomAvailability =
  | "always_on"
  | "scheduled"
  | "while_client_open"
  | "on_demand"
  | "unknown";
export type AgentDomTriggerType =
  | "manual"
  | "schedule"
  | "webhook"
  | "event"
  | "poll"
  | "client_session"
  | "other";
export type AgentDomLocationKind =
  | "local"
  | "remote"
  | "provider_ui"
  | "dash"
  | "client"
  | "other";
export type AgentDomCommand =
  | "approve"
  | "reject"
  | "choose"
  | "retry"
  | "pause"
  | "resume"
  | "cancel";
export type AgentDomConnectionOwnership = "dash_managed" | "agent_managed" | "external";

/** A route step as seen by the manifest builder (plan_workflow's RouteStep subset). */
export type ManifestRouteStep = {
  step: number;
  component_id: string;
  component_name?: string;
  purpose?: string;
  risk_level?: string;
  model_tier?: string;
  /** Registry-grounded provider access for Agent DOM connection capabilities. */
  connection_access?: "read" | "write";
};

const IRREVERSIBLE_RISK = new Set<ManifestRisk>(["high", "critical"]);

function coerceRisk(r?: string): ManifestRisk {
  return r === "medium" || r === "high" || r === "critical" ? r : "low";
}
function coerceTier(t?: string): ManifestTier {
  return t === "small" || t === "standard" || t === "frontier" ? t : "none";
}

function stableId(value: string, fallback: string): string {
  const id = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "");
  return id || fallback;
}

function isSelfHostedBuildTarget(target: ManifestBuildTarget): boolean {
  return target === "code" || target === "cursor";
}

function agentDomRuntimeClass(runtimeClass: string | undefined): AgentDomRuntimeClass {
  switch (runtimeClass) {
    case "local_process":
    // MAR-456: a local scheduled task is still a local process — it just runs
    // on a timer instead of continuously. Reuses the existing bucket rather
    // than adding a new AgentDomRuntimeClass value, which is a manifest v2
    // field DASH also reads.
    case "local_cron":
      return "local_process";
    case "managed_durable_background":
    case "self_hosted":
    case "application_backend":
      return "managed_worker";
    case "managed_scheduled_job":
      return "scheduled_job";
    case "workflow_automation":
      return "workflow_platform";
    case "client_chat":
      return "client_session";
    default:
      return "other";
  }
}

function agentDomAvailability(
  runtimeClass: AgentDomRuntimeClass,
  requirements: RuntimeRequirements | undefined,
): AgentDomAvailability {
  if (runtimeClass === "client_session") return "while_client_open";
  if (runtimeClass === "scheduled_job" || requirements?.operation_mode === "scheduled") {
    return "scheduled";
  }
  if (
    runtimeClass === "managed_worker" ||
    (runtimeClass === "workflow_platform" &&
      (requirements?.operation_mode === "continuous" ||
        requirements?.operation_mode === "event-driven"))
  ) {
    return "always_on";
  }
  if (runtimeClass === "local_process" || runtimeClass === "workflow_platform") {
    return "on_demand";
  }
  return "unknown";
}

function runtimeLocationKind(runtimeClass: AgentDomRuntimeClass): AgentDomLocationKind {
  switch (runtimeClass) {
    case "local_process":
      return "local";
    case "managed_worker":
    case "scheduled_job":
    case "workflow_platform":
      return "remote";
    case "client_session":
      return "client";
    default:
      return "other";
  }
}

function surfaceLocationKind(id: string): AgentDomLocationKind {
  if (id.includes("dash")) return "dash";
  if (id.includes("client")) return "client";
  if (id.includes("logs")) return "local";
  if (
    id.includes("provider") ||
    id.includes("slack") ||
    id.includes("gmail") ||
    id.includes("website")
  ) {
    return "provider_ui";
  }
  return "other";
}

function triggerType(
  trigger: TriggerExplanation | undefined,
  routeSteps: ManifestRouteStep[],
  cadenceEnabled: boolean,
): AgentDomTriggerType {
  switch (trigger?.mode) {
    case "interactive":
      return "client_session";
    case "scheduled":
      // MAR-463: stay consistent with the gated planned_route below — a build
      // whose cadence isn't enabled yet hasn't wired the schedule, even though
      // the plan's route is scheduled. See
      // docs/ADR-MAR-456-scheduled-trigger-manifest-export.md.
      return cadenceEnabled ? "schedule" : "manual";
    case "polling":
      return "poll";
    case "manual":
      return "manual";
    case "event":
      return routeSteps.some(
        (step) =>
          step.component_id === "webhook_trigger" || step.component_id === "github_trigger",
      )
        ? "webhook"
        : "event";
    default:
      return "other";
  }
}

/**
 * MAR-463: when a route is scheduled but cadence isn't enabled for this build
 * yet, the manifest's trigger declaration falls back to a manual/on-demand
 * description instead of the plan's honest "scheduled" explanation — the plan
 * still describes the full agent the user asked for; the manifest describes
 * what this build currently runs. See
 * docs/ADR-MAR-456-scheduled-trigger-manifest-export.md.
 */
function gatedTriggerExplanation(
  trigger: TriggerExplanation | undefined,
  cadenceEnabled: boolean,
): TriggerExplanation | undefined {
  if (!trigger || trigger.mode !== "scheduled" || cadenceEnabled) return trigger;
  return {
    mode: "manual",
    label: "Manual run (cadence not enabled for this build)",
    what_wakes_it_up:
      "The user starts a run. This build's cadence is not wired in yet, even though the plan is scheduled.",
    offline_behavior: "Does not run after the client or runner closes.",
    limitation: `${trigger.limitation} Enable cadence in export_build_brief to wire the schedule into this build.`,
  };
}

function commandsForManifest(input: {
  buildTarget: ManifestBuildTarget;
  runtimeClass: AgentDomRuntimeClass;
  enforcedApprovalGates: string[];
  runtimeRequirements?: RuntimeRequirements;
}): AgentDomCommand[] {
  if (!isSelfHostedBuildTarget(input.buildTarget) || input.runtimeClass === "client_session") {
    return [];
  }
  const approvalCommands: AgentDomCommand[] =
    input.enforcedApprovalGates.length > 0 ||
    input.runtimeRequirements?.durable_approval_needed === true
      ? ["approve", "reject", "choose"]
      : [];
  // Runner start/stop/trigger are deliberately absent: they are lifecycle
  // operations, not Agent DOM commands.
  return [...approvalCommands, "retry", "pause", "resume", "cancel"];
}

type AgentDomLocation = {
  id: string;
  label: string;
  kind: AgentDomLocationKind;
  uri?: string;
  offline_behavior?: string;
};

type AgentDomConnectionField = {
  id: string;
  label: string;
  purpose: string;
  kind: "secret" | "non_secret" | "oauth_reauthorization";
  required: boolean;
  help?: string;
  technical?: {
    environment_name?: string;
    provider_scopes?: string[];
  };
};

type AgentDomConnection = {
  id: string;
  provider: string;
  label: string;
  purpose: string;
  ownership: AgentDomConnectionOwnership;
  capabilities: {
    id: string;
    label: string;
    access: "read" | "write";
  }[];
  fields: AgentDomConnectionField[];
  validation_action: {
    id: string;
    label: string;
    behavior: "test" | "reconnect_test_switch";
  };
};

function connectionOwnership(
  connection: ConnectionRequirement,
): AgentDomConnectionOwnership {
  const actionable = connection.acquisition_paths.find(
    (path) => path.kind === connection.actionable_path_kind,
  );
  switch (actionable?.ownership_location) {
    case "dash":
      return "dash_managed";
    case "external_manager":
      return "external";
    default:
      return "agent_managed";
  }
}

function credentialScopes(credential: CredentialRequirement): string[] {
  if (credential.oauth?.scopes) return [...credential.oauth.scopes];
  if ("required_scopes" in credential.probe) {
    return [...(credential.probe.required_scopes ?? [])];
  }
  return [];
}

function connectionFields(
  connection: ConnectionRequirement,
  ownership: AgentDomConnectionOwnership,
  credentials: CredentialRequirement[],
): AgentDomConnectionField[] {
  if (ownership !== "agent_managed") {
    const actionable = connection.acquisition_paths.find(
      (path) => path.kind === connection.actionable_path_kind,
    );
    return [
      {
        id: stableId(`${connection.connection_id}-authorization`, "authorization"),
        label: `${connection.label} authorization`,
        purpose: connection.grants,
        kind: "oauth_reauthorization",
        required: true,
        ...(actionable?.how ? { help: actionable.how } : {}),
        ...(connection.scopes.length > 0
          ? { technical: { provider_scopes: [...connection.scopes] } }
          : {}),
      },
    ];
  }

  return credentials
    .filter(
      (credential) =>
        credential.required_by.some((componentId) =>
          connection.serves_components.includes(componentId),
        ) &&
        (credential.provider === connection.connection_id ||
          (credential.provider === "google" &&
            (connection.connection_id === "gmail" ||
              connection.connection_id === "google_calendar"))),
    )
    .map((credential) => {
      const scopes = credentialScopes(credential);
      return {
        id: stableId(credential.env, "connection-field"),
        label: credential.label,
        purpose: `Configure ${credential.label} for ${connection.label}.`,
        kind:
          credential.connect === "google_oauth"
            ? "oauth_reauthorization"
            : credential.secret
              ? "secret"
              : "non_secret",
        required: credential.required,
        help: credential.mint_hint,
        technical: {
          environment_name: credential.env,
          ...(scopes.length > 0 ? { provider_scopes: scopes } : {}),
        },
      } satisfies AgentDomConnectionField;
    });
}

/**
 * ADR 0006 (orchestratedash): a manifest asking for both a `remote` runtime
 * and a `dash_managed` connection is a contradiction DASH refuses at import,
 * not at runtime — the broker cannot reach a process it did not spawn. The
 * emitter must not produce what the importer refuses, so a remote runtime
 * downgrades any would-be `dash_managed` ownership to `agent_managed`: the
 * same "holds its own credentials" reading ADR 0006 option 1 gives every
 * connection on an unbrokered runtime. See MAR-486.
 */
function ownershipForRuntime(
  ownership: AgentDomConnectionOwnership,
  runtimeKind: AgentDomLocationKind,
): AgentDomConnectionOwnership {
  return runtimeKind === "remote" && ownership === "dash_managed" ? "agent_managed" : ownership;
}

function agentDomConnections(input: {
  connections: ConnectionRequirement[];
  credentials: CredentialRequirement[];
  routeSteps: ManifestRouteStep[];
  runtimeKind: AgentDomLocationKind;
}): AgentDomConnection[] {
  const routeById = new Map(input.routeSteps.map((step) => [step.component_id, step]));
  return input.connections.map((connection) => {
    const ownership = ownershipForRuntime(connectionOwnership(connection), input.runtimeKind);
    const capabilities = connection.serves_components.map((componentId) => {
      const step = routeById.get(componentId);
      return {
        id: stableId(`${connection.connection_id}.${componentId}`, connection.connection_id),
        label: step?.purpose || step?.component_name || componentId,
        access: step?.connection_access ?? "read",
      };
    });
    if (capabilities.length === 0) {
      capabilities.push({
        id: stableId(`${connection.connection_id}.access`, connection.connection_id),
        label: connection.grants,
        access: "read",
      });
    }
    return {
      id: connection.connection_id,
      provider: connection.connection_id,
      label: connection.label,
      purpose: connection.grants,
      ownership,
      capabilities,
      fields: connectionFields(connection, ownership, input.credentials),
      validation_action: {
        id: stableId(`test-${connection.connection_id}`, "test-connection"),
        label:
          ownership === "dash_managed"
            ? `Reconnect, test, and switch ${connection.label}`
            : `Test ${connection.label} connection`,
        behavior: ownership === "dash_managed" ? "reconnect_test_switch" : "test",
      },
    };
  });
}

function surfaceLocation(
  axis: PlacementAxis | undefined,
  fallback: string,
): AgentDomLocation | null {
  const option = axis?.recommended;
  if (!option) return null;
  return {
    id: stableId(option.id, fallback),
    label: option.label,
    kind: surfaceLocationKind(option.id),
    ...(option.limitation ? { offline_behavior: option.limitation } : {}),
  };
}

/**
 * Components whose step is irreversible (registry risk_level high|critical).
 * These are the ones DASH expects a resolved gate before, and the manifest lists
 * under `safety_contract.irreversible_components`. Deduped, route order preserved.
 */
export function deriveIrreversibleComponents(steps: ManifestRouteStep[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of steps) {
    if (IRREVERSIBLE_RISK.has(coerceRisk(s.risk_level)) && !seen.has(s.component_id)) {
      seen.add(s.component_id);
      out.push(s.component_id);
    }
  }
  return out;
}

// ─────────────────────── plan_workflow observability block ───────────────────

/**
 * Advisory observability guidance surfaced by plan_workflow (MAR-296). Tells the
 * reading agent which run events to wire and where DASH enforces gate compliance,
 * without the MCP ever calling DASH. The full manifest + wiring is emitted by
 * export_build_brief.
 */
export type ObservabilityGuidance = {
  recommended_events: string[];
  gate_events_required_for: string[];
  endpoint_env: string;
  token_env: string;
  note: string;
};

export function buildObservabilityGuidance(
  steps: ManifestRouteStep[],
): ObservabilityGuidance {
  const irreversible = deriveIrreversibleComponents(steps);
  return {
    recommended_events: [...DASH_RUN_EVENTS],
    gate_events_required_for: irreversible,
    endpoint_env: DASH_ENDPOINT_ENV,
    token_env: DASH_TOKEN_ENV,
    note:
      irreversible.length > 0
        ? `Emit a gate_requested → gate_resolved pair before each irreversible step ` +
          `(${irreversible.join(", ")}). DASH flags an irreversible step_started with no ` +
          `preceding resolved gate. Call export_build_brief to get the agent.manifest.json ` +
          `and the event-wiring section for this plan.`
        : `No irreversible steps in this route — the run/step lifecycle events are enough. ` +
          `Call export_build_brief to get the agent.manifest.json and the event-wiring ` +
          `section for this plan.`,
  };
}

// ───────────────────────────── agent.manifest.json ───────────────────────────

export type AgentManifest = {
  manifest_version: typeof MANIFEST_VERSION;
  agent: {
    name: string;
    goal: string;
    plan_source: "playbook" | "composed";
    playbook_id: string;
    route_id: string;
    build_target: ManifestBuildTarget;
  };
  /**
   * MAR-463: "what this build currently runs" — NOT guaranteed to equal
   * plan_workflow's `recommended_route`. When the route contains
   * `scheduled_trigger` and the build's cadence isn't enabled yet (see the
   * `cadence_enabled` input to `buildAgentManifest`/`export_build_brief`),
   * `scheduled_trigger` is excluded here and `agent_dom.trigger` falls back to
   * a manual/on-demand declaration, even though the plan itself stays
   * scheduled. Consumers (DASH's `lib/analyze.ts` included) must not diff this
   * 1:1 against the plan's route — see
   * docs/ADR-MAR-456-scheduled-trigger-manifest-export.md.
   */
  planned_route: {
    step: number;
    component_id: string;
    risk_level: ManifestRisk;
    model_tier: ManifestTier;
  }[];
  safety_contract: {
    automation_clearance: ManifestClearance;
    enforced_approval_gates: string[];
    irreversible_components: string[];
  };
  monitoring: {
    events: string[];
    endpoint_env: string;
    token_env: string;
    output_location: string;
  };
  /**
   * MAR-383: the connection contract, so the DASH Connection Center can render
   * an imported agent's connection rows — service, what it grants, ranked
   * acquisition paths, and where the token lives — straight from the manifest
   * without a second contract or a round-trip to plan_workflow.
   *
   * Metadata only. No secret, no token, and no credential VALUE is ever written
   * here: the manifest is a client-readable artifact, and DASH-08's acceptance
   * forbids secrets in manifests.
   */
  connections: ConnectionRequirement[];
  provenance: {
    generated_by: string;
    registry_fingerprint: string;
    generated_at: string;
  };
  agent_dom: {
    dom_version: 1;
    runtime: {
      class: AgentDomRuntimeClass;
      provider?: string;
      label: string;
      availability: AgentDomAvailability;
      continues_when_dash_closed: boolean;
    };
    trigger: {
      type: AgentDomTriggerType;
      label: string;
      schedule?: string;
      technical?: Record<string, unknown>;
    };
    /**
     * Agent DOM state is read through the declared control location (GET in the
     * v0 transport profile); the canonical schema has no separate `state`
     * location and this emitter does not invent one.
     */
    locations: {
      runtime: AgentDomLocation;
      control: AgentDomLocation[];
      interaction: AgentDomLocation[];
    };
    connections: AgentDomConnection[];
    control: {
      supported: boolean;
      command_version: 1;
      location_id?: string;
      commands: AgentDomCommand[];
    };
    memory: {
      id: string;
      label: string;
      description: string;
      visibility: "user_visible";
      retention: "descriptor_only" | "user_approved";
    }[];
  };
};

/** Slug for `agent.name` — hyphenated, ≤60 chars, never empty. */
export function agentSlug(playbookId: string, goal: string): string {
  const source = playbookId || goal;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "agent";
}

/**
 * Build the `agent.manifest.json` for a plan (MAR-296). Deterministic: every
 * field comes from the plan (route, safety contract, provenance fingerprint) or
 * the user-stated output_location — no network, no LLM. `generated_at` is the
 * only non-reproducible field; it is injectable so tests/snapshots stay stable.
 */
export function buildAgentManifest(input: {
  goal: string;
  plan_source: "playbook" | "composed";
  playbook_id: string;
  route_id: string;
  build_target: ManifestBuildTarget;
  route_steps: ManifestRouteStep[];
  automation_clearance: ManifestClearance;
  enforced_approval_gates: string[];
  output_location: string;
  registry_fingerprint: string;
  agent_name?: string;
  generated_at?: string;
  /** MAR-383 connection contract (metadata only — never a credential value). */
  connections?: ConnectionRequirement[];
  /** MAR-364 credential requirements (metadata only — values never enter MCP). */
  credential_requirements?: CredentialRequirement[];
  /** MAR-378 placement facts; omitted calls receive conservative unknown/read-only values. */
  runtime_requirements?: RuntimeRequirements;
  runtime_recommendation?: RuntimeOption;
  control_surface?: PlacementAxis;
  interaction_surface?: PlacementAxis;
  trigger_explanation?: TriggerExplanation;
  /**
   * MAR-463: whether this build's schedule is wired and enabled yet. Absent
   * or false excludes `scheduled_trigger` from `planned_route` and declares a
   * manual/on-demand `agent_dom.trigger`, even when the route/trigger are
   * scheduled — DASH's News Scout (MAR-457) is deliberately manual-run-first,
   * with cadence an opt-in second step. Set true once cadence is actually
   * enabled to export `scheduled_trigger` and a schedule-typed trigger. See
   * docs/ADR-MAR-456-scheduled-trigger-manifest-export.md.
   */
  cadence_enabled?: boolean;
}): AgentManifest {
  const agentName =
    input.agent_name?.trim() || agentSlug(input.playbook_id, input.goal);
  const cadenceEnabled = input.cadence_enabled === true;
  const effectiveTrigger = gatedTriggerExplanation(input.trigger_explanation, cadenceEnabled);
  const plannedRouteSteps = input.route_steps.filter(
    (s) => cadenceEnabled || s.component_id !== "scheduled_trigger",
  );
  const runtimeClass = agentDomRuntimeClass(input.runtime_recommendation?.runtime_class);
  const runtimeKind = runtimeLocationKind(runtimeClass);
  const commands = commandsForManifest({
    buildTarget: input.build_target,
    runtimeClass,
    enforcedApprovalGates: input.enforced_approval_gates,
    runtimeRequirements: input.runtime_requirements,
  });
  const supported = commands.length > 0;
  const declaredControl = surfaceLocation(input.control_surface, `${agentName}-control`);
  const controlLocation: AgentDomLocation | null =
    declaredControl ??
    (supported
      ? {
          id: `${agentName}-agent-dom`,
          label: "Agent DOM control adapter",
          kind: runtimeKind,
          offline_behavior: "State and commands are unavailable while the agent runtime is offline.",
        }
      : null);
  const interactionLocation = surfaceLocation(
    input.interaction_surface,
    `${agentName}-interaction`,
  );
  const connections = input.connections ?? [];

  return {
    manifest_version: MANIFEST_VERSION,
    agent: {
      name: agentName,
      goal: input.goal,
      plan_source: input.plan_source,
      playbook_id: input.playbook_id,
      route_id: input.route_id,
      build_target: input.build_target,
    },
    planned_route: plannedRouteSteps.map((s, index) => ({
      step: index + 1,
      component_id: s.component_id,
      risk_level: coerceRisk(s.risk_level),
      model_tier: coerceTier(s.model_tier),
    })),
    safety_contract: {
      automation_clearance: input.automation_clearance,
      enforced_approval_gates: input.enforced_approval_gates,
      irreversible_components: deriveIrreversibleComponents(input.route_steps),
    },
    monitoring: {
      events: [...DASH_RUN_EVENTS],
      endpoint_env: DASH_ENDPOINT_ENV,
      token_env: DASH_TOKEN_ENV,
      output_location: input.output_location,
    },
    connections,
    provenance: {
      generated_by: MANIFEST_GENERATED_BY,
      registry_fingerprint: input.registry_fingerprint,
      generated_at: input.generated_at ?? new Date().toISOString(),
    },
    agent_dom: {
      dom_version: 1,
      runtime: {
        class: runtimeClass,
        label: input.runtime_recommendation?.label || "Runtime not declared in this export",
        availability: agentDomAvailability(runtimeClass, input.runtime_requirements),
        continues_when_dash_closed:
          input.runtime_recommendation?.continues_when_dash_closed ?? false,
      },
      trigger: {
        type: triggerType(effectiveTrigger, input.route_steps, cadenceEnabled),
        label: effectiveTrigger?.label || "Trigger not declared in this export",
        ...(effectiveTrigger
          ? {
              technical: {
                what_wakes_it_up: effectiveTrigger.what_wakes_it_up,
                offline_behavior: effectiveTrigger.offline_behavior,
                limitation: effectiveTrigger.limitation,
              },
            }
          : {}),
      },
      locations: {
        runtime: {
          id: `${agentName}-runtime`,
          label: input.runtime_recommendation?.label || "Runtime not declared in this export",
          kind: runtimeKind,
          offline_behavior:
            input.runtime_recommendation?.offline_behavior ||
            "Runtime availability was not declared in this export.",
        },
        control: controlLocation ? [controlLocation] : [],
        interaction: interactionLocation ? [interactionLocation] : [],
      },
      connections: agentDomConnections({
        connections,
        credentials: input.credential_requirements ?? [],
        routeSteps: input.route_steps,
        runtimeKind,
      }),
      control: {
        supported,
        command_version: 1,
        ...(supported && controlLocation ? { location_id: controlLocation.id } : {}),
        commands,
      },
      // Runtime state is not automatically user-visible memory. A future plan
      // may declare grounded memory categories; absence stays explicit today.
      memory: [],
    },
  };
}
