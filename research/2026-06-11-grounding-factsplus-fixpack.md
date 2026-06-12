# facts+ agent.pack surface map

## 1. buildAgentPack today — `D:\dev\ai agents\facts+\packages\webapp\src\export.ts` (private fn, lines 37–104; not exported — only `exportReport` is)

### Header lines (exact, in order — `head` array, lines 70–88)
```
facts+ audit pack · v1
project: ${r.target.label}  (${r.target.kind})
source: ${r.target.root}
commit: ${r.target.sha}
generated: ${r.generatedAt}
grade: ${graded ? grade + " (" + overall + "/100 pass-rate of assessed)" : "— (insufficient coverage to grade)"}
coverage: ${s.coverage}% — ${s.assessed} of ${s.applicable} applicable checkpoints assessed
counts: ${fail} fail · ${review} review · ${pass} pass · ${na} n/a
severity of fails: Critical N · Serious N · Moderate N · Minor N   (via SEVERITY_META[k].label)
<blank>
This file lists UI / accessibility / performance / trust issues found in this
project, each with its exact location, surrounding code, and how to fix it.
Work top-to-bottom: criticals and serious first. Locations are file:line.
After fixing, re-run the facts+ audit to confirm.
<blank>
=== ${fails.length} FAILING CHECKPOINTS ===
<blank>
```
Note: `source:` prints `r.target.root` — the **absolute disk path** (or clone path for remote targets). Fails are sorted by `SEV_RANK` desc (critical=4…info=0) then practice id asc.

### recordOf (lines 106–138) — every field, exact order
```
--- ISSUE ${n}/${total} ---
id: ${p.id}
severity: ${p.severity}
category: ${p.category}
found_by: ${e.tier}            (+ " (AI-judged; locations below are AI-cited)" when tier === "llm")
title: ${p.title}
problem: ${e.detail}
why_it_matters: ${p.intent}
standards: ${refs}             (p.refs mapped to "kind:id", comma-joined, e.g. "wcag:1.1.1, html:H37")
locations:
${locs}
fix: ${e.recommendation}
<blank>
```
`locs`: each citation renders as `  - ${c.path}:${c.line}` plus `:${c.col}` if col is set, then a newline + snippet if the file was readable. Empty evidence → `  - (no specific location — applies project-wide)`.

### snippet() (lines 51–62)
- ±3 lines of context (`ctx = 3`), clamped to file bounds; file read via `linesOf` (cached `Map<string,string[]>`, reads `join(sourceRoot, path)`, swallows errors to `[]` → snippet returns `""`).
- Each line: 4 spaces indent + line number `String(n).padStart(4)` + `| ` + raw source line + `" <<<"` marker appended on the cited line:
```
    12| const x = 1
    13| <img src=a> <<<
    14| ...
```
- Raw source is embedded **unescaped/unfenced** — no untrusted-content delimiter today.

### Evidence cap
`e.evidence.slice(0, 8)` (line 116) — silently drops everything past 8 locations; no "+N more" indicator.

### NEEDS REVIEW appendix (lines 94–101)
```
\n\n=== NEEDS REVIEW (${reviews.length}) — not auto-decided; verify manually or add an LLM API key ===\n
- [${severity}] ${id} ${title}      (one line per review, unsorted, ALL of them)
\n
```
No trailer after this — the pack just ends.

### Types it reads
- **`Evaluation`** (`packages/audit/src/types.ts:229`): `practice` (BestPractice), `status`, `severity`, `tier` (`EvalTier | "none"`), `confidence`, `detail`, `recommendation`, `evidence: readonly Citation[]`.
- **`Citation`** (`packages/core/src/knowledge-object.ts:70`): `path` (workspace-relative), `line` (1-based), `col?`, `endLine?`, `endCol?`, `sha` (commit sha the citation was resolved against). **No content hash** — `sha` is the same commit/"working" sha for the whole run; usable for staleness vs the repo, not as a per-line content hash. A 4-char content hash must be derived from the source line itself (already in hand via `linesOf`).
- **`AuditReport.target`** = `AuditTargetMeta` (`types.ts:279`): `id` (slug), `label`, `kind` (`"local"|"github"|"gitlab"|"azure"`), `root` (**absolute path**), `sha` (commit or `"working"`). Also available on the report: `generatedAt`, `durationMs`, `fileCount`, `score`, `llm`, `runtime`.

## 2. Call sites and consumers

| Where | What |
|---|---|
| `packages/webapp/src/export.ts:31` | `exportReport` writes `agent.pack` (with `audit.json`, `report.html`) — the only `buildAgentPack` caller |
| `packages/webapp/src/index.ts:27` | re-exports `exportReport` (public API) |
| `packages/cli/src/commands/audit.ts:95` | `fp audit` — `written.push(...exportReport(report, outDir, meta.root).files)`; gated by `formats.has("json") || ("html") || ("pack")` (all three always written together, comment at line 93). Default format string is `"json,html,pack"` (line 89); `sourceRoot` = `meta.root` |
| `scripts/build-static.mjs:85` | `exportReport(report, join(OUT, 'app', slug), t.root)` — bakes the deploy site; packs exist on disk at `deploy/app/{demo-app,ecom,lms-lxp,portfolio}/agent.pack` and ship with the static deploy |
| `worker/audit.ts` | does **not** produce a pack — imports only `renderAuditHtml` + `makeJudge`; cloud audit returns HTML only |
| `packages/app/` (dashboard) | **zero** references to `agent.pack`/`exportReport` — `report-view.tsx` has no download/export link to the pack |
| `report-html.ts` | does not link to agent.pack |
| Prose only: `PRODUCT.md:28,36`, `scripts/gen-cto-audit.mjs:47`, `audit-cto-review.html:31` | positioning copy ("AI coding agents consume the agent.pack and SARIF"; ".pack artifact is a cornerstone") |

## 3. Tests that pin pack text

**None.** Exhaustive search of all `*.test.ts` for `exportReport|buildAgentPack|agent.pack|--- ISSUE|FAILING CHECKPOINTS|\bpack\b` returns zero matches.
- `packages/webapp/src/export-formats.test.ts` covers only `renderSarif` / `renderMarkdown` / `failsAtOrAbove` (asserts SARIF 2.1.0 shape, `%SRCROOT%` base id, `ROB-020` presence; markdown `/## facts\+ audit — Demo/`, `/failing checkpoint/`, `/coverage \d+%/`).
- `packages/cli/src/report/report.test.ts` is the **legacy knowledge-report** pipeline (`esc`/`html`/`analyze`/`render` over a `KnowledgeObject` fixture) — unrelated to the audit pack.
- Consequence: the pack text can change freely without breaking any test; conversely the pack format is currently **unpinned** (a v0.2 change should add a pack test next to export-formats.test.ts).

## 4. Data availability for v0.2 features

- **Total locations before cap**: free — `e.evidence.length` is the uncapped count (`Evaluation.evidence: readonly Citation[]`, types.ts:237); the cap is purely presentational (`slice(0,8)` in recordOf). `+N more` = `e.evidence.length - 8`.
- **Category grouping for reviews**: free — every `Evaluation.practice.category` (BestPractice, types.ts:84) is one of the 20 `Category` values; additionally `report.score.byCategory` (`CategoryScore`, types.ts:240) already carries per-category `review` counts if you want pre-computed numbers. Severity for the serious-and-above list: `e.practice.severity` + the existing `SEV_RANK` map (export.ts:35).
- **Source lines for content hash**: already in hand inside `buildAgentPack` — `linesOf(path)` (export.ts:39–50) returns the file's lines from `sourceRoot`; `ls[c.line - 1]` is the cited line. `Citation.sha` is NOT per-content (whole-run commit sha), so hash the line text (e.g. FNV/djb2 → 4 hex chars). recordOf currently receives only the `snippet` closure — it needs the line accessor (or a `hashAt(path,line)` closure) threaded in.

## 5. v0.2 change → exact edit points (all in `D:\dev\ai agents\facts+\packages\webapp\src\export.ts`)

| Change | File + function | Exact spot |
|---|---|---|
| (a) end-of-pack trailer | `export.ts` → `buildAgentPack` | line 103 `return head + body + appendix;` — append a trailer string |
| (b) untrusted-snippet + column-0 + re-anchor preamble | `export.ts` → `buildAgentPack` | the prose block in `head`, lines 81–84 (after `generated/grade/coverage` lines) |
| (c) "+N more locations" on capped evidence | `export.ts` → `recordOf` | the `locs` builder, lines 114–122 — after `.slice(0,8).map(...).join("\n")`, append when `e.evidence.length > 8` |
| (d) relative source path in header | `export.ts` → `buildAgentPack` | line 73 `` `source: ${r.target.root}` `` — `r.target.root` is absolute (types.ts:283); citations are already workspace-relative, so the header is the only absolute-path leak. (Callers pass `sourceRoot` = `meta.root` / `t.root`: audit.ts:95, build-static.mjs:85 — unchanged) |
| (e) NEEDS REVIEW → category counts + serious-and-above only | `export.ts` → `buildAgentPack` | `appendix`, lines 94–101; group `reviews` by `e.practice.category`, list only `SEV_RANK[e.practice.severity] >= 3` |
| (f) checkpoint-glossary dedup when fails > 50 | `export.ts` → `buildAgentPack` (emit glossary section, decide on `fails.length > 50`) **and** `recordOf` (drop/shorten `title`/`why_it_matters`/`standards` per-record, lines 129/131/132, when glossary mode is on — needs a mode flag param) |
| (g) 4-char content hash per location line | `export.ts` → `recordOf` (the `` `  - ${c.path}:${c.line}` `` line, line 119) **and** `buildAgentPack` (expose `linesOf`/a hash closure to recordOf alongside `snippet`, call at line 91) |

A new `packages/webapp/src/export-pack.test.ts` (or extending `export-formats.test.ts`, which already builds a real `AuditReport` fixture via `audit({target, files, practices: ALL_PRACTICES})`) would be the natural place to pin the v0.2 format.

## FACTS

| Fact | Value |
|---|---|
| buildAgentPack location | `D:\dev\ai agents\facts+\packages\webapp\src\export.ts` lines 37–104 (private; `recordOf` 106–138, `snippet` 51–62, `SEV_RANK` 35); only `exportReport` (line 21) is exported, re-exported via `packages/webapp/src/index.ts:27` |
| Call sites | `packages/cli/src/commands/audit.ts:95` (`fp audit`, default formats `json,html,pack`); `scripts/build-static.mjs:85` (deploy bake → `deploy/app/<slug>/agent.pack` for demo-app, ecom, lms-lxp, portfolio). NOT in `worker/` (HTML only) or `packages/app/` dashboard |
| Tests pinning pack text | none — zero test references to `exportReport`/`buildAgentPack`/`agent.pack`/pack strings; `export-formats.test.ts` pins SARIF+markdown only; `cli/src/report/report.test.ts` pins the legacy knowledge HTML report |
| AuditReport.target fields | `id`, `label`, `kind` (`local\|github\|gitlab\|azure`), `root` (absolute path), `sha` (commit or `"working"`) — `AuditTargetMeta`, `packages/audit/src/types.ts:279` |
| Citation fields | `path` (workspace-relative), `line` (1-based), `col?`, `endLine?`, `endCol?`, `sha` (whole-run commit sha — not a per-line content hash) — `packages/core/src/knowledge-object.ts:70` |
