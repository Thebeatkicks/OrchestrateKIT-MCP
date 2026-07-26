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
