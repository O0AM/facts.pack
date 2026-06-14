/**
 * conformance.mjs — Gate 1 conformance for the FactsPack v0.2a format.
 *
 * Pins the properties that make the wire a SAFE conformance base:
 *   - Determinism: encode(x) is byte-identical across repeated runs (in-process).
 *   - Golden vectors: the byte-exact example fixtures decode to exact, known data.
 *   - Canonical round-trip: decode(fixture) re-encodes byte-for-byte.
 *   - Cross-encoder SEMANTIC parity: the web engine and the reference encoder
 *     produce packs that decode to equivalent logical data.
 *   - Byte-for-byte encoder parity: the browser converter and the reference codec
 *     are ONE encoder (encodeAuto inlined into docs/index.html) — proven byte
 *     identical, and guarded against drift from source.
 *
 *   - Full-PACK determinism: with the canonical-producer profile the shipped
 *     converter pins its header to a content digest (no wall-clock), so the whole
 *     pack is byte-identical across runs and platforms (DET-3).
 *
 * Gate 1 is now complete: determinism (DET-1/2/3), resource ceilings, and encoder
 * byte-parity all hold. What remains is Gate 2 (the owner-gated P0.1 benchmark),
 * not a conformance property.
 *
 * Run: node test/conformance.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { encode, encodeAuto, decode } from './factspack.bundle.mjs';
import { convert, engine } from './harness.mjs';
import { ledger } from './_report.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (f) => readFileSync(join(dir, 'fixtures', f), 'utf8');

const L = ledger({ PASS: '✅', FAIL: '❌', OPEN: '🔻' }, ['FAIL']);
const confirm = (id, title, cond, detail) => L.add(cond ? 'PASS' : 'FAIL', `[${id}] ${title}`, detail);
const flag = (id, title, detail) => L.add('OPEN', `[${id}] ${title}`, detail);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* 1. Determinism (in-process): identical input -> identical bytes, every time. */
{
  const mk = () => encode({
    header: { producer: 'facts/0.2a', schema: 's-v1', snapshotId: 'x', rowCount: null, kind: 'master' },
    meta: { legend: ['t a B'] },
    tables: [{ name: 't', columns: [{ name: 'a' }, { name: 'B' }],
      rows: [['1', 'src/auth.ts'], ['2', 'src/auth.ts'], ['3', 'src/users.ts']] }],
  });
  const runs = Array.from({ length: 5 }, mk);
  confirm('DET-1', 'In-process determinism: 5 encodes of the same input are byte-identical',
    runs.every((r) => r === runs[0]), `${new Set(runs).size} distinct output(s) (want 1)`);

  // DET-2 (v0.3 — CLOSED): code-map file paths are canonicalized to POSIX '/', so the
  // same logical map emits identical BODY bytes regardless of input path separators.
  const BS = String.fromCharCode(92);
  const code = (sep) => `// file: src${sep}auth${sep}session.ts\nexport function login(){}\nexport function logout(){}\n`;
  const bodyOf = (s) => s.split('\n').filter((l) => !l.startsWith('# ') && !l.startsWith('; end ')).join('\n');
  const winBody = bodyOf((await convert(code(BS))).pack);
  const posBody = bodyOf((await convert(code('/'))).pack);
  confirm('DET-2', 'Cross-platform: a code map with Windows vs POSIX path separators emits identical body bytes (v0.3 canonicalization)',
    winBody === posBody && winBody.includes('src/auth/session.ts'),
    winBody === posBody ? 'paths normalized to POSIX /, bodies byte-equal' : 'bodies diverge');

  // DET-3 (v0.3 — CLOSED): full-PACK determinism via the canonical-producer profile.
  // The shipped converter pins its header to a content digest (no wall-clock), so the
  // WHOLE pack (header included) is byte-identical across runs and platforms.
  const det = 'role,team\nadmin,core\nviewer,core\nadmin,growth';
  const r1 = (await convert(det)).pack;
  await new Promise((res) => setTimeout(res, 20)); // let the wall-clock advance between runs
  const r2 = (await convert(det)).pack;
  confirm('DET-3', 'FULL-pack determinism: two runs of the shipped converter emit a byte-identical pack (canonical-producer profile, no wall-clock)',
    r1 === r2 && !/\d{4}-\d\d-\d\dT\d\d:\d\d/.test(r1),
    r1 === r2 ? 'header + body byte-equal across runs; no ISO timestamp present' : 'packs differ across runs');
  // The pinned snapshotId is a pure CONTENT digest: identical data ⇒ identical id
  // (clock- and platform-independent), distinct data ⇒ distinct id.
  const idOf = (p) => p.split('\n')[0].split('\t')[2];
  const r3 = (await convert(det + '\nviewer,growth')).pack; // one extra row ⇒ different data
  confirm('DET-3-id', 'The pinned snapshotId is a content digest: same data ⇒ same id, different data ⇒ different id',
    /^[0-9a-f]{12}$/.test(idOf(r1)) && idOf(r1) !== idOf(r3),
    `id(data)=${idOf(r1)} vs id(data+1row)=${idOf(r3)}`);
}

/* 2. Golden vectors: the byte-exact fixtures decode to EXACT known data. */
{
  const m = decode(fx('symbols-master.pack'));
  const sym = m.tables.get('symbols');
  confirm('GOLD-master', 'symbols-master.pack decodes to the exact 5 expected rows',
    m.header.kind === 'master' && m.header.rowCount === 5 && sym.rows.length === 5
      && eq(sym.rows[0], ['1', 'fn', 'login', 'src/auth.ts', '42'])
      && eq(sym.rows[4], ['5', 'fn', 'list', 'src/users.ts', '25']),
    `kind=${m.header.kind}, rowCount=${m.header.rowCount}, rows=${sym.rows.length}`);

  const d = decode(fx('symbols-diff.pack'));
  const ds = d.tables.get('symbols');
  confirm('GOLD-diff', 'symbols-diff.pack decodes to the exact diff (1 add, 1 delete, 0 sentinel)',
    d.header.kind === 'diff' && d.header.rowCount === 0 && ds.addedRows.length === 1
      && eq(ds.addedRows[0], ['6', 'fn', 'reset', 'src/auth.ts', '70'])
      && eq(ds.deletedIds, ['3']) && d.trailer.rows === 2,
    `kind=${d.header.kind}, rowCount=${d.header.rowCount}, +${ds.addedRows.length}/x${ds.deletedIds.length}, trailer.rows=${d.trailer.rows}`);
}

/* 3. Canonical round-trip: decode then re-encode the fixtures byte-for-byte. */
{
  const dd = decode(fx('symbols-master.pack'));
  const t = [...dd.tables.values()][0];
  const re = encode({ header: dd.header, meta: { legend: dd.meta },
    tables: [{ name: t.name, columns: t.columns, rows: t.rows }] });
  confirm('RT-master', 'decode(symbols-master.pack) re-encodes byte-for-byte (stable canonical form)',
    re === fx('symbols-master.pack'), re === fx('symbols-master.pack') ? 'identical' : 'DRIFT');
}

/* 4. Cross-encoder SEMANTIC parity: web engine vs reference encoder decode-equivalent. */
{
  const records = [{ id: '1', role: 'admin' }, { id: '2', role: 'viewer' }, { id: '3', role: 'admin' }];
  const webPack = (await convert(JSON.stringify(records))).pack; // web engine → strict-valid master
  const refPack = encode({
    header: { producer: 'ref/1', schema: 'paste-v1', snapshotId: 'x', rowCount: null, kind: 'master' },
    meta: { legend: ['records id role'] },
    tables: [{ name: 'records', columns: [{ name: 'id' }, { name: 'role' }], rows: records.map((r) => [r.id, r.role]) }],
  });
  const wt = decode(webPack).tables.get('records');
  const rt = decode(refPack).tables.get('records');
  confirm('PARITY-semantic', 'Web engine and reference encoder decode to the SAME logical rows',
    eq(wt.rows, rt.rows), `${wt.rows.length} web rows vs ${rt.rows.length} ref rows`);
  // The browser emitter ↔ reference DECODER parity is already proven by validate.mjs
  // (15 shipped-engine outputs all round-trip through the strict reference decoder).
  confirm('PARITY-decoder', 'The web engine output is accepted by the strict reference decoder (emitters do not drift)',
    decode(webPack).header.schema === 'paste-v1', 'shipped-engine pack decodes strict — see validate.mjs for the full battery');
  // BYTE-for-byte encoder parity — now ACHIEVED. The browser converter and the
  // reference codec are ONE encoder: encodeAuto is esbuild-inlined into
  // docs/index.html. A representative inline check (the full battery is parity.mjs):
  // the encoder INLINED in the shipped page === the reference codec, byte-for-byte.
  const pOpts = {
    header: { producer: 'p', schema: 's', snapshotId: 't', rowCount: null, kind: 'master' },
    tables: [{ name: 'files', columns: ['F'], rows: [['x/y/longname.ts'], ['x/y/longname.ts'], ['x/y/longname.ts']] }],
  };
  confirm('PARITY-byte', 'The browser-inlined encoder === the reference codec, byte-for-byte (see parity.mjs for the full battery)',
    engine.__FPCODEC.encodeAuto(pOpts) === encodeAuto(pOpts), 'inlined codec and reference codec produce identical bytes');

  // Drift guards: BOTH vendored copies of the codec must equal a FRESH esbuild of
  // the reference source — the IIFE inlined in docs/index.html (the shipped
  // encoder) AND the bundle the Node tests treat as the reference side of every
  // parity assertion — so neither can silently diverge from source.
  // On a clean clone WITHOUT the sibling reference source (../claude/factstack),
  // the guards cannot rebuild to compare, so they are SKIPPED (flagged) rather
  // than failed — the committed bundle/IIFE are trusted as-is. With the sibling
  // present they enforce byte-equality with source.
  const SIBLING = resolve(dir, '..', '..', 'claude', 'factstack');
  if (existsSync(SIBLING)) {
    const inlineDrift = spawnSync('node', [join(dir, 'build-inline-codec.mjs'), '--check'], { encoding: 'utf8' });
    confirm('INLINE-DRIFT', 'The codec inlined in docs/index.html matches a fresh build of the reference source',
      inlineDrift.status === 0, ((inlineDrift.stdout || '') + (inlineDrift.stderr || '')).trim().slice(0, 90));
    const bundleDrift = spawnSync('node', [join(dir, 'build-bundle.mjs'), '--check'], { encoding: 'utf8' });
    confirm('BUNDLE-DRIFT', 'The vendored test bundle matches a fresh build of the reference source (the reference side of parity)',
      bundleDrift.status === 0, ((bundleDrift.stdout || '') + (bundleDrift.stderr || '')).trim().slice(0, 90));
  } else {
    flag('INLINE-DRIFT', 'SKIPPED — reference source (../claude/factstack) absent on this checkout; cannot rebuild to compare',
      'the committed inlined IIFE in docs/index.html is trusted as-is; run with the sibling codec present to enforce drift');
    flag('BUNDLE-DRIFT', 'SKIPPED — reference source absent on this checkout; cannot rebuild to compare',
      'the committed test bundle is trusted as-is; run with the sibling codec present to enforce drift');
  }
}

/* ---------- report ---------- */
L.finish(({ n, failed }) =>
  `${n('PASS')} conformance properties hold · ${n('OPEN')} open Gate-1 items flagged · ${failed} failed\n` +
  (failed === 0
    ? 'Gate 1 conformance holds for what is implemented; open items are flagged, not assumed.'
    : 'A conformance property regressed — investigate.'));
