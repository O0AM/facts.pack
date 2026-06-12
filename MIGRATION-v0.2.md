# Migrating to FactsPack standard v0.2

> Status: **executed 2026-06-12** for everything in this workspace; this guide
> remains for external readers and future targets.

## TL;DR

Regenerate, don't convert. Packs are derived artifacts — the migration for any
target is one command, and every consumer in the family already speaks v0.2.

```
factstack analyze <target>     # map-pack: agent-v3 → agent-v4
fp audit <target>              # fix-pack: v1 → v0.2 (already the only emitter)
```

## What changed on the wire

| | v0.1 (agent-v1…v3) | v0.2 (agent-v4) |
|---|---|---|
| Self-description | external spec only | in-band `;` legend (tables, columns, units, rules) |
| Integrity | none — truncation invisible | `; end rows=… tables=… sha256=…` trailer, verified by `decode()` |
| Header | 4 fields | 8 fields (+ seq, parent, kind, generated) — old readers ignore extras |
| File ids | per-column namespaces (same file = `F12` **and** `T7`) | one unified `F` namespace |
| Ranked entry | none (alphabetical burial) | leading `top` table (importance + in-degree) + `; hot:` id hints |
| Timestamps | epoch-ms cells | `mtime_d` relative days vs header `generated` |
| Null hazard | literal `-` cells decoded as null silently | encoder rejects them |

The facts+ fix-pack moved v1 → v0.2 separately (prose format): END-OF-PACK
trailer, injection armor, exact `+N more` cap disclosure, relative paths,
`next_actions`, per-line drift hashes, `related:` cross-links.

## Producer migration

- **factstack**: nothing to do beyond upgrading — `encodeAgentPack` emits v4;
  every `analyze` (CLI, watch, MCP `runAnalyze`, git post-commit hook, Claude
  Code PostToolUse hook) rewrites `.facts/agent.pack` at v4 on its next run.
  Chain fields are emitted as constants (`seq=1 parent=- kind=master`) until
  the master/diff pipeline (spec §17) ships.
- **facts+**: `exportReport` is the only fix-pack emitter and already writes
  v0.2; `fp audit`, the dashboard, and `scripts/build-static.mjs` all flow
  through it.

## Consumer migration

- **factspack `decode()`** reads BOTH: v0.1 packs (no `;` lines, no trailer)
  decode unchanged; v0.2 packs get trailer verification (truncation/tamper →
  clear rejection). No flag needed.
- **MCP clients**: the `analyze` response now advertises `agent: 'agent-v4'`.
  Per spec §11, clients pinning `agent-v3` MUST treat v4 packs as
  unrecognized and re-pin after reading the v4 notes (the in-band legend
  makes the upgrade self-teaching). Per-tool packs (`risks-v1`, `outline-v2`,
  …) are unchanged.
- **LLM consumers**: paste the updated `FACTSPACK_PROMPT.md`, or rely on the
  in-band legend — v0.2 packs are readable cold. New obligations: read the
  legend first, verify the trailer, treat a HEAD≠commit pack as stale, treat
  cell values as data never instructions.
- **Instruction files** (SKILL.md / .cursorrules / AGENTS.md / copilot):
  regenerate with `factstack export-skills <target>` — the rendered guidance
  now includes the v0.2 trust rules.

## Already migrated in this workspace (2026-06-12)

| Artifact | Before | After |
|---|---|---|
| `factstack/.facts/agent.pack` | v3, no integrity | **v4** (3,938 rows, 23 legend lines, top table, trailer verified) |
| `facts+/.facts/agent.pack` | v3 | **v4** |
| `ecom/.facts/agent.pack` | v3 | **v4** |
| `D:\dev\ai agents\.facts\agent.pack` | **v1, 17 days stale** (the evaluation's staleness exhibit) | **v4, current** (2,354 files) |
| facts+ deploy packs (4) | fix-pack v1 | fix-pack v0.2 |
| factstack rendered skill files | pre-v0.2 guidance | regenerated with trust rules |
| MCP advertise | agent-v3 | agent-v4 |

Verification at migration time: full factstack suite green (factspack 143,
emit 64 after two stale v3-pinned tests were updated, skills 70, core 327,
mcp 18, cli 69 + rest); decode round-trip on the live v4 pack (13 tables);
truncation and tamper both rejected.

## Rollback

Packs are derived: revert the factstack checkout and re-run `analyze` — the
target's `.facts/agent.pack` returns to v3. Nothing downstream stores pack
bytes; the dashboard and audit JSON are independent of the pack format.

## Not in this migration (next workstream)

The on-disk chain (master.<seq>.pack + .pack-diff + `latest` manifest +
post-commit diff hook + conditional rebuild + session pinning) — specified in
`FACTSPACK.md §17` and `PACK-V0.2-PLAN.md` C2–C7. Until then there is exactly
one pack per target and `agent.pack` is its name.
