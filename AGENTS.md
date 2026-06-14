# Agent coordination — facts-pack

Three AI agents work on this repo on the owner's (Aditya Mishra) behalf: **Claude**,
**Antigravity**, and **Codex**. The owner asked them to coordinate respectfully and
converge on the best joint solution. This file is the shared ground truth for how.

## Canonical files (in precedence order)

1. `FACTSPACK.md` — the spec. Never edit unilaterally; see process below.
2. `planning/ROADMAP-v0.3.md` — the agreed plan toward v0.3/agent-v5.
3. `research/2026-06-13-consensus-v0.3.md` — tri-agent design resolutions R1–R7 and the
   credit scorecard. Read it before re-opening any of those questions.
4. `research/` — proposals, reviews, and evidence. Date-prefix new files
   (`YYYY-MM-DD-<topic>.md`) and attribute claims to sources.

## Master live record refresh

Any agent updating `research/2026-06-14-pack-master-live-doc.html` must follow
`research/MASTER-LIVE-RECORD-REFRESH.md`. Run the project proof batteries, perform
fresh adversarial probes, update evidence and immutable checklist truth, then run
`node test/master-live-record-audit.mjs`. Leave any verification that could not be
performed visibly unticked, timestamp the evidence snapshot, and sign with the
agent's initials. Never convert an observed result into a consensus claim without
the normal proposal and reconciliation process.

## Change process

Propose in `research/` → reconcile in the consensus doc (amend it, add a new R#) →
encode in `planning/ROADMAP-v0.3.md` → only then touch `FACTSPACK.md`. Disagreements are
recorded as positions with reasoning, not resolved by overwriting another agent's text.
Amend prior agents' uncommitted work with attribution; never silently revert it.

## Settled decisions (do not re-litigate)

- **License:** AGPL-3.0 + commercial dual-license for all code, codec included (owner's
  final call). Open sub-question for the owner only: permissive doc/data license for
  spec text + conformance fixtures.
- **Wave-1 wire compatibility is a hard promise:** new capabilities ride `;` meta lines
  and new tables only; `&` schema lines and existing table shapes don't change until
  agent-v5.
- **Claims policy (R5):** no unmeasured number on any public surface except labeled
  "illustrative hypothesis — not benchmark-derived". The P0.1 benchmark is the gate.

## Repo rules (owner's standing instructions)

- **No commits, pushes, or deploys without the owner's literal go-ahead** ("commit" /
  "ship it" / "deploy") in the current message. Stop at green local verification.
- **All HTML ships with fully inline CSS** in `<style>` blocks — no external
  stylesheets or CSS/font CDNs, ever. (Google Fonts `<link>` tags count as violations.)
- Self-contained artifacts: pages and reports must work offline from a single file.
