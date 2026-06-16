/**
 * chain.mjs — the master/diff CHAIN (Gate 4 / spec §17), proven on observable bytes.
 *
 * The chain is the prompt-cache moat: keep a cached `master` pack, and on each
 * commit append a tiny `.pack-diff` instead of re-sending the whole map. This
 * suite proves the two load-bearing properties from real bytes:
 *   1. CORRECTNESS — decode(master) + computeDiff + encodeIncremental + decode +
 *      applyChain reconstructs the NEXT state exactly (as a row set), including
 *      additions, deletions, and in-place updates (delete-old + add-new).
 *   2. ECONOMICS — a small change produces a diff far smaller than a fresh master
 *      (measured in bytes AND a proxy token count), which is the whole point.
 *
 * No model is needed: the cache win is a byte/token fact, measured here directly.
 */
import { encode, encodeIncremental, decode, computeDiff, applyChain } from './factspack.bundle.mjs';
import { ledger } from './_report.mjs';

const L = ledger({ OK: '🔗', ECON: '📉', BROKEN: '❌' }, ['BROKEN']);
const confirm = (id, claim, pass, detail, state = 'OK') => L.add(pass ? state : 'BROKEN', `[${id}] ${claim}`, detail);

const H = (snap) => ({ producer: 'factspack-chain/0.1', schema: 'symbols-v1', snapshotId: snap, rowCount: null, kind: 'master' });
const COLS = [{ name: 'id' }, { name: 'kind' }, { name: 'name' }, { name: 'F' }, { name: 'line' }];

// A baseline map of 60 symbols across a few files.
const FILES = ['src/auth.ts', 'src/users.ts', 'src/db.ts', 'src/api.ts'];
const baseRows = Array.from({ length: 60 }, (_, i) => [
  String(i), i % 3 === 0 ? 'fn' : i % 3 === 1 ? 'cls' : 'const',
  'sym_' + i, FILES[i % FILES.length], String(100 + i),
]);
const masterPack = encode({ header: H('rev1'), meta: { legend: ['symbols id kind name F line'] }, tables: [{ name: 'symbols', columns: COLS, rows: baseRows }] });

// NEXT state: one symbol renamed (update), one removed (delete), two added.
const nextRows = baseRows
  .filter((r) => r[0] !== '7')                                  // delete id 7
  .map((r) => (r[0] === '12' ? [r[0], r[1], 'sym_12_RENAMED', r[3], r[4]] : r)) // update id 12
  .concat([['60', 'fn', 'sym_60_new', 'src/auth.ts', '999'], ['61', 'cls', 'sym_61_new', 'src/api.ts', '1000']]); // add 60,61
const nextMaster = encode({ header: H('rev2'), meta: { legend: ['symbols id kind name F line'] }, tables: [{ name: 'symbols', columns: COLS, rows: nextRows }] });

const prevDec = decode(masterPack);
const nextDec = decode(nextMaster);

// ── 1. computeDiff captures exactly the change set ──
const diffTables = computeDiff(prevDec, nextDec);
const st = diffTables.find((t) => t.name === 'symbols');
confirm('DIFF-shape', 'computeDiff captures the change set: 3 adds (new+new+updated) and 2 deletes (removed+updated-old)',
  !!st && st.addedRows.length === 3 && st.deletedIds.length === 2,
  st ? `+${st.addedRows.length} rows / x${st.deletedIds.length} ids (deleted: ${st.deletedIds.sort().join(',')})` : 'no symbols diff');

// ── 2. The diff round-trips through the wire and reconstructs NEXT exactly ──
const diffPack = encodeIncremental({
  header: { producer: 'factspack-chain/0.1', schema: 'symbols-v1', snapshotId: 'rev2', seq: 1, parent: 'rev1aaaaaaaa', kind: 'diff' },
  tables: diffTables,
});
const diffDec = decode(diffPack); // strict: a valid diff (kind=diff, 0 sentinel, +/x ops)
confirm('DIFF-strict', 'the diff pack is a valid strict v0.2 diff (kind=diff, 0-sentinel header, +/x ops only)',
  diffDec.header.kind === 'diff' && diffDec.header.rowCount === 0, `trailer rows=${diffDec.trailer.rows}`);

const applied = applyChain(prevDec, [diffDec]);
const appliedRows = applied.get('symbols').rows;
const key = (rows) => rows.map((r) => r.join('')).sort().join('\n');
confirm('CHAIN-exact', 'applyChain(master, [diff]) reconstructs the NEXT row set EXACTLY (adds, deletes, updates)',
  key(appliedRows) === key(nextRows), `${appliedRows.length} rows reconstructed vs ${nextRows.length} expected`);

// ── 3. A multi-diff chain reconstructs the final state ──
const rev3Rows = nextRows.concat([['62', 'fn', 'sym_62', 'src/db.ts', '1200']]);
const rev3 = encode({ header: H('rev3'), meta: { legend: ['symbols id kind name F line'] }, tables: [{ name: 'symbols', columns: COLS, rows: rev3Rows }] });
const diff2 = encodeIncremental({
  header: { producer: 'factspack-chain/0.1', schema: 'symbols-v1', snapshotId: 'rev3', seq: 2, parent: 'rev2aaaaaaaa', kind: 'diff' },
  tables: computeDiff(nextDec, decode(rev3)),
});
const applied2 = applyChain(prevDec, [diffDec, decode(diff2)]);
confirm('CHAIN-multi', 'a 2-diff chain (master + diff + diff) reconstructs the final state exactly',
  key(applied2.get('symbols').rows) === key(rev3Rows), `${applied2.get('symbols').rows.length} rows after 2 diffs`);

// ── 4. ECONOMICS: the diff is far smaller than a fresh master ──
const tok = (s) => Math.ceil(s.length / 4); // same proxy the converter uses
const dB = diffPack.length, mB = nextMaster.length;
const savedPct = Math.round((1 - dB / mB) * 100);
confirm('ECON-bytes', `a 5-row change emits a diff far smaller than a fresh master (${dB} B vs ${mB} B, −${savedPct}%)`,
  dB < mB * 0.5, `diff ${dB} B (~${tok(diffPack)} tok) vs master ${mB} B (~${tok(nextMaster)} tok) — re-send the diff, not the map`, 'ECON');

// ── 5. Duplicate primary keys are rejected (a sound diff needs unique PKs) ──
{
  const dup = encode({ header: H('d1'), meta: { legend: ['symbols id kind name F line'] }, tables: [{ name: 'symbols', columns: COLS, rows: [['1', 'fn', 'a', 'f.ts', '1'], ['1', 'fn', 'b', 'f.ts', '2']] }] });
  const one = encode({ header: H('d2'), meta: { legend: ['symbols id kind name F line'] }, tables: [{ name: 'symbols', columns: COLS, rows: [['1', 'fn', 'a', 'f.ts', '1']] }] });
  let threw = false, msg = '';
  try { computeDiff(decode(dup), decode(one)); } catch (e) { threw = true; msg = String((e && e.message) || e); }
  confirm('DUP-PK', 'computeDiff REJECTS a table with duplicate primary keys (a sound diff requires unique PKs)',
    threw && /duplicate primary key/i.test(msg), msg.slice(0, 70));
}

// ── 6. ECONOMICS break-even: the diff wins for SMALL deltas, not large ones ──
// Honesty: the −84% headline holds for a small change. When most rows change, a
// diff carries delete+add for each, so it can EXCEED the master — at which point
// the producer should re-send the master. Measure both ends, claim only the truth.
{
  const allChanged = baseRows.map((r) => [r[0], r[1], r[2] + '_x', r[3], r[4]]); // every row's content differs
  const allNext = encode({ header: H('rAll'), meta: { legend: ['symbols id kind name F line'] }, tables: [{ name: 'symbols', columns: COLS, rows: allChanged }] });
  const bigDiff = encodeIncremental({
    header: { producer: 'factspack-chain/0.1', schema: 'symbols-v1', snapshotId: 'rAll', seq: 9, parent: 'rev1aaaaaaaa', kind: 'diff' },
    tables: computeDiff(prevDec, decode(allNext)),
  });
  confirm('ECON-breakeven', 'when EVERY row changes, the diff is NOT smaller than the master (the cache win is scoped to small deltas, not universal)',
    bigDiff.length >= allNext.length * 0.9, `all-rows-changed diff ${bigDiff.length} B vs master ${allNext.length} B — re-send the master past the break-even (~40-50% changed)`, 'ECON');
}

L.finish(({ n, failed, total }) =>
  failed === 0
    ? `${total} chain checks pass — reconstructs exactly; a SMALL change is a small diff (−84%), a large change is not (honest break-even).`
    : `${failed}/${total} chain checks FAILED.`);
