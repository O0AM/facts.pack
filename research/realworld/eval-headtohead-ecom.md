All verifications complete. Compiling the head-to-head evaluation.

# HEAD-TO-HEAD: facts+ v0.2 vs factstack agent-v3 on D:\dev\ecom

## 1. WHAT EACH SEES

**factstack map-pack** (`factstack-on-ecom.agent-v3.pack`, 7,060 bytes ≈ **1,765 tokens**)
A comprehension map: inventory of all 33 files with language, LOC, token/byte/gzip cost, mtime, and estimated read-cost; the full import graph (8 edges: main.jsx → redux/routes/index.css; App.jsx → logos/hero/App.css; routes → App); a route table (react-router, 1 route); the env-var contract (6 `VITE_FIREBASE_*` vars in src/lib/fb.js with line numbers and fallback defaults); exported declarations (`store`, `router`, `auth`, `db`, `app`, `App` with line ranges); doc entities (Design.md = "Neo Commerce Design System", spec.md = empty, project_str.md); per-file importance scores (App.jsx = 1.0); and exactly one risk (no license declared). It says: this is a Vite + React 19 + Redux Toolkit + react-router 7 + Firebase scaffold, plus four standalone "commander" HTML prototypes and design docs that nothing imports. It says nothing about quality.

**facts+ audit fix-pack** (`agent.pack`, 59,147 bytes ≈ **14,787 tokens**; sibling `audit.json` 554KB ≈ 138.5k tokens, only needed for the review backlog; `report.html` 380KB is human-facing)
A judgment report: grade D (68/100), 9% coverage (40/434 checkpoints assessed; 394 deferred pending an LLM key), 10 failing checkpoints — missing `prefers-reduced-motion`, 10 clickable `<div>`s without keyboard semantics (double-cited as OPR-002 + SEM-009), videos without captions, 6 `target="_blank"` links missing `rel=noopener`, broken heading outlines, 32 unlabeled inline SVGs, 7 typeless buttons — each with severity, WCAG/OWASP standard, exact `file:line:col`, drift-tolerant line hash, code snippet, and a fix recipe. It says nothing about architecture, dependencies, or how files relate.

## 2. ACCURACY — spot-verification against D:\dev\ecom

**facts+ — 5/5 verified, all citations byte-exact:**

| Claim | Verdict |
|---|---|
| MOT-001: `transition: border-color 0.3s;` at App.css:8 and `box-shadow 0.3s` at :128, no reduced-motion query anywhere | **TRUE** — both lines exact; grep confirms zero `prefers-reduced-motion` in project source (only node_modules/docs) |
| TRU-001: 6 `target="_blank"` links without rel=noopener at App.jsx:46/52/67/79/91/103 | **TRUE** — all 6 lines exact, count exact |
| OPR-002/SEM-009: `<div id="modal-overlay" ... onclick=...>` at commander v1.2.html:485–486 | **TRUE** — exact line and content |
| PER-004: `<video controls>` with no `<track>` at commander v1.2.html:752 | **TRUE** — exact |
| FRM-003: typeless `<button` at App.jsx:27 | **TRUE** — exact |

Internal arithmetic also consistent (10+30 assessed = 40 of 434; +394 review +13 n/a = 447 total).

**factstack — 5/6 verified, 1 partial:**

| Claim | Verdict |
|---|---|
| Env contract: 6 VITE_FIREBASE_* vars, fb.js lines 8–13, `import.meta.env`, defaults `YOUR_API_KEY` etc. | **TRUE** — every var, line, and default exact |
| Import graph: all 8 edges (main.jsx→store/router/index.css, App.jsx→svg/png/css, routes→App) | **TRUE** — all real imports |
| Declarations: `store` 18–22, `router` 4–13, `auth` 19, `db` 20, `App` component 8–122, export 124 | **TRUE** — line ranges exact |
| LOC table (App.jsx 125, App.css 185, pnpm-lock 3755, commander v1.2 917 …) | **TRUE with convention** — uniformly raw+1 (split-on-`\n` counts trailing newline); consistent across all 13 files checked, never misleading |
| Route: `react-router GET /index` | **PARTIAL/WRONG** — actual route path is `'/'` (routes/index.jsx:6); `/index` is a normalization artifact that could send an agent hunting for a nonexistent route |
| Risk: missing-license | **TRUE** — no `license` field in package.json, no LICENSE file outside node_modules |

**Tally: facts+ 5/5 exact · factstack 5/6 exact + 1 partial.** No fabricated citations in either.

## 3. COMPLEMENTARITY

**Only factstack gives you:** the import graph and the killer insight it enables — *nothing imports the four `commander*.html` files*; they are orphaned prototypes outside the built Vite app. Also: the Firebase env-var contract, exported symbol locations, read-cost budgeting (pnpm-lock.yaml = 37k tokens, don't read it), doc inventory (spec.md is empty — 0 LOC), file importance ranking (App.jsx = 1.0), the license risk, and implicit duplicate detection (`commander.html` and `commander v1.2.html` have identical loc/tok/bytes/gz/mtime — byte-identical copies).

**Only facts+ gives you:** every concrete defect with line-precise, hash-protected citation, severity, standard reference, and fix recipe; the severity-weighted grade; the 394-item judged-review backlog; re-verification workflow (`fp audit .`).

**Both state (agreement, no contradictions):** the same file universe — every file facts+ cites appears in factstack's inventory with consistent line ranges (facts+ cites commander v1.2.html:766 inside factstack's 917-line count). Both independently corroborate the commander.html duplication: factstack via identical file stats, facts+ via identical issues at identical lines (~9f85, ~21f8, ~1599) in both copies. Zero conflicting claims found.

The cross-product matters: **8 of facts+'s 10 failing checkpoints live entirely in the orphaned prototypes factstack reveals as dead code.** The shipping React app's real fails are only noopener links, a typeless button, and missing reduced-motion. Neither artifact alone tells you that.

## 4. WORKFLOW FIT

**"Fix the worst UX problems in ecom":** load **facts+ agent.pack first** (14.8k tok — it *is* the ordered work queue with fixes), then **factstack second** (+1.8k tok) for triage judgment: deprioritize the 8 issues in unimported commander prototypes (or delete the byte-identical duplicate instead of fixing it twice), fix the 3 React-app issues, re-run `fp audit .`. Skip audit.json unless escalating to the 394 reviews. Total ~16.6k tokens.

**"Add a new feature touching checkout":** load **factstack first** (1.8k tok) — it shows there *is no checkout*: one route (`'/'`), a near-empty redux store, the Firebase contract you must wire into, and an empty spec.md. That's pure greenfield orientation facts+ cannot give. Don't load the facts+ pack up front (its issues are mostly in dead prototypes); instead **re-run facts+ after building** as the quality gate on the new checkout UI. Order: factstack → build → fp audit.

## 5. THE FAMILY THESIS

**Supported by this evidence.** The artifacts have near-zero informational overlap (shared content is only the file universe), zero contradictions, and — critically — *composition changes decisions*: factstack's import graph reframes facts+'s severity ordering (most fails are in dead code), and facts+ supplies the actionable defects factstack's single license-risk cannot. Both honor the same .pack discipline (line-oriented, dictionary-compressed, agent-addressed, self-verifying footer/hash conventions). Caveats: facts+ ran at only 9% assessed coverage (the 394-review tier needs an LLM key, so "judgment" is partly latent); factstack's one soft error was in routes, exactly the kind of claim agents act on; and on a 33-file repo a map is cheap to rebuild by hand — factstack's orientation value should compound with repo size, which this sample can't prove.

## VERDICT TABLE

| Dimension | factstack map-pack (agent-v3) | facts+ audit fix-pack (v0.2) |
|---|---|---|
| **Accuracy** | 5/6 exact, 1 partial (route `/index` vs real `/`); LOC uses consistent +1 newline convention | 5/5 exact — every line, snippet, and count verified |
| **Token cost** | ~1.8k tokens (7.1 KB) | ~14.8k tokens (59 KB); +138.5k optional audit.json |
| **Actionability** | Low–medium: 1 fixable risk, env contract, read budget; no fix recipes | High: 10 ordered fixes with locations + recipes + re-verify loop |
| **Orientation value** | High: stack, import graph, routes, exports, docs, importance, duplicates | Low: no architecture; file knowledge only incidental via citations |

**Overall conclusion:** On the same real repo, the two packs proved factually reliable (facts+ flawless on 5 spot-checks, factstack 5/6 with one route-path normalization error) and almost perfectly disjoint in content, which is the strongest possible evidence for the comprehension+judgment family thesis. factstack buys an agent the lay of the land for under 2k tokens; facts+ buys a verified, executable defect queue for 15k. Their composition is more than additive: only the map reveals that 80% of the audit's failing checkpoints sit in orphaned prototype files, which inverts the fix priorities an agent would otherwise follow. The honest gaps are facts+'s 9% assessed coverage without an LLM key and factstack's diminishing returns on a repo this small — but on this evidence the right default for an agent is: map first, audit as gate, never one pretending to be the other.
