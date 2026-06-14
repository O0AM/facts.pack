/**
 * parity.mjs — BROWSER ⇄ REFERENCE encoder byte parity (Gate 1).
 *
 * The Gate-1 "emitter parity" gap was: the browser converter and the reference
 * codec were two independent encoders that could emit different bytes for the
 * same logical data. They are now ONE encoder — the converter calls the
 * reference codec's `encodeAuto`, esbuild-inlined into docs/index.html.
 *
 * This suite proves it from observable bytes, two ways:
 *
 *  1. CODEC PARITY — the encoder INLINED in the shipped page (`__FPCODEC`,
 *     extracted verbatim from docs/index.html by the harness) and the reference
 *     codec vendored for Node (`encodeAuto` from the bundle) produce
 *     BYTE-IDENTICAL output for identical `encodeAuto` options. No timestamp or
 *     adapter is involved — pure encoder-vs-encoder.
 *
 *  2. END-TO-END — a pack the converter actually emits (via `convert()`) strict-
 *     decodes, and its legend "Tables:" tokens match the on-wire `&` schema
 *     (cleaned + cased). We do NOT re-derive the adapter to "reproduce" the bytes
 *     here — that would only compare the adapter to a copy of itself; the
 *     non-circular byte-parity proof is section 1, and full round-trip
 *     equivalence is validate.mjs (15 cases).
 *
 * Scope honesty: section 1 is the body+digest the encoder produces — the byte
 * parity the evidence matrix flagged as the open Gate-1 item, now closed for the
 * encoder. Full-PACK determinism (the per-run timestamp) is a separate open item.
 */

import { engine, convert } from './harness.mjs';
import { encodeAuto, decode, PackDecodeError } from './factspack.bundle.mjs';
import { ledger } from './_report.mjs';

const L = ledger({ PARITY: '🟰', DECODE: '🔓', BROKEN: '❌' }, ['BROKEN']);
const confirm = (id, claim, pass, detail, state = 'PARITY') =>
  L.add(pass ? state : 'BROKEN', `[${id}] ${claim}`, detail);

/* ── 1. CODEC PARITY: inlined __FPCODEC.encodeAuto === bundle encodeAuto ── */
const inlined = engine.__FPCODEC;
confirm('CODEC-present', 'the shipped page inlines the reference codec (__FPCODEC.encodeAuto is callable)',
  inlined && typeof inlined.encodeAuto === 'function',
  inlined ? `typeof encodeAuto = ${typeof inlined.encodeAuto}` : 'no __FPCODEC');

const H = { producer: 'factspack-web/0.1', schema: 'demo-v1', snapshotId: 'snap', rowCount: null, kind: 'master' };
const CASES = [
  {
    label: 'literal columns (below intern threshold)',
    opts: { header: H, tables: [{ name: 't', columns: ['id', 'name'], rows: [[1, 'a'], [2, 'b']] }] },
  },
  {
    label: 'interned column (repeats pay for the dictionary)',
    opts: {
      header: H,
      tables: [{
        name: 'files',
        columns: ['F'],
        rows: Array.from({ length: 6 }, () => ['src/components/widget.tsx']).concat([['src/index.ts']]),
      }],
    },
  },
  {
    label: 'multi-table shared dict + coercion + nulls + legend',
    opts: {
      header: H,
      tables: [
        { name: 'files', columns: ['F', 'loc'], rows: [['src/a-long-enough-name.ts', 12], ['src/a-long-enough-name.ts', 12], ['src/a-long-enough-name.ts', 12]] },
        { name: 'imports', columns: ['F', 'to'], rows: [['src/a-long-enough-name.ts', null], ['src/a-long-enough-name.ts', '']] },
      ],
      meta: { legend: ['a legend line', 'another'] },
    },
  },
];

for (const c of CASES) {
  let a, b, err = '';
  try { a = inlined.encodeAuto(c.opts); b = encodeAuto(c.opts); } catch (e) { err = String((e && e.message) || e); }
  confirm(`CODEC-${c.label}`, `inlined codec === reference codec, byte-for-byte — ${c.label}`,
    !err && a === b, err || (a === b ? `${a.length} B identical` : 'BYTES DIFFER between inlined and reference codec'));
}

/* ── 2. END-TO-END: the converter's REAL output is valid + self-consistent ── */
// We deliberately do NOT re-derive the adapter to "reproduce" the bytes — that
// compares the adapter to a copy of itself. The non-circular byte-parity proof
// is section 1 (inlined vs bundle, no adapter). Here we check the converter's
// actual output: it strict-decodes, and its legend "Tables:" tokens match the
// on-wire & schema (cleaned + cased) — locking the legend/schema-consistency fix.
const E2E = [
  { label: 'data (CSV)', input: 'sku,cat,price\nA-1,x,9.99\nB-2,y,3.50\nC-3,x,7.25' },
  { label: 'code map (JS)', input: '// a.js\nimport {x} from "./b.js";\nexport function foo(){}\nexport function bar(){}\n' },
  { label: 'JSON records', input: JSON.stringify([{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'a' }]) },
  { label: 'spaces+interned key', input: JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ 'First Name': 'a-long-repeated-token', id: i }))) },
  { label: 'newline in key', input: JSON.stringify([{ 'a\nb': 1, x: 2 }, { 'a\nb': 3, x: 4 }]) },
  // Colliding columns: "Name" and "name" clean+case-fold to the same token. The
  // producer must suffix the collision so the `& schema` line stays duplicate-free
  // (otherwise a name-keyed consumer silently merges the two fields).
  { label: 'colliding column names', input: JSON.stringify([{ Name: 'Alice', name: 'bob', age: '30' }]) },
];

for (const t of E2E) {
  const r = await convert(t.input);
  const pack = r.pack;
  let decoded = null, derr = '';
  try { decoded = decode(pack); } catch (e) { derr = e instanceof PackDecodeError ? e.message : String(e); }
  confirm(`E2E-decode-${t.label}`, `converter output strict-decodes — ${t.label}`, !!decoded, derr || 'strict-decoded', 'DECODE');

  // Legend "Tables: name(col, col)" tokens must equal the on-wire & schema tokens.
  const lines = pack.split('\n');
  const legendLine = lines.find((l) => l.startsWith('; Tables:')) || '';
  const schemaLines = lines.filter((l) => l.startsWith('& '));
  const schemaCols = schemaLines.flatMap((l) => l.slice(2).split('\t').slice(1));

  // Column IDENTITY: each `& schema` line must carry DISTINCT tokens (checked
  // per-table — the same token across two tables is legitimate). A duplicate
  // header would silently merge two source fields for a name-keyed consumer.
  const everyLineUnique = schemaLines.every((l) => {
    const cols = l.slice(2).split('\t').slice(1);
    return new Set(cols).size === cols.length;
  });
  confirm(`E2E-uniqcols-${t.label}`, `every on-wire & schema line has DISTINCT column tokens (no duplicate headers) — ${t.label}`,
    everyLineUnique, schemaLines.map((l) => l.slice(2)).join(' | '));
  const legendCols = legendLine.replace(/^; Tables: /, '').split(' · ').flatMap((seg) => {
    const m = seg.match(/^[^(]+\((.*)\)$/);
    return m ? m[1].split(', ') : [];
  });
  confirm(`E2E-legend-${t.label}`, `legend "Tables:" tokens match the on-wire & schema (cleaned + cased) — ${t.label}`,
    JSON.stringify(legendCols) === JSON.stringify(schemaCols),
    `legend=${JSON.stringify(legendCols)} schema=${JSON.stringify(schemaCols)}`);
}

L.finish(({ n, failed, total }) =>
  failed === 0
    ? `${total} parity checks pass — the browser converter and the reference codec are ONE encoder (byte-identical).`
    : `${failed}/${total} parity checks FAILED — the encoders diverge.`);
