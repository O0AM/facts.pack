All four verification tasks complete. Full results:

## 1. CLR-003 (factstack-v2 audit.json, status=review) — first 6 citations

All six cite `apps/ui-remix/public/briefing.html` pinned to `sha d66ee21`, which matches factstack HEAD (`d66ee21d106754e5...`). Each line:col was checked character-exactly — **every one of the 6 lands precisely on a `color:var(--fg-faint)` declaration**:

| # | line:col | selector | text at col |
|---|----------|----------|-------------|
| 1 | 71:115 | `.rail__part` | `color:var(--fg-faint);` |
| 2 | 76:20 | `.rail a.rl .ct` | `color:var(--fg-faint);` |
| 3 | 80:59 | `.rail__foot` | `color:var(--fg-faint);` |
| 4 | 96:117 | `.hero__kicker` | `color:var(--fg-faint);` |
| 5 | 161:59 | `.card li::before` | `color:var(--fg-faint);` |
| 6 | 168:113 | `.fbox .ft` | `color:var(--fg-faint);` |

`var()` resolution against custom properties **in the same file**: `--fg-faint: rgba(230,232,234,0.44)` (line 25, dark) / `rgba(26,29,33,0.44)` (lines 41/48, light); `--bg: #0B0D10` / `#FAFAF8`; `--surface-1: #14171C`.

**Arithmetic (citation 1, dark theme):** alpha-composite 0.44·(230,232,234) + 0.56·(11,13,16) = (107.36, 109.36, 111.92). Relative luminances: L(eff) = 0.2126·f(107.36/255) + 0.7152·f(109.36/255) + 0.0722·f(111.92/255) = 0.1638; L(#0B0D10) = 0.00679. Ratio = (0.1638+0.05)/(0.00679+0.05) = **3.77:1** — inside the 3:1–4.5:1 band. Over `--surface-1` it is 3.77:1, over `--surface-2` 3.70:1.

**Arithmetic (citation 2, light theme — same var, light resolution):** 0.44·(26,29,33) + 0.56·(250,250,248) = (151.44, 152.76, 153.40); L(eff) = 0.3146; L(#FAFAF8) = 0.9503. Ratio = (0.9503+0.05)/(0.3146+0.05) = **2.74:1**.

**Verdict: all 6 JUSTIFIED REVIEW** — text is genuinely translucent (alpha 0.44) and the dark-theme computed ratios sit squarely in 3:1–4.5:1. (Caveat, not a citation error: in *light* theme the same token computes to 2.74:1, below 3:1 — "review" is the conservative call given translucent text on variable surfaces, but a human reviewer should treat the light theme as the worse case.) **0 BOGUS.**

## 2. The 5 fails — first citations (all `sha d66ee21`, all exact)

- **PER-003** `apps/ui-remix/src/ui/ThemeToggle.tsx:60:5` — col 5 is `<` of `<svg width="14" height="14" viewBox="0 0 16 16" ...>`; no `aria-label`, `role`, or `aria-hidden`. MATCHES.
- **OPR-023** `apps/ui-remix/public/briefing.html:591:29` — col 29 is `<h4>Blast radius</h4>` (10 spaces + 18-char `<div class="feat">`); section heading at line 586 is `<h2>` → genuine h2→h4 skip. MATCHES.
- **ROB-017** `apps/ui-remix/src/ui/MarginColumn.tsx:64:5` — col 5 is `<aside`, whose opening tag carries `role="complementary"` (line 65) — redundant role on a native `<aside>`. MATCHES.
- **SEM-001** `docs/cto-eli5-audit-2026-06-10.html:125:7` — col 7 is `<h1>FACTS — what it is...`; a second h1 (first at line 107: `<h1>FACTS Audit</h1>`). MATCHES.
- **SEM-004** `apps/ui-remix/public/briefing.html:591:29` — same h2→h4 skip as OPR-023. MATCHES.

## 3. demo-app audit.json — CLR-003 FAIL

Status `fail`, severity critical, evidence `styles.css:4:26` @ sha `0c8bc83` (root `D:\dev\ai agents\facts+\examples\demo-app`). Line 4 of `D:\dev\ai agents\facts+\examples\demo-app\styles.css` is `.title { font-size: 9px; color: #ff0000; background: #fe0000; }`; col 26 is exactly the `c` of `color: #ff0000`. Math: L(#ff0000) = 0.212600, L(#fe0000) = 0.210708 → ratio = (0.2126+0.05)/(0.210708+0.05) = **1.0073:1** ≈ 1.0, far below 3:1. FAIL correct, citation exact.

## 4. lms-lxp agent.pack

- **Degenerate citation class is gone**: 0 occurrences of `gen-docx` and 0 of `.cjs` anywhere in the pack. (The old target `D:\dev\lms-lxp\.gen-docx.cjs` still exists as tooling but now has only 537 lines — line 538 no longer exists at all.)
- **All 18 location lines** (13 unique) match `path:line[:col] ~hhhh`. For every one I re-read the cited line in `D:\dev\lms-lxp`, confirmed it non-blank, confirmed col within line bounds, and **recomputed the djb2-16 hash (`(h*33+c)|0`, `&0xffff`) — all 18 match**: `~8ca8` = `<h4>Per-role hourly rates</h4>` (in `_deploy/index.html:1649`, `brief.html:1786`, `index_brief.html:1649`, `sop-module-brief.html:1773`), `~38a0` = the `<h3>` inside `frsop-redesign.html:419:53`, `~54a8` = unlabelled `<svg class="item-chev" ...>` at 8 lines of `brief - Copy.html`. Pack terminates correctly with `=== END OF PACK · 3 issues · 391 reviews · commit e5c9b85 ===`.

## Citation-accuracy tally

| Artifact | Checked | Exact/Justified | Bogus/Failed |
|---|---|---|---|
| factstack-v2 CLR-003 (review) first 6 | 6 | 6 (all `--fg-faint` α=0.44, 3.70–3.77:1 dark) | 0 |
| factstack-v2 five fails, first citations | 5 | 5 | 0 |
| demo-app CLR-003 fail | 1 | 1 (ratio 1.0073:1) | 0 |
| lms-lxp agent.pack location lines | 18 (13 unique) | 18 (hashes all match) | 0 |
| **Total** | **30** | **30** | **0** |

**No citation failed verification — nothing to quote.** Only soft finding: factstack CLR-003's `--fg-faint` computes to 2.74:1 in the light theme (below even the 3:1 large-text floor), so its "review" status is conservative rather than wrong; the light theme is the case to fix first.
