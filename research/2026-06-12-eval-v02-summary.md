# agent.pack v0.2 — build & evaluation summary (2026-06-12)

Phase 1 (facts+ fix-pack, Workstream D) implemented, built, and evaluated. Full evaluator
reports: `2026-06-12-eval-{coldread,adversarial,conformance}.md`. Before-metrics:
`2026-06-11-eval-before.txt`.

## Build

- D0–D7 implemented in `packages/webapp/src/export.ts`; format pinned by the first-ever pack
  test suite (`export-pack.test.ts`, 14 tests after hardening).
- All suites green: audit 31 · webapp 23 · cli 5 · store 4 · scanner 3 = **66 tests, 0 fail**.
- Deploy packs rebuilt at v0.2 for demo-app / ecom / lms-lxp / portfolio.

## Economics (before → after)

| pack | v1 bytes | v0.2 bytes | Δ |
|---|---|---|---|
| demo-app | 43,962 | 24,430 | −44% |
| ecom | 79,051 | 58,308 | −26% |
| lms-lxp | 41,375 | 22,386 | −46% |
| portfolio | 28,366 | 9,312 | −67% |
| **total** | **192,754** | **114,436** | **−41%** (~48k → ~28.6k tokens) |

Smaller while *adding* trailer, per-line drift hashes, cap disclosures, and safety preamble —
the review-wall collapse (399 lines → category counts + ~110 serious-plus items + pointer)
pays for everything.

## Evaluation verdicts

- **Cold-read usability: 7/10.** A spec-blind agent correctly identified the artifact, produced
  a correct prioritized fix plan (including grouping three checkpoint ids that share one line),
  explained the hash/trailer/review semantics, and verified completeness. Top requested
  improvement: a NEXT ACTIONS block (exact re-run command + where the LLM key goes) — the
  verify half of the fix→verify loop is unexecutable from the pack alone.
- **Adversarial: 5/6 v1 vulnerabilities killed and survived re-attack** (truncation, injection,
  path leak, drift, review wall). One landed: the engine's `capEvidence(max=10)` made "+N more"
  understate pervasive issues (101 real → "+2 more"). Plus 5 new latent findings.
- **Conformance: D0–D7 all CONFORM**; 10/10 planned tests present; acceptance sweep clean;
  noted gaps: CTO-audit regen pending (commit ritual), glossary omits the planned fix-pattern
  field (benign — records keep `fix:`).

## Post-evaluation hardening (same day, all verified in rebuilt packs)

1. **Cap reconciliation** — at the engine's 10-citation floor, the true total is recovered from
   the check's own tally in the problem prose: lms-lxp PER-003 now reads **"+93 more locations
   not shown"** (was "+2"); unparseable tallies get an honest floor line
   ("+2 more cited; the true count may be higher").
2. **Blank cited lines carry no hash** (empty-string hash collided on every blank line).
3. **Snippet lines truncated at 240 chars** with an explicit `…[+N chars]` marker (minified-
   bundle flooding / off-screen payload hiding).
4. **Bidi/zero-width controls render as `\uXXXX` escapes** (Trojan-Source visual spoofing).
5. **`problem:`/`fix:` values are newline-guarded** (field forgery at column 0).

## Open items (deliberate, not regressions)

- **Engine-side fix for the evidence cap** (`evidenceTotal` on CheckResult/Evaluation, threading
  `cites.length` through ~67 `capEvidence` call sites) — the render-side reconciliation covers
  the house detail-style; the engine change makes it style-independent. Candidate for the next
  increment.
- **Cold-read D8 candidates:** NEXT ACTIONS block (re-run command + LLM-key location); document
  `<<<`, `:col`, and the hash algorithm in the preamble; grade formula note ("severity-weighted,
  not count-based"); duplicate-finding cross-links ("same fix as ISSUE n").
- **Hash stays 16-bit by policy** — the snippet is the locator; the hash only confirms drift.
- **CTO-audit regeneration** with a pack-v0.2 session entry — belongs to the commit-gate ritual.
