/**
 * moniker.mjs — SCIP-style position-free monikers (tools/moniker), proven on bytes.
 *
 * This is the identity layer the diff chain needs to work on SYMBOLS (not just file
 * paths). The headline property, measured directly: a pure code MOVE — shift every
 * symbol's line — is an EMPTY moniker diff, where the old `name@line` ids re-index the
 * whole table. Plus the safety rules: overloads disambiguate, and a lite collision that
 * can only be told apart by position is flagged so the chain re-indexes instead of
 * keying a destructive delta on a probabilistic match.
 */
import { decode, computeDiff } from './factspack.bundle.mjs';
import { makePack } from './_pack.mjs';
import { descriptor, assignMonikers, chainSafe, strictMoniker } from '../tools/moniker/moniker.mjs';
import { ChainStore } from '../tools/chain/store.mjs';
import { ledger } from './_report.mjs';
import { memIO, makeOk } from './_util.mjs';

const L = ledger({ OK: '🔗', ECON: '📉', BROKEN: '❌' }, ['BROKEN']);
const ok = makeOk(L);

// a tiny "codebase": symbols with structural metadata + a line position.
const syms = (lineBase) => [
  { file: 'src/auth.ts', container: 'AuthService', name: 'login', kind: 'method', arity: 2, line: lineBase + 10 },
  { file: 'src/auth.ts', container: 'AuthService', name: 'logout', kind: 'method', arity: 0, line: lineBase + 20 },
  { file: 'src/auth.ts', name: 'AuthService', kind: 'class', line: lineBase + 5 },
  { file: 'src/db.ts', name: 'connect', kind: 'function', arity: 1, line: lineBase + 8 },
  { file: 'src/db.ts', name: 'query', kind: 'function', arity: 2, line: lineBase + 14 },
  { file: 'src/api.ts', name: 'handler', kind: 'function', arity: 1, line: lineBase + 3 },
];
const monRows = (lineBase) => assignMonikers(syms(lineBase), { mode: 'lite' }).rows.map((r) => [r.moniker, r.kind, r.name]);
const lineRows = (lineBase) => syms(lineBase).map((s) => [`${s.file}#${s.name}@${s.line}`, s.kind, s.name]); // the OLD churny id

const COLS = [{ name: 'sym' }, { name: 'kind' }, { name: 'name' }];
const P = (snap, rows) => makePack(snap, { producer: 'factstack/scip', schema: 'symbols-v1', table: 'symbols', columns: COLS, legend: 'symbols sym kind name', rows });

// ── 1. a moniker is position-free; a line-number id is not ──
ok('STABLE', 'a symbol moniker is identical when its line number moves; a line-id changes',
  descriptor(syms(0)[0]) === descriptor(syms(500)[0]) && lineRows(0)[0][0] !== lineRows(500)[0][0],
  `moniker=${descriptor(syms(0)[0])}`);

// ── 2. a pure code MOVE churns every line-id row but is an EMPTY moniker diff ──
const monDiff = computeDiff(decode(P('a', monRows(0))), decode(P('b', monRows(500))));
const lineChurn = computeDiff(decode(P('a', lineRows(0))), decode(P('b', lineRows(500)))).find((t) => t.name === 'symbols');
ok('MOVE-NOCHURN', 'shifting every symbol down 500 lines is an EMPTY moniker diff, but re-indexes every line-id row',
  monDiff.length === 0 && lineChurn && lineChurn.addedRows.length === 6 && lineChurn.deletedIds.length === 6,
  `moniker diff tables=${monDiff.length}; line-id diff = +${lineChurn ? lineChurn.addedRows.length : 0}/x${lineChurn ? lineChurn.deletedIds.length : 0}`, 'ECON');

// ── 3. through the chain: a move is 'nochange'; a real change is a small diff ──
const io = memIO(); const store = new ChainStore(io);
store.add(P('v1', monRows(0)));
ok('CHAIN-MOVE', 'the chain producer reports a pure code move as nochange (no diff written)',
  store.add(P('v2', monRows(500))).action === 'nochange', 'move -> nochange');
const syms2 = syms(500).concat([{ file: 'src/api.ts', name: 'middleware', kind: 'function', arity: 3, line: 600 }]);
const rAdd = store.add(P('v3', assignMonikers(syms2, { mode: 'lite' }).rows.map((r) => [r.moniker, r.kind, r.name])));
ok('CHAIN-REALCHANGE', 'adding one symbol emits a small diff (not a re-index)', rAdd.action === 'diff', `action=${rAdd.action}, ${rAdd.bytes} B`);

// ── 4. overloads disambiguate by signature — no silent merge ──
const ov = assignMonikers([
  { file: 'a.ts', name: 'add', kind: 'function', arity: 2, signature: '(a:int,b:int)' },
  { file: 'a.ts', name: 'add', kind: 'function', arity: 2, signature: '(a:str,b:str)' },
], { mode: 'lite' });
ok('OVERLOAD', 'two same-arity overloads get DISTINCT monikers via the signature disambiguator',
  new Set(ov.rows.map((r) => r.moniker)).size === 2 && ov.confident, ov.rows.map((r) => r.moniker).join('  |  '));

// ── 5. a fragile lite collision is flagged not-confident → re-index, never mis-key ──
const frag = assignMonikers([{ file: 'a.ts', name: 'tmp', kind: 'const' }, { file: 'a.ts', name: 'tmp', kind: 'const' }], { mode: 'lite' });
ok('FRAGILE-REINDEX', 'an unresolvable lite collision is confident:false and chainSafe()=false (re-index, do not key a destructive delta)',
  frag.confident === false && chainSafe(frag) === false && new Set(frag.rows.map((r) => r.moniker)).size === 2,
  `confident=${frag.confident}, chainSafe=${chainSafe(frag)}`);

// ── 6. strict is authoritative; both modes self-declare via ; caps ──
const strictA = assignMonikers([{ file: 'a.ts', name: 'f', kind: 'function', arity: 0, moniker: 'a.ts#f().' }], { mode: 'strict' });
ok('AUTHORITY', 'strict mode is authoritative + declares moniker:strict; lite declares moniker:lite',
  strictA.authoritative === true && chainSafe(strictA) && strictA.capToken === 'moniker:strict' && assignMonikers([], { mode: 'lite' }).capToken === 'moniker:lite',
  `strict cap=${strictA.capToken}`);

// ── 7. a rename changes only that moniker → exactly one delete + one add ──
const renamed = syms(500).map((s) => (s.name === 'login' ? { ...s, name: 'signIn' } : s));
const rdiff = computeDiff(decode(P('a', monRows(500))), decode(P('b', assignMonikers(renamed, { mode: 'lite' }).rows.map((r) => [r.moniker, r.kind, r.name])))).find((t) => t.name === 'symbols');
ok('RENAME', 'a rename changes one moniker → exactly one delete (old) + one add (new), nothing else churns',
  rdiff && rdiff.addedRows.length === 1 && rdiff.deletedIds.length === 1 && rdiff.addedRows[0].join('').includes('signIn'),
  `+${rdiff ? rdiff.addedRows.length : 0}/x${rdiff ? rdiff.deletedIds.length : 0}`);

// ── 8. crafted names with descriptor delimiters never alias to one moniker (adversarial B1) ──
{
  const tricky = assignMonikers([
    { file: 'a.ts', name: 'p', kind: 'var', signature: 'q.<r' },
    { file: 'a.ts', name: 'p', kind: 'var', signature: 'ZZZ' },
    { file: 'a.ts', name: 'p.<q', kind: 'var', signature: 'r' },
    { file: 'a.ts', name: 'p.<q', kind: 'var', signature: 'WWW' },
  ], { mode: 'lite' });
  const ids = tricky.rows.map((r) => r.moniker);
  ok('COLLISION-SAFE', 'crafted names containing descriptor delimiters never alias to one moniker (encoded components)',
    new Set(ids).size === ids.length, `${new Set(ids).size}/${ids.length} unique`);
}

// ── 9. the container/name boundary is unambiguous: A::"B.x" != "A.B"::x (adversarial B2) ──
{
  const m1 = descriptor({ file: 'f', container: 'A', name: 'B.x', kind: 'field' });
  const m2 = descriptor({ file: 'f', container: 'A.B', name: 'x', kind: 'field' });
  const C = [{ name: 'm' }, { name: 'k' }];
  const PP = (snap, rows) => makePack(snap, { producer: 'p', schema: 's', table: 't', columns: C, legend: 't m k', rows });
  const pad = Array.from({ length: 20 }, (_, i) => [`f#pad${i}.`, 'field']); // keep the table big so one swap is a small diff
  const io9 = memIO(); const s9 = new ChainStore(io9);
  s9.add(PP('v1', [[m1, 'field'], ...pad]));
  const r9 = s9.add(PP('v2', [[m2, 'field'], ...pad]));
  ok('BOUNDARY', 'A::"B.x" and "A.B"::x get DISTINCT monikers; swapping them is a real diff, not a silent nochange',
    m1 !== m2 && r9.action === 'diff', `m1=${m1} | m2=${m2} | action=${r9.action}`);
}

// ── 10. the chain ENFORCES re-index for a not-chain-safe (fragile lite) assignment (adversarial B3) ──
{
  const C = [{ name: 'm' }, { name: 'v' }];
  const PP = (snap, rows) => makePack(snap, { producer: 'p', schema: 's', table: 't', columns: C, legend: 't m v', rows });
  const build = (vals) => {
    const a = assignMonikers([{ file: 'a.ts', name: 'tmp', kind: 'const' }, { file: 'a.ts', name: 'tmp', kind: 'const' }], { mode: 'lite' });
    return { bytes: PP('s', a.rows.map((r, i) => [r.moniker, vals[i]])), safe: chainSafe(a) };
  };
  const io10 = memIO(); const s10 = new ChainStore(io10);
  const v1 = build(['60', '300']); s10.add(v1.bytes, { forceMaster: !v1.safe });
  const v2 = build(['90', '300']); const r10 = s10.add(v2.bytes, { forceMaster: !v2.safe });
  ok('LITE-ENFORCED', 'a fragile lite assignment (chainSafe=false) forces a re-index master, never a probabilistic-keyed diff',
    v1.safe === false && r10.action === 'master' && r10.reason === 'reindex', `chainSafe=${v1.safe}, v2 -> ${r10.action}/${r10.reason}`);
}

// ── 11. strictMoniker rejects wire-unsafe descriptors ──
{
  const bad = ['', '-', 'a\tb', 'a\nb'];
  let rejected = 0, accepted = '';
  for (const d of bad) { try { strictMoniker(d); accepted = JSON.stringify(d); } catch { rejected++; } }
  ok('STRICT-VALIDATE', 'strictMoniker rejects empty / "-" / tab / newline descriptors (wire-unsafe authority)',
    rejected === bad.length, accepted ? `accepted ${accepted}` : 'all 4 rejected');
}

// ── 12. STRICT collision: distinct overloads sharing one input moniker must get UNIQUE
//        row keys — the row map must not let the raw input field clobber the resolved id ──
{
  const a = assignMonikers([
    { file: 'm.ts', name: 'f', kind: 'function', arity: 1, signature: '(a)', moniker: 'm.ts#f().' },
    { file: 'm.ts', name: 'f', kind: 'function', arity: 1, signature: '(b)', moniker: 'm.ts#f().' },
  ], { mode: 'strict' });
  const uniq = new Set(a.rows.map((r) => r.moniker)).size;
  ok('STRICT-COLLIDE', 'strict inputs sharing one moniker get unique row keys (disambiguation survives the row map, not clobbered by the raw field)',
    uniq === 2, `uniqueKeys=${uniq} of 2`);
}

// ── 13. the global-uniqueness BACKSTOP catches a CROSS-group collision the per-group loop
//        can't see (signature-disambiguating one group lands on another group's raw id) ──
{
  const a = assignMonikers([
    { file: 'a.ts', name: 'f', kind: 'function', arity: 1, signature: '(x)', moniker: 'M' },
    { file: 'a.ts', name: 'f', kind: 'function', arity: 1, signature: '(y)', moniker: 'M' },
    { file: 'a.ts', name: 'z', kind: 'function', arity: 0, moniker: 'M<%28x%29>' }, // == group 'M' disambiguates to
  ], { mode: 'strict' });
  const uniq = new Set(a.rows.map((r) => r.moniker)).size;
  ok('BACKSTOP', 'the global-uniqueness backstop forces a residual cross-group duplicate unique AND marks confident=false',
    uniq === 3 && a.confident === false, `uniqueKeys=${uniq}/3, confident=${a.confident}`);
}

L.finish(({ failed, total }) => failed === 0
  ? `${total} moniker checks pass — position-free ids make a code MOVE a no-op diff; encoded components prevent aliasing; colliding strict overloads keep unique keys; the backstop catches cross-group dups; fragile lite collisions force a re-index, never a mis-key.`
  : `${failed}/${total} moniker checks FAILED.`);
