/**
 * What DASH names, and what DASH brokers — MAR-493 / MAR-494.
 *
 * The one place in the MCP that holds DASH-side vocabulary. Both facts here are
 * DASH's to define and the MCP's to follow, and they are kept in a single file
 * so a review that touches one is forced to look at the other.
 *
 * ## Why the MCP holds any of this
 *
 * MAR-477 ran the round trip end to end and found the seam blocked by two field
 * *values*, not two field shapes: `agent_dom.connections[].provider` and
 * `.ownership`. Both repos type them as strings, both documents validate against
 * the shared schema, and neither a type check nor a schema check could see the
 * disagreement.
 *
 * MAR-486 already settled the principle that decides who moves: **the emitter
 * must not produce what the importer refuses.** DASH is the importer. So the
 * MCP spells things DASH's way.
 *
 * ## The cost, stated plainly
 *
 * This is DASH knowledge inside the MCP, which the architecture boundary
 * otherwise avoids, and it will drift when DASH adds a provider or an operation.
 *
 * It drifts **narrow**, which is the safe direction. A connection missing from
 * `DASH_BROKERED_CONNECTIONS` is emitted exactly as it is today and simply is not
 * brokered — the user sees the MCP-server or direct-credential path they already
 * see. A connection missing from `DASH_MANIFEST_PROVIDER` keeps its own id, which
 * DASH refuses with an honest "DASH has no sign-in for this" rather than
 * silently pointing at the wrong provider. Neither failure invents access.
 *
 * The direction that would NOT be safe is claiming a connection is brokered when
 * DASH cannot broker it. That produces a row rendering as "DASH holds this
 * credential" whose every call is then refused with `no_broker_profile` — a
 * connection that looks connected while nothing works. Adding an entry here is
 * therefore a claim about DASH that has to be checked against DASH, and
 * `tests/lib/dashBrokerCatalog.test.ts` records what was checked and when.
 */

/**
 * MCP `connection_id` → the `provider` string DASH expects in a manifest.
 *
 * Hand-listed rather than derived, mirroring `lib/oauth/providers.ts` in
 * orchestratedash, which lists its side by hand for a stated reason: a prefix or
 * case transform would invent `google-drive` and point it at Google with scopes
 * nobody wrote copy for. A transform here would invent `google-sheets` and
 * `hub-spot`, neither of which DASH has heard of, turning a clean refusal into a
 * guess.
 *
 * Only services DASH actually names belong here. Everything else keeps its own
 * id, which is what `dashManifestProvider` does.
 */
const DASH_MANIFEST_PROVIDER: Readonly<Record<string, string>> = {
  gmail: "google-gmail",
  google_calendar: "google-calendar",
};

/**
 * The `provider` value to emit for a connection, DASH's spelling where DASH has
 * one and the MCP's own id where it does not.
 *
 * Never throws and never guesses: an unmapped connection is passed through
 * unchanged, so adding a provider to the registry cannot break an export.
 */
export function dashManifestProvider(connectionId: string): string {
  return DASH_MANIFEST_PROVIDER[connectionId] ?? connectionId;
}

/**
 * Connections DASH's broker can actually hold a credential for and run an
 * operation against.
 *
 * Narrower than `DASH_MANIFEST_PROVIDER` on purpose, and the two are not the same
 * question. Naming a service is a vocabulary fact and is safe to state for
 * anything DASH recognises; brokering it is a claim that DASH has an OAuth flow,
 * a provider profile AND at least one allowlisted operation. A service DASH can
 * name but not broker belongs in the map above and not in this set.
 *
 * Checked against orchestratedash master on 2026-08-06: `lib/broker/providers.ts`
 * defines exactly one real profile (`google-gmail`; the loopback proof profile is
 * test-only and env-gated), and `lib/broker/operations.ts` defines three
 * operations, all `google-gmail`. Google Calendar has an OAuth flow on the DASH
 * side but no broker profile and no operations, so it is deliberately absent —
 * including it would be the "looks connected, grants nothing" failure this file's
 * header warns about.
 */
const DASH_BROKERED_CONNECTIONS: ReadonlySet<string> = new Set(["gmail"]);

/**
 * Can DASH broker this connection, if DASH is present?
 *
 * Answers only the capability half. Whether DASH is present at all is the
 * caller's assertion, carried by `export_build_brief`'s `dash_broker_available`
 * input — the MCP is stateless and cannot observe it.
 */
export function dashBrokersConnection(connectionId: string): boolean {
  return DASH_BROKERED_CONNECTIONS.has(connectionId);
}

/** Every connection this build of the MCP believes DASH brokers. For tests. */
export function dashBrokeredConnectionIds(): string[] {
  return [...DASH_BROKERED_CONNECTIONS].sort();
}

/** Every connection id with a DASH-specific spelling. For tests. */
export function dashNamedConnectionIds(): string[] {
  return Object.keys(DASH_MANIFEST_PROVIDER).sort();
}

/**
 * MAR-582 (F14 companion, MAR-596): every model-provider DASH will hold an API
 * key for, by value — mirrors orchestratedash's `lib/ai/providers.ts::AI_PROVIDER_IDS`.
 * Same discipline as `DASH_MANIFEST_PROVIDER`/`DASH_BROKERED_CONNECTIONS` above
 * and for the same reason: this is DASH's registry of manifest `provider`
 * strings DASH will actually act on for its AI-key vault (MAR-582's "bring
 * your own AI key" feature), not something derivable from this repo's own
 * registry.
 *
 * Checked against orchestratedash master on 2026-08-10 (`5ad6d70`):
 * `AI_PROVIDER_IDS = ["openrouter", "anthropic", "openai"] as const`, and
 * `AiProviderProfile.connection_provider` equals `id` for all three — so the
 * MCP's own `llm_provider` spelling ("anthropic"/"openrouter") already matches
 * DASH's manifest `provider` string with no translation table, unlike Gmail.
 * "openai" has no MCP-side selection path yet (`connectContract.ts`'s
 * `LlmProvider` union does not offer it): narrow drift, the safe direction
 * this file's own header calls out — unreachable today rather than guessed.
 */
export const AI_PROVIDER_IDS = ["openrouter", "anthropic", "openai"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
