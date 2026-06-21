# FactsPack chain producer

Maintain a **master/diff chain** of codebase-map `.pack` snapshots over time, so an
agent keeps one prompt-cached `master` and rides tiny diffs across turns instead of
re-sending the whole map. The diff economics are proven in
[`test/chain.mjs`](../../test/chain.mjs); this tool is the producer that maintains a
chain end-to-end. Spec: [`FACTSPACK.md` §17](../../FACTSPACK.md).

## Quick start

```sh
# append a full snapshot pack — emits a tiny diff, or re-masters automatically
node tools/chain/cli.mjs add snapshot.pack --dir .factspack-chain

node tools/chain/cli.mjs head     --dir .factspack-chain   # reconstruct the latest state
node tools/chain/cli.mjs head     --dir .factspack-chain --out latest.pack
node tools/chain/cli.mjs verify   --dir .factspack-chain   # check the hash chain
node tools/chain/cli.mjs manifest --dir .factspack-chain   # list the links
node tools/chain/cli.mjs prune    --dir .factspack-chain   # delete files orphaned by re-masters
```

`add` takes an already-encoded **full** snapshot pack (a `kind=master` pack — e.g. your
analyzer's output or the browser converter's download) and decides whether to append a
diff or start a fresh master.

## Layout

A chain directory holds:

```
1.master.pack      2.diff.pack      3.diff.pack      …      manifest.pack
```

`manifest.pack` is itself a self-sealed `.pack` (the format describing its own chain): a
`chain` table of `seq, kind, file, sha, parent, rows`, naming the **active** chain — the
current master followed by the diffs on top of it. A re-master starts a fresh manifest;
`prune` removes the superseded files.

## Coalescing (tunable policy)

A diff carries a delete + an add per changed row, so once enough rows change it grows
larger than the full map. The producer re-masters when:

| flag | default | meaning |
|---|---|---|
| `--ratio` | `0.5` | re-master when a diff reaches this fraction of a fresh full snapshot (the measured break-even) |
| `--max`   | `24`  | re-master once the chain passes this many diffs (bounds a consumer's apply cost) |

These are knobs, **not measured-optimal constants** — the right values come from a
chain-depth measurement, not a guessed file count.

## Soundness scope

A diff is sound only when the **column-1 primary key is stable across snapshots**. That
holds today for **path-keyed / file-level** tables. Symbol tables whose ids derive from
line numbers churn — stable identity for those is the SCIP-moniker work (analyzer side,
§18); pass `--key N` to key on a different stable column when that lands. A schema change
(columns added/renamed/retyped, a table added/removed) always re-masters, since a diff is
a row delta, not a schema migration.

## Integrity

Each diff's header `parent` is the prior link's trailer sha, and the manifest records
every link's sha, so `verify()` rejects a tampered, reordered, or bit-rotted link — and
returns `{ok:false}` rather than throwing, so it's safe to branch on.

## Automating it (opt-in)

[`post-commit.sample`](post-commit.sample) is a git hook that regenerates your snapshot
and appends it on each commit. It is **not** auto-installed — copy it to
`.git/hooks/post-commit`, make it executable, and set `FACTSPACK_SNAPSHOT_CMD` to your
producer. See the file's header for details.

Tests: [`test/chainproducer.mjs`](../../test/chainproducer.mjs).
