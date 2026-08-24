import type { Playbook } from "../registry/playbookSchema.js";
import type { Route } from "../registry/routeSchema.js";

export type PlaybookOverlapResult = {
  playbook_id: string;
  playbook_title: string;
  /** Recall: |shared| / |playbook components| — how much of the playbook is covered. */
  overlap_fraction: number;
  /** Precision: |shared| / |candidate components| — how much of the candidate is playbook. */
  precision: number;
  /**
   * Jaccard similarity: |shared| / |playbook ∪ candidate|.
   * A precision/recall-balanced similarity measure.
   */
  jaccard: number;
  shared_components: string[];
  /** Candidate components not in the playbook — possible compose noise or valid extensions. */
  extra_components: string[];
  /** Playbook components absent from the candidate — gaps to address. */
  missing_components: string[];
};

export type RouteOverlapResult = {
  route_id: string;
  route_name: string;
  /** Recall: |shared| / |route components|. */
  overlap_fraction: number;
  /** Precision: |shared| / |candidate components|. */
  precision: number;
  /** Jaccard similarity. */
  jaccard: number;
  shared_components: string[];
  extra_components: string[];
  missing_components: string[];
};

/**
 * Components that ride in as a CONSEQUENCE of another component already in the
 * set, never as independent evidence about what the goal wants (MAR-749).
 *
 * `approval_binding` is injected by safetyAugmenter Rule 5c exactly when
 * `human_approval_gate` meets a gated write. Both of those are already in the
 * candidate set and already carry that signal, so scoring the binding as a
 * third data point counts the same fact twice — and it counts it against the
 * candidate, because a playbook written before the component existed reads it
 * as compose noise. That is not a matcher signal, it is bookkeeping: the price-
 * monitor and scheduled-report goals both dropped out of their own playbooks
 * the moment the binding started riding along.
 *
 * Subtracted from BOTH sides so the arithmetic stays symmetric — a playbook
 * that DOES list the binding must not have its recall diluted by the same
 * exclusion that protects one that does not.
 */
export const POLICY_INJECTED_IDS = new Set(["approval_binding"]);

/**
 * Finds playbooks whose component list significantly overlaps with
 * the candidate component set (MAR-91).
 *
 * Returns full overlap stats — recall, precision, Jaccard, extra and missing
 * components — so callers can apply their own thresholds for playbook-first
 * routing. Results filtered to `recall >= minOverlap`, sorted by recall desc.
 *
 * `POLICY_INJECTED_IDS` are excluded from the scoring on both sides — see the
 * note above.
 */
export function findOverlappingPlaybooks(
  candidateIds: Set<string>,
  playbooks: Playbook[],
  minOverlap = 0.5,
): PlaybookOverlapResult[] {
  const results: PlaybookOverlapResult[] = [];
  const scoredCandidate = new Set(
    [...candidateIds].filter((id) => !POLICY_INJECTED_IDS.has(id)),
  );
  const candidateSize = scoredCandidate.size;

  for (const pb of playbooks) {
    if (pb.components.length === 0) continue;

    const pbComponents = pb.components.filter((id) => !POLICY_INJECTED_IDS.has(id));
    if (pbComponents.length === 0) continue;

    const shared = pbComponents.filter((id) => scoredCandidate.has(id));
    const recall = shared.length / pbComponents.length;

    if (recall < minOverlap) continue;

    const precision = candidateSize > 0 ? shared.length / candidateSize : 0;
    const unionSize = pbComponents.length + candidateSize - shared.length;
    const jaccard = unionSize > 0 ? shared.length / unionSize : 0;

    const sharedSet = new Set(shared);
    // Reported on the SCORED sets too: a policy injection is not compose noise,
    // and listing it as an extra would push it into the benchmark's noise flags
    // and into primaryDomainExtras' append list.
    const extra_components = [...scoredCandidate].filter((id) => !sharedSet.has(id));
    const missing_components = pbComponents.filter((id) => !scoredCandidate.has(id));

    results.push({
      playbook_id: pb.id,
      playbook_title: pb.title,
      overlap_fraction: Math.round(recall * 100) / 100,
      precision: Math.round(precision * 100) / 100,
      jaccard: Math.round(jaccard * 100) / 100,
      shared_components: shared,
      extra_components,
      missing_components,
    });
  }

  return results.sort((a, b) => b.overlap_fraction - a.overlap_fraction);
}

/**
 * Finds known routes whose component list overlaps with the candidate set.
 */
export function findOverlappingRoutes(
  candidateIds: Set<string>,
  routes: Route[],
  minOverlap = 0.5,
): RouteOverlapResult[] {
  const results: RouteOverlapResult[] = [];
  const candidateSize = candidateIds.size;

  for (const route of routes) {
    if (route.components.length === 0) continue;

    const shared = route.components.filter((id) => candidateIds.has(id));
    const recall = shared.length / route.components.length;

    if (recall < minOverlap) continue;

    const precision = candidateSize > 0 ? shared.length / candidateSize : 0;
    const unionSize = route.components.length + candidateSize - shared.length;
    const jaccard = unionSize > 0 ? shared.length / unionSize : 0;

    const sharedSet = new Set(shared);
    const extra_components = [...candidateIds].filter((id) => !sharedSet.has(id));
    const missing_components = route.components.filter((id) => !candidateIds.has(id));

    results.push({
      route_id: route.id,
      route_name: route.name,
      overlap_fraction: Math.round(recall * 100) / 100,
      precision: Math.round(precision * 100) / 100,
      jaccard: Math.round(jaccard * 100) / 100,
      shared_components: shared,
      extra_components,
      missing_components,
    });
  }

  return results.sort((a, b) => b.overlap_fraction - a.overlap_fraction);
}
