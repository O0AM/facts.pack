# Over-suppression audit: factsplus-on-factstack v1 (11 fails) → v2 (5 fails)

Fail-set diff: REMOVED = FRM-001, FRM-003, PRF-003, PRF-004, RSP-001, SEM-017, UND-002. SURVIVED = OPR-023, PER-003, ROB-017, SEM-004. ADDED = SEM-001. File set grew 330→332, so no removal is explained by dropped files.

## 1. Verdicts on the 7 removals

**FRM-001 (fail→review) — CORRECTLY REMOVED.** Fix: `insideLabel()` wrapping-label awareness (`packages/audit/src/checks/util.ts:106`, used at `markup.ts:167`). Ground truth `apps/ui-remix/src/routes/Review.tsx:190`: the cited `<select>` is wrapped in a `<label>` opening at line 175 with visible "Baseline" text — implicit association per WCAG H44, textbook FP. Note it degrades to `review` ("confirm each id has a matching <label for>"), not `pass` — honest, not silent.

**SEM-017 (fail→review) — CORRECTLY REMOVED.** Same citation (Review.tsx:190/191), same fix, same evidence as FRM-001. Duplicate of the same FP.

**RSP-001 (fail→pass) — CORRECTLY REMOVED.** Fix: fragment classification in `htmlDocs()` (`packages/audit/src/checks/doc.ts:17-19` — requires doctype/`<html>`/`<head>`). Both cited files are fragments: `legacy/prototype/design-ref.html` starts with `<style>` (a token sheet, 1.9 KB, no `<html>`/doctype); `legacy/prototype/scripts/graph-block.html` is a JavaScript snippet in a .html wrapper (starts with `// ---- Dependency tree...` comments). Viewport meta cannot apply to fragments.

**UND-002 (fail→pass) — CORRECTLY REMOVED.** Same two fragment files, same fix. A `<title>` requirement on a JS snippet was a FP. Cross-checked the whole repo: all 32 real HTML documents (doctype/`<html>`/`<head>`) have both a strict `<meta name="viewport">` and a non-empty `<title>` — zero real documents were excused.

**FRM-003 (fail→pass) — CORRECTLY REMOVED.** Fix: `submitRisk` gate (`markup.ts:198`) — in a self-contained .html document, typeless buttons are only an accidental-submit risk if a `<form>` exists; JSX components keep the strict rule. Ground truth: all three cited docs (`docs/cto-audit-phase6.html:99-100`, `docs/impeccable-audit-facts-code.html:600`, `docs/impeccable-audit-facts-tree.html:568`) contain **zero `<form>` elements** — the buttons are toolbar/filter chips in static report artifacts; `type` default-to-submit is inert there. The strict rule still applies to product JSX, and I verified every real `<button>` in `apps/ui-remix/src` has explicit `type` (the only 2 typeless matches are inside comments at OpenModal.tsx:1767 and TreePanel.tsx:10). `falsepos.test.ts:80` confirms typeless buttons next to a form still fail.

**PRF-003 (fail→na) — CORRECTLY REMOVED.** Fix: local()-only @font-face skip (`styles.ts:70-71`). Ground truth `apps/ui-remix/src/styles/app.css:19-26`: the cited `@font-face` is `src: local('Helvetica Neue'), local('Arial')` — a metric-override fallback font with **no `url()`**; nothing loads over the network, FOIT is physically impossible. FP.

**PRF-004 (fail→pass) — CORRECTLY REMOVED.** Fix: `isProductUi()` path filter (`util.ts:95-102`) + AST parsing (comments/strings can't match). All 47 old citations were tooling: `.claude/skills/` scripts, `.pnpmfile.cjs`, `apps/*/scripts/*.mjs` build scripts, `legacy/prototype/scripts/` — console output there is the tool's interface. Independent repo-wide grep: the only console statement in shipped UI is a single `console.warn` at `apps/ui-remix/src/lib/loadArtifacts.ts:163` (error-path fallback diagnostic), and the check deliberately scopes to log/debug/trace (`code.ts:21`), matching its own recommendation text. `packages/*/coverage/prettify.js` (istanbul assets with console.log/debugger) would slip the path filter but are gitignored (`.gitignore:7 coverage/`) and outside the 332-file pack.

## 2. New blind-spot hunt

**(a) console in real UI:** none. Zero `console.log/debug/trace` or `debugger` in `apps/ui-remix/src`; only the `console.warn` above, which is outside the check's intended scope by design. PRF-004's new `pass` is sound.

**(b) unlabelled controls excused by insideLabel:** none. Audited every `<input>/<select>/<textarea>` in `apps/ui-remix/src`. All real controls are named: `ghurl`/`ghpat`/`directoryInputId` (OpenModal.tsx:1769/1973/1998 — id), `seq-entry` (Flow.tsx:447 — id + `<label for="seq-entry">` at 446), `manifest-paste` (Vulnerabilities.tsx:551 — id), CommandPalette.tsx:383 (`aria-label="Search"`), DocsBrowse.tsx:96-101 (`aria-label="Filter documents"`), Config.tsx:496 (`aria-label`), Review.tsx:190 (wrapping label). Every other raw match (OpenModal.tsx:793/1069/1079/1131, scannerBridge.ts:118, Flow.tsx:133/426) is inside a comment.

**(c) real documents losing viewport/title:** none — see UND-002 above; 0 of 32 real documents missing either.

**Borderline (noted, not blind spots):** PER-003's citation list narrowed 7→3, dropping 4 decorative legend SVGs built inside JS string literals at `legacy/prototype/scripts/graph-block.html:156-159` (AST string-awareness); they would ideally carry `aria-hidden` when rendered, but they live in a non-shipped legacy prototype and the check still fails on the 3 real ThemeToggle.tsx icons.

## 3. Surviving fails — statuses unchanged

- OPR-023 fail→fail (briefing.html heading outline; detail improved 0→1 doc-without-one-h1, consistent with the SEM-001 gain)
- PER-003 fail→fail (ThemeToggle.tsx:60/76/86 unlabelled SVGs — same true cites)
- ROB-017 fail→fail (MarginColumn.tsx:64 redundant role — same cite)
- SEM-004 fail→fail (30 heading skips, briefing.html — same cites)
- SEM-001 pass→**fail (NEW)** — verified TRUE positive: `docs/cto-eli5-audit-2026-06-10.html` has two `<h1>` (lines 107 and 125); the v1 run missed it. This is a recall gain, not noise.

## 4. CLR-003 (review tier, new audit)

Status: `review`, tier `static`, severity `info`. Detail: "114 computable pair(s) land between 3:1 and 4.5:1, or use heavily transparent text — verify against WCAG AA (4.5:1)." `evidenceTotal: 114`, 10 citations shown. **The briefing.html translucent-text case is directly among the shown citations**: lines 71, 76, 80, 96, 161, 168, 186, 192, 197, 206 of `apps/ui-remix/public/briefing.html` are exactly the `color: var(--fg-faint)` usages, where `--fg-faint: rgba(230,232,234,0.44)` (line 25), and several are real copy (hero kicker line 96, rail body text line 80, `.toward` text line 192, figure captions line 197). v1's CLR-003 was an empty "no static check yet" stub, so this is also a capability gain.

## Summary

- **Removals correct: 7/7**
- **Wrongly-suppressed list: empty**
- **New-blind-spot list: empty** (one borderline note: 4 decorative string-literal SVG citations dropped from still-failing PER-003 in legacy prototype code)
- **Verdict:** Every one of the 7 removals eliminated a ground-truth false positive (wrapped-label control, formless static docs, local-only font, tooling console output, HTML fragments) while the new audit kept all 4 true survivors, added one verified true positive (SEM-001) and a substantive CLR-003 review queue — precision improved strictly with zero recall loss.
