import type { Registry } from "./registryTypes.js";

export type ValidationError = {
  entity: string;
  field: string;
  message: string;
  /**
   * "error" (default when omitted) fails `strict` loads. "warning" never does —
   * used for a reference that resolves against the full, unfiltered registry
   * but is merely invisible at the current status filter (MAR-530: a playbook
   * promoted ahead of its still-lagging golden-path route must never make
   * `loadRegistry` throw for every caller; it is surfaced here instead).
   */
  severity?: "error" | "warning";
};

export class RegistryValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ValidationError[],
  ) {
    super(message);
    this.name = "RegistryValidationError";
  }
}

export function validateNoDuplicateIds(
  items: ReadonlyArray<{ id: string }>,
  entityType: string,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new RegistryValidationError(`Duplicate ${entityType} id: "${item.id}"`, [
        { entity: `${entityType}:${item.id}`, field: "id", message: `Duplicate id "${item.id}"` },
      ]);
    }
    seen.add(item.id);
  }
}

export function validateCrossReferences(
  registry: Registry,
  /**
   * Every route id that exists anywhere in the raw registry, regardless of
   * status filter. Defaults to the (already-filtered) visible route set,
   * which reproduces the pre-MAR-530 behavior for any caller that does not
   * pass it. Passing the unfiltered set lets this function tell "the route
   * does not exist" (a real authoring error) apart from "the route exists
   * but is not visible at this status filter" (a playbook/route pair whose
   * statuses have drifted apart — never a throw, see `severity`).
   */
  allRouteIds?: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const componentIds = new Set(registry.components.map((c) => c.id));
  const edgeIds = new Set(registry.edges.map((e) => e.id));
  const stackIds = new Set(registry.stacks.map((s) => s.id));
  const routeIds = new Set(registry.routes.map((r) => r.id));
  const knownRouteIds = allRouteIds ?? routeIds;
  const workerIds = new Set(registry.workers.map((w) => w.id));

  for (const edge of registry.edges) {
    if (!componentIds.has(edge.from)) {
      errors.push({
        entity: `edge:${edge.id}`,
        field: "from",
        message: `Unknown component id "${edge.from}"`,
      });
    }
    if (!componentIds.has(edge.to)) {
      errors.push({
        entity: `edge:${edge.id}`,
        field: "to",
        message: `Unknown component id "${edge.to}"`,
      });
    }
  }

  for (const route of registry.routes) {
    for (const cid of route.components) {
      if (!componentIds.has(cid)) {
        errors.push({
          entity: `route:${route.id}`,
          field: "components",
          message: `Unknown component id "${cid}"`,
        });
      }
    }
    for (const eid of route.edges) {
      if (!edgeIds.has(eid)) {
        errors.push({
          entity: `route:${route.id}`,
          field: "edges",
          message: `Unknown edge id "${eid}"`,
        });
      }
    }
  }

  for (const pb of registry.playbooks) {
    if (pb.golden_path_route_id && !routeIds.has(pb.golden_path_route_id)) {
      if (!knownRouteIds.has(pb.golden_path_route_id)) {
        errors.push({
          entity: `playbook:${pb.id}`,
          field: "golden_path_route_id",
          message: `Unknown route id "${pb.golden_path_route_id}"`,
          severity: "error",
        });
      } else {
        // MAR-530: the route exists, just not at this status filter — a
        // half-promoted pair, not a broken reference. Never fails a strict load.
        errors.push({
          entity: `playbook:${pb.id}`,
          field: "golden_path_route_id",
          message: `Route "${pb.golden_path_route_id}" exists but is not visible at this status filter — the playbook's status has moved ahead of its golden-path route's. Certify the pair together; never promote one without the other.`,
          severity: "warning",
        });
      }
    }
    if (pb.stack_id && !stackIds.has(pb.stack_id)) {
      errors.push({
        entity: `playbook:${pb.id}`,
        field: "stack_id",
        message: `Unknown stack id "${pb.stack_id}"`,
      });
    }
    for (const cid of pb.components) {
      if (!componentIds.has(cid)) {
        errors.push({
          entity: `playbook:${pb.id}`,
          field: "components",
          message: `Unknown component id "${cid}"`,
        });
      }
    }
    for (const eid of pb.edges) {
      if (!edgeIds.has(eid)) {
        errors.push({
          entity: `playbook:${pb.id}`,
          field: "edges",
          message: `Unknown edge id "${eid}"`,
        });
      }
    }
    for (const wid of pb.worker_sequence ?? []) {
      if (!workerIds.has(wid)) {
        errors.push({
          entity: `playbook:${pb.id}`,
          field: "worker_sequence",
          message: `Unknown worker id "${wid}"`,
        });
      }
    }
  }

  for (const w of registry.workers) {
    for (const target of w.handoff_to) {
      if (!workerIds.has(target)) {
        errors.push({
          entity: `worker:${w.id}`,
          field: "handoff_to",
          message: `Unknown worker id "${target}"`,
        });
      }
    }
  }

  return errors;
}
