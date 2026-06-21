/**
 * store.mjs — the master/diff CHAIN PRODUCER (spec §17).
 *
 * The diff primitives (computeDiff / applyChain) already prove that a small
 * change becomes a small diff and reconstructs exactly (test/chain.mjs). This
 * module is the ORCHESTRATION the primitives lacked: it maintains a chain over
 * time on disk (or any I/O adapter), writes a self-describing `.pack` manifest,
 * computes real `parent` hashes so the chain is verifiable end-to-end, and
 * decides per snapshot whether to append a diff or re-master.
 *
 * Soundness scope: a diff is only sound when the column-1 PRIMARY KEY is stable
 * across snapshots. That holds today for path-keyed / file-level tables. Symbol
 * tables whose ids derive from line numbers churn; stable identity for those is
 * the SCIP-moniker work (analyzer side) and is NOT assumed here. Pass keyIndex
 * to key on a different stable column.
 *
 * The codec is the vendored Node bundle (the repo's single codec entry point).
 */
import {
  encode, encodeIncremental, decode, computeDiff, applyChain,
} from '../../test/factspack.bundle.mjs';

export const MANIFEST = 'manifest.pack';

const MANIFEST_COLS = [
  { name: 'seq' }, { name: 'kind' }, { name: 'file' },
  { name: 'sha' }, { name: 'parent' }, { name: 'rows' },
];

/** Encode the chain manifest as a self-sealed `.pack` (dogfooding the format). */
export function buildManifest(links) {
  const head = links.length ? links[links.length - 1].sha : '-';
  // a master has no parent -> a genuine null cell (encodes as the wire's null
  // sentinel); a literal "-" string is rejected by the encoder as ambiguous.
  const rows = links.map((l) => [
    String(l.seq), l.kind, l.file, l.sha, l.parent == null ? null : l.parent, String(l.rows),
  ]);
  return encode({
    header: { producer: 'factspack-chain/0.1', schema: 'chain-manifest-v1', snapshotId: head, rowCount: null, kind: 'master' },
    meta: { legend: ['chain: the ordered master+diff links to apply, in sequence', 'chain seq kind file sha parent rows'] },
    tables: [{ name: 'chain', columns: MANIFEST_COLS, rows }],
  });
}

/** Parse a manifest `.pack` back into its ordered link list. */
export function parseManifest(bytes) {
  const t = decode(bytes).tables.get('chain');
  if (!t) throw new Error('manifest.pack has no "chain" table — not a FactsPack chain manifest');
  return t.rows.map((r) => {
    const file = r[2];
    // Link file names are read straight off disk; a tampered manifest must not be able
    // to point a read at an arbitrary path. Only the producer's own naming is allowed.
    if (!/^\d+\.(master|diff)\.pack$/.test(file)) throw new Error(`manifest: unsafe or malformed link file name "${file}"`);
    return { seq: Number(r[0]), kind: r[1], file, sha: r[3], parent: r[4] == null ? null : r[4], rows: Number(r[5]) };
  });
}

/**
 * A comparable signature of a pack's SCHEMA: the table set plus each table's
 * column names+types. A diff carries row ops only (`+`/`x`), never a schema
 * migration — so any schema change (column added/renamed/retyped, table
 * added/removed) must force a fresh master rather than a row diff, which would
 * otherwise silently corrupt the reconstructed head.
 */
function schemaSig(tablesMap) {
  const names = [...tablesMap.keys()].sort();
  return JSON.stringify(names.map((n) => [n, tablesMap.get(n).columns.map((c) => [c.name, c.type ?? null])]));
}

/**
 * A sound diff needs a stable, UNIQUE, NON-EMPTY primary key in the keyIndex column. The
 * codec accepts empty and duplicate cells anywhere (both are legal wire values), and
 * computeDiff only throws on the NEXT add — so a bad key would persist a master that
 * dead-ends or corrupts the chain later, with a confusing low-level error. Validate here,
 * at the producer seam (mirroring symbolsToPack's dup-key guard), so the failure is loud,
 * immediate, and actionable at the offending snapshot.
 */
function validateKeys(tablesMap, keyIndex) {
  for (const [name, t] of tablesMap) {
    const seen = new Set();
    for (const r of t.rows) {
      const k = r[keyIndex];
      if (k == null || k === '') throw new Error(`chain: empty primary key at column ${keyIndex} in table "${name}" — keys must be a non-empty value for a sound diff (choose a different keyIndex)`);
      if (seen.has(k)) throw new Error(`chain: duplicate primary key "${k}" at column ${keyIndex} in table "${name}" — keys must be unique for a sound diff`);
      seen.add(k);
    }
  }
}

/**
 * The chain producer. `io` is a tiny ADAPTER seam so the same logic runs against disk
 * (`nodeFsIO`, tools/chain/node-io.mjs) or an in-memory map (`memIO`, test/_util.mjs).
 * The interface is the four methods AND these invariants — a third adapter (S3, SQLite,
 * an encrypted store) must honour ALL of them (checked by `adapterConforms`, test/ioadapter.mjs):
 *
 *   io.read(name)        -> string | null
 *       The file's exact bytes as a UTF-8 string, or `null` if it does not exist. MUST
 *       distinguish "missing" (return null) from an I/O error (throw): the store treats
 *       null as absent and a throw as fatal.
 *   io.write(name, data) -> void
 *       Durably persist the UTF-8 string `data` so a later read returns it byte-for-byte
 *       (read(write(x)) === x), overwriting any existing file. The store writes the pack
 *       file BEFORE the manifest, so an adapter that buffers must flush in call order —
 *       a crash must never leave a manifest pointing at an unwritten pack.
 *   io.list()            -> string[]
 *       All file names currently present, any order, stable within one call. Concurrent
 *       external writers are not assumed visible.
 *   io.remove(name)      -> void   (OPTIONAL)
 *       Delete a file, idempotently (removing a missing name is not an error). Required
 *       only for prune()/autoPrune; an adapter without it simply can't reclaim orphans.
 */
export class ChainStore {
  constructor(io, opts = {}) {
    this.io = io;
    this.keyIndex = opts.keyIndex ?? 0;
    // Coalescing policy (tunable, NOT a measured-optimal constant): re-master
    // when a diff would be >= coalesceRatio of a fresh full snapshot — grounded
    // in the measured break-even (~50%, test/chain.mjs ECON-breakeven) — or when
    // the chain has grown past maxChainLen diffs (bounds consumer apply cost).
    this.coalesceRatio = opts.coalesceRatio ?? 0.5;
    this.maxChainLen = opts.maxChainLen ?? 24;
    // opt-in: delete files orphaned by a re-master immediately. Default off keeps the
    // full history on disk (the `prune` command reclaims it on demand).
    this.autoPrune = opts.autoPrune === true;
  }

  loadLinks() {
    const m = this.io.read(MANIFEST);
    return m ? parseManifest(m) : [];
  }

  nextSeq() {
    let max = 0;
    for (const name of this.io.list()) {
      const m = /^(\d+)\.(master|diff)\.pack$/.exec(name);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
  }

  /**
   * Add a new full snapshot (an already-encoded master-style pack). Returns
   * { action, file, seq, bytes } where action is 'master' (baseline or a
   * coalesce re-master), 'diff' (appended delta), or 'nochange'.
   */
  add(nextBytes, opts = {}) {
    // Per-call opts are only the per-SNAPSHOT facts: `keyIndex` (the PK column) and
    // `forceMaster` (re-index when the key isn't chain-safe). The coalescing POLICY
    // (coalesceRatio / maxChainLen) is a measured break-even set ONCE at construction —
    // not a per-snapshot choice — so it is read from `this`, never overridden here.
    const keyIndex = opts.keyIndex ?? this.keyIndex;

    const links = this.loadLinks();
    const seq = this.nextSeq();
    const nextDec = decode(nextBytes);
    // Reject an unusable key (empty or duplicate) before persisting ANYTHING — for the
    // baseline/reindex master too, not just the diff path. Loud now beats a confusing
    // computeDiff throw on the next add (or a silently-corrupt master).
    validateKeys(nextDec.tables, keyIndex);

    const writeMaster = (reason) => {
      const file = `${seq}.master.pack`;
      this.io.write(file, nextBytes);
      const fresh = [{ seq, kind: 'master', file, sha: nextDec.trailer.sha256, parent: null, rows: nextDec.trailer.rows }];
      this.io.write(MANIFEST, buildManifest(fresh));
      if (this.autoPrune && typeof this.io.remove === 'function') this.prune();
      return { action: 'master', reason, file, seq, bytes: nextBytes.length };
    };

    if (!links.length) return writeMaster('baseline');
    // A moniker-aware caller passes forceMaster when its symbol identity is not chain-safe
    // (e.g. a fragile/probabilistic lite key) — re-index rather than key a destructive
    // delta on it (spec §18: "a probabilistic match is never a primary key").
    if (opts.forceMaster) return writeMaster('reindex');

    // The diff must be computed against the reconstructed HEAD STATE (master +
    // every diff applied), not against the last link file — a diff pack decodes
    // to a delta, not the full table. The hash-chain parent is still the last
    // link's sha (we chain over the pack files, in order).
    const headLink = links[links.length - 1];
    const masterBytesOnDisk = this.io.read(links[0].file);
    if (masterBytesOnDisk == null) throw new Error(`chain master "${links[0].file}" is missing from the store`);
    const headState = applyChain(
      decode(masterBytesOnDisk),
      links.slice(1).map((l) => {
        const b = this.io.read(l.file);
        if (b == null) throw new Error(`chain diff "${l.file}" is missing from the store`);
        return decode(b);
      }),
      { keyIndex },
    );

    // A schema change can't be expressed as row ops — re-master instead of
    // diffing (else applyChain keeps the master's columns and head() corrupts).
    if (schemaSig(headState) !== schemaSig(nextDec.tables)) return writeMaster('schema-change');

    const diffTables = computeDiff({ tables: headState }, nextDec, { keyIndex });
    if (diffTables.length === 0) return { action: 'nochange', seq, bytes: 0 };

    const diffBytes = encodeIncremental({
      header: {
        producer: nextDec.header.producer, schema: nextDec.header.schema,
        snapshotId: nextDec.header.snapshotId, seq, parent: headLink.sha, kind: 'diff',
      },
      tables: diffTables,
    });

    const diffCount = links.length - 1; // diffs already on top of the master
    const tooBig = diffBytes.length >= this.coalesceRatio * nextBytes.length;
    const tooLong = diffCount + 1 > this.maxChainLen;
    if (tooBig || tooLong) return writeMaster(tooBig ? 'coalesce:diff-too-large' : 'coalesce:chain-too-long');

    const diffDec = decode(diffBytes);
    const file = `${seq}.diff.pack`;
    this.io.write(file, diffBytes);
    links.push({ seq, kind: 'diff', file, sha: diffDec.trailer.sha256, parent: headLink.sha, rows: diffDec.trailer.rows });
    this.io.write(MANIFEST, buildManifest(links));
    return { action: 'diff', file, seq, bytes: diffBytes.length, masterBytes: nextBytes.length };
  }

  /** Reconstruct the current head as a table set (master + every diff applied). */
  head(opts = {}) {
    const keyIndex = opts.keyIndex ?? this.keyIndex;
    const links = this.loadLinks();
    if (!links.length) throw new Error('empty chain — nothing to reconstruct');
    if (links[0].kind !== 'master') throw new Error('corrupt chain: first link is not a master');
    const read = (l) => {
      const b = this.io.read(l.file);
      if (b == null) throw new Error(`chain link "${l.file}" is missing — run verify()`);
      return decode(b);
    };
    return applyChain(read(links[0]), links.slice(1).map(read), { keyIndex });
  }

  /** Reconstruct the head and re-encode it as a single self-sealed master pack. */
  reconstructPack(opts = {}) {
    const keyIndex = opts.keyIndex ?? this.keyIndex;
    const links = this.loadLinks();
    if (!links.length) throw new Error('empty chain — nothing to reconstruct');
    const masterBytes = this.io.read(links[0].file);
    if (masterBytes == null) throw new Error(`chain master "${links[0].file}" is missing — run verify()`);
    const masterDec = decode(masterBytes); // header (producer/schema) comes from the master
    // The tables are the reconstructed HEAD (master + every diff applied), NOT the raw master —
    // otherwise reconstructPack() / CLI `head --out` would silently emit a stale snapshot.
    const tables = [...this.head({ keyIndex }).entries()].map(([name, t]) => ({ name, columns: t.columns, rows: t.rows }));
    const legend = tables.map((t) => `${t.name} ${t.columns.map((c) => c.name).join(' ')}`);
    return encode({
      header: { producer: masterDec.header.producer, schema: masterDec.header.schema, snapshotId: links[links.length - 1].sha, rowCount: null, kind: 'master' },
      meta: { legend },
      tables,
    });
  }

  /**
   * Integrity check: every link's bytes must hash to the sha the manifest
   * records, and every diff's parent must equal the prior link's sha (a tamper
   * or reorder breaks the hash chain). Returns { ok, errors }.
   */
  verify() {
    const errors = [];
    let links;
    // A corrupt/tampered manifest must surface as ok:false, never as a throw —
    // verify() is the integrity gate a caller branches on.
    try { links = this.loadLinks(); }
    catch (e) { return { ok: false, errors: [`manifest unreadable (corrupt/tampered): ${(e && e.message) || e}`], links: 0 }; }
    if (!links.length) return { ok: true, errors, links: 0 };
    if (links[0].kind !== 'master') errors.push('first link must be a master');
    let prevSha = null;
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      const bytes = this.io.read(l.file);
      if (bytes == null) { errors.push(`${l.file}: missing — chain unverifiable from here`); prevSha = null; continue; }
      let dec;
      // A byte-level tamper invalidates the pack's own trailer sha, so decode()
      // throws before our sha check — catch it and report, don't crash.
      try { dec = decode(bytes); }
      catch (e) { errors.push(`${l.file}: undecodable (corrupt/tampered) — ${(e && e.message) || e}`); prevSha = null; continue; }
      if (dec.trailer.sha256 !== l.sha) errors.push(`${l.file}: sha ${dec.trailer.sha256} != manifest ${l.sha}`);
      // The manifest records each link's kind, but a tamperer can edit the manifest. Cross-
      // check the pack's OWN self-declared header.kind against its position: a diff pack
      // smuggled into the master-root slot otherwise passes (verify trusts link.kind) while
      // head() rebuilds empty/wrong state from its (empty) master rows.
      const expectKind = i === 0 ? 'master' : 'diff';
      if (dec.header.kind !== expectKind) errors.push(`${l.file}: pack header says kind=${dec.header.kind}, expected ${expectKind} at position ${i}`);
      if (i > 0) {
        if (l.kind !== 'diff') errors.push(`${l.file}: expected a diff at position ${i}`);
        if (l.parent !== prevSha) errors.push(`${l.file}: parent ${l.parent} != prior link sha ${prevSha} (chain broken)`);
        if (dec.header.parent !== prevSha) errors.push(`${l.file}: header parent ${dec.header.parent} != prior link sha ${prevSha}`);
      }
      prevSha = l.sha;
    }
    return { ok: errors.length === 0, errors, links: links.length };
  }

  /**
   * Delete pack files orphaned by re-masters — anything matching the
   * `<seq>.master.pack` / `<seq>.diff.pack` naming that the CURRENT manifest no
   * longer references. The active chain and the manifest itself are always kept.
   * Requires the io adapter to expose `remove(name)`. Returns { removed }.
   */
  prune() {
    if (typeof this.io.remove !== 'function') throw new Error('io adapter has no remove() — cannot prune');
    const keep = new Set(this.loadLinks().map((l) => l.file));
    keep.add(MANIFEST);
    const removed = [];
    for (const name of this.io.list()) {
      if (/^\d+\.(master|diff)\.pack$/.test(name) && !keep.has(name)) { this.io.remove(name); removed.push(name); }
    }
    return { removed };
  }
}
