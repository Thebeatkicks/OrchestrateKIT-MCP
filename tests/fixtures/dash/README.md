# DASH contract fixtures

The schemas, `contract.lock.json`, and `conformance/v1/*` are code-free,
semantically exact copies of orchestratedash's contracts. Manifest v1 and run events
remain the frozen telemetry-v1/read-only contract. Manifest v2 is the additive
runner-hostable contract and requires `agent_dom`.

The schema files' pinned orchestratedash commit and their semantic SHA-256
fingerprints live in `contract.lock.json` (`canonical_commit` and
`schema_semantic_sha256`), which is the single authority for both — restated
here once, they went stale silently and disagreed with the lock for two
re-syncs before MAR-555 noticed. Their semantic content is copied exactly
rather than recreated as a local approximation.

`agent.manifest.v2.schema.json` additionally has a live drift check,
`pnpm dash:schema:check` (`scripts/check-dash-schema-drift.mjs`), which
compares it structurally against orchestratedash's working copy whenever that
repo is checked out beside this one. Copy the canonical file, move the lock's
`canonical_commit` and the v2 fingerprint, and decide whether the emitter
should populate anything newly added — all in the same commit, or the check
fails by design.

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

Its own `source_commit` field is authoritative for its content, and CI reads it
directly: the workflow clones orchestratedash at exactly that commit before
running the drift gate.

### It is now EXTRACTED, not transcribed (MAR-692)

The paragraph that used to sit here said there was no live drift check against
DASH's TypeScript, because "importing another repo's runtime module graph for a
fact this small is not worth the fragility", and that re-syncing by hand on the
same review that touches DASH's broker files was the intended discipline.

That discipline failed completely. This file pinned three operations while DASH
had fifteen, 598 commits behind, and the twelve it was missing are the AI
operations every model step needs — so the MCP could not name a single operation
DASH would resolve for a model call, and nothing anywhere said so.

`pnpm dash:vocab:check` (`scripts/check-dash-vocabulary-drift.ts`) replaces the
hand discipline. It **runs** orchestratedash's own `lib/broker/operations.ts` and
`lib/broker/providers.ts` out of a checkout at `source_commit` and rewrites or
fails against what they return. There is no module graph to import: those two
files plus `lib/ai/providers.ts` have exactly one import between them and no
external dependency, so a bare clone with no `pnpm install` is enough — and if
that ever stops being true, the gate fails loudly rather than falling back to
guessing.

Twelve of the fifteen operations were never transcribable anyway. They exist as
no literal in DASH's source at all: they are generated per AI provider from
exported suffix constants, so any hand copy was always a re-implementation of
DASH's id generation, drifting on its own schedule.

Re-sync with `pnpm dash:vocab:check --write` after moving `source_commit`, then
recompute this file's `schema_semantic_sha256` entry in `contract.lock.json` and
re-run `pnpm test`. `src/lib/dashBrokerCatalog.ts` is never auto-written:
deciding whether the emitter should now *reach* a new operation is a judgement,
and the gate exists to insist somebody makes it.

## run-artifact contract — deliberately NOT here

The third DASH contract the MCP mirrors, `contracts/run-artifact.schema.json`,
lives in `src/lib/dashArtifactContract.ts` instead. It is the one mirror
`export_build_brief` reads at runtime rather than only in a test, so it has to
survive `pnpm build` into `dist/` — a fixture would be correct in CI and missing
in the shipped server. The same gate checks it, by value including every
`description` string, and checks the `items_digest` canonicalisation beside it by
running both DASH's function and the MCP's pasteable copy over the same items.
