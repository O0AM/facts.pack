/**
 * chainproducer.mjs — the master/diff CHAIN PRODUCER (tools/chain/store.mjs).
 *
 * chain.mjs proves the diff PRIMITIVES; this proves the PRODUCER that maintains
 * a chain over time: it decides diff-vs-remaster per snapshot, writes a
 * self-describing .pack manifest with real parent hashes, reconstructs the head
 * exactly, coalesces at the measured break-even, and detects a tampered chain.
 *
 * Uses an in-memory I/O adapter (no disk) and a PATH-keyed table — the stable-PK
 * case the producer is scoped to.
 */
import { encode, decode } from './factspack.bundle.mjs';
import { makePack } from './_pack.mjs';
import { ChainStore, parseManifest, buildManifest, MANIFEST } from '../tools/chain/store.mjs';
import { ledger } from './_report.mjs';
import { memIO, makeOk } from './_util.mjs';

const L = ledger({ OK: '🔗', ECON: '📉', BROKEN: '❌' }, ['BROKEN']);
const ok = makeOk(L);

const COLS = [{ name: 'path' }, { name: 'lines' }, { name: 'sha' }];
// H stays for the bespoke MULTI-table schema-change tests below; the common single-table
// builder goes through the shared, transparent makePack.
const H = (snap) => ({ producer: 'factspack-chain/0.1', schema: 'files-v1', snapshotId: snap, rowCount: null, kind: 'master' });
const pack = (snap, rows) => makePack(snap, { producer: 'factspack-chain/0.1', schema: 'files-v1', table: 'files', columns: COLS, legend: 'files path lines sha', rows });
// stable identity: the PK (column 0) is a file PATH, stable across snapshots.
const base = Array.from({ length: 40 }, (_, i) => ['src/f' + i + '.ts', String(100 + i), 'h' + i]);
const rowKey = (rows) => rows.map((r) => r.join('')).sort().join('\n');
const headRows = (store) => store.head().get('files').rows;

// ── 1. baseline snapshot becomes the master ──
const io = memIO();
const store = new ChainStore(io, { coalesceRatio: 0.5, maxChainLen: 24 });
const r1 = store.add(pack('rev1', base));
ok('BASE', 'the first snapshot is written as the master (baseline)', r1.action === 'master' && r1.reason === 'baseline', `action=${r1.action} file=${r1.file}`);

// ── 2. a small change becomes a small diff, not a fresh map ──
const bRows = base.filter((r) => r[0] !== 'src/f3.ts')                                   // delete f3
  .map((r) => (r[0] === 'src/f7.ts' ? [r[0], '999', r[2]] : r))                          // change f7
  .concat([['src/fnew.ts', '5', 'hn']]);                                                 // add fnew
const r2 = store.add(pack('rev2', bRows));
ok('DIFF', 'a small change is appended as a diff far smaller than the full map', r2.action === 'diff' && r2.bytes < r2.masterBytes * 0.5,
  `diff ${r2.bytes} B vs full map ${r2.masterBytes} B`, 'ECON');

// ── 3. a second small change extends the chain ──
const cRows = bRows.map((r) => (r[0] === 'src/f10.ts' ? [r[0], '42', r[2]] : r));
const r3 = store.add(pack('rev3', cRows));
ok('DIFF2', 'a second small change appends a second diff (chain = master + 2 diffs)', r3.action === 'diff' && parseManifest(io.read(MANIFEST)).length === 3,
  `links=${parseManifest(io.read(MANIFEST)).length}`);

// ── 4. head() reconstructs the latest state EXACTLY from master + diffs ──
ok('RECON', 'head() reconstructs the latest snapshot exactly from master + every diff', rowKey(headRows(store)) === rowKey(cRows),
  `${headRows(store).length} rows reconstructed vs ${cRows.length} expected`);

// ── 5. the manifest is itself a valid, self-sealed .pack ──
const manDec = decode(io.read(MANIFEST));
ok('MANIFEST', 'the manifest is a valid .pack with a "chain" table of the ordered links', !!manDec.tables.get('chain') && manDec.tables.get('chain').rows.length === 3,
  `chain rows=${manDec.tables.get('chain') ? manDec.tables.get('chain').rows.length : 0}, sha=${manDec.trailer.sha256}`);

// ── 6. re-adding the same snapshot is a no-op ──
const rNo = store.add(pack('rev3', cRows));
ok('NOCHANGE', 're-adding an unchanged snapshot writes nothing (action=nochange)', rNo.action === 'nochange', `action=${rNo.action}`);

// ── 7. parent hashes link up and verify() passes ──
const v1 = store.verify();
ok('VERIFY', 'verify() confirms every sha matches and every diff.parent links the prior link', v1.ok, v1.ok ? `${v1.links} links chained` : v1.errors.join('; '));

// ── 8. tampering a link is detected (the hash chain breaks) ──
const links = parseManifest(io.read(MANIFEST));
const victim = links[1].file; // the first diff
io.write(victim, pack('tampered', base)); // valid pack, but its sha != the manifest's
const v2 = store.verify();
ok('TAMPER', 'verify() REJECTS a tampered link (sha no longer matches the manifest)', !v2.ok && v2.errors.some((e) => /sha|parent/.test(e)),
  v2.errors[0] ? v2.errors[0].slice(0, 64) : 'no error raised');

// ── 9. coalescing: when most rows change, re-master instead of a bloated diff ──
const io2 = memIO();
const s2 = new ChainStore(io2, { coalesceRatio: 0.5, maxChainLen: 24 });
s2.add(pack('m1', base));
const allChanged = base.map((r) => [r[0], String(Number(r[1]) + 1), r[2] + '_x']); // every row's content differs
const rBig = s2.add(pack('m2', allChanged));
ok('COALESCE', 'when ~every row changes, the producer re-masters instead of emitting a diff bigger than the map', rBig.action === 'master' && /coalesce/.test(rBig.reason),
  `action=${rBig.action} reason=${rBig.reason}`, 'ECON');
ok('COALESCE-HEAD', 'after a coalesce the manifest is just the new master and head() still equals the latest snapshot',
  parseManifest(io2.read(MANIFEST)).length === 1 && rowKey(headRows(s2)) === rowKey(allChanged), `links=${parseManifest(io2.read(MANIFEST)).length}`);

// ── 10. coalescing also fires when the chain grows past maxChainLen ──
const io3 = memIO();
const s3 = new ChainStore(io3, { coalesceRatio: 0.99, maxChainLen: 2 });
s3.add(pack('c0', base));
let last;
for (let i = 1; i <= 3; i++) {
  const rows = base.map((r) => (r[0] === 'src/f0.ts' ? [r[0], String(i), r[2]] : r));
  last = s3.add(pack('c' + i, rows));
}
ok('MAXLEN', 'the chain re-masters once it grows past maxChainLen diffs (bounds consumer apply cost)', last.action === 'master' && last.reason === 'coalesce:chain-too-long',
  `3rd add -> ${last.action}/${last.reason}`);

// ── 11. a schema change (column arity) re-masters instead of corrupting head (adversarial F2) ──
{
  const io4 = memIO(); const s4 = new ChainStore(io4, { coalesceRatio: 0.5 });
  const C2 = [{ name: 'p' }, { name: 'v' }], C3 = [{ name: 'p' }, { name: 'v' }, { name: 'x' }];
  const big = Array.from({ length: 200 }, (_, i) => ['f' + i + '.ts', String(i)]);
  s4.add(encode({ header: H('r1'), meta: { legend: ['big p v', 'sm p v'] }, tables: [{ name: 'big', columns: C2, rows: big }, { name: 'sm', columns: C2, rows: [['a', '1'], ['b', '2'], ['c', '3']] }] }));
  const rA = s4.add(encode({ header: H('r2'), meta: { legend: ['big p v', 'sm p v x'] }, tables: [{ name: 'big', columns: C2, rows: big }, { name: 'sm', columns: C3, rows: [['a', '1', 'X'], ['b', '2', 'X'], ['c', '3', 'X']] }] }));
  const sm = s4.head().get('sm');
  ok('SCHEMA-ARITY', 'a column-count change (even on a small table) re-masters; head stays consistent and re-encodable',
    rA.action === 'master' && rA.reason === 'schema-change' && sm.columns.length === 3 && sm.rows.every((row) => row.length === 3) && !!s4.reconstructPack(),
    `action=${rA.action}/${rA.reason}, cols=${sm.columns.length}, widths=${[...new Set(sm.rows.map((row) => row.length))].join(',')}`);
}

// ── 12. dropping a table re-masters — no phantom empty table survives (adversarial F3) ──
{
  const io5 = memIO(); const s5 = new ChainStore(io5, { coalesceRatio: 0.5 });
  const C2 = [{ name: 'p' }, { name: 'v' }];
  const big = Array.from({ length: 200 }, (_, i) => ['f' + i + '.ts', String(i)]);
  s5.add(encode({ header: H('r1'), meta: { legend: ['big p v', 'sym p v'] }, tables: [{ name: 'big', columns: C2, rows: big }, { name: 'sym', columns: C2, rows: [['a', '1'], ['b', '2']] }] }));
  const rD = s5.add(encode({ header: H('r2'), meta: { legend: ['big p v'] }, tables: [{ name: 'big', columns: C2, rows: big }] }));
  ok('TABLE-DROP', 'removing a table re-masters; the dropped table is absent from head (no phantom)',
    rD.action === 'master' && [...s5.head().keys()].join(',') === 'big', `action=${rD.action}, head=[${[...s5.head().keys()].join(',')}]`);
}

// ── 13. a schema-only change (column rename, same data) is captured, not a false "nochange" (adversarial F4) ──
{
  const io6 = memIO(); const s6 = new ChainStore(io6);
  const d2 = base.map((r) => [r[0], r[1]]);
  s6.add(encode({ header: H('r1'), meta: { legend: ['files p v'] }, tables: [{ name: 'files', columns: [{ name: 'p' }, { name: 'v' }], rows: d2 }] }));
  const rR = s6.add(encode({ header: H('r2'), meta: { legend: ['files p val'] }, tables: [{ name: 'files', columns: [{ name: 'p' }, { name: 'val' }], rows: d2 }] }));
  ok('SCHEMA-RENAME', 'a column rename with identical data is NOT reported nochange; head reports the new name',
    rR.action === 'master' && s6.head().get('files').columns.map((c) => c.name).join(',') === 'p,val', `action=${rR.action}, cols=${s6.head().get('files').columns.map((c) => c.name).join(',')}`);
}

// ── 14. verify() REPORTS corruption (never throws) on byte tamper of a link or the manifest (adversarial F1) ──
{
  const io7 = memIO(); const s7 = new ChainStore(io7);
  s7.add(pack('r1', base));
  s7.add(pack('r2', base.map((r) => (r[0] === 'src/f1.ts' ? [r[0], '5', r[2]] : r))));
  const dfile = parseManifest(io7.read(MANIFEST))[1].file;
  io7.write(dfile, io7.read(dfile).replace('\t5\t', '\t6\t')); // flip one content byte; trailer sha now stale
  let v, threw = false;
  try { v = s7.verify(); } catch { threw = true; }
  ok('VERIFY-CORRUPT', 'verify() returns ok:false (does NOT throw) when a link file is byte-corrupted',
    !threw && v && v.ok === false && v.errors.some((e) => /undecodable|sha/.test(e)), threw ? 'THREW' : (v && v.errors[0] || '').slice(0, 60));
  io7.write(MANIFEST, 'garbage — not a pack');
  let v2, threw2 = false;
  try { v2 = s7.verify(); } catch { threw2 = true; }
  ok('VERIFY-CORRUPT-MANIFEST', 'verify() returns ok:false (does NOT throw) when the manifest.pack itself is corrupt',
    !threw2 && v2 && v2.ok === false, threw2 ? 'THREW' : (v2 && v2.errors[0] || '').slice(0, 60));
}

// ── 15. prune removes files orphaned by a re-master; the active chain still verifies ──
{
  const io8 = memIO(); const s8 = new ChainStore(io8, { coalesceRatio: 0.5 });
  const p3rows = base.map((r) => [r[0], String(Number(r[1]) + 1), r[2] + '_y']);
  s8.add(pack('p1', base));                                                            // 1.master
  s8.add(pack('p2', base.map((r) => (r[0] === 'src/f2.ts' ? [r[0], '7', r[2]] : r))));  // 2.diff
  s8.add(pack('p3', p3rows));                                                           // 3.master (coalesce: every row changed)
  const before = io8.list().filter((n) => /\.pack$/.test(n) && n !== MANIFEST).length;
  const pr = s8.prune();
  const after = io8.list().filter((n) => /\.pack$/.test(n) && n !== MANIFEST).length;
  ok('PRUNE', 'prune deletes the files orphaned by a re-master; the active chain still verifies and reconstructs',
    pr.removed.length === 2 && before === 3 && after === 1 && s8.verify().ok && rowKey(headRows(s8)) === rowKey(p3rows),
    `removed ${pr.removed.length} (${before}->${after} packs), verify=${s8.verify().ok}`);
}

// ── 16. a manifest whose link file name escapes the directory is rejected (security: no path traversal) ──
{
  const io9 = memIO(); const s9 = new ChainStore(io9);
  s9.add(pack('r1', base));
  const MCOLS = [{ name: 'seq' }, { name: 'kind' }, { name: 'file' }, { name: 'sha' }, { name: 'parent' }, { name: 'rows' }];
  const forged = encode({ header: { producer: 'factspack-chain/0.1', schema: 'chain-manifest-v1', snapshotId: 'x', rowCount: null, kind: 'master' },
    meta: { legend: ['chain seq kind file sha parent rows'] },
    tables: [{ name: 'chain', columns: MCOLS, rows: [['1', 'master', '../../../etc/passwd', 'abc', null, '1']] }] });
  io9.write(MANIFEST, forged);
  let threwRead = false; try { s9.head(); } catch { threwRead = true; }
  const v = s9.verify();
  ok('NO-TRAVERSAL', 'a manifest pointing a link file at a path-traversal name is rejected (no arbitrary read), and verify() reports it',
    threwRead && v.ok === false && /unsafe/.test(v.errors[0] || ''), `head threw=${threwRead}, verify.ok=${v.ok}`);
}

// ── 17. autoPrune (opt-in) removes files orphaned by a re-master automatically ──
{
  const ioA = memIO(); const sA = new ChainStore(ioA, { coalesceRatio: 0.5, autoPrune: true });
  sA.add(pack('a1', base));                                                              // 1.master
  sA.add(pack('a2', base.map((r) => (r[0] === 'src/f2.ts' ? [r[0], '7', r[2]] : r))));    // 2.diff
  sA.add(pack('a3', base.map((r) => [r[0], String(Number(r[1]) + 1), r[2] + '_z'])));     // 3.master (coalesce) -> auto-prune
  const packsLeft = ioA.list().filter((n) => /\.pack$/.test(n) && n !== MANIFEST).length;
  ok('AUTOPRUNE', 'with autoPrune:true a coalesce re-master deletes the orphaned files immediately (no manual prune)',
    packsLeft === 1 && sA.verify().ok, `packs left=${packsLeft}, verify=${sA.verify().ok}`);
}

// ── 18. add() rejects an empty primary key LOUDLY at the producer (not a deferred codec throw) ──
{
  const s = new ChainStore(memIO());
  let threw = '';
  try { s.add(pack('e1', [['', '1', 'h0'], ['src/b.ts', '2', 'h1']])); } catch (e) { threw = e.message; }
  ok('EMPTY-KEY', 'add() rejects an empty primary key with a clear producer error (not a deferred computeDiff throw)',
    /empty primary key/.test(threw), `threw="${threw.slice(0, 60)}"`);
}

// ── 19. add() rejects a duplicate-PK baseline master BEFORE persisting it (atomic + loud) ──
{
  const ioD = memIO(); const s = new ChainStore(ioD);
  let threw = '';
  try { s.add(pack('d1', [['src/a.ts', '1', 'h0'], ['src/a.ts', '2', 'h1']])); } catch (e) { threw = e.message; }
  ok('DUP-KEY-MASTER', 'add() rejects a duplicate-PK master loudly and writes nothing (atomic)',
    /duplicate primary key/.test(threw) && ioD.list().length === 0, `threw="${threw.slice(0, 48)}", files=${ioD.list().length}`);
}

// ── 20. verify() cross-checks each pack's self-declared header.kind vs its manifest position ──
{
  const ioK = memIO(); const s = new ChainStore(ioK);
  s.add(pack('r1', base));
  s.add(pack('r2', base.map((r, i) => (i === 0 ? [r[0], '7', r[2]] : r))));   // -> 2.diff.pack
  const diffDec = decode(ioK.read('2.diff.pack'));
  ioK.write(MANIFEST, buildManifest([{ seq: 2, kind: 'master', file: '2.diff.pack', sha: diffDec.trailer.sha256, parent: null, rows: diffDec.trailer.rows }]));
  const v = s.verify();
  ok('VERIFY-KIND', 'verify() rejects a diff pack smuggled into the master-root slot (header.kind cross-check)',
    !v.ok && v.errors.some((e) => /kind=diff, expected master/.test(e)), `ok=${v.ok}`);
}

// ── 21. verify() catches a link swapped to a DIFFERENT valid pack (parent ok, sha mismatch) ──
{
  const ioS = memIO(); const s = new ChainStore(ioS);
  s.add(pack('r1', base));
  s.add(pack('r2', base.map((r, i) => (i === 0 ? [r[0], '7', r[2]] : r))));   // 2.diff.pack (sha recorded)
  const io2 = memIO(); const s2 = new ChainStore(io2);
  s2.add(pack('r1', base));                                                    // identical master -> identical sha
  s2.add(pack('r2b', base.map((r, i) => (i === 5 ? [r[0], '9', r[2]] : r))));  // a DIFFERENT valid diff, same parent
  ioS.write('2.diff.pack', io2.read('2.diff.pack'));                           // swap bytes; manifest keeps the old sha
  const v = s.verify();
  ok('VERIFY-SHA', 'verify() catches a link swapped to a different valid pack (correct parent, wrong sha)',
    !v.ok && v.errors.some((e) => /sha/.test(e)), `ok=${v.ok}`);
}

// ── 22. verify() catches a manifest-ONLY parent tamper (pack bytes/header/sha untouched) ──
{
  const ioP = memIO(); const s = new ChainStore(ioP);
  s.add(pack('r1', base));
  s.add(pack('r2', base.map((r, i) => (i === 0 ? [r[0], '7', r[2]] : r))));
  const links = parseManifest(ioP.read(MANIFEST));
  links[1].parent = 'deadbeefdead';                                            // tamper only the manifest parent column
  ioP.write(MANIFEST, buildManifest(links));
  const v = s.verify();
  ok('VERIFY-PARENT', 'verify() catches a manifest-only parent tamper (the diff pack itself is untouched)',
    !v.ok && v.errors.some((e) => /parent/.test(e)), `ok=${v.ok}`);
}

// ── 23. reconstructPack() applies diffs — equals head(), NOT the stale master ──
{
  const ioR = memIO(); const s = new ChainStore(ioR);
  s.add(pack('r1', base));
  s.add(pack('r2', base.map((r, i) => (i === 0 ? [r[0], '7', r[2]] : r))));    // a diff
  const rb = decode(s.reconstructPack());
  ok('RECONSTRUCT-DIFF', 'reconstructPack() applies the chain — decodes to exactly head(), not the stale baseline master',
    rowKey(rb.tables.get('files').rows) === rowKey(headRows(s)), `recon=${rb.tables.get('files').rows.length} rows`);
}

L.finish(({ failed, total }) => failed === 0
  ? `${total} chain-producer checks pass — maintains a chain, reconstructs head (with diffs) exactly, validates keys, coalesces at the break-even, re-masters on schema change, detects tampering (sha/parent/kind), prunes (manual + auto), rejects path traversal.`
  : `${failed}/${total} chain-producer checks FAILED.`);
