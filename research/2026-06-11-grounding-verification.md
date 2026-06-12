VERDICT LIST — 8 load-bearing claims, all independently verified against source:

1. **Spec version string** — CONFIRMED. Status block reads "Status: design-locked... Schema version: `1`. Last revised: 2026-04-24." — `D:\dev\ai agents\claude\factstack\docs\FACTSPACK.md:3-5`. Rejection rule "Version-mismatched packs MUST be rejected with a clear error (no silent best-effort parsing)" at `FACTSPACK.md:283-284`.

2. **Schema-tag rejection is spec-only, NOT enforced by decode()** — CONFIRMED. Doc comment: "the decoder reads the header faithfully but doesn't enforce a particular version. The caller checks `decoded.header.schema`..." — `D:\dev\ai agents\claude\factstack\packages\factspack\src\decode.ts:22-25`. `parseHeader` only checks non-empty producer/schema/snapshotId — `decode.ts:193-195` (report said 194-196; off by one, substance correct).

3. **encodeIncremental never called in production** — CONFIRMED. Defined `packages\factspack\src\encode.ts:81`, exported `src\index.ts:22`; only call sites are `test\encode.test.ts:233,252` and `test\round-trip.test.ts:138`; `docs\feature-plan.md:462` confirms it's planned-but-unwired. Exhaustive grep matches report exactly.

4. **No facts+ tests pin pack text** — CONFIRMED. Grep across all `*.test.ts` in `D:\dev\ai agents\facts+` for `exportReport|buildAgentPack|agent\.pack|FAILING CHECKPOINTS|--- ISSUE` → zero matches. Pack format is unpinned.

5. **Schema tag set points** — CONFIRMED. `const SCHEMA = 'agent-v3'` at `packages\emit\src\pack.ts:37`, `const PRODUCER = 'factstack/0.3.10'` at `:32` (comment at :33-34 documents v2/v3 history). MCP per-tool tags at `apps\mcp-server\src\pack-responses.ts:23` (PRODUCER) and `:72` query-graph-v1, `:100` risks-v1, `:156` outline-v2, `:283` subgraph-v1, `:375` context-v1, `:399` envs-v1, `:435` learnings-v1. Fixture `'agent-v1'` only at `packages\factspack\test\round-trip.test.ts:24`. The live tag is agent-v3, not agent-v1.

6. **Per-column id namespaces** — CONFIRMED. `Encoder` class (`packages\factspack\src\encode.ts:174`) keeps `maps: Map<colName, Map<literal,key>>` (`:176`) and `counters: Map<colName, number>` (`:178`); key = `` `${colName}${next}` `` in `intern()` (`:199-214`). One Encoder per pack ⇒ same-named columns share keys across tables. No unified namespace exists.

7. **agent.pack write path** — CONFIRMED. `encodeAgentPack(agent)` called with no snapshotId at `packages\emit\src\orchestrator.ts:126` (so snapshotId = `generatedAt`); written via `writer.writeText('agent.pack', packBody)` at `orchestrator.ts:142`; comment at :124-125 confirms "ships in EVERY profile — minimal and legacy alike"; `NodeFileWriter` defaults to `.facts` subdir (`packages\emit\src\node-writer.ts:36`).

8. **Citation fields (facts+)** — CONFIRMED. `export interface Citation` at `D:\dev\ai agents\facts+\packages\core\src\knowledge-object.ts:70`: `path` (workspace-relative), `line` (1-based), `col?`, `endLine?`, `endCol?`, `sha` ("SHA the citation was resolved against — lets a stale citation be detected") — whole-run commit sha, no per-line content hash. Supporting: `AuditTargetMeta` at `packages\audit\src\types.ts:279` with `root` "absolute path on disk" (`:283`) and `sha` "commit or \"working\"" (`:284`); `buildAgentPack` at `packages\webapp\src\export.ts:37`, `source: ${r.target.root}` leak at `:73`, evidence cap `.slice(0, 8)` at `:116`.

No corrections required. The only deviation found anywhere: decode.ts empty-field check is at lines 193-195, not 194-196 as Report 2 stated — cosmetic, does not affect any plan decision.
