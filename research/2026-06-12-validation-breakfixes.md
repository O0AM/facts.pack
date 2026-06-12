BREAK-THE-FIXES REPORT — facts+ audit engine (real engine run via `D:\dev\ai agents\facts+\packages\audit\dist\index.js`, harness at `C:\Users\Aditya Mishra\AppData\Local\Temp\attack.mjs` + `attack2.mjs`, 36 fixtures, no repo files modified, no crashes anywhere)

## 1. insideLabel — FRM-001 (`packages\audit\src\checks\util.ts:106`)

| Attack | Expected | Actual | Verdict |
|---|---|---|---|
| A1 `<label>x</label><select>` (closed label before control) | FAIL | FAIL @ a1.html:1:25 | OK |
| A2 label in previous sibling `<div>` | FAIL | FAIL @ a2.html:1:45 | OK |
| A3 `<label for=a></label><select>` unwrapped, no id | FAIL | FAIL @ a3.html:1:22 | OK |
| A4a JSX `<Label>` wrapping select | debatable | REVIEW (treated as labelled) | OK-ish — react-aria `Label` renders `<label>`, so suppression is right, but only by the lucky accident that lowercased `<Label` prefix-matches `"<label"` |
| A4b JSX `<Label>Pick</Label><select/>` sibling | context-dependent | FAIL | OK (statically unlabelled; react-aria context wiring is invisible to static tier — acceptable) |
| A5 `"<label"` only inside an HTML comment before select | FAIL | REVIEW | **UNDER-FLAGS** |
| A6 `<label-group>` custom element wrapping select | FAIL | REVIEW | **UNDER-FLAGS** — `lastIndexOf("<label")` has no tag boundary, matches `<label-group` |
| A7 tsx string literal `const tpl = "<label...>"` before bare `<select/>` | FAIL | REVIEW | **UNDER-FLAGS** — insideLabel scans raw content, defeating the AST element model built precisely to ignore strings |
| X1 `<LabelledField>` component wrapping select | FAIL | REVIEW | **UNDER-FLAGS** (same prefix bug, JSX path) |
| X3 `data-tip="use a <label> element"` attribute before select | FAIL | REVIEW | **UNDER-FLAGS** |
| A8 properly wrapped control | no fail | REVIEW (ok-message) | OK |

## 2. htmlDocs gate (`checks\doc.ts:17`)

| Attack | Expected | Actual | Verdict |
|---|---|---|---|
| B1 real page with only `<body>` (no html/head/doctype) | doc checks apply | UND-001/UND-002/RSP-001/ROB-020 all NA | **UNDER-FLAGS** — a served body-only page escapes every document check. Bonus defect: `fullDocs()` filters htmlDocs by `<(?:html|body)`, but a `<body`-only file never survives htmlDocs, so the `body` branch of fullDocs is dead code |
| B2 fragment, `<html` only in a comment | NA | 3 FAILs (lang/title/viewport) on the fragment | **OVER-FLAGS** |
| B3 fragment, `"<head>"` inside a JS string | NA | UND-002 + RSP-001 FAIL; UND-001 vacuous PASS (no `<html>` tag exists to inspect) | **OVER-FLAGS** (+ vacuous-pass inconsistency) |

## 3. isProductUi (`util.ts:95`) — planted `console.log`, PRF-004

Only the control `src/components/App.tsx` was flagged. All five adversarial paths were silently excluded (C1), and C2 shows markup checks (FRM-001 → NA) go blind on the same paths, so the ENTIRE static tier is off for these files:

| Path | Verdict | Honest severity of over-exclusion |
|---|---|---|
| `src/scripts/upload.ts` | **UNDER-FLAGS** | HIGH — `src/scripts/` is Astro's canonical shipped-client-JS dir; common product location |
| `app/examples/gallery.tsx` | **UNDER-FLAGS** | HIGH — in Next.js app router this is a literal shipped route |
| `src/tasks/TaskList.tsx` | **UNDER-FLAGS** | HIGH — "tasks" is a core feature dir in any todo/PM product |
| `src/tools/AdminTools.tsx` | **UNDER-FLAGS** | MODERATE-HIGH — admin-tools feature pages are common |
| `src/build/BuildStatus.tsx` | **UNDER-FLAGS** | MODERATE — CI-dashboard products have `build/` feature dirs |
| `src/bench/Chart.tsx` | **UNDER-FLAGS** | LOW-MODERATE — usually genuinely benchmarks |

Root cause: the tooling-dir regex matches segments anywhere in the path, not only at repo root.

## 4. textContrast — CLR-003 (`styles.ts:153`)

| Attack | Expected | Actual | Verdict |
|---|---|---|---|
| D1 hsl() pair | skip, no crash | REVIEW "no computable pairs" | OK (graceful; hsl support is a coverage gap, not a bug) |
| D2 `background: linear-gradient(...)` | skip | skipped | OK |
| D3 `color:#fff; background:#fff url(x.png)` shorthand | ideally FAIL (1:1) | silently skipped | **UNDER-FLAGS** (white-on-white missed; "acceptable" only as a documented limit) |
| D4 currentcolor / inherit | skip | skipped | OK |
| D5 `/* color: #000; */ color: #eee; background: #fff` | FAIL (real pair 1.27:1) | "1 computable pair(s) all meet 4.5:1" | **UNDER-FLAGS** — regex matched the commented-out color AND actively asserted the rule passes |
| D6 `/* color: #fff; */ color: #000; background: #fff` | no fail (real 21:1) | FAIL @ d6.css:1:9 | **OVER-FLAGS** — genuine false positive fabricated by a comment |
| D7 `var(--missing, var(--bg, #fff))` on `#000` (--bg:#000) | ideally FAIL | skipped (`[^)]+` can't nest) | **UNDER-FLAGS** |
| D8 low-contrast rule inside `@media` | FAIL | FAIL @ d8.css:1:34 | OK |
| D9 `color: #888 !important; background: #888` | FAIL | skipped — parseColor chokes on the suffix | **UNDER-FLAGS** — `!important` is extremely common in real CSS |
| D10 background BEFORE color in source order | FAIL | FAIL | OK |
| D11 `rgba(0,0,0,0.2)` no background | REVIEW | REVIEW with citation | OK |
| D12 inline `<style>` in .html, bad pair on line 3 | FAIL, line 3 | FAIL @ d12.html:3:6 | OK (cssSources base offset exact) |

## 5. toCharIndex (`ast.ts:64`)

| Attack | Expected | Actual | Verdict |
|---|---|---|---|
| E1 file starting with literal U+FEFF BOM | console.log cited 3:1 | 3:1 | OK |
| E2 3 astral emoji on line before console.log | 2:1 | 2:1 | OK |
| E3 astral emoji on SAME line before the call | 1:17 | 1:17 | OK — byte→UTF-16 map exact through surrogate pairs |

## 6. fontDisplay — PRF-003 (`styles.ts:63`)

| Attack | Expected | Actual | Verdict |
|---|---|---|---|
| F1 `src: url(a.woff2) format(...), local("X")`, no font-display | FAIL | FAIL | OK |
| F2 `src:url(y.woff)` no space | FAIL | FAIL | OK |
| F3 local-only face, `url(` only inside a comment | NA | FAIL | **OVER-FLAGS** (minor) |
| F4 local-only clean | NA | NA | OK |

## 7. buttonType — FRM-003 (`markup.ts:191`)

| Attack | Expected | Actual | Verdict |
|---|---|---|---|
| G1 html button, no form anywhere | no fail | PASS | OK (new gate works) |
| G2 html button + `<form` only in a comment | no fail | FAIL @ g2.html:1:58 | **OVER-FLAGS** — comment fabricates submit risk |
| G3 `<button form="checkout">`, form in another file | FAIL | PASS | **UNDER-FLAGS** (mild — cross-file composition; `form` attribute presence should imply submitRisk) |
| X2 `<button form="missing">`, no form anywhere | inert button | PASS | OK-ish (button is inert; covered if the id existed in-file) |
| G4 tsx component button | FAIL (strict by design) | FAIL | OK |

## Severity-ranked weaknesses + one-line fixes

1. **HIGH — isProductUi over-excludes real product code** (`src/scripts/`, `app/examples/`, `src/tasks/`, `src/tools/`, `src/build/` kill ALL static checks for those files). Fix: only treat tooling segments as tooling at repo root (anchor `(^|/)` → `^` or require the segment NOT be under `src/|app/|pages/`).
2. **HIGH — textContrast is comment-blind both ways** (D6 false positive, D5 false negative that asserts "passes"). Fix: in textContrast (and var harvesting), strip `/*…*/` offset-preservingly first: `body.replace(/\/\*[\s\S]*?\*\//g, m => " ".repeat(m.length))`.
3. **MODERATE — insideLabel scans raw text with a prefix match**, so `<label-group>`, `<LabelledField>`, comments, strings, and attribute values all suppress FRM-001 fails. Fix: require a tag boundary (`/<label[\s>]/i` for open, matching boundary for close) and, for AST languages, derive label ancestry from JSX parents instead of raw content.
4. **MODERATE — htmlDocs gate**: `<html`/`<head` inside comments/strings promote fragments to documents (B2/B3 over-flags), while body-only pages are invisible (B1 under-flag) and make fullDocs' `<body` branch unreachable. Fix: detect doctype/html/head/body via `eachTag()` (real tag scan) and add `body` to the doc heuristic.
5. **MODERATE — parseColor rejects `!important`** (D9, very common in real CSS). Fix: `v = v.replace(/\s*!important$/, "")` before parsing.
6. **LOW-MODERATE — background shorthand skipped** (D3, white-on-white missed). Fix: try parseColor on each whitespace-separated token of the background value, take the first that parses.
7. **LOW — nested var() fallback unparsed** (D7). Fix: replace `([^)]+)` with a paren-balancing scan of the fallback.
8. **LOW — buttonType comment/string `<form` fabricates risk (G2) and `form=` attr ignored (G3)**. Fix: strip comments before the `<form\b` probe and OR in `el.attr("form") !== null` as submitRisk.
9. **LOW — fontDisplay counts `url(` inside comments** (F3). Fix: strip comments inside the matched `@font-face` block before the `url\s*\(` test.
10. **COSMETIC — htmlLang vacuously passes** a "document" that has no `<html>` tag at all (B3). Fix: cite docs where the `<html\b` regex finds nothing, instead of skipping them.

Verified solid under attack: toCharIndex (BOM + astral-pair exact line/col), @media and declaration-order handling in textContrast, hsl/gradient/currentcolor graceful skips, inline-`<style>` offset math, url+local and no-space `@font-face` forms, the closed-label/sibling-label FRM-001 cases, and the no-form button gate.
