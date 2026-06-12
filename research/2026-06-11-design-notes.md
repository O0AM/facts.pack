# .pack design notes — distilled from the 2026-06-11 working sessions

> Context that produced the v0.2 plan: an LLM-consumer usefulness assessment, an adversarial
> review of both pack artifacts, and the immutability/economics design discussion. The
> grounded code/spec facts live in the sibling `2026-06-11-grounding-*.md` reports.

## 1. Usefulness assessment (Claude, Fable 5, as the target consumer)

- **facts+ fix-pack ≈ ideal agent input.** Self-describing preamble, every issue self-contained
  (id/severity/tier/problem/why/standards/location/snippet/fix), severity-ordered, sha-stamped.
  Its token saving is *eliminated tool calls*, not compression — acting on an issue cold would
  cost a Grep + Read + reasoning; the pack inlines all of it.
- **factstack map-pack = real reach, one cognitive cost.** 371KB pack ≈ ~100k tokens vs
  agent.json 2.8MB ≈ ~700k (doesn't fit a 200k window at all; 7× cost in a 1M window for zero
  extra information). The cost: dictionary dereference is a long-range attention task — small
  but nonzero error rate at thousands of refs, and errors are silent and confident. Aliasing
  (same file as `F2` and `T8`) multiplies it.
- **What maximizes usefulness:** self-description beats compression when they conflict; hint the
  hot refs; rank content head-first (attention is head-weighted); pack for orientation + MCP for
  ground truth; staleness is worse than absence (confident stale facts get acted on); sweet spot
  ~50–150k tokens/pack; stable prefixes are prompt-cache money.

## 2. Adversarial review — findings that drove v0.2

Shared: prompt injection via embedded source (code can address the reading agent; a source line
can mimic record delimiters — armor: untrusted-data + column-0 preamble rules); line-number
drift during the fix loop (re-anchor by snippet content); no truncation detection (trailer).

facts+: silent `slice(0,8)` evidence cap (agent fixes 8 of 40, believes done — violates the
no-silent-caps law); absolute path leak in `source:` (ships on the public deploy); 399-line
NEEDS REVIEW wall (~half the pack, unactionable); catalog prose duplication at scale (glossary
above 50 fails); no per-line content hash (whole-run sha only).

factstack: zero in-band legend (reader must guess `read`=minutes, `mtime`=epoch-ms, `-`=null —
every guess a hallucination seed); F/T id aliasing; no commit sha, no freshness contract (the
only wild pack was 16 days stale with gitAvailable:false); alphabetical ordering buries the
most-imported files behind skill docs; unlabeled header magic number (rowCount); epoch-ms
timestamps. Counterpoint discovered in grounding: the encoder/decoder are machine-rigorous
(strict escapes, reject-on-unknown, 103 tests) — the defects are at the LLM-legibility layer,
not the machine layer.

## 3. The immutability → diff → pinning design evolution

1. **"Immutable packs, agent writes a new one per checkpoint"** — immutability right; agent-as-
   typewriter wrong. Hand-emitting a 100k-token pack ≈ $5 and 15–30 min per checkpoint, with a
   strict decoder rejecting format slips, and — decisively — the facts would be *asserted, not
   measured* (cite-or-refuse violation at the root). Resolution: **agent-initiated, tool-emitted,
   decoder-validated, agent-annotated** (~300-token annotation ≈ 1.5¢; "the tool types, the
   agent signs").
2. **"Per-commit `.pack-diff`, master rebuilt hourly"** — diff-per-commit right (and
   `encodeIncremental` already existed, unwired); hourly wrong: *diffs are freshness; masters are
   compaction*. A wall-clock rebuild is new bytes for identical knowledge → gratuitous cache
   kill. Resolution: **size/idle-triggered rebuild** (chain > ~30% of master, or ≥20 diffs, or
   explicit/idle; skip when nothing changed — determinism makes this decidable).
3. **Session pinning (MVCC)** makes rebuild cadence nearly irrelevant: versioned immutable
   masters + a mutable `latest` manifest; a session pins its master and appends diffs after the
   cached prefix (cache-extending, like conversation turns); new sessions adopt latest; old
   masters GC'd when unpinned. Parallel: LSM-trees (WAL/memtable → SSTable compaction) and git
   itself (loose objects → packfiles).

## 4. Economics (Fable 5: $10/M in, $50/M out; cache read 0.1×, write 1.25× 5-min TTL / 2× 1-h)

Generation per checkpoint: agent hand-writes full master ~$5.00 + 15–30 min (forbidden);
agent hand-writes diff $0.02–0.05 (permitted, validated); tool emits + agent annotates ~$0.015
(the ritual); tool emits all $0.

Reads, active day (3 sessions × 30 turns, 100k-token master): mutable-per-commit ≈ $23;
hourly rebuild no pinning ≈ $17; **immutable master + appended diffs + pinning ≈ $12.80** —
the floor ($0.10/turn is the cache-read price of holding the map; only shrinking the map beats
it). Caveats: 5-min default TTL means the protected win is in-session turn-over-turn reuse;
cross-session reuse hours apart was cold regardless.

## 5. Standing decisions (codified in PACK-V0.2-PLAN.md)

Standard = FactsPack v0.2 · wire tag `agent-v4` · facts+ line `· v0.2` (alignment rename) ·
one new line prefix `;` carrying legend/hints/notes/trailer · trailer with rows/tables/sha256 ·
header +`seq`/`parent`/`kind`/`generated`, field 3 normatively the commit sha · unified `F`
namespace · `top` table from already-computed PageRank · `mtime_d` relative days ·
`.facts/pack/{master.<seq>.pack, <seq>.<sha>.pack-diff, latest}` · transition alias
`agent.pack` · the agent checkpoint ritual as normative spec text · facts+ D0–D7 with the
format's first pinning tests.
