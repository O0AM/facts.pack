# agent.pack producers & consumers — FACTS monorepo (`D:\dev\ai agents\claude\factstack`)

## 1. The emit pipeline

**Table building** — all 12 `PackTable`s are built in `D:\dev\ai agents\claude\factstack\packages\emit\src\pack.ts` by `encodeAgentPack(agent, opts)` (line 45). Schema name is **`agent-v3`** (not agent-v1); table order is part of the contract:

| # | Table | Columns (exact) | Notes |
|---|-------|-----------------|-------|
| 1 | `files` | `path, L, loc, tok, bytes, gz, status, mtime, churn, read` | `L`=interned lang; `path` literal PK |
| 2 | `imports` | `id, F, T, kind, conf` | file-graph edges; `F`/`T` interned paths |
| 3 | `routes` | `id, framework, method, path, F, sym` | `F`=interned handler file |
| 4 | `risks` | `id, sev, cat, rule, F, line, msg, tech` | |
| 5 | `envs` | `id, N, F, line, access, default` | flattened (one row per read site) |
| 6 | `declarations` | `id, F, name, kind, start, end, exp` | top-level decls only |
| 7 | `symbols` | `id, F, name, kind, start, end, exp` | F2; empty without `--symbols` |
| 8 | `calls` | `id, S, T, kind, conf` | F2 symbol edges |
| 9 | `nodeMetrics` | `path, imp, comm` | F5; PageRank importance + community |
| 10 | `rationale` | `id, sym, kind, text, F, line` | F10 |
| 11 | `entities` | `id, kind, name, mod, F, line, detail` | F11 whole-stack |
| 12 | `entityEdges` | `id, E, T, kind, conf, line` | F11 |

**Header assembly** — also in `pack.ts` (lines 32–51): `PRODUCER = 'factstack/0.3.10'`, `SCHEMA = 'agent-v3'`, `snapshotId = opts.snapshotId ?? agent.generatedAt`, `rowCount: null` (the encoder sums table rows). Header line rendering (`# producer\tschema\tsnapshotId\trowCount`) lives in `renderHeader` in `D:\dev\ai agents\claude\factstack\packages\factspack\src\encode.ts:104`.

**Disk write** — `writeArtifactsTo()` in `D:\dev\ai agents\claude\factstack\packages\emit\src\orchestrator.ts` calls `encodeAgentPack(agent)` (line 126, no snapshotId override — so snapshotId is always `generatedAt` today) and writes `agent.pack` (line 142). `agent.pack` is written in **every** profile (`minimal` and `legacy`). The Node shim `writeArtifacts()` in `packages\emit\src\write.ts` wraps it with `NodeFileWriter(root)` (`packages\emit\src\node-writer.ts` — scoped to `<root>/.facts/`, auto-mkdirp, path-escape guard). The browser shim `packages\emit-browser\src\write.ts` calls the same orchestrator via the FSA writer.

`.facts/` layout: `agent.json` (legacy only), `human.json`, **`agent.pack`**, `agent.jsonl` (legacy only), `MEMORY.md` (optional), `snapshots/<ISO-ms>Z.json` (when `writeSnapshot`), `learnings.jsonl` (appended separately by CLI/MCP, not by the orchestrator).

**Transitive producers** (everything that calls `writeArtifacts`): CLI `analyze` (cli.ts:283, legacy + snapshot), CLI `ui`/`watch` `reanalyzeAndPush` (cli.ts:472), CLI `scan-vulns` (~cli.ts:1393), MCP `runAnalyze` (server.ts:139) and `list_vulnerabilities refresh:true` (server.ts:776), Claude Code PostToolUse hook (`apps\cli\src\agentHook.ts` — `npx factstack analyze --minimal` after Edit|Write), git post-commit hook (`apps\cli\src\gitHook.ts` — `npx factstack analyze .`).

**`encodeIncremental` is NEVER called in production code.** Defined at `packages\factspack\src\encode.ts:81`, exported via `packages\factspack\src\index.ts:22`. Only call sites: `packages\factspack\test\encode.test.ts:233,252` and `packages\factspack\test\round-trip.test.ts:138`. `docs\feature-plan.md:462` (F8) explicitly notes "encodeIncremental already exists in the types; wire a `writeIncrementalPack` path in `emit`" — i.e. planned, unwired.

## 2. Row ordering & in-degree data

- **`files` rows = walker enumeration order**: directories-first, then files, alphabetical within each level (`packages\walker\src\index.ts:133-137`) — deterministic, path-grouped, but not flat-alphabetical. `agent.files` is `outlines[]` pushed in walk order (`packages\core\src\index.ts:200,266,461`).
- **`imports`/`calls`/`entityEdges`**: insertion order (per-file × per-import), `id` = array index. **`routes`**: deduped then sorted by URL path `localeCompare` (`core\src\index.ts:898`). **`envs`**: vars sorted by read-count desc then name (`core\src\index.ts:1322`), reads sorted by file/line. **`declarations`/`symbols`/`nodeMetrics`**: follow file/node order. **`risks`**: scanner emission order.
- **In-degree/importance already computed — three sources, all reusable for a ranked `top` table**:
  1. `computeMetrics` (`packages\graph\src\metrics.ts:45`) — deterministic PageRank `importance` (normalized 0..1, fixed 30 iters) + community, written onto every graph node (`core\src\index.ts:569-575`) and **already emitted** in the pack's `nodeMetrics` table. Sorting `nodeMetrics` by `imp` desc gives the ranked top list with zero new computation.
  2. `buildCallerIndex` (`packages\graph\src\callers.ts:24`) — inverted importer index, backfilled as `node.callers` (`core\src\index.ts:559-563`); `callers.length` = raw in-degree (in agent.json, not in the pack).
  3. `buildHubDiagram` (`packages\core\src\diagram.ts:207-221`) — recomputes per-file `inDegree` for the hub view (rank by in-degree, alpha tie-break).

## 3. MCP server (consumer side)

The MCP server (`apps\mcp-server\src\server.ts`) **never serves or reads the raw `agent.pack` file**. It keeps the full `AgentArtifact` in memory (`cached`, populated by `runAnalyze`, which also *writes* agent.pack to disk as a side effect) and **re-encodes fresh, per-tool PACK strings** via the converters in `apps\mcp-server\src\pack-responses.ts` (same `PRODUCER = 'factstack/0.3.10'`, `snapshotId = agent.generatedAt` via `packSnapshotId`):

- `query_graph` → `query-graph-v1` (`paths`/`orphans`/`cycles` tables)
- `query` → `subgraph-v1` (`nodes`, `edges`, `citations`, 1-row `meta`)
- `get_outline` → `outline-v2` (`declarations` + `refs`)
- `list_risks` → `risks-v1` (column-identical to agent.pack's `risks` — deliberate so agents learn columns once)
- `get_config` → `envs-v1` (identical to agent.pack `envs`)
- `query_learnings` → `learnings-v1`
- `get_context` → `context-v1` (`ranked`, `edges`, `meta`)

All default to `format:"pack"` with a `format:"json"` escape hatch. MCP **resources** (`facts://project|graph|routes|risks|file/{path}|schema/{kind}`) are JSON-only — no pack resource. `analyze`'s response advertises the pack schema versions (`agent: 'agent-v3'`, etc., server.ts:541-551). Other consumers of agent.pack are *instructional*: the skills renderers (`packages\skills\src\format.ts`, `renderers\agents.ts`, `renderers\claude.ts`) generate AGENTS.md/.cursorrules/SKILL.md telling external agents to `cat .facts/agent.pack` first. `decode()` from factspack is used only in tests. The Remix UI (`apps\ui-remix\src\lib\loadArtifacts.ts`) consumes the **JSON dataset** (inline `<script id="factstack-data">` or `/data/factstack.json`), never the pack.

## 4. CLI surface

- **`factstack watch [target]` exists** (cli.ts:992) — pure alias for `ui --watch`. `ui --watch` runs a chokidar watcher (cli.ts:950) over the project root (excluding `.facts/**`, `node_modules/**`, build outputs to avoid write→watch→write loops); on any event it debounces 400ms-ish and chains `reanalyzeAndPush('watch')` (cli.ts:467) → **full re-analyze + full `writeArtifacts` (legacy profile, `writeSnapshot: true`) + SSE broadcast**. Every file change rewrites the entire agent.pack; nothing incremental.
- **Git-hook integration exists today**: `factstack hook install|uninstall` (cli.ts:2208, F8) installs a marker-delimited **post-commit** hook (`apps\cli\src\gitHook.ts`) running `npx factstack analyze . >/dev/null 2>&1 || true` — full re-analyze after each commit, never blocks, idempotent merge, handles `gitdir:` pointer files (worktrees/submodules); `core.hooksPath` is a documented limitation. Plus the Claude Code PostToolUse hook (`agentHook.ts`, `factstack setup` path) running `analyze --minimal` after every Edit/Write.
- **snapshots/**: `.facts/snapshots/<ISO-ms>Z.json` (collision suffix `-1`, `-2`…) written by `writeSnapshotFile` in `orchestrator.ts:239` — a 7-field stats rollup (`at, stats, risks, broken, stale, todos, secrets`), NOT a full artifact. Retention default 50, lexically-oldest pruned (`pruneSnapshots`). Read back by `readSnapshots` (`emit\src\write.ts:127`, History tab) and `readLatestSnapshot` (server.ts:1022, for `since`/`review_change`).
- **`factstack diff [a] [b]`** (cli.ts:1469): zero-arg = *second-to-last* snapshot vs current `agent.json` (the newest snapshot was written by the same analyze run); one-arg = named snapshot vs agent.json; two-arg = two explicit endpoints. Snapshot rollups are synthesized into minimal AgentArtifacts (`loadDiffEndpoint`, cli.ts:2713) → per-file diff marked `incomplete`. `factstack review` reuses the same endpoint resolution for the Change Verdict. **Note: diff compares JSON artifacts/snapshots, never `.pack` files.**

## 5. learnings.jsonl

- **Path**: `<root>/.facts/learnings.jsonl`, append-only JSONL, one event per line.
- **Schema**: `LearningEventSchema` (Zod) in `D:\dev\ai agents\claude\factstack\packages\core\src\learnings.ts:52` — `schemaVersion` (literal `factstack-learnings.v1`), `timestamp` (ISO), `agent`, `model?`, `ticketId?`, `action` (≤64 chars), `outcome` (`accepted|rejected|pending|self-calibrate`), `reasoning?` (≤500), `filesAffected?`, `confidence?` (0..1), `tags?`, `meta?`. Serialized via `formatLearningEvent` (validates then `JSON.stringify + '\n'`); parsed by `parseLearningsJsonl` (tolerant, per-line).
- **Writers** (core is pure; fs appends live on the adapters):
  - CLI `analyze`: inline `appendFileSync` of a self-calibrate event (cli.ts:295-310).
  - CLI F9 helpers: `appendLearningLine` (cli.ts:2921) used by `factstack remember`/context/session commands.
  - MCP server: `appendLearning` (server.ts:1057) used by the `log_learning` tool, the post-analyze self-calibrate event (server.ts:153), and `get_context`'s deduped `served` session events (server.ts:980).

## 6. v0.2 plan (immutable `master.<seq>.pack` + per-commit `.pack-diff` + latest pointer + hash chain + conditional rebuild) — touch list

**Files/functions to change:**
1. `packages\emit\src\pack.ts` — add a `writeIncrementalPack`/`encodeAgentPackDelta` companion to `encodeAgentPack`; pass a real `snapshotId` (commit SHA) instead of defaulting to `generatedAt`.
2. `packages\emit\src\orchestrator.ts` — `writeArtifactsTo` is the choke point: rename/sequence the pack write (`agent.pack` → `master.<seq>.pack`), add `latest` pointer write, hash-chain field, and a conditional-rebuild check before encoding; extend `WriteArtifactsToOptions`/`WriteArtifactsResult`.
3. `packages\emit\src\write.ts` (Node shim) + `packages\emit-browser\src\write.ts` — surface new options/paths (and decide browser behavior).
4. `packages\factspack\src\encode.ts` / `types.ts` — `encodeIncremental` + `IncrementalTable` (`+`/`x` rows, rowCount 0 convention) **already exist and are tested; reuse as-is**. Header may need a `prevHash`/chain extension (spec change in `docs/`).
5. `apps\cli\src\cli.ts` — `analyze` action (seq/pointer/conditional flags), `diff` (teach `resolveDiffEndpointArg`/`loadDiffEndpoint` about `.pack-diff` endpoints), possibly a new `pack-log`/`compact` verb.
6. `apps\cli\src\gitHook.ts` — `GIT_HOOK_COMMAND`/`factstackGitHookBlock`: post-commit becomes the per-commit `.pack-diff` producer (e.g. `factstack analyze --incremental`), passing `HEAD` SHA as snapshotId. The marker-block install/uninstall machinery is reusable unchanged.
7. `apps\cli\src\agentHook.ts` — optionally switch the freshness hook to the incremental path.
8. `apps\mcp-server\src\server.ts` — `runAnalyze`/`readLatestSnapshot` to follow the `latest` pointer; `packSnapshotId` (pack-responses.ts:454) to key on seq/SHA instead of `generatedAt`.
9. `packages\spec\` — schema additions for seq/hash metadata.

**Reusable machinery (don't rebuild):** `encodeIncremental` (done, tested); the `FileWriter` abstraction + `listKeys`/`removeEntry` (snapshot naming, collision suffixing, retention pruning in `orchestrator.ts` is exactly the immutable-sequence + retention pattern needed for `master.<seq>.pack`); chokidar watch + serialized `reanalyzeChain` in `ui --watch` (debounce/serialization for conditional rebuild); `diffArtifacts`/`buildChangeVerdict` + `resolveDiffEndpointArg` (endpoint resolution for diff verbs); git-hook installer (marker block, gitdir resolution); per-file `contentHash` (djb2) already in `extractors/src/parse.ts` per feature-plan F8 (conditional-rebuild input); `node.callers` + `computeMetrics` importance for any ranked `top` table.

---

## FACTS table

| Fact | Value |
|---|---|
| **Tables emitted** (`agent-v3`, fixed order) | `files(path,L,loc,tok,bytes,gz,status,mtime,churn,read)` · `imports(id,F,T,kind,conf)` · `routes(id,framework,method,path,F,sym)` · `risks(id,sev,cat,rule,F,line,msg,tech)` · `envs(id,N,F,line,access,default)` · `declarations(id,F,name,kind,start,end,exp)` · `symbols(id,F,name,kind,start,end,exp)` · `calls(id,S,T,kind,conf)` · `nodeMetrics(path,imp,comm)` · `rationale(id,sym,kind,text,F,line)` · `entities(id,kind,name,mod,F,line,detail)` · `entityEdges(id,E,T,kind,conf,line)` |
| **agent.pack write path** | `<projectRoot>/.facts/agent.pack` — built by `encodeAgentPack` (`packages\emit\src\pack.ts:45`), written by `writeArtifactsTo` (`packages\emit\src\orchestrator.ts:142`) via `NodeFileWriter` (`packages\emit\src\node-writer.ts`, `.facts` subdir) / FSA writer in browser; written in both `minimal` and `legacy` profiles |
| **encodeIncremental call sites** | **None in production.** Defined `packages\factspack\src\encode.ts:81`; exported `packages\factspack\src\index.ts:22`; called only in `packages\factspack\test\encode.test.ts:233,252` and `packages\factspack\test\round-trip.test.ts:138` |
| **watch/diff behavior** | `factstack watch` = alias for `ui --watch` (cli.ts:992): chokidar on root (excl. `.facts/`, node_modules) → serialized full re-analyze + full `writeArtifacts` (legacy, snapshot on) + SSE push per change. `factstack diff` (cli.ts:1469): zero-arg = second-to-last `.facts/snapshots/<ISO>.json` rollup vs current `agent.json`; 1–2 args = explicit snapshot/agent.json endpoints; compares JSON only, never packs. Git post-commit hook (`factstack hook install`, `apps\cli\src\gitHook.ts`) runs full `npx factstack analyze .` per commit |
| **learnings.jsonl writer locations** | Schema/serializers (pure): `packages\core\src\learnings.ts` (`LearningEventSchema`, `formatLearningEvent`). Disk appenders: CLI analyze inline append (`apps\cli\src\cli.ts:310`), CLI `appendLearningLine` (`apps\cli\src\cli.ts:2921`), MCP `appendLearning` (`apps\mcp-server\src\server.ts:1057`) — all to `<root>/.facts/learnings.jsonl` |
