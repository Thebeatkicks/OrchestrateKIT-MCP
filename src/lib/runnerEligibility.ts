/**
 * Public-runner eligibility policy (MAR-460).
 *
 * A *reachable* DASH Agent Runner is not therefore an *eligible* one. Reaching a
 * runner proves it answers; it proves nothing about where it executes, who holds
 * its credentials, what it is exposed to, whether it can be stopped, whether a
 * run can be cancelled, whether anything is recorded, or whether approval gates
 * are enforced when nobody is watching. Before MAR-460 the build brief asserted
 * a runner "can validate and host" a build with no capability evidence at all —
 * the exact guess this module removes.
 *
 * The security property this file exists to hold:
 *
 *   **An absent capability record and a negative capability record never share
 *   a code path.**
 *
 * "The runner does not do X" (negative evidence) and "nobody has said whether
 * the runner does X" (no evidence) are different facts with different remedies —
 * the first is a runner to reject, the second is a question to ask. Collapsing
 * them into one boolean is how a default-deny gate quietly becomes default-allow:
 * once absence reads as `false`, a caller who "fixes" the false by supplying a
 * bare `true` has satisfied the gate without ever producing evidence. So the
 * assessment is tri-state (`satisfied` / `refuted` / `unproven`) end to end, and
 * the decision distinguishes `ineligible` (evidence says no) from
 * `needs_evidence` (nothing said). Every presence fixture in
 * `tests/lib/runnerEligibility.test.ts` is paired with an absence fixture, per
 * CONTRIBUTING's grounded-prose rule.
 *
 * Fail closed: the default — no profile, empty profile, malformed profile — is
 * `needs_evidence`. There is no input to this module that yields `eligible`
 * without a positive, sourced record for every dimension the posture requires.
 *
 * STATELESS: no network calls, no probing. This module never asks a runner
 * anything; it only judges records a caller supplies.
 */

export const RUNNER_ELIGIBILITY_CONTRACT = "orchestratekit.runner_eligibility.v1" as const;

/**
 * How exposed the agent this runner would host is meant to be. Eligibility is
 * always scoped to a posture — "eligible" on its own is not a claim this module
 * can make, because the checks that matter differ between a human watching each
 * run and an agent reachable by people who do not own it.
 */
export type RunnerPosture = "attended" | "unattended" | "public";

/** The capability dimensions MAR-460 requires a runner to have evidence for. */
export type RunnerCapabilityDimension =
  | "runtime_location"
  | "credential_custody"
  | "network_exposure"
  | "lifecycle_control"
  | "cancellation"
  | "audit_trail"
  | "approval_enforcement";

export const RUNNER_CAPABILITY_DIMENSIONS = [
  "runtime_location",
  "credential_custody",
  "network_exposure",
  "lifecycle_control",
  "cancellation",
  "audit_trail",
  "approval_enforcement",
] as const satisfies readonly RunnerCapabilityDimension[];

/**
 * A caller-supplied attestation about one dimension.
 *
 * `evidence` is not decoration: an attestation with no source is not evidence,
 * and is scored `unproven` in BOTH directions (see `readRecord`). That keeps
 * CONTRIBUTING's "never let a model narrate provenance" rule enforceable here —
 * a record either names where the fact came from or it does not count.
 */
export type RunnerCapabilityRecord = {
  /** Whether the runner is attested to HAVE the capability. */
  supported: boolean;
  /** Where this attestation came from (registration record, operator, probe). */
  evidence: string;
};

/**
 * Records for some or all dimensions. A missing key means "nobody said" — it is
 * NOT shorthand for `{ supported: false }`, and `assessRunnerEligibility` is
 * required to keep those apart.
 */
export type RunnerCapabilityProfile = Partial<
  Record<RunnerCapabilityDimension, RunnerCapabilityRecord>
>;

export type RunnerCapabilityStatus = "satisfied" | "refuted" | "unproven";

export type RunnerEligibilityDecision = "eligible" | "ineligible" | "needs_evidence";

export type RunnerCapabilityFinding = {
  dimension: RunnerCapabilityDimension;
  status: RunnerCapabilityStatus;
  /** Whether this dimension gates the decision at the assessed posture. */
  required: boolean;
  /** What the posture needs proven — fixed text, not derived from the record. */
  requirement: string;
  /** The record's own source string; `null` exactly when nothing was supplied. */
  evidence: string | null;
  /** One sentence entailed by THIS status alone (grounded-prose rule). */
  detail: string;
};

export type RunnerEligibilityAssessment = {
  contract: typeof RUNNER_ELIGIBILITY_CONTRACT;
  posture: RunnerPosture;
  decision: RunnerEligibilityDecision;
  /**
   * Recorded so a reader can see reachability and eligibility disagree. It is
   * deliberately NOT an input to `decision` — MAR-460 exists because a reachable
   * runner was being treated as an eligible one. `null` when unstated.
   */
  runner_reachable: boolean | null;
  /** All seven dimensions, always, in `RUNNER_CAPABILITY_DIMENSIONS` order. */
  findings: RunnerCapabilityFinding[];
  required_dimensions: RunnerCapabilityDimension[];
  /** Required dimensions with negative evidence — these make it `ineligible`. */
  refuted_dimensions: RunnerCapabilityDimension[];
  /** Required dimensions with no usable record — these make it `needs_evidence`. */
  missing_evidence: RunnerCapabilityDimension[];
  /** Negative evidence outside the required set: reported, never decisive. */
  advisories: string[];
  /** Assembled from the findings above, never free prose over them. */
  rationale: string;
};

type DimensionSpec = {
  requirement: string;
  satisfied: string;
  refuted: string;
  unproven: string;
};

/**
 * Fixed prose per dimension per status. Three separate sentences rather than one
 * templated sentence with a negation spliced in, so an `unproven` finding can
 * never render as a weaker phrasing of a `refuted` one.
 */
const DIMENSION_SPECS: Record<RunnerCapabilityDimension, DimensionSpec> = {
  runtime_location: {
    requirement: "The runner declares where it executes and on whose hardware.",
    satisfied: "The runner's execution location is declared and sourced.",
    refuted: "The runner does not declare where it executes.",
    unproven: "No record states where this runner executes.",
  },
  credential_custody: {
    requirement:
      "The runner declares who holds the agent's credentials and how they are scoped.",
    satisfied: "Credential custody and scoping are declared and sourced.",
    refuted: "The runner does not declare who holds the agent's credentials.",
    unproven: "No record states who holds this runner's credentials.",
  },
  network_exposure: {
    requirement:
      "The runner declares what network surface it exposes and who can reach it.",
    satisfied: "The runner's network exposure is declared and sourced.",
    refuted: "The runner does not constrain or declare its network exposure.",
    unproven: "No record states what network surface this runner exposes.",
  },
  lifecycle_control: {
    requirement: "The runner exposes a start/stop lifecycle its owner controls.",
    satisfied: "Owner-controlled start/stop is declared and sourced.",
    refuted: "The runner does not expose an owner-controlled start/stop lifecycle.",
    unproven: "No record states whether this runner can be started and stopped by its owner.",
  },
  cancellation: {
    requirement: "The runner can cancel an in-flight run and report the outcome.",
    satisfied: "In-flight cancellation is declared and sourced.",
    refuted: "The runner cannot cancel an in-flight run.",
    unproven: "No record states whether this runner can cancel an in-flight run.",
  },
  audit_trail: {
    requirement: "The runner records an attributable audit trail of what each run did.",
    satisfied: "An attributable per-run audit trail is declared and sourced.",
    refuted: "The runner does not record an attributable per-run audit trail.",
    unproven: "No record states whether this runner keeps a per-run audit trail.",
  },
  approval_enforcement: {
    requirement:
      "The runner enforces the plan's approval gates before irreversible steps.",
    satisfied: "Approval-gate enforcement is declared and sourced.",
    refuted: "The runner does not enforce the plan's approval gates.",
    unproven: "No record states whether this runner enforces approval gates.",
  },
};

const ATTENDED_REQUIRED = [
  "runtime_location",
  "credential_custody",
  "audit_trail",
] as const satisfies readonly RunnerCapabilityDimension[];

/**
 * Which dimensions gate the decision, per posture. A ratchet — each posture
 * requires everything the one before it did, plus what its own exposure adds:
 *
 * - `attended`: a human starts each run and watches it, so the unattended
 *   guarantees below are supplied by that human. What the human cannot supply by
 *   watching is where the code runs, who holds the credentials, and whether
 *   anything was recorded.
 * - `unattended`: nobody is watching, so the runner itself must be stoppable,
 *   must be able to cancel a run in flight, and must enforce the approval gates
 *   a watching human would otherwise enforce.
 * - `public`: parties who do not own the agent can reach it, which is the only
 *   posture where the runner's own network exposure is load-bearing.
 */
const REQUIRED_BY_POSTURE: Record<RunnerPosture, readonly RunnerCapabilityDimension[]> = {
  attended: ATTENDED_REQUIRED,
  unattended: [
    ...ATTENDED_REQUIRED,
    "lifecycle_control",
    "cancellation",
    "approval_enforcement",
  ],
  public: RUNNER_CAPABILITY_DIMENSIONS,
};

/**
 * The single place absence is decided, so it cannot be re-derived differently
 * elsewhere. Returns a record ONLY when it carries a usable boolean and a
 * non-empty source; everything else — missing key, `undefined`, non-boolean
 * `supported`, blank `evidence` — is absence, scored `unproven`.
 *
 * Note the asymmetry that matters: a malformed record does NOT become `refuted`.
 * Refusing a runner requires someone to have actually said "no"; garbage says
 * nothing, and nothing is `unproven`. That keeps a schema slip from silently
 * turning into a hard rejection the caller cannot explain.
 */
function readRecord(
  profile: RunnerCapabilityProfile | undefined,
  dimension: RunnerCapabilityDimension,
): RunnerCapabilityRecord | undefined {
  const record = profile?.[dimension];
  if (!record || typeof record !== "object") return undefined;
  if (typeof record.supported !== "boolean") return undefined;
  if (typeof record.evidence !== "string" || record.evidence.trim() === "") return undefined;
  return { supported: record.supported, evidence: record.evidence.trim() };
}

function statusFor(record: RunnerCapabilityRecord | undefined): RunnerCapabilityStatus {
  if (!record) return "unproven";
  return record.supported ? "satisfied" : "refuted";
}

/** Human-readable dimension label, e.g. `network_exposure` → "network exposure". */
export function runnerDimensionLabel(dimension: RunnerCapabilityDimension): string {
  return dimension.replace(/_/g, " ");
}

/**
 * Judge a runner against a posture. Pure and total: every input — including no
 * input at all — produces a decision, and only a complete set of positive,
 * sourced records for the posture's required dimensions produces `eligible`.
 */
export function assessRunnerEligibility(input: {
  posture: RunnerPosture;
  profile?: RunnerCapabilityProfile;
  /** Context only; see `RunnerEligibilityAssessment.runner_reachable`. */
  runner_reachable?: boolean;
}): RunnerEligibilityAssessment {
  const posture = input.posture;
  const required = REQUIRED_BY_POSTURE[posture];
  const requiredSet = new Set<RunnerCapabilityDimension>(required);

  const findings: RunnerCapabilityFinding[] = RUNNER_CAPABILITY_DIMENSIONS.map((dimension) => {
    const record = readRecord(input.profile, dimension);
    const status = statusFor(record);
    const spec = DIMENSION_SPECS[dimension];
    return {
      dimension,
      status,
      required: requiredSet.has(dimension),
      requirement: spec.requirement,
      evidence: record ? record.evidence : null,
      detail: spec[status],
    };
  });

  const refuted_dimensions = findings
    .filter((f) => f.required && f.status === "refuted")
    .map((f) => f.dimension);
  const missing_evidence = findings
    .filter((f) => f.required && f.status === "unproven")
    .map((f) => f.dimension);

  // Negative evidence outside the required set is real and worth showing, but it
  // is not this posture's business to reject on — saying so explicitly beats
  // either hiding it or letting it silently widen the gate.
  const advisories = findings
    .filter((f) => !f.required && f.status === "refuted")
    .map(
      (f) =>
        `${f.detail} The ${posture} posture does not require ${runnerDimensionLabel(
          f.dimension,
        )}, so this does not change the decision.`,
    );

  const decision: RunnerEligibilityDecision =
    refuted_dimensions.length > 0
      ? "ineligible"
      : missing_evidence.length > 0
      ? "needs_evidence"
      : "eligible";

  return {
    contract: RUNNER_ELIGIBILITY_CONTRACT,
    posture,
    decision,
    runner_reachable: typeof input.runner_reachable === "boolean" ? input.runner_reachable : null,
    findings,
    required_dimensions: [...required],
    refuted_dimensions,
    missing_evidence,
    advisories,
    rationale: rationaleFor(posture, decision, refuted_dimensions, missing_evidence),
  };
}

/**
 * Assembled from the decision and the dimension lists that produced it — never
 * free prose over the findings, so the sentence cannot describe a decision the
 * lists do not support.
 */
function rationaleFor(
  posture: RunnerPosture,
  decision: RunnerEligibilityDecision,
  refuted: RunnerCapabilityDimension[],
  missing: RunnerCapabilityDimension[],
): string {
  const list = (dimensions: RunnerCapabilityDimension[]): string =>
    dimensions.map(runnerDimensionLabel).join(", ");
  switch (decision) {
    case "ineligible":
      return (
        `Not eligible for ${posture} operation: the runner is attested NOT to provide ` +
        `${list(refuted)}.` +
        (missing.length > 0
          ? ` Evidence is also absent for ${list(missing)}.`
          : "")
      );
    case "needs_evidence":
      return (
        `Eligibility for ${posture} operation is undecided: no capability evidence was ` +
        `supplied for ${list(missing)}. Absent evidence is not a pass — supply a sourced ` +
        `record for each, or run this agent attended.`
      );
    case "eligible":
      return (
        `Eligible for ${posture} operation: every capability this posture requires has a ` +
        `positive, sourced record.`
      );
  }
}

/**
 * The §9 build-brief block (MAR-460's "build-brief export showing the decision
 * and evidence"). Renders the decision, then every required dimension with its
 * status and its source — so a reader can audit the judgment, not just read it.
 */
export function summarizeRunnerEligibility(assessment: RunnerEligibilityAssessment): string[] {
  const marker =
    assessment.decision === "eligible"
      ? "✅"
      : assessment.decision === "ineligible"
      ? "⛔"
      : "⚠️";
  const lines = [
    `- **Public-runner eligibility (\`${assessment.posture}\` posture):** ${marker} ` +
      `\`${assessment.decision}\` — ${assessment.rationale}`,
  ];
  if (assessment.runner_reachable === true) {
    lines.push(
      `  - **Reachability is not eligibility:** a runner was declared reachable. That is ` +
        `recorded, and it does not contribute to the decision above.`,
    );
  }
  for (const finding of assessment.findings.filter((f) => f.required)) {
    const status =
      finding.status === "satisfied" ? "✅" : finding.status === "refuted" ? "⛔" : "⚠️";
    lines.push(
      `  - ${status} \`${finding.dimension}\` — ${finding.detail}` +
        (finding.evidence ? ` _(evidence: ${finding.evidence})_` : ""),
    );
  }
  for (const advisory of assessment.advisories) {
    lines.push(`  - ℹ️ ${advisory}`);
  }
  return lines;
}
