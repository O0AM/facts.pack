/**
 * _chain.ts — diff-chain primitives, VENDORED in facts-pack (same reason as
 * _encode-auto.ts: the codec repo's tooling prunes new src files). Mirrors the
 * codec's chain.ts and imports only the codec's tracked `types.js`.
 *
 * computeDiff(prev, next) → IncrementalTable[] ready for encodeIncremental().
 * applyChain(master, diffs) → reconstructed Map<name, {columns, rows}>.
 *
 * Both operate on DECODED packs: a pack's dictionary keys (F1, S2, …) are
 * assigned per-pack by reference frequency, so the SAME literal can take a
 * different key in the next pack ("ids are stable within this file only"). A
 * sound diff therefore matches LITERAL rows by a STABLE primary key, and
 * decode() has already resolved every cell to its literal. Row identity is the
 * column-1 value by convention (spec §4.4); callers pass opts.keyIndex otherwise.
 */
import type { DecodedPack, DecodedTable, IncrementalTable, PackColumn, PackRow } from '../../claude/factstack/packages/factspack/src/types.js';

/** A reconstructed table: schema + the live row set after applying diffs. */
export interface AppliedTable {
  columns: PackColumn[];
  rows: PackRow[];
}

function keyOf(row: PackRow, keyIndex: number, where: string): string {
  const k = row[keyIndex];
  if (k === null || k === undefined) {
    throw new Error(`computeDiff/applyChain: null primary key at column ${keyIndex} in ${where}`);
  }
  return k;
}

/** Order-independent identity of a full row (for change detection). NUL joins
 *  cells so distinct cell splits cannot alias (a NUL never appears in wire data). */
function serializeRow(row: PackRow): string {
  return JSON.stringify(row);
}

/**
 * Compute the per-table additions/deletions that turn `prev` into `next`, keyed
 * by the column-1 primary key. A changed row (same key, different cells) becomes
 * a delete (old key) + an add (new row), so applying the result reproduces
 * `next` exactly. Unchanged tables are omitted so the diff stays small.
 */
export function computeDiff(
  prev: DecodedPack,
  next: DecodedPack,
  opts: { keyIndex?: number } = {},
): IncrementalTable[] {
  const ki = opts.keyIndex ?? 0;
  const out: IncrementalTable[] = [];
  const names = new Set<string>([...prev.tables.keys(), ...next.tables.keys()]);

  for (const name of names) {
    const p = prev.tables.get(name);
    const n = next.tables.get(name);

    if (n && !p) {
      if (n.rows.length > 0) {
        out.push({ name, columns: n.columns, addedRows: n.rows.map((r) => r.slice()), deletedIds: [] });
      }
      continue;
    }
    if (p && !n) {
      const deletedIds = p.rows.map((r) => keyOf(r, ki, `prev.${name}`));
      if (deletedIds.length > 0) out.push({ name, columns: p.columns, addedRows: [], deletedIds });
      continue;
    }
    if (!p || !n) continue;

    const prevByKey = new Map<string, string>();
    for (const r of p.rows) {
      const pk = keyOf(r, ki, `prev.${name}`);
      if (prevByKey.has(pk)) throw new Error(`computeDiff: duplicate primary key "${pk}" in prev.${name} — the PK column must be unique for a sound diff`);
      prevByKey.set(pk, serializeRow(r));
    }

    const addedRows: PackRow[] = [];
    const deletedIds: string[] = [];
    const seen = new Set<string>();
    for (const r of n.rows) {
      const k = keyOf(r, ki, `next.${name}`);
      if (seen.has(k)) throw new Error(`computeDiff: duplicate primary key "${k}" in next.${name} — the PK column must be unique`);
      seen.add(k);
      const prevSer = prevByKey.get(k);
      if (prevSer === undefined) {
        addedRows.push(r.slice());
      } else if (prevSer !== serializeRow(r)) {
        addedRows.push(r.slice());
        deletedIds.push(k);
      }
    }
    for (const r of p.rows) {
      const k = keyOf(r, ki, `prev.${name}`);
      if (!seen.has(k)) deletedIds.push(k);
    }
    if (addedRows.length > 0 || deletedIds.length > 0) {
      out.push({ name, columns: n.columns, addedRows, deletedIds });
    }
  }
  return out;
}

/**
 * Apply a master and an ordered list of decoded diffs, producing the
 * reconstructed table set. Each diff's deletedIds are removed (matched by
 * column-1 PK) before its addedRows are appended, so a same-diff delete+add (an
 * update) lands correctly. Tables a diff never mentions carry through unchanged.
 */
export function applyChain(
  master: DecodedPack,
  diffs: readonly DecodedPack[],
  opts: { keyIndex?: number } = {},
): Map<string, AppliedTable> {
  const ki = opts.keyIndex ?? 0;
  const tables = new Map<string, AppliedTable>();
  for (const [name, t] of master.tables) {
    tables.set(name, { columns: t.columns, rows: t.rows.map((r) => r.slice()) });
  }
  for (const diff of diffs) {
    for (const [name, dt] of diff.tables as Map<string, DecodedTable>) {
      let t = tables.get(name);
      if (!t) {
        t = { columns: dt.columns, rows: [] };
        tables.set(name, t);
      }
      if (dt.deletedIds.length > 0) {
        const del = new Set(dt.deletedIds);
        t.rows = t.rows.filter((r) => !del.has(keyOf(r, ki, `applied.${name}`)));
      }
      for (const r of dt.addedRows) t.rows.push(r.slice());
    }
  }
  return tables;
}
