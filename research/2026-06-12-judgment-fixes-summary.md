# facts+ judgment-layer fixes — before/after (2026-06-12)

The real-world evaluation scored facts+'s static checks at ~36% strict precision on the
factstack repo (4 TP · 3 FP · 4 MC). Every flagged failure mode was fixed the same day and
re-measured against the identical target (`factsplus-on-factstack-v2/`).

## Fixes (packages/audit)

| Eval finding | Fix | Where |
|---|---|---|
| FRM-001/SEM-017 FP: `<select>` wrapped in `<label>` called unlabelled (twice) | `insideLabel()` ancestor test — implicit association per WCAG H44 (also applied to UND-010) | `checks/util.ts`, `checks/markup.ts` |
| RSP-001/UND-002 MC: viewport/title flagged on HTML *fragments* | `htmlDocs()` now requires doctype/`<html>`/`<head>` — fragments exit ALL document-shell checks | `checks/doc.ts` |
| PRF-004 MC: console.log in build tooling called "shipped code" | `isProductUi()` extended: scripts/, tools/, bench/, examples/, fixtures/, corpus/, dot-dirs, dotfiles, *.config.* | `checks/util.ts` |
| PRF-004: 2 citations on wrong lines (emoji drift) | oxc spans are UTF-8 **byte** offsets — `toCharIndex()` converts at the boundary; applied to every AST citation (code.ts ×5, elements.ts) | `checks/ast.ts` |
| PRF-003 FP: local()-only `@font-face` flagged for FOIT | faces with no `url()` skip — nothing loads, FOIT impossible | `checks/styles.ts` |
| FRM-003 MC: typeless buttons in formless doc pages | .html documents need a `<form>` for the accidental-submit risk; components keep the strict rule | `checks/markup.ts` |
| Severity tally omitted info (10 ≠ 11 fails) | header line includes Info | `webapp/export.ts` |
| Missed: statically computable contrast (CLR-003 sat in the LLM backlog) | NEW static check: same-rule pairs (var()-resolved **per file**), WCAG math with alpha compositing, inline `<style>` blocks scanned with offset-correct citations; fail <3:1, review 3–4.5:1 or translucent text; never a static pass (cascade unseen) | `checks/styles.ts`, registry, catalog (63 → **64** static checks) |

Bonus catch during verification: the first CLR-003 cut resolved `var()`s **globally across
files** — one document's palette clobbered another's and fabricated 2 critical fails
(`#e6edf3` on `#1b2433` ≈ 12.7:1 flagged as <3:1). Caught by spot-checking my own output;
fixed with per-file scoping. The check now refuses to resolve cross-file vars rather than guess.

## Re-measurement (same repo, same commit d66ee21)

| | Before | After |
|---|---|---|
| Fails | 11 (grade C) | **5 (grade A)** |
| Strict precision | ~36% (4 TP / 3 FP / 4 MC) | **100%** — all 5 are from the evaluator's verified-true list (PER-003, OPR-023, SEM-001, SEM-004, ROB-017) |
| False positives | 3 (incl. 2 of 3 "serious") | 0 |
| Wrong-context flags | 4 | 0 |
| Missed contrast class | invisible in 397-item backlog | CLR-003 review with 10 exact citations (114 borderline pairs incl. the rgba-0.44 translucent class) |
| Wrong-line citations | 2 (byte-offset drift) | 0 (regression-tested with emoji fixture) |

Tests: audit 49 (+14) · webapp 27 · cli 5 · store 4 · scanner 3 = **88 green** + both harnesses.
CTO audit regenerated (799 points, derives 64). Deploy rebuilt — the demo app's planted
`#ff0000`-on-`#fe0000` defect is now caught statically (CLR-003 critical), which the audit
previously couldn't see without a browser.

## Companion workstream

factstack wire-format v0.2 (`agent-v4`: legend, trailer+sha256, unified ids, top table,
header chain fields) — implemented by a parallel agent; results recorded separately when
verified.
