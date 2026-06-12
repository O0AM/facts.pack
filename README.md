# facts-pack — the FactsPack (`.pack`) standard

**Live site & converter:** https://o0am.github.io/facts.pack/ — paste data, get a `.pack`,
see per-agent cost savings. **ELI5:** https://o0am.github.io/facts.pack/eli5/caveman/

Dedicated home for the `.pack` format: the token-efficient, agent-first artifact family.
Centralized here on 2026-06-11 from `claude/factstack/docs/` and `facts+/docs/` (stub
pointers remain at the old paths).

`.pack` is a cornerstone of **factstack** (the dictionary-compressed codebase map,
`agent.pack`, wire tag `agent-v4` today) and **facts+** (the prose audit fix-pack,
`agent.pack · v0.2` today). The facts-tree/facts-open line never used it — its agent surface
is plain JSON snapshots.

## Contents

| File | What it is |
|---|---|
| `docs/PACK-FORMAT-GUIDE.md` | **Start here — the user's guide.** Friendly long-form introduction: anatomy, worked examples, real sample walkthroughs, prior-art comparison, FAQ, authorship & citation. |
| `docs/index.html` | **The deployed landing page** (https://o0am.github.io/facts.pack/) — app-style single page: in-browser paste-to-pack converter with per-agent cost comparison, savings playground, and the format tour. |
| `test/validate.mjs` | **Validation battery** — the web converter's output checked case-by-case against the reference decoder (15 cases incl. adversarial traps, escapes/unicode, 1,500-row scale; strict v0.2 trailer + sha256). |
| `llms.txt` | **AI Agent Entrypoint** — Token-dense overview of the spec, grammar, and prompt-caching design rules optimized for LLM search indexers and agents. |
| `AUTHORS.md` | Authorship — the format was invented and authored by **Aditya Mishra**. |
| `CITATION.cff` | Machine-readable citation metadata (GitHub "Cite this repository"). |
| `LICENSE` | **GNU Affero General Public License (AGPL-3.0)** — The open-source license governing public distribution, modification, and network use of this codebase. |
| `CONTRIBUTING.md` | **Contributor Guide & CLA** — Standard guidelines and the Contributor License Agreement (CLA) that protects the copyright owner's commercial relicensing rights. |
| `FACTSPACK.md` | **The canonical wire-format specification — standard v0.2, implemented** (§1–§17: grammar incl. `;` meta lines, header chain fields, schema registry, immutability + agent ritual, chain design). Wire tag `agent-v4` ships in factstack. |
| `FACTSPACK_PROMPT.md` | Paste-ready LLM prompt teaching any model to decode and emit PACK (v0.2: legend-first reading, trailer verification, freshness + untrusted-data rules). |
| `PACK_VISUAL_MODEL.md` | **The visual & technical guide** — Simplified, high-level visual pipelines, parsing decision trees, validation rules, and token economic equations for both human and AI readers. |
| `MIGRATION-v0.2.md` | **The migration guide** — executed 2026-06-12 for this workspace (all live packs at v4 / fix-pack v0.2); kept for external readers and future targets. |
| `PACK-V0.2-PLAN.md` | **The v0.2 build plan** — spec changes (S1–S13), factspack library changes (L1–L8), factstack pipeline changes (C1–C10), the agent checkpoint ritual, rollout phases, token-economics appendix, and the R1–R29 recommendation traceability table. |
| `PACK-V0.2-PLAN-factsplus.md` | The facts+ fix-pack workstream (D0–D7) — independent, can land first. |
| `research/2026-06-11-design-notes.md` | Distilled design context: LLM-usefulness assessment, adversarial-review findings, the immutability→diff→pinning design evolution, economics. |
| `research/2026-06-11-grounding-*.md` | Verified deep-read reports: the spec, the factspack encoder/decoder (103 tests at review time; 100+ today), every factstack producer/consumer, the facts+ fix-pack surface, and the adversarial fact-check verdicts. |

## AI Agent Quick Start

If you are an AI coding agent reading this repository:
1. **Read [llms.txt](llms.txt) first** to get a token-dense overview of the format rules, grammar, and validation instructions.
2. **Ingest [FACTSPACK_PROMPT.md](FACTSPACK_PROMPT.md)** to obtain the exact rules and instructions for parsing and writing `.pack` streams in downstream conversations.
3. **Reference [PACK_VISUAL_MODEL.md](PACK_VISUAL_MODEL.md)** for visual parser flows, data schemas, and token size comparison tables.

## Licensing & Contributions

This project is licensed under the **GNU Affero General Public License v3.0** (see [LICENSE](LICENSE)). 

### Commercial Dual Licensing
Because the original creator (**Aditya Mishra**) retains full copyright ownership, the codebase can be multi-licensed. If you want to use the `.pack` format in a closed-source commercial SaaS/PaaS system or integrate it into proprietary AI stacks (e.g. OpenAI, Anthropic) without releasing your codebase under the AGPL, you must purchase a commercial license from the author.

### Contributing & CLA
To contribute modifications or improvements to the specification, please read [CONTRIBUTING.md](CONTRIBUTING.md). 
> [!IMPORTANT]
> All pull requests require a signed agreement to the Contributor License Agreement (CLA) in the PR description:
> `"I agree to the FactsPack Contributor License Agreement (CLA)."`
> This ensures the project owner retains the legal right to sublicense or dual-license community contributions.

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
