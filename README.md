# facts-pack — the FactsPack (`.pack`) standard

Dedicated home for the `.pack` format: the token-efficient, agent-first artifact family.
Centralized here on 2026-06-11 from `claude/factstack/docs/` and `facts+/docs/` (stub
pointers remain at the old paths).

`.pack` is a cornerstone of **factstack** (the dictionary-compressed codebase map,
`agent.pack`, wire tag `agent-v3` today) and **facts+** (the prose audit fix-pack,
`agent.pack · v1` today). The facts-tree/facts-open line never used it — its agent surface
is plain JSON snapshots.

## Contents

| File | What it is |
|---|---|
| `docs/PACK-FORMAT-GUIDE.md` | **Start here — the user's guide.** Friendly long-form introduction: anatomy, worked examples, real sample walkthroughs, prior-art comparison, FAQ, authorship & citation. |
| `docs/index.html` | **The web explainer** — self-contained single-page site (GitHub-Pages-ready) telling the same story visually. |
| `AUTHORS.md` | Authorship — the format was invented and authored by **Aditya Mishra**. |
| `CITATION.cff` | Machine-readable citation metadata (GitHub "Cite this repository"). |
| `LICENSE` | **GNU Affero General Public License (AGPL-3.0)** — The open-source license governing public distribution, modification, and network use of this codebase. |
| `FACTSPACK.md` | **The canonical wire-format specification — standard v0.2, implemented** (§1–§17: grammar incl. `;` meta lines, header chain fields, schema registry, immutability + agent ritual, chain design). Wire tag `agent-v4` ships in factstack. |
| `FACTSPACK_PROMPT.md` | Paste-ready LLM prompt teaching any model to decode and emit PACK (v0.2: legend-first reading, trailer verification, freshness + untrusted-data rules). |
| `PACK_VISUAL_MODEL.md` | **The visual & technical guide** — Simplified, high-level visual pipelines, parsing decision trees, validation rules, and token economic equations for both human and AI readers. |
| `MIGRATION-v0.2.md` | **The migration guide** — executed 2026-06-12 for this workspace (all live packs at v4 / fix-pack v0.2); kept for external readers and future targets. |
| `PACK-V0.2-PLAN.md` | **The v0.2 build plan** — spec changes (S1–S13), factspack library changes (L1–L8), factstack pipeline changes (C1–C10), the agent checkpoint ritual, rollout phases, token-economics appendix, and the R1–R29 recommendation traceability table. |
| `PACK-V0.2-PLAN-factsplus.md` | The facts+ fix-pack workstream (D0–D7) — independent, can land first. |
| `research/2026-06-11-design-notes.md` | Distilled design context: LLM-usefulness assessment, adversarial-review findings, the immutability→diff→pinning design evolution, economics. |
| `research/2026-06-11-grounding-*.md` | Verified deep-read reports: the spec, the factspack encoder/decoder (+103 tests), every factstack producer/consumer, the facts+ fix-pack surface, and the adversarial fact-check verdicts. |

## Where the implementations live

- **Wire format library:** `D:\dev\ai agents\claude\factstack\packages\factspack\` (encode/decode/escape + tests)
- **Map-pack emitter:** `D:\dev\ai agents\claude\factstack\packages\emit\src\pack.ts` (`agent-v3`, 12 tables) → `<project>/.facts/agent.pack`
- **MCP per-tool packs:** `D:\dev\ai agents\claude\factstack\apps\mcp-server\src\pack-responses.ts`
- **Fix-pack emitter:** `D:\dev\ai agents\facts+\packages\webapp\src\export.ts` (`buildAgentPack`) → `agent.pack` beside `audit.json`/`report.html`

## v0.2 in one line

Immutable, hash-chained, self-describing packs — `master.<seq>.pack` + per-commit
`.pack-diff` + `latest` manifest, in-band legend and trailer, injection armor, unified ids,
ranked head — produced by tools, validated by decoders, annotated by agents, and priced for
prompt-cache economics.
