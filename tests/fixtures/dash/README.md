# DASH contract fixtures

The schemas, `contract.lock.json`, and `conformance/v1/*` are code-free,
semantically exact copies of orchestratedash's contracts. Manifest v1 and run events
remain the frozen telemetry-v1/read-only contract. Manifest v2 is the additive
runner-hostable contract and requires `agent_dom`.

The v2 schema is pinned to orchestratedash commit
`163f4141b153953e8e08900b31e51953ee5975ed` with semantic SHA-256
`2e9b3c8ab18a15eaa642c6c0bf4559c36d9d479ec5b065cac3fab1bfd598d12a`.
Its semantic content is copied exactly rather than recreated as a local approximation.

**Dual-update discipline** (same rule as `tests/fixtures/matcher-corpus.json`):
when the DASH contract changes, copy the canonical schema without changing its
semantics, update its source commit and semantic hash in the same commit, and
re-run `pnpm test`.
Semantic schema fingerprints plus the golden fixtures are the contract tripwire
between repos, which otherwise share no code.

## broker-profiles.json

A semantic copy of the REAL broker facts `orchestratedash`'s
`lib/broker/providers.ts` and `lib/broker/operations.ts` define — which
`connection_provider` strings DASH's broker recognises (`brokerProfileFor`)
and which OAuth scopes each operation requires (`resolveGrant`'s
scope-intersection). Excludes the env-gated loopback proof profile, which
cannot exist on a hosted agent.

This is what makes `tests/tools/dashBrokerRoundTrip.test.ts` a cross-repo
conformance test rather than a self-consistency check: without it, an
assertion like "gmail's provider is `google-gmail`" only proves the MCP
agrees with itself. Checked against the pinned facts here, it proves the MCP's
`src/lib/dashBrokerCatalog.ts` and the manifest's declared OAuth scopes are
still what DASH's `resolveGrant` needs to actually grant an operation — the
exact seam MAR-477 found broken (two agreeing schemas, two disagreeing field
*values*).

Its own `source_commit` field is authoritative for its content (independent of
`contract.lock.json`'s top-level `canonical_commit`, which tracks the schema
files only, since the two are not always re-synced in the same pass). Its
`schema_semantic_sha256` entry in `contract.lock.json` follows the same
dual-update discipline as the schemas above: when DASH's broker facts change,
re-copy the values, update `source_commit`, recompute the fingerprint, and
re-run `pnpm test`. There is no live drift check against DASH's TypeScript
source (unlike `agent.manifest.v2.schema.json`'s `pnpm dash:schema:check`) —
importing another repo's runtime module graph for a fact this small is not
worth the fragility; re-syncing by hand on the same review that touches DASH's
broker files is the intended discipline.
