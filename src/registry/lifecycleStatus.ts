/**
 * Playbook/route visibility compatibility (MAR-530).
 *
 * `isAllowedStatus` in registryAssembly.ts gates "beta" and "candidate" behind
 * two INDEPENDENT boolean flags (`includeBeta`, `includeCandidates`) — turning
 * one on does not turn the other on, and neither is a superset of the other.
 * "published"/"validated" need no flag at all. A total rank order across all
 * five statuses is the WRONG model here: this codebase's real registry has
 * several "published" playbooks whose golden-path route is only "validated"
 * (a strict rank check would flag all of them, yet both statuses are always
 * loaded together with zero flags — nothing can ever go invisible). The bug
 * MAR-530 actually found is narrower: a route gated behind a DIFFERENT flag
 * than the one that already made its playbook visible.
 */
export type VisibilityGroup = "always" | "beta" | "candidate" | "never";

/** Which `loadRegistry` flag (if any) is required for an entity at this status to be visible. */
export function visibilityGroup(status: string): VisibilityGroup {
  switch (status) {
    case "published":
    case "validated":
      return "always";
    case "beta":
      return "beta";
    case "candidate":
      return "candidate";
    default:
      // "draft" (playbook-only) and "deprecated" are never surfaced by any
      // loadRegistry flag combination in use today.
      return "never";
  }
}

/**
 * True when a golden-path route could go invisible at some flag combination
 * where its playbook stays visible — MAR-530's half-promotion class of bug.
 * A route in the "always" group is safe under every combination. A route
 * gated behind the SAME flag as its playbook (both "beta", or both
 * "candidate") is safe too, since one flag unlocks both together. Anything
 * else — a different flag, or "never" — can strand the playbook pointing at
 * an invisible route.
 */
export function routeLagsBehindPlaybook(playbookStatus: string, routeStatus: string): boolean {
  const routeGroup = visibilityGroup(routeStatus);
  if (routeGroup === "always") return false;
  return routeGroup !== visibilityGroup(playbookStatus);
}
