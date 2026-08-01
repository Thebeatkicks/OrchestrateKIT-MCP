# Linear reconciliation batch

Prepared: 2026-08-01

Status: Applied 2026-08-01

All 15 agreed issues received commit/proof comments before their status changed
to Done: MAR-383, MAR-384, MAR-423, MAR-426, MAR-427, MAR-428, MAR-429,
MAR-432, MAR-433, MAR-448, MAR-450, MAR-451, MAR-452, MAR-453, and MAR-454.
The state checkers now carry those Done statuses; this document remains the
audit packet for why each issue was closed.

This is a mutation packet, not an alternate source of truth. Before applying,
re-read each issue and confirm the commit remains reachable from the repository
evidence branch. Add the evidence comment before changing status.

## Close as implemented

| Issue | Repository evidence | Linear action | Proof obligation after close |
| --- | --- | --- | --- |
| MAR-383 | DASH `33b879e` | Done | Permission-broker work moves to a new Wave 2 issue; do not reopen the credential foundation. |
| MAR-384 | DASH `e30921c` | Done | None beyond normal regression coverage. |
| MAR-423 | DASH `ad56874` | Done | AI News Scout extends this shipped sample journey in a new Wave 1 issue. |
| MAR-426 | MCP `5f23903` | Done | Deterministic manifest-v2 export is covered by the pinned schema tests. |
| MAR-427 | MCP `fabd88d` | Done | Public eligibility/fail-closed policy remains MAR-460. |
| MAR-428 | DASH `c54ce60` | Done | Installed first-run proof remains MAR-454. |
| MAR-429 | DASH `32d3af9` | Done | Lifecycle evidence remains in `docs/msix-lifecycle-evidence.md`. |
| MAR-432 | DASH `d965f03` | Done | Packaged renderer startup is re-exercised by MAR-454. |
| MAR-433 | DASH `a527585`, installed proof `05201e7` | Done | Satisfied: a fresh runner-hosted run rendered in Runs with verdict and digest artifact under `pnpm verify`. |
| MAR-448 | MCP `14aa04b` | Done | Keep both supported revisions in conformance CI under MAR-459. |
| MAR-450 | DASH `71b28e5` | Done | Residual self-healing and protocol ownership are tested by MAR-454. |

Suggested comment shape:

> Implementation evidence: `<commit>` is reachable from `<branch>`. Closing the
> implementation issue. This is **merged**, not automatically installed-proven.
> The remaining proof is owned by `<proof issue>` and must pass before the public
> claim is promoted.

## Wave 0 - installed first-run reliability (close as proven)

The restart and direct `pnpm verify` passed on 2026-08-01. Add the exact proof
comment and move all four issues to Done:

- MAR-451 — runner build/protocol identity, implementation/proof `05201e7`.
- MAR-452 — authenticated graceful shutdown and confirmed agent exit, implementation/proof `05201e7`.
- MAR-453 — pending-before-consent handoff ledger and expiry, implementation/proof `05201e7`.
- MAR-454 — mandatory self-contained packaged Windows smoke, implementation/proof `05201e7`; state promotion `bf28d2b`.

MAR-363 stays In Progress and is blocked by MAR-454. Its own control sheet still
requires the final video, timings, and run IDs; partial recording-prep commits do
not make the issue Done.

## Re-scope, do not let parent epics block merged work

- MAR-380 — remove blocker relationships to already-implemented foundation.
  Re-scope it to the optional Agent DOM control/handoff work that genuinely
  remains after Wave 0.
- MAR-421 — place approval delivery in Wave 2 unless AI News Scout introduces a
  real approval. News Scout's public-RSS read path does not need one.
- MAR-326 and MAR-329 — close, re-scope, or lower priority. LAB Chief flags both
  as 25-day stale priority-2 decisions.

## Create under the new initiative split

### Initiative: DASH - Useful agent loop

**MAR-457 — AI News Scout: prove and extend the shipped sample journey**

- Build on MAR-423; no parallel demo path.
- Public RSS/HTTP sources, editable source set, and cadence.
- Live step output, cited digest artifact, explicit verdict and recovery.
- `network: read` permission receipt.
- Installed proof recorded through the MAR-454 harness.

### Initiative: DASH - Connections as capabilities

**MAR-458 — Permission broker: narrow connector operations, never raw provider tokens**

- Implement DASH ADR 0002.
- Separate DASH identity from connector authorization.
- Keep refresh/access tokens on the trusted broker side.
- Gmail read/search plus local draft artifact first.
- Provider-side draft creation later; no Gmail send operation exists.
- Native OAuth and authenticated MCP connectors share permission receipts while
  naming the actual token custodian.

**MAR-446 — BYO Google client onboarding and Testing-mode expiry UX**

- The current Google client ID is compiled into DASH; BYO is not shipped.
- Guided Cloud Console setup, client validation, named test-user instructions,
  seven-day refresh-token expiry warning, and one-click reconnect.
- This is an advanced/developer route, not the default public experience.

### Initiative: MCP - Standards conformance

- MAR-459 — protocol conformance fixtures in CI.
- MAR-460 — explicit public-runner eligibility, fail closed.
- Follow-ups: MCP Apps card rendering, then MCP Tasks for long-running
  DASH-as-server work.

### Initiative: LAB - Evidence flywheel

- Evidence reconciliation: Chief verifies Git ancestry before ranking Linear.
- MAR-461 — prove the invoice-payment corpus contract with a fresh scored evaluation.
- Flywheel health: last real session, accepted finding, promoted issue, merged
  fix, and later outcome delta.
- Trading Bot remains paused until one complete causal chain is visible.

### Initiative: Site - Public trust surface

- MAR-462 — deploy and prove the evidence-backed, canonical dark-editorial direction.
- Responsive/browser proof at 375, 768, and 1280.
- Primary CTA is the live planning path; secondary CTA inspects the artifact.

## Project shape

Use the portfolio waves as Linear initiatives, not one milestone per repository:

1. Installed truth
2. Useful agent loop
3. Connections as capabilities
4. MCP standards and portable UI
5. LAB evidence flywheel
6. Public trust surface

An issue can belong to one implementation project and one portfolio initiative.
This keeps cross-repository outcomes visible without making a mega-project that
hides ownership.
