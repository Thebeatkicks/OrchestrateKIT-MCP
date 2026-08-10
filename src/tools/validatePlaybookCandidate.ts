/**
 * validate_playbook_candidate (MAR-169) — the playbook factory's gate.
 *
 * Read-only, deterministic, stateless. Takes a candidate playbook YAML and
 * checks it against the live registry + the Definition of Done, and reports
 * which lifecycle stage it qualifies for (draft → candidate → beta). It NEVER
 * writes to the registry and NEVER certifies `validated`/`published` itself:
 * those require evidence (real Lab sessions + a benchmark prompt + logged ships)
 * that a stateless advisor cannot see — that half lives in the private Lab
 * (/promote queue) and the flywheel. We report exactly what we can verify and
 * name what the Lab must confirm.
 */
import { z } from "zod";
import { load as parseYaml } from "js-yaml";
import type { McpServer } from "@modelcontextprotocol/server";
import { loadRegistry } from "../registry/registryProvider.js";
import { PlaybookSchema, type Playbook } from "../registry/playbookSchema.js";
import { RouteSchema } from "../registry/routeSchema.js";
import { lintLoopPlaybooks } from "../registry/registryLint.js";
import { routeLagsBehindPlaybook } from "../registry/lifecycleStatus.js";
import type { RegistrySnapshot } from "../graph/routeComposer.js";
import { toErrorResult } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { ValidatePlaybookCandidateOutputShape } from "./outputSchemas.js";

export type DodCheck = {
  id: number;
  label: string;
  /** true = met, false = not met, "unverifiable" = needs Lab evidence. */
  ok: boolean | "unverifiable";
  detail?: string;
};

export type PlaybookValidation = {
  status: "ok" | "invalid_yaml" | "schema_invalid";
  playbook_id: string | null;
  /** Highest lifecycle stage the STRUCTURAL DoD supports (MCP-certifiable). */
  qualifies_for: "draft" | "candidate" | "beta" | null;
  dod: DodCheck[];
  missing_components: string[];
  invalid_edges: string[];
  /** Structural DoD items still blocking a higher stage. */
  blocking: string[];
  /** DoD items only the Lab can confirm (sessions, benchmark, ships). */
  evidence_required: string[];
  summary_markdown: string;
  next_recommended_tools: string[];
  /** Present only when `route_yaml` was supplied (MAR-530 atomic-pair certification). */
  route?: RouteValidation;
  /** The pair's certifiable ceiling — the lower of the playbook's and route's own qualifies_for. Present only alongside `route`. */
  pair_qualifies_for?: "draft" | "candidate" | "beta" | null;
  /** True when the playbook's declared status is already ahead of its route's declared status — the exact MAR-530 failure. Refused here with a sentence; never a throw from the loader. */
  pair_status_mismatch?: boolean;
};

export type RouteValidation = {
  status: "ok" | "invalid_yaml" | "schema_invalid";
  route_id: string | null;
  /** The route's own declared status, as written in the supplied YAML. */
  route_status: string | null;
  /** Highest lifecycle stage the route's STRUCTURAL DoD supports. */
  qualifies_for: "candidate" | "beta" | null;
  missing_components: string[];
  invalid_edges: string[];
  blocking: string[];
};

/** Stage rank shared by the playbook and (the certifiable subset of) the route ladder. */
const STAGE_RANK: Record<"draft" | "candidate" | "beta", number> = {
  draft: 0,
  candidate: 1,
  beta: 2,
};
function rankToStage(rank: number): "draft" | "candidate" | "beta" {
  return rank <= 0 ? "draft" : rank === 1 ? "candidate" : "beta";
}

/**
 * Structural DoD for a route candidate (MAR-530) — the route-side half of
 * atomic-pair certification. Mirrors the playbook DoD's shape but scoped to
 * what a route YAML actually declares: components/edges must resolve against
 * the live registry, and a route needs real failure-mode/eval coverage before
 * it can certify past "candidate". Never certifies past "beta" — same ceiling
 * as the playbook side, for the same reason (validated/published need Lab
 * evidence a stateless advisor cannot see).
 */
export function validateRouteCandidate(
  yamlText: string,
  registry: RegistrySnapshot,
): RouteValidation {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return invalidRoute("invalid_yaml", `YAML failed to parse: ${msg}`);
  }
  if (typeof raw !== "object" || raw === null) {
    return invalidRoute("invalid_yaml", "YAML did not parse to a route object.");
  }

  const parsed = RouteSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `\`${i.path.join(".") || "(root)"}\`: ${i.message}`)
      .join("; ");
    return invalidRoute("schema_invalid", `Schema validation failed: ${issues}`);
  }
  const route = parsed.data;

  const componentIds = new Set(registry.components.map((c) => c.id));
  const edgeIds = new Set(registry.edges.map((e) => e.id));
  const missing_components = route.components.filter((c) => !componentIds.has(c));
  const invalid_edges = route.edges.filter((e) => !edgeIds.has(e));
  const refsOk = missing_components.length === 0 && invalid_edges.length === 0;
  const betaOk = refsOk && route.failure_modes.length >= 3 && route.evals.length >= 2;

  const blocking: string[] = [];
  if (missing_components.length > 0) {
    blocking.push(`missing components: ${missing_components.join(", ")}`);
  }
  if (invalid_edges.length > 0) {
    blocking.push(`invalid edges: ${invalid_edges.join(", ")}`);
  }
  if (refsOk && !betaOk) {
    if (route.failure_modes.length < 3) {
      blocking.push(`needs ≥3 failure_modes (has ${route.failure_modes.length})`);
    }
    if (route.evals.length < 2) {
      blocking.push(`needs ≥2 evals (has ${route.evals.length})`);
    }
  }

  return {
    status: "ok",
    route_id: route.id,
    route_status: route.status,
    qualifies_for: betaOk ? "beta" : refsOk ? "candidate" : null,
    missing_components,
    invalid_edges,
    blocking,
  };
}

function invalidRoute(status: "invalid_yaml" | "schema_invalid", message: string): RouteValidation {
  return {
    status,
    route_id: null,
    route_status: null,
    qualifies_for: null,
    missing_components: [],
    invalid_edges: [],
    blocking: [message],
  };
}

const APPROVAL_WORDS = ["approval", "human", "gate", "sign-off", "sign off", "review"];

/** Components that perform a gated external write and so REQUIRE an approval policy. */
const GATED_WRITE_COMPONENTS = new Set([
  "external_publish",
  "crm_note_write",
  "calendar_write",
  "accounting_write",
  "optional_email_send",
  "slack_notification",
]);

/**
 * DoD #8: risk + approval policy explicit. A playbook with no gated-write
 * component needs no approval gate — risk_level alone is the explicit policy.
 * One that DOES write externally must declare an approval policy (an
 * approval_required_for entry, a human_approval_gate component, or a guardrail).
 */
function approvalPolicyOk(pb: Playbook): boolean {
  const hasGatedWrite = pb.components.some((c) => GATED_WRITE_COMPONENTS.has(c));
  if (!hasGatedWrite) return true;
  const perms = pb.permissions as { approval_required_for?: unknown };
  const approvalList = Array.isArray(perms.approval_required_for)
    ? perms.approval_required_for
    : [];
  if (approvalList.length > 0) return true;
  if (pb.components.includes("human_approval_gate")) return true;
  return pb.guardrails.some((g) =>
    APPROVAL_WORDS.some((w) => g.toLowerCase().includes(w)),
  );
}

/**
 * Validate a candidate playbook against the registry + Definition of Done.
 * Pure given a registry snapshot; the registry is the source of truth for which
 * component/edge ids exist.
 */
export function validatePlaybookCandidate(
  yamlText: string,
  registry: RegistrySnapshot & { workers?: { id: string; role: string }[] },
  /** Optional companion route YAML (MAR-530) — supply it to certify the playbook + its golden-path route as an atomic pair. */
  routeYamlText?: string,
): PlaybookValidation {
  // ── parse ──
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return invalid("invalid_yaml", `YAML failed to parse: ${msg}`);
  }
  if (typeof raw !== "object" || raw === null) {
    return invalid("invalid_yaml", "YAML did not parse to a playbook object.");
  }

  // ── schema ──
  const parsed = PlaybookSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `\`${i.path.join(".") || "(root)"}\`: ${i.message}`)
      .join("; ");
    return invalid("schema_invalid", `Schema validation failed: ${issues}`);
  }
  const pb = parsed.data;

  // ── cross-references ──
  const componentIds = new Set(registry.components.map((c) => c.id));
  const edgeIds = new Set(registry.edges.map((e) => e.id));
  const missing_components = pb.components.filter((c) => !componentIds.has(c));
  const invalid_edges = pb.edges.filter((e) => !edgeIds.has(e));
  const refsOk = missing_components.length === 0 && invalid_edges.length === 0;

  // loop playbooks must satisfy the MAR-167 guardrails too
  const loopErrors = pb.loop_contract
    ? lintLoopPlaybooks([pb], (registry.workers ?? []) as never)
    : [];

  // ── Definition of Done (10 items) ──
  const dod: DodCheck[] = [
    check(1, "≥5 components", pb.components.length >= 5, `${pb.components.length} components`),
    check(2, "≥5 failure modes", pb.failure_modes.length >= 5, `${pb.failure_modes.length} failure_modes`),
    check(3, "≥5 evals", pb.evals.length >= 5, `${pb.evals.length} evals`),
    { id: 4, label: "≥2-3 real Lab sessions", ok: "unverifiable", detail: "confirm in the Lab — stateless advisor cannot see sessions" },
    { id: 5, label: "≥1 benchmark prompt", ok: "unverifiable", detail: "confirm in the Lab / benchmarks — not present in the YAML" },
    check(6, "all components exist", missing_components.length === 0, missing_components.length ? `missing: ${missing_components.join(", ")}` : "all present"),
    check(7, "all edges exist", invalid_edges.length === 0, invalid_edges.length ? `invalid: ${invalid_edges.join(", ")}` : "all present"),
    check(8, "risk level + approval policy explicit", Boolean(pb.risk_level) && approvalPolicyOk(pb), approvalPolicyOk(pb) ? `risk=${pb.risk_level}, approval policy explicit` : `risk=${pb.risk_level}, gated write present but NO explicit approval policy`),
    check(9, "LLM-driven vs deterministic steps separated", pb.deterministic_steps.length > 0 || pb.llm_driven_steps.length > 0, `${pb.llm_driven_steps.length} llm / ${pb.deterministic_steps.length} deterministic`),
    check(10, "sources / internal evidence present", pb.sources.length >= 1, `${pb.sources.length} source(s)`),
  ];

  // loop guardrail failures fold into DoD #8 (approval/safety policy)
  if (loopErrors.length > 0) {
    dod.push(check(11, "loop_contract guardrails (MAR-167)", false, loopErrors.map((e) => e.message).join("; ")));
  }

  // ── lifecycle qualification (structural only) ──
  const structuralDod = dod.filter((d) => d.ok !== "unverifiable");
  const candidateOk = refsOk && bool(dod, 8) && loopErrors.length === 0;
  const betaOk =
    candidateOk &&
    bool(dod, 1) && bool(dod, 2) && bool(dod, 3) && bool(dod, 9) && bool(dod, 10);

  const qualifies_for: PlaybookValidation["qualifies_for"] = betaOk
    ? "beta"
    : candidateOk
    ? "candidate"
    : "draft";

  const blocking = structuralDod.filter((d) => d.ok === false).map((d) => `#${d.id} ${d.label}${d.detail ? ` (${d.detail})` : ""}`);
  const evidence_required = dod
    .filter((d) => d.ok === "unverifiable")
    .map((d) => `#${d.id} ${d.label} — ${d.detail}`);

  // ── MAR-530: atomic-pair certification against the golden-path route ──
  // Nothing else in the MCP can certify a route. Supplying route_yaml here
  // certifies the PAIR: the ceiling is the lower of what each side
  // structurally qualifies for, and a playbook already declared ahead of its
  // route's declared status is refused with a sentence — never a throw.
  let route: RouteValidation | undefined;
  let pair_qualifies_for: PlaybookValidation["qualifies_for"] | undefined;
  let pair_status_mismatch: boolean | undefined;
  if (routeYamlText !== undefined) {
    route = validateRouteCandidate(routeYamlText, registry);
    if (route.status !== "ok") {
      pair_qualifies_for = null;
      blocking.push(`route candidate invalid: ${route.blocking.join("; ")}`);
    } else {
      pair_status_mismatch = routeLagsBehindPlaybook(pb.status, route.route_status ?? "");
      if (pair_status_mismatch) {
        blocking.push(
          `Playbook status "${pb.status}" can go visible without its golden-path route's declared status "${route.route_status}" — certify the pair atomically. Promote the route to at least "${pb.status}" first, or hold the playbook at "${route.route_status}".`,
        );
      }
      pair_qualifies_for =
        route.qualifies_for === null
          ? null
          : rankToStage(Math.min(STAGE_RANK[qualifies_for], STAGE_RANK[route.qualifies_for]));
    }
  }

  return {
    status: "ok",
    playbook_id: pb.id,
    qualifies_for,
    dod,
    missing_components,
    invalid_edges,
    blocking,
    evidence_required,
    summary_markdown: renderMarkdown(pb.id, qualifies_for, dod, blocking, evidence_required, route, pair_qualifies_for, pb.golden_path_route_id),
    next_recommended_tools: ["get_playbook", "get_route", "explain_component"],
    ...(route !== undefined ? { route, pair_qualifies_for, pair_status_mismatch } : {}),
  };
}

// ── helpers ──
function check(id: number, label: string, ok: boolean, detail?: string): DodCheck {
  return { id, label, ok, detail };
}
function bool(dod: DodCheck[], id: number): boolean {
  return dod.find((d) => d.id === id)?.ok === true;
}
function invalid(status: "invalid_yaml" | "schema_invalid", message: string): PlaybookValidation {
  return {
    status,
    playbook_id: null,
    qualifies_for: null,
    dod: [],
    missing_components: [],
    invalid_edges: [],
    blocking: [message],
    evidence_required: [],
    summary_markdown: `## ❌ Candidate ${status === "invalid_yaml" ? "is not valid YAML" : "fails schema validation"}\n\n${message}`,
    next_recommended_tools: ["get_playbook"],
  };
}
function renderMarkdown(
  id: string,
  stage: PlaybookValidation["qualifies_for"],
  dod: DodCheck[],
  blocking: string[],
  evidence: string[],
  route?: RouteValidation,
  pairStage?: PlaybookValidation["qualifies_for"],
  goldenPathRouteId?: string,
): string {
  const icon = (ok: boolean | "unverifiable") => (ok === true ? "✅" : ok === false ? "❌" : "🔍");
  const lines = [
    `## Playbook candidate \`${id}\` → qualifies for: **${stage}**`,
    ``,
    `Lifecycle: draft → candidate → beta → validated → published. A stateless advisor ` +
      `can certify up to **beta** (structure). \`validated\`/\`published\` need Lab evidence.`,
    ``,
    `### Definition of Done`,
    ``,
  ];
  for (const d of dod) lines.push(`- ${icon(d.ok)} #${d.id} ${d.label}${d.detail ? ` — ${d.detail}` : ""}`);
  lines.push(``);
  if (blocking.length > 0) {
    lines.push(`### ❌ Blocking a higher stage`, ``, ...blocking.map((b) => `- ${b}`), ``);
  }
  if (evidence.length > 0) {
    lines.push(`### 🔍 Needs Lab evidence (we never fake this)`, ``, ...evidence.map((e) => `- ${e}`), ``);
  }
  if (route) {
    lines.push(
      `### 🔗 Golden-path route pair (MAR-530)`,
      ``,
      `Route \`${route.route_id ?? "?"}\` (declared status: ${route.route_status ?? "?"}) qualifies for: **${route.qualifies_for ?? "none — broken references"}**.`,
      `**Pair ceiling: ${pairStage ?? "null"}** — the lower of the playbook's and route's own qualifies_for. Certify both to the same status together; never promote one without the other.`,
      ``,
    );
    if (route.blocking.length > 0) {
      lines.push(...route.blocking.map((b) => `- ❌ route: ${b}`), ``);
    }
  } else if (goldenPathRouteId) {
    lines.push(
      `### 🔗 Golden-path route`,
      ``,
      `Pass \`route_yaml\` alongside \`playbook_yaml\` to certify the playbook and its golden-path route as an atomic pair (MAR-530) — a route left behind makes the pair impossible to promote safely.`,
      ``,
    );
  }
  return lines.join("\n");
}

// ── registration ──
const InputShape = {
  playbook_yaml: z.string().min(1).describe(
    "The candidate playbook as YAML text (same shape as registry/playbooks/*.playbook.yaml). " +
    "Validated against the live registry and the Definition of Done.",
  ),
  route_yaml: z.string().min(1).optional().describe(
    "Optional companion golden-path route YAML (same shape as registry/routes/*.route.yaml). " +
    "Supply it to certify the playbook and its route as an atomic pair (MAR-530): the reported " +
    "qualifies_for becomes the lower of what each side structurally qualifies for, and a " +
    "playbook whose declared status already sits ahead of its route's is refused with a " +
    "sentence — never promote a playbook past its still-lagging route.",
  ),
};

export function registerValidatePlaybookCandidate(server: McpServer): void {
  server.registerTool(
    "validate_playbook_candidate",
    {
      title: "Validate Playbook Candidate",
      description:
        "Deterministic, read-only gate for the playbook factory. Give it a candidate " +
        "playbook YAML and it checks the Definition of Done against the live registry — " +
        "missing components, invalid edges, missing failure modes/evals, risk + approval " +
        "policy, LLM-vs-deterministic separation, sources — and reports which lifecycle " +
        "stage it qualifies for (draft → candidate → beta). It never writes to the registry " +
        "and never certifies validated/published (those need Lab evidence it cannot see). " +
        "Pass the optional route_yaml to certify the playbook + its golden-path route together " +
        "as an atomic pair (MAR-530) — the only way anything in the MCP certifies a route.",
      inputSchema: InputShape,
      outputSchema: ValidatePlaybookCandidateOutputShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        const registry = loadRegistry({ includeBeta: true, includeCandidates: true });
        const result = validatePlaybookCandidate(input.playbook_yaml, registry, input.route_yaml);
        logger.debug(
          `validate_playbook_candidate → status=${result.status} qualifies=${result.qualifies_for}`,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err) {
        logger.error("validate_playbook_candidate failed", err);
        return toErrorResult(err);
      }
    },
  );
}
