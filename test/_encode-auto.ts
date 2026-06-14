/**
 * _encode-auto.ts — the AUTOMATIC-ECONOMIC producer profile, VENDORED in
 * facts-pack and layered over the reference codec's `encode()`.
 *
 * Placement note: this logically belongs in the canonical codec as a producer
 * profile, but the codec repo's tooling prunes any src/ file unreachable from its
 * managed public `index.ts`, so it cannot persist there yet. Vendoring it here
 * (importing the codec's stable, tracked `encode()` + types) keeps the unification
 * working and byte-exact: the browser converter's inlined encoder (esbuilt from
 * THIS file) and the reference path (the bundle, which re-exports THIS file's
 * encodeAuto) run the SAME planner over the SAME encode(), so they agree on the
 * wire. If the codec tooling is later fixed to keep the file, this moves into the
 * codec unchanged.
 *
 * `encode()` interns a column iff its NAME starts uppercase — the caller decides
 * the schema declaratively. A paste/convert producer has no schema to declare, so
 * encodeAuto profiles each column's values, interns only when the `@ K=V`
 * dictionary pays for itself in bytes, assigns a single-letter key prefix shared
 * across same-named columns in every table, then hands a declarative table set to
 * encode(). It is a PLANNER over encode(), never a second encoder — every
 * dictionary/escape/trailer decision stays in encode(). Strictness is inherited:
 * a literal `-` cell still makes encode() throw; paste tools sanitize first.
 */

import { encode } from '../../claude/factstack/packages/factspack/src/encode.js';
import { sha256hex } from '../../claude/factstack/packages/factspack/src/sha256.js';
import {
  isInternedColumn,
  type PackColumn,
  type PackHeader,
  type PackMeta,
  type PackRow,
  type PackTable,
} from '../../claude/factstack/packages/factspack/src/types.js';

/**
 * A raw table for `encodeAuto`: plain column names plus positional rows of raw
 * values. The planner decides each column's casing and interning. Cells may be
 * numbers/booleans — they are stringified into the wire value space.
 */
export interface AutoTable {
  name: string;
  columns: string[];
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>;
}

/** Tunable thresholds for the intern-or-not decision (defaults match the
 *  browser converter's long-standing economic heuristic). */
export interface AutoInternTuning {
  minValues?: number;
  minSavings?: number;
}

export interface EncodeAutoOptions {
  header: PackHeader;
  tables: AutoTable[];
  meta?: PackMeta;
  tuning?: AutoInternTuning;
  /**
   * Canonical-producer profile (v0.3 — full-pack determinism). When true, the
   * header's `snapshotId` is replaced by a content digest of the planned data and
   * the wall-clock `generated` field is dropped, so the same logical input yields
   * a BYTE-IDENTICAL pack on every run and platform (the snapshotId stays a valid
   * cache key, per the spec, because it now addresses the content). A producer
   * with a real commit/snapshot can leave this off and supply its own stable id.
   */
  canonical?: boolean;
}

const DEFAULT_TUNING: Required<AutoInternTuning> = { minValues: 3, minSavings: 30 };

/** Coerce a raw cell into the wire value space: null/undefined ⇒ null (the `-`
 *  sentinel), '' stays the empty cell, everything else stringifies. */
function coerce(v: string | number | boolean | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v === '') return '';
  return String(v);
}

/** Clean a raw column name to a wire-safe token: trim, collapse internal
 *  whitespace to `_`, never empty. */
function cleanName(name: string): string {
  const t = String(name).trim().replace(/\s+/g, '_');
  return t.length ? t : 'col';
}

/**
 * Make the FINAL (cleaned + cased) column tokens of ONE table unique, so the
 * emitted `& schema` line can never carry two identical headers.
 *
 * Why this is needed: cleaning (`cleanName`) and casing (UPPER for interned,
 * lower for literal) can fuse two DISTINCT source columns onto the same wire
 * token — e.g. `{ "Name": …, "name": … }` ⇒ both become `name`, or `"a b"` and
 * `"a_b"` ⇒ both become `a_b`. A duplicate token in the `& schema` line is
 * accepted by the strict decoder but collapses the two fields for any
 * name-keyed consumer: column IDENTITY is silently lost even though every value
 * round-trips. Suffixing the later collisions keeps the two source fields
 * distinguishable end-to-end.
 *
 * Contract for the implementation below:
 *  - Input is the already-cleaned+cased token per column, in column order.
 *  - Return a same-length array, same order, where every entry is unique.
 *  - The FIRST occurrence of a token keeps its name unchanged (so the common
 *    no-collision case is a no-op and existing packs are byte-stable).
 *  - A later collision is renamed `<token>_2`, `<token>_3`, … — and the chosen
 *    suffix must be collision-SAFE: it must not equal any OTHER column's token
 *    (e.g. inputs `["id", "id", "id_2"]` must not let the 2nd `id` steal the
 *    name the 3rd column legitimately holds).
 *  - Casing is preserved by construction: the suffix is appended, so the first
 *    byte (which decides interned-vs-literal) is untouched.
 */
function dedupeColumnNames(names: readonly string[]): string[] {
  // Reserve-first: every ORIGINAL token is off-limits as a generated suffix, so a
  // rename can never steal the name a later column legitimately holds (input
  // `["id","id","id_2"]` ⇒ `["id","id_3","id_2"]`, not `["id","id_2","id_2_2"]`).
  const taken = new Set(names);
  const seen = new Set<string>();
  return names.map((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      return name;
    }
    let n = 2;
    let candidate = `${name}_${n}`;
    while (seen.has(candidate) || taken.has(candidate)) candidate = `${name}_${++n}`;
    seen.add(candidate);
    return candidate;
  });
}

/** First ASCII letter of a name, uppercased — the natural key prefix; falls back
 *  to `V` when the name carries no letter. */
function prefixSeed(name: string): string {
  const m = name.match(/[a-zA-Z]/);
  return (m ? m[0] : 'V').toUpperCase();
}

/** Decide whether a column group's value set earns a dictionary, using the same
 *  byte-economy estimate the browser converter has used. */
function worthInterning(values: string[], tuning: Required<AutoInternTuning>): boolean {
  if (values.length < tuning.minValues) return false;
  let total = 0;
  const uniq = new Map<string, number>();
  for (const v of values) {
    total += v.length;
    uniq.set(v, (uniq.get(v) ?? 0) + 1);
  }
  const idLen = 1 + String(uniq.size).length;
  let uniqLen = 0;
  for (const v of uniq.keys()) uniqLen += v.length;
  const internedCost = uniqLen + uniq.size * (3 + idLen) + values.length * idLen;
  return total - internedCost >= tuning.minSavings;
}

/**
 * Derive a deterministic, content-addressed header for the canonical-producer
 * profile: snapshotId becomes a 12-hex digest of the planned data (producer,
 * schema, kind, and the declarative tables), and the wall-clock `generated`
 * field is dropped. Same input ⇒ same header ⇒ same pack, on every run and
 * platform. seq/parent (chain position, caller-supplied and already stable) are
 * preserved.
 */
function canonicalHeader(h: PackHeader, tables: PackTable[]): PackHeader {
  const kind = h.kind ?? 'master';
  const key = [h.producer, h.schema, kind, JSON.stringify(tables)].join('\u0000');
  const out: PackHeader = {
    producer: h.producer,
    schema: h.schema,
    snapshotId: sha256hex(key).slice(0, 12),
    rowCount: h.rowCount,
    kind,
  };
  if (h.seq !== undefined) out.seq = h.seq;
  if (h.parent !== undefined) out.parent = h.parent;
  // `generated` is deliberately omitted: a wall-clock value would defeat determinism.
  return out;
}

/** Encode a baseline pack, deciding interning automatically from the data. */
export function encodeAuto(opts: EncodeAutoOptions): string {
  const tuning = { ...DEFAULT_TUNING, ...opts.tuning };

  // Pass 1: group columns across ALL tables by cleaned, upper-cased name and
  // accumulate every non-empty value, so the intern decision is made once per
  // group over its full (shared) value set.
  const groups = new Map<string, { values: string[] }>();
  const tableMeta = opts.tables.map((t) => {
    const clean = t.columns.map(cleanName);
    const groupKeys = clean.map((c) => c.toUpperCase());
    clean.forEach((_, ci) => {
      const gk = groupKeys[ci]!;
      let g = groups.get(gk);
      if (!g) {
        g = { values: [] };
        groups.set(gk, g);
      }
      for (const row of t.rows) {
        const cell = coerce(row[ci]);
        if (cell !== null && cell !== '') g.values.push(cell);
      }
    });
    return { clean, groupKeys };
  });

  // Decide interning per group (first-appearance order ⇒ deterministic) and
  // assign each interned group a globally-unique single-letter prefix.
  const decision = new Map<string, { interned: boolean; prefix?: string }>();
  const usedPrefix = new Set<string>();
  for (const [gk, g] of groups) {
    if (!isInternedColumn(gk) || usedPrefix.size >= 26 || !worthInterning(g.values, tuning)) {
      decision.set(gk, { interned: false });
      continue;
    }
    let p = prefixSeed(gk);
    while (usedPrefix.has(p)) p = p === 'Z' ? 'A' : String.fromCharCode(p.charCodeAt(0) + 1);
    usedPrefix.add(p);
    decision.set(gk, { interned: true, prefix: p });
  }

  // Pass 2: build the declarative PackTables encode() consumes. Interned columns
  // become UPPERCASE (+ internGroup = their prefix); literal columns lowercase.
  // Rows are null-filled to the column count.
  const tables: PackTable[] = opts.tables.map((t, ti) => {
    const { clean, groupKeys } = tableMeta[ti]!;
    const decisions = groupKeys.map((gk) => decision.get(gk)!);
    // The wire token is the CASED name (UPPER ⇒ interned, lower ⇒ literal).
    // Cleaning+casing can fuse two distinct source columns onto one token, so
    // make the tokens unique within this table BEFORE building the schema —
    // otherwise the `& schema` line would carry duplicate headers and a
    // name-keyed consumer would silently merge the two fields.
    const baseNames = clean.map((name, ci) =>
      decisions[ci]!.interned ? name.toUpperCase() : name.toLowerCase());
    const wireNames = dedupeColumnNames(baseNames);
    const columns: PackColumn[] = wireNames.map((name, ci) => {
      const d = decisions[ci]!;
      // internGroup (the shared dictionary prefix) is namespaced independently
      // of the column name in encode(), so the uniqueness suffix never disturbs
      // interning or value round-tripping — it only repairs column identity.
      return d.interned && d.prefix !== undefined ? { name, internGroup: d.prefix } : { name };
    });
    const rows: PackRow[] = t.rows.map((r) => clean.map((_, ci) => coerce(r[ci])));
    return { name: t.name, columns, rows };
  });

  // Canonical mode pins the header to a content digest (no wall-clock), so the
  // same logical input yields a byte-identical pack on every run and platform.
  const header = opts.canonical ? canonicalHeader(opts.header, tables) : opts.header;
  return opts.meta !== undefined
    ? encode({ header, tables, meta: opts.meta })
    : encode({ header, tables });
}
