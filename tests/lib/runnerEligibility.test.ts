/**
 * MAR-460 — public-runner eligibility must fail closed.
 *
 * The whole point of this suite is the pairing discipline CONTRIBUTING demands:
 * every fixture that proves a capability is accepted has a sibling proving that
 * its ABSENCE is not accepted, and — the part that actually matters here — a
 * sibling proving that absence and refusal do not land in the same place.
 *
 * If someone ever "simplifies" the tri-state into a boolean, the `absent vs
 * negative` block below is what fails.
 */
import { describe, it, expect } from "vitest";
import {
  assessRunnerEligibility,
  RUNNER_CAPABILITY_DIMENSIONS,
  summarizeRunnerEligibility,
  type RunnerCapabilityDimension,
  type RunnerCapabilityProfile,
  type RunnerPosture,
} from "../../src/lib/runnerEligibility.js";

/** A fully-attested profile — the only shape that may ever produce `eligible`. */
function fullProfile(): RunnerCapabilityProfile {
  const profile: RunnerCapabilityProfile = {};
  for (const dimension of RUNNER_CAPABILITY_DIMENSIONS) {
    profile[dimension] = { supported: true, evidence: `registration record: ${dimension}` };
  }
  return profile;
}

function profileWithout(dimension: RunnerCapabilityDimension): RunnerCapabilityProfile {
  const profile = fullProfile();
  delete profile[dimension];
  return profile;
}

function profileRefusing(dimension: RunnerCapabilityDimension): RunnerCapabilityProfile {
  return {
    ...fullProfile(),
    [dimension]: { supported: false, evidence: `operator attestation: ${dimension} not provided` },
  };
}

const POSTURES: RunnerPosture[] = ["attended", "unattended", "public"];

describe("MAR-460 fail-closed default", () => {
  it.each(POSTURES)("no profile at all is needs_evidence, never eligible (%s)", (posture) => {
    const result = assessRunnerEligibility({ posture });
    expect(result.decision).toBe("needs_evidence");
    expect(result.missing_evidence.length).toBeGreaterThan(0);
    expect(result.refuted_dimensions).toEqual([]);
  });

  it.each(POSTURES)("an empty profile is needs_evidence, never eligible (%s)", (posture) => {
    const result = assessRunnerEligibility({ posture, profile: {} });
    expect(result.decision).toBe("needs_evidence");
  });

  it("only a complete, sourced profile reaches eligible", () => {
    // Presence fixture. Its absence sibling is the `no profile` case above.
    const result = assessRunnerEligibility({ posture: "public", profile: fullProfile() });
    expect(result.decision).toBe("eligible");
    expect(result.missing_evidence).toEqual([]);
    expect(result.refuted_dimensions).toEqual([]);
  });

  it("assesses all seven dimensions regardless of posture", () => {
    for (const posture of POSTURES) {
      const result = assessRunnerEligibility({ posture });
      expect(result.findings.map((f) => f.dimension)).toEqual([...RUNNER_CAPABILITY_DIMENSIONS]);
    }
  });
});

describe("MAR-460 absent evidence and negative evidence never collapse", () => {
  // This is the security boundary. Each required dimension is exercised twice:
  // once with the record removed, once with the record present and negative.
  for (const posture of POSTURES) {
    const required = assessRunnerEligibility({ posture }).required_dimensions;

    for (const dimension of required) {
      it(`${posture}/${dimension}: absent evidence is needs_evidence, not ineligible`, () => {
        const result = assessRunnerEligibility({
          posture,
          profile: profileWithout(dimension),
        });
        expect(result.decision).toBe("needs_evidence");
        expect(result.missing_evidence).toEqual([dimension]);
        expect(result.refuted_dimensions).toEqual([]);

        const finding = result.findings.find((f) => f.dimension === dimension)!;
        expect(finding.status).toBe("unproven");
        expect(finding.evidence).toBeNull();
      });

      it(`${posture}/${dimension}: negative evidence is ineligible, not needs_evidence`, () => {
        const result = assessRunnerEligibility({
          posture,
          profile: profileRefusing(dimension),
        });
        expect(result.decision).toBe("ineligible");
        expect(result.refuted_dimensions).toEqual([dimension]);
        expect(result.missing_evidence).toEqual([]);

        const finding = result.findings.find((f) => f.dimension === dimension)!;
        expect(finding.status).toBe("refuted");
        expect(finding.evidence).not.toBeNull();
      });

      it(`${posture}/${dimension}: the two cases produce different prose`, () => {
        const absent = assessRunnerEligibility({ posture, profile: profileWithout(dimension) });
        const refused = assessRunnerEligibility({ posture, profile: profileRefusing(dimension) });
        expect(absent.rationale).not.toBe(refused.rationale);

        const absentDetail = absent.findings.find((f) => f.dimension === dimension)!.detail;
        const refusedDetail = refused.findings.find((f) => f.dimension === dimension)!.detail;
        expect(absentDetail).not.toBe(refusedDetail);
      });
    }
  }

  it("a refutation outranks an absence when both are present", () => {
    const profile = profileRefusing("audit_trail");
    delete profile.credential_custody;
    const result = assessRunnerEligibility({ posture: "public", profile });
    expect(result.decision).toBe("ineligible");
    expect(result.refuted_dimensions).toEqual(["audit_trail"]);
    // The absence is still reported — an ineligible verdict must not swallow the
    // open question, or fixing the refutation would silently promote to eligible.
    expect(result.missing_evidence).toEqual(["credential_custody"]);
    expect(result.rationale).toContain("credential custody");
  });
});

describe("MAR-460 an attestation without a source is not evidence", () => {
  it.each([
    ["blank evidence", { supported: true, evidence: "   " }],
    ["missing evidence", { supported: true } as unknown],
    ["non-boolean supported", { supported: "yes", evidence: "operator" } as unknown],
    ["null record", null as unknown],
  ])("%s is scored unproven, not satisfied and not refuted", (_label, record) => {
    const profile = {
      ...fullProfile(),
      audit_trail: record,
    } as RunnerCapabilityProfile;
    const result = assessRunnerEligibility({ posture: "public", profile });
    expect(result.decision).toBe("needs_evidence");
    expect(result.missing_evidence).toEqual(["audit_trail"]);
    // Specifically NOT ineligible: garbage is not someone saying "no".
    expect(result.refuted_dimensions).toEqual([]);
  });

  it("a negative attestation still needs a source to count as a refutation", () => {
    const profile = {
      ...fullProfile(),
      cancellation: { supported: false, evidence: "" },
    } as RunnerCapabilityProfile;
    const result = assessRunnerEligibility({ posture: "public", profile });
    expect(result.decision).toBe("needs_evidence");
    expect(result.missing_evidence).toEqual(["cancellation"]);
    expect(result.refuted_dimensions).toEqual([]);
  });
});

describe("MAR-460 reachability is not eligibility", () => {
  it("a reachable runner with no capability evidence is still needs_evidence", () => {
    const result = assessRunnerEligibility({ posture: "public", runner_reachable: true });
    expect(result.decision).toBe("needs_evidence");
    expect(result.runner_reachable).toBe(true);
  });

  it("reachability changes nothing about the decision either way", () => {
    const profile = profileWithout("network_exposure");
    const unstated = assessRunnerEligibility({ posture: "public", profile });
    const reachable = assessRunnerEligibility({
      posture: "public",
      profile,
      runner_reachable: true,
    });
    const unreachable = assessRunnerEligibility({
      posture: "public",
      profile,
      runner_reachable: false,
    });
    expect(reachable.decision).toBe(unstated.decision);
    expect(unreachable.decision).toBe(unstated.decision);
    expect(reachable.missing_evidence).toEqual(unstated.missing_evidence);
    expect(unstated.runner_reachable).toBeNull();
  });

  it("a refuted runner is not rescued by being reachable", () => {
    const result = assessRunnerEligibility({
      posture: "public",
      profile: profileRefusing("approval_enforcement"),
      runner_reachable: true,
    });
    expect(result.decision).toBe("ineligible");
  });
});

describe("MAR-460 posture ratchet", () => {
  it("each posture requires everything the looser one did", () => {
    const attended = assessRunnerEligibility({ posture: "attended" }).required_dimensions;
    const unattended = assessRunnerEligibility({ posture: "unattended" }).required_dimensions;
    const publicPosture = assessRunnerEligibility({ posture: "public" }).required_dimensions;

    expect(unattended).toEqual(expect.arrayContaining(attended));
    expect(publicPosture).toEqual(expect.arrayContaining(unattended));
    expect(publicPosture).toHaveLength(RUNNER_CAPABILITY_DIMENSIONS.length);
    expect(attended.length).toBeLessThan(unattended.length);
    expect(unattended.length).toBeLessThan(publicPosture.length);
  });

  it("network exposure gates the public posture and only the public posture", () => {
    // Presence fixture: public rejects the missing dimension.
    expect(
      assessRunnerEligibility({ posture: "public", profile: profileWithout("network_exposure") })
        .decision,
    ).toBe("needs_evidence");
    // Absence fixture: the narrower postures do not invent a requirement.
    expect(
      assessRunnerEligibility({
        posture: "unattended",
        profile: profileWithout("network_exposure"),
      }).decision,
    ).toBe("eligible");
    expect(
      assessRunnerEligibility({ posture: "attended", profile: profileWithout("network_exposure") })
        .decision,
    ).toBe("eligible");
  });

  it("unattended requires the guarantees an attending human would otherwise supply", () => {
    for (const dimension of ["lifecycle_control", "cancellation", "approval_enforcement"] as const) {
      expect(
        assessRunnerEligibility({ posture: "unattended", profile: profileWithout(dimension) })
          .decision,
      ).toBe("needs_evidence");
      expect(
        assessRunnerEligibility({ posture: "attended", profile: profileWithout(dimension) })
          .decision,
      ).toBe("eligible");
    }
  });

  it("reports a non-required refutation as an advisory without changing the decision", () => {
    const result = assessRunnerEligibility({
      posture: "attended",
      profile: profileRefusing("network_exposure"),
    });
    expect(result.decision).toBe("eligible");
    expect(result.refuted_dimensions).toEqual([]);
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]).toContain("does not change the decision");
    // The finding itself still records the refusal — the advisory softens the
    // consequence, never the fact.
    expect(result.findings.find((f) => f.dimension === "network_exposure")!.status).toBe("refuted");
  });

  it("emits no advisory when nothing outside the required set was refuted", () => {
    const result = assessRunnerEligibility({ posture: "attended", profile: fullProfile() });
    expect(result.advisories).toEqual([]);
  });
});

describe("MAR-460 rendered decision block", () => {
  it("states the decision and the source of every required capability", () => {
    const lines = summarizeRunnerEligibility(
      assessRunnerEligibility({ posture: "public", profile: fullProfile() }),
    ).join("\n");
    expect(lines).toContain("`eligible`");
    expect(lines).toContain("evidence: registration record: audit_trail");
  });

  it("names the missing dimensions rather than implying a refusal", () => {
    const lines = summarizeRunnerEligibility(
      assessRunnerEligibility({ posture: "public" }),
    ).join("\n");
    expect(lines).toContain("`needs_evidence`");
    expect(lines).toContain("No record states");
    expect(lines).not.toContain("does not provide");
  });

  it("says reachability did not count, but only when reachability was declared", () => {
    const declared = summarizeRunnerEligibility(
      assessRunnerEligibility({ posture: "public", runner_reachable: true }),
    ).join("\n");
    expect(declared).toContain("Reachability is not eligibility");

    // Absence fixture — an undeclared reachability must not emit the caveat.
    const undeclared = summarizeRunnerEligibility(
      assessRunnerEligibility({ posture: "public" }),
    ).join("\n");
    expect(undeclared).not.toContain("Reachability is not eligibility");
  });
});
