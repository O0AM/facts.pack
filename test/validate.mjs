/**
 * Validation battery: converts a battery of inputs with the SHIPPED engine
 * (extracted from docs/index.html by harness.mjs) and validates every output
 * with the REFERENCE decoder from factstack packages/factspack (strict v0.2:
 * trailer + sha256 verified, unresolved dictionary keys rejected).
 *
 * Run: node test/validate.mjs
 */
import { decode, PackDecodeError } from './factspack.bundle.mjs';
import { convert } from './harness.mjs';

const results = [];
let fixturesWritten = 0;

/* ---------- expected-value normalizer (independent re-statement of the
   emitter's documented contract; deliberately NOT engine.flat) ---------- */
const normVal = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s === '-' ? '−' : s;
};
const flatten = (obj) => {
  const o = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) o[k + '.' + k2] = normVal(v2);
    } else o[k] = normVal(v);
  }
  return o;
};
const sanitize = (c) => String(c).trim().replace(/[\s\t]+/g, '_') || 'col';

function expectedMatrix(records) {
  const flat = records.map(flatten);
  const keys = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  return {
    cols: keys.map(sanitize),
    rows: flat.map((r) => keys.map((k) => (k in r ? r[k] : null))),
  };
}

/* ---------- battery ---------- */
const FILES = ['src/auth/session.ts', 'src/users/registry.ts', 'src/ui/dashboard.tsx', 'src/api/client.ts'];
const NAMES = ['login', 'logout', 'refresh', 'signup', 'invite', 'revoke', 'render', 'hydrate', 'fetchAll'];
const sampleRows = [];
for (let i = 0; i < 36; i++) sampleRows.push({
  id: i + 1, kind: i % 9 === 4 ? 'cls' : 'fn',
  name: NAMES[i % 9] + (i >= 9 ? Math.floor(i / 9) : ''),
  file: FILES[i % 4], line: 8 + i * 7,
});

const CAT = ['electronics', 'home-and-kitchen', 'sports-outdoors'];
const csvLines = ['sku,category,price,stock,warehouse'];
for (let i = 0; i < 24; i++)
  csvLines.push('SKU-' + (1000 + i) + ',' + CAT[i % 3] + ',' + (9.99 + i * 3) + ',' + (5 + i * 2) + ',' + (i % 2 ? 'berlin-dc-east' : 'berlin-dc-west'));
const csvText = csvLines.join('\n');
const csvRecords = csvLines.slice(1).map((l) => {
  const c = l.split(',');
  return { sku: c[0], category: c[1], price: c[2], stock: c[3], warehouse: c[4] };
});

const ndjsonA = Array.from({ length: 6 }, (_, i) => ({ id: i, path: 'pkg/core/engine/runtime.ts', msg: 'event ' + i }));
const ndjsonB = Array.from({ length: 4 }, (_, i) => ({ user: 'u' + i, role: i % 2 ? 'admin' : 'viewer' }));
const ndjsonText = [...ndjsonA.map((o) => JSON.stringify(o)), ...ndjsonB.map((o) => JSON.stringify(o))].join('\n');

const mdRecords = [
  { feature: 'interning', status: 'shipped', notes: 'one id per file' },
  { feature: 'trailer', status: 'shipped', notes: 'sha256 verified' },
  { feature: 'chains', status: 'specified', notes: 'pipeline next' },
  { feature: 'hot hints', status: 'optional', notes: '' },
];
const mdText = [
  '| feature | status | notes |',
  '|---|---|---|',
  ...mdRecords.map((r) => `| ${r.feature} | ${r.status} | ${r.notes} |`),
].join('\n');

const longPath = 'packages/analyzer/src/pipeline/walker/visitors/declarations.ts';
const escapeRows = [];
for (let i = 0; i < 12; i++) escapeRows.push({
  id: i,
  file: i % 3 === 0 ? longPath : i % 3 === 1 ? 'packages/emit/src/pack\twith-tab.ts' : 'packages/web/src/Ωnaïve-🦖.tsx',
  text: ['tab\there', 'line\nbreak', 'back\\slash', 'combo\\t-not-escape', '-', '', null, 'plain'][i % 8],
});

const mixedRows = [];
for (let i = 0; i < 30; i++) mixedRows.push({ id: i, f: FILES[i % 3], n: i });
mixedRows.push({ id: 30, f: 12345, n: 30 });          // number in interned column
mixedRows.push({ id: 31, f: 67890, n: 31 });

const boolRows = [];
for (let i = 0; i < 30; i++) boolRows.push({ id: i, f: FILES[i % 3] });
boolRows.push({ id: 30, f: true });
boolRows.push({ id: 31, f: false });

const nullRows = [];
for (let i = 0; i < 30; i++) nullRows.push({ id: i, f: i % 5 === 0 ? null : FILES[i % 3] });

const emptyRows = [];
for (let i = 0; i < 30; i++) emptyRows.push({ id: i, f: i % 5 === 0 ? '' : FILES[i % 3] });

const dashRows = Array.from({ length: 8 }, (_, i) => ({ id: i, v: i % 2 ? '-' : 'value-' + i }));

const scaleRows = [];
for (let i = 0; i < 1500; i++) scaleRows.push({
  id: i, kind: 'fn', name: 'sym' + i, file: FILES[i % 4] + '/deep/nesting/module-' + (i % 12) + '.ts', line: i * 3,
});

const codeText = (() => {
  const fn = (n, b) => 'export function ' + n + '(input) {\n  const checked = validate(input);\n  ' + b + '\n  return checked;\n}\n';
  let js = "// file: src/auth/session.js\nimport jwt from 'jsonwebtoken';\nimport { db } from '../data/store';\n\n";
  ['login', 'logout', 'refresh'].forEach((n) => { js += fn(n, "db.sessions.write(checked);"); });
  js += 'export class SessionPolicy {}\n';
  let py = '# file: src/data/pipeline.py\nimport sqlite3\nfrom pathlib import Path\n\n';
  ['connect', 'migrate'].forEach((n) => { py += 'def ' + n + '(db_path):\n    return sqlite3.connect(db_path)\n\n'; });
  py += 'class PipelineState:\n    pass\n';
  return js + '\n' + py;
})();

const CASES = [
  { name: 'json-records-36', input: JSON.stringify(sampleRows, null, 1), mode: 'lossless', records: sampleRows, table: 'records' },
  { name: 'csv-products-24', input: csvText, mode: 'lossless', records: csvRecords, table: 'records' },
  { name: 'ndjson-two-shapes', input: ndjsonText, mode: 'lossless', multi: [{ table: 'records', records: ndjsonA }, { table: 'records2', records: ndjsonB }] },
  { name: 'markdown-table', input: mdText, mode: 'lossless', records: mdRecords, table: 'records' },
  { name: 'json-escapes-unicode', input: JSON.stringify(escapeRows), mode: 'lossless', records: escapeRows, table: 'records', lossyDash: true },
  { name: 'TRAP-number-in-interned', input: JSON.stringify(mixedRows), mode: 'lossless', records: mixedRows, table: 'records' },
  { name: 'TRAP-bool-in-interned', input: JSON.stringify(boolRows), mode: 'lossless', records: boolRows, table: 'records' },
  { name: 'nulls-in-interned', input: JSON.stringify(nullRows), mode: 'lossless', records: nullRows, table: 'records' },
  { name: 'empty-str-in-interned', input: JSON.stringify(emptyRows), mode: 'lossless', records: emptyRows, table: 'records' },
  { name: 'literal-dash-values', input: JSON.stringify(dashRows), mode: 'lossless', records: dashRows, table: 'records', lossyDash: true },
  { name: 'json-array-of-arrays', input: JSON.stringify([[1, 'a'], [2, 'b'], [3, null]]), mode: 'lossless' },
  { name: 'json-object-of-arrays', input: JSON.stringify({ x: [1, 2, 3], y: ['p', 'q', 'r'] }), mode: 'lossless', records: [{ x: 1, y: 'p' }, { x: 2, y: 'q' }, { x: 3, y: 'r' }], table: 'records' },
  { name: 'json-single-object', input: JSON.stringify({ name: 'pack', version: 0.2, nested: { deep: true } }), mode: 'lossless' },
  { name: 'code-map-js-py', input: codeText, mode: 'map' },
  { name: 'scale-1500-rows', input: JSON.stringify(scaleRows), mode: 'lossless', records: scaleRows, table: 'records' },
];

/* ---------- assertions ---------- */
function check(name, cond, detail) {
  if (!cond) throw new Error(name + (detail ? ' — ' + detail : ''));
}

for (const c of CASES) {
  const r = { name: c.name, status: 'PASS', notes: [] };
  const t0 = performance.now();
  try {
    const { pack, mode } = await convert(c.input);
    check('mode', mode === c.mode, `expected ${c.mode}, got ${mode}`);
    check('final newline', pack.endsWith('\n'));

    let decoded;
    try {
      decoded = decode(pack);
    } catch (e) {
      throw new Error('REFERENCE DECODER REJECTED: ' + (e instanceof PackDecodeError ? e.message : e));
    }

    // header contract
    const h = decoded.header;
    check('producer', h.producer === 'factspack-web/0.1', h.producer);
    check('schema', h.schema === (mode === 'map' ? 'map-v1' : 'paste-v1'), h.schema);
    check('kind', h.kind === 'master', String(h.kind));
    // A standalone converter master is not part of a diff chain, so it carries
    // no seq (the unified codec omits absent header fields rather than emitting a
    // misleading seq=1). kind=master is still asserted above.
    check('seq absent (standalone master)', h.seq === undefined, String(h.seq));
    const totalRows = [...decoded.tables.values()].reduce((n, t) => n + t.rows.length, 0);
    check('header rowCount', h.rowCount === totalRows, `${h.rowCount} vs ${totalRows}`);

    // trailer contract (decoder verified sha256 already; assert presence+counts)
    check('trailer present', !!decoded.trailer);
    check('trailer rows', decoded.trailer.rows === totalRows);
    check('trailer tables', decoded.trailer.tables === decoded.tables.size);

    // legend present
    check('legend lines', decoded.meta.length >= 5, String(decoded.meta.length));

    // round-trip equality
    const compareTable = (tableName, records) => {
      const table = decoded.tables.get(tableName);
      check('table ' + tableName, !!table, [...decoded.tables.keys()].join(','));
      const exp = expectedMatrix(records);
      check(tableName + ' row count', table.rows.length === exp.rows.length, `${table.rows.length} vs ${exp.rows.length}`);
      check(tableName + ' col count', table.columns.length === exp.cols.length,
        `[${table.columns.map(x => x.name)}] vs [${exp.cols}]`);
      table.columns.forEach((col, i) =>
        check(`col ${i}`, col.name.toLowerCase() === exp.cols[i].toLowerCase(), `${col.name} vs ${exp.cols[i]}`));
      for (let ri = 0; ri < exp.rows.length; ri++)
        for (let ci = 0; ci < exp.cols.length; ci++) {
          const got = table.rows[ri][ci], want = exp.rows[ri][ci];
          check(`cell r${ri}c${ci} (${exp.cols[ci]})`, got === want, JSON.stringify(got) + ' vs ' + JSON.stringify(want));
        }
    };
    if (c.records && c.table) compareTable(c.table, c.records);
    if (c.multi) for (const m of c.multi) compareTable(m.table, m.records);

    if (c.name === 'code-map-js-py') {
      const syms = decoded.tables.get('symbols');
      const files = decoded.tables.get('files');
      const imports = decoded.tables.get('imports');
      check('files rows', files.rows.length === 2);
      check('symbols extracted', syms.rows.length === 7, String(syms.rows.length)); // 3 fn + 1 cls JS, 2 fn + 1 cls PY
      check('imports extracted', imports.rows.length === 4, String(imports.rows.length));
      const names = syms.rows.map((r) => r[2]);
      for (const n of ['login', 'logout', 'refresh', 'SessionPolicy', 'connect', 'migrate', 'PipelineState'])
        check('symbol ' + n, names.includes(n));
    }
    if (c.name === 'scale-1500-rows') {
      const dictKeys = (await convert(c.input)).pack.split('\n').filter((l) => l.startsWith('@ ')).length;
      check('interning active', dictKeys === 12, String(dictKeys)); // i%12 determines i%4: 12 unique paths
      r.notes.push(`${(performance.now() - t0).toFixed(0)}ms, dict=${dictKeys}`);
    }
    if (c.lossyDash) r.notes.push('"-" → "−" substitution verified (documented lossy)');
  } catch (e) {
    r.status = 'FAIL';
    r.notes.push(e.message.length > 220 ? e.message.slice(0, 220) + '…' : e.message);
  }
  results.push(r);
}

/* ---------- report ---------- */
let failed = 0;
for (const r of results) {
  if (r.status === 'FAIL') failed++;
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}${r.notes.length ? '  · ' + r.notes.join(' · ') : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} cases pass against the reference decoder`);
process.exit(failed ? 1 : 0);
