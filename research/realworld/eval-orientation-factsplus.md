ORIENTATION TEST REPORT — factstack agent-v3 pack over facts+

## Step 1 — Answers from the pack only

**(1) Project kind/structure** — facts+ ("The Ultimate Static Analysis Tool" per docs entities; PRODUCT.md/DESIGN.md "Liquid Glass"): a TypeScript pnpm monorepo implementing a UI/UX best-practices audit tool with tiered evaluation (static checks → LLM judge → Playwright/axe runtime probe). 8 packages: `core` (knowledge-object graph model), `scanner` (crawl + oxc symbol walk), `store` (SQLite), `audit` (catalog of 20 categories / "400+" points, checks, scoring), `cli` (scan/report/serve/watch/audit), `runtime` (Playwright/axe probe), `webapp` (dashboard, exports, LLM client), `app` (Remix v3 glass-UI dashboard); plus `worker/` (Cloudflare Worker cloud audit), `scripts/`, `docs/`, `1idea/` planning HTML, `examples/demo-app`, `verification/`. Confidence: high.

**(2) Top 5 files** — by the pack's `imp` metric: `packages/core/src/index.ts` (1.0), `packages/core/src/knowledge-object.ts` (0.831), `packages/audit/src/types.ts` (0.831), `packages/core/src/node-id.ts` (0.449), `packages/audit/src/index.ts` (0.441). Judgment-adjusted (metric looks barrel-biased — core/index.ts is 8 LOC): knowledge-object.ts, audit/types.ts, audit/severity.ts, app/store.server.ts, webapp/export.ts. Confidence: medium — `imp` is an undocumented column I guessed is import-graph centrality, and `engine.ts` showed `loc 0, lang=other` which made me distrust its rank.

**(3) Scoring math** — `packages/audit/src/severity.ts`: `score()` lines 249–316, `aggregate()` 227–243 ("pass-rate of what was ASSESSED"), `gradeFor()` 193–198; tested in `scoring.test.ts`. Confidence: high (docstrings in the rationale table nailed it).

**(4) agent.pack fix-bundle build** — `packages/webapp/src/export.ts`: `buildAgentPack()` lines 60–164, called from `exportReport()` (23–35), with `glossarySection`/`reviewAppendix`/`recordOf` helpers; tested by `packages/webapp/src/export-pack.test.ts`. Confidence: high.

**(5) Counts** — 228 files, 66,330 total LOC (summed from the files table; binaries counted 0). Header's trailing `1386` is undocumented; I derived it equals total data-row count (228+237+497+9+159+3+228+23+2). Confidence: high on 228, medium on LOC semantics.

**(6) Risks/secrets/todos** — risks table: 3× medium broken-import in `worker/audit.ts` (unresolved `../packages/runtime/dist/axe-map.js`, `../packages/webapp/dist/llm-client.js`, `../packages/webapp/dist/report-html.js`), 1× low missing license, 5× low >1MB PNGs skipped. Envs: only `NODE_ENV`, `PORT` — no secrets flagged. TODOs: ~30 hits but mostly self-referential (the catalog/docs describe TODO-detection); real ones: `examples/demo-app/ProductList.jsx:9`, `assets/app.js:1157`.

**Guess points hit (format-forced):** (a) trailing header number `1386` unexplained; (b) dual id spaces — the same file has an F-id and a T-id (`dashboard.tsx` = F6 = T3, `controller.tsx` = F1 = T19), two lookups per import/declaration row; (c) undocumented columns: `files.read` (read-time? minutes?), `churn`, `nodeMetrics.imp`/`comm`, `declarations.exp`, `imports.conf`; (d) `& routes`, `& symbols`, `& calls` tables have schemas but zero rows — "none found" vs "not implemented" is indistinguishable; (e) `engine.ts` listed `status ok` but `loc 0, tok 0, lang other` — had to guess a packer read failure; (f) scan exclusion rules nowhere stated, so "228 files" is uninterpretable without the repo.

## Step 2 — Verification against D:\dev\ai agents\facts+

- **Q1 RIGHT.** `packages/` contains exactly app, audit, cli, core, runtime, scanner, store, webapp; worker/, scripts/, docs/ as described.
- **Q2 HALF.** knowledge-object.ts/types.ts are genuinely central, but the pack hid `packages/audit/src/engine.ts` — on disk it is a normal 338-line, 11,900-byte TS file ("The audit engine: best practices + project files..."), arguably top-3 important. Pack CONTENT error (misread file, mtime ~5 min before pack generation) compounded by FORM error (status said "ok").
- **Q3 RIGHT.** `gradeFor` at severity.ts:193, `score` at :249 — exact line matches.
- **Q4 RIGHT.** `buildAgentPack` at export.ts:60, `exportReport` at :23 — exact line matches.
- **Q5 RIGHT (with caveat).** Every one of the 228 pack files exists in the repo (zero stale entries); the repo has 285 raw files, the extra 57 all generated (.facts, .gstack, .wrangler, deploy/, tsbuildinfo, logs) — sensible but undeclared exclusions. LOC: repo wc -l over the same set = 66,467 vs pack 66,330 (0.2% off; definitional + engine.ts counted 0).
- **Q6 MOSTLY RIGHT.** Missing license confirmed (no `license` field, no LICENSE file). PNG sizes confirmed. But the broken-import risk is overstated CONTENT: all three dist files exist on disk; the imports resolve after a build — the analyzer just doesn't scan dist/, and its message ("dependency removed or path stale") is wrong. Legit fragility signal, wrong diagnosis.

**Error attribution:** CONTENT — engine.ts misread (worst miss), broken-import misdiagnosis, barrel-biased imp metric. FORM — dual F/T id spaces, undocumented columns/header number, empty-table ambiguity, unstated scan scope, `status ok` on an unread file.

## Verdict

**Orientation score: 5/6** (Q2 half, Q6 half; rest clean).

**Time-to-orient:** the pack-equipped agent wins clearly. One ~53K-token read produced exact file+line targets for scoring and pack-building (verified line-exact), the package topology, importance ranking, churn, docstring rationale, and a risk register — a directory-listing+grep agent would need 5-10 search rounds for Q2-Q4 and would never get imp/churn/risks. Two costs: ~25% of tokens go to dictionary + nodeMetrics boilerplate, and one silently-wrong row (engine.ts "ok"/0-LOC) is worse than no data — grep would never conclude the audit engine is empty.

**Top 3 v0.2 improvements vs confusions actually hit:**
1. **Unified ids** — YES, fixes a concrete confusion: the F#/T# double dictionary forced two lookups per imports/declarations row and obscured that F6 and T3 are the same file.
2. **Legend lines** — YES, fixes concrete confusions: the trailing `1386`, `read`/`churn`/`imp`/`comm`/`exp`/`conf` columns, and empty-table semantics were the majority of my guesswork; a one-line legend per table eliminates all of it.
3. **Top table** — PARTIAL: it would have fixed the Q2 ranking ergonomics (curated hot files instead of eyeballing raw imp floats biased toward 8-LOC barrels) and made the engine.ts anomaly conspicuous, but the underlying misread is a content bug a top table exposes rather than fixes. (Hot-ref hints would have helped Q3/Q4, but those already succeeded without them.)

Key paths: pack `D:\dev\ai agents\facts-pack\research\realworld\factstack-on-factsplus.agent-v3.pack`; scoring `D:\dev\ai agents\facts+\packages\audit\src\severity.ts`; pack builder `D:\dev\ai agents\facts+\packages\webapp\src\export.ts`; misread file `D:\dev\ai agents\facts+\packages\audit\src\engine.ts`.
