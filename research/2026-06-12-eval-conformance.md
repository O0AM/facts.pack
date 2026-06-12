# PLAN CONFORMANCE AUDIT — agent.pack v0.2 (facts+)

Plan: `D:\dev\ai agents\facts-pack\PACK-V0.2-PLAN-factsplus.md` · Impl: `D:\dev\ai agents\facts+\packages\webapp\src\export.ts` · Tests: `D:\dev\ai agents\facts+\packages\webapp\src\export-pack.test.ts` · Artifact: `D:\dev\ai agents\facts+\deploy\app\ecom\agent.pack`

## D0–D7 verdicts

**D0 (version line) — CONFORMS.** export.ts:88 `"facts+ audit pack · v0.2"`. Pack line 1 matches exactly. All 4 deploy packs carry it.

**D1 (location cap honesty) — CONFORMS, with a plan-grounding flaw.** export.ts:42 (`MAX_LOCATIONS = 8`), :167-175 — `slice(0, MAX_LOCATIONS)`, `hidden = e.evidence.length - shown.length`, appends the exact planned string. Pack sample (ecom, ISSUE 2, line 124): `- (+2 more locations not shown — re-run the audit after fixing these)`. The +N matches audit.json evidence counts everywhere (verified below). **However**, the plan's premise "`e.evidence.length` is the uncapped count; no engine change needed" is false: the engine caps evidence at 10 (`capEvidence(cites, max = 10)`, `packages\audit\src\checks\util.ts:81-83`, used at 67 call sites). Ecom PER-003's `problem:` says "32 inline <svg>" but evidence has only 10 citations, so the pack prints 8 + "(+2 more)" when 24 instances are actually unshown. The export-level change is exactly as planned; the no-silent-caps goal is only partially achieved (true count survives only in the `problem:` prose).

**D2 (injection armor preamble) — CONFORMS.** export.ts:101-103, all three lines verbatim. Pack lines 14-16 match character-for-character.

**D3 (END OF PACK trailer) — CONFORMS.** export.ts:118 (trailer) + :105-106 (preamble warning). Pack last line (732): `=== END OF PACK · 10 issues · 394 reviews · commit working ===` — counts match audit.json (fail=10, review=394, sha=working). Preamble warning reworded trivially ("if that line is missing" vs plan's "if it is missing").

**D4 (absolute-path leak) — CONFORMS.** export.ts:85: `r.target.kind === "local" ? basename(r.target.root) || r.target.label : r.target.label`. audit.json root is `D:\dev\ecom`; pack line 3 is `source: ecom`. No `:\` or repo-root string in any of the 4 deploy packs. Minor unplanned addition: the `|| r.target.label` empty-basename fallback (benign hardening).

**D5 (review appendix) — CONFORMS.** export.ts:135-155 — per-category counts (grouped from `practice.category`, the plan's option 1), serious+ line items only (`SEV_RANK >= 3`, :143), pointer `(full review list: audit.json)` (:153). Pack lines 619-731: category counts sum to exactly 394; 110 serious+ items listed; pointer present.

**D6 (glossary dedup) — CONFORMS with one narrowing.** export.ts:40 (`GLOSSARY_THRESHOLD = 50`), :84 (`fails.length > GLOSSARY_THRESHOLD` — strictly >50, per plan), :124-133 (`glossarySection`), mode flag threaded into `recordOf` (:114, :163, :185) which drops `why_it_matters`/`standards` and keeps `title`. **Not observable in built packs** (max fails across deploys = 16, demo-app) — verified via code + test 6, which pins the 51/50 boundary and prose migration. **Deviation:** the planned glossary entry shape was "(id → title, why_it_matters, standards, **fix-pattern**)" — the glossary emits only title/why/standards; the practice-level fix-pattern (`BestPractice.recommendation`, `packages\audit\src\types.ts:90`) is omitted. No information lost (records keep `fix:`), but the dedup is less aggressive than planned. Records also retain `category:`, which the plan's shrink list didn't include.

**D7 (per-location line hash) — CONFORMS.** export.ts:70-77 — djb2 (truncated to 16 bits), 4-hex, empty string for unreadable lines; threaded as `hashAt` closure into `recordOf` alongside `snippet` (:114, :173) per plan. Legend in preamble (:104, slightly reworded from the plan's quote). Pack sample (line 32): `makercentral_v1/src/assets/styles/App.css:8:3 ~d4d3`; identical source lines hash identically across files (`~9f85` at commander.html:485 and commander v1.2.html:485 — correct behavior).

## Test plan — 10 planned cases

| # | Planned | Exists | Asserts as planned |
|---|---|---|---|
| 1 | Header v0.2/commit/source leak | ✔ (line 63) | ✔ — and stronger: also asserts root appears nowhere in the whole pack |
| 2 | Trailer present/last-line/counts | ✔ (75) | **Narrowed** — pins last-line regex + counts vs body, but the planned "truncate the string → a checker helper detects the missing trailer" part was never built; no checker helper exists |
| 3 | Cap >8 / ≤8 | ✔ (89) | ✔ — 12-evidence → exactly 8 lines + "+4 more"; 2-evidence → no cap line |
| 4 | Three D2 lines verbatim | ✔ (100) | ✔ |
| 5 | Appendix counts/serious+/pointer | ✔ (108) | ✔ — sums to review count, strict subset, all listed are critical/serious, pointer. (Doesn't assert every serious+ item appears — minor under-assertion) |
| 6 | Glossary 51 vs 50 | ✔ (122) | ✔ — "emitted once" pinned indirectly (51 `why:` entries would be 102 if doubled) |
| 7 | Hash present/absent | ✔ (136) | ✔ — `~[0-9a-f]{4}` on readable, bare location for missing file ("absent, not garbage") |
| 8 | Determinism | ✔ (148) | ✔ — same-report byte-identical; plan's "except generated:" carve-out not exercised (same report ⇒ same timestamp; this is all export.ts controls) |
| 9 | Spoofed delimiter armor | ✔ (154) | ✔ — spoof present as data, every occurrence wrapped in snippet indent, never column 0 |
| 10 | Project-wide no-location line | ✔ (166) | ✔ |

Runner conforms (compiled, `node --test dist`): new suite 10/10 pass; full suite **62/62 pass** — exactly the plan's "52 existing + ~10 new".

## Acceptance sweep (rollout item 3)

- **Trailer present:** ✔ all 4 packs (demo-app 16/399, ecom 10/394, lms-lxp 4/391, portfolio 0/385), each the literal last line, counts match each pack's audit.json.
- **No absolute paths:** ✔ no `:\` and no repo/target absolute root in any pack.
- **+N correctness vs audit.json:** ✔ every fail with evidence>8 has the exact `(+N more` line (ecom 4/4: OPR-002, OPR-023, PER-003, SEM-009 all evidence=10 → "+2 more"; lms-lxp 1/1); zero spurious cap lines. *Caveat:* "+N" is correct relative to audit.json but understates reality where the engine's `capEvidence(10)` already truncated (PER-003: 32 real instances).

## Rollout gaps

- Item 2, second half **not done**: `audit-cto-review.html` is dated 2026-06-09 (packs are 2026-06-11) and contains no "pack v0.2"/"agent.pack v0.2"/THIS-SESSION entry — `gen-cto-audit.mjs` was not re-run after the pack work.
- Item 1 ✔ (build + 62/62 green), item 2 first half ✔ (deploy packs regenerated at v0.2), item 4 (commit-gate presentation) outside this audit's observability.

## Scope creep (implemented, not in plan)

1. `|| r.target.label` fallback in the D4 source line (export.ts:85).
2. `category:` field retained in glossary-mode records (export.ts:181).
3. Appendix decorations: the `=== NEEDS REVIEW (N) — not auto-decided; verify manually or add an LLM API key ===` heading, "serious and above:" label, and two empty-state lines (`(none)`, `(no critical/serious items awaiting review)`) — within D5's spirit, not specified.
4. `MAX_LOCATIONS` extracted as a named constant (plan implied inline 8) — benign.
5. The export.ts doc header (lines 10-11) embeds the plan's absolute path `D:\dev\ai agents\facts-pack\...` — in source only, never in artifacts, but ironic next to D4.

## Silently narrowed

1. Test 2's truncation-detection checker helper — dropped entirely (documented-only via the preamble warning).
2. D6 glossary omits the planned fix-pattern field.
3. D3/D7 preamble texts cosmetically reworded from the plan's quoted strings.
4. Test 8 doesn't exercise the "except `generated:`" determinism carve-out.
5. (Plan-level, not impl-level) D1's "no silent caps" guarantee is hollowed by the pre-existing engine `capEvidence(10)` the plan wrongly asserted didn't matter.

**Overall: CONFORMS — all 8 items and all 10 tests landed substantially as planned (62/62 green, deploy packs clean), with two real gaps to close: the stale CTO audit (rollout item 2b) and the engine-level evidence cap that quietly undercuts D1's honesty guarantee.**
