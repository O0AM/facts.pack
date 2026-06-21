/**
 * symbolchain.mjs — the moniker→chain INTEGRATION (tools/chain/symbols.mjs).
 *
 * addSymbols() is the seam that makes the lite-safety rule un-forgettable: it always
 * passes forceMaster when the moniker assignment is not chain-safe, so a fragile key
 * forces a re-index instead of a probabilistic delta. This suite proves that, plus the
 * `; caps moniker:<mode>` self-declaration and the position-free move-is-a-no-op property
 * through the integration.
 */
import { decode } from './factspack.bundle.mjs';
import { ChainStore } from '../tools/chain/store.mjs';
import { addSymbols, symbolsToPack } from '../tools/chain/symbols.mjs';
import { ledger } from './_report.mjs';
import { memIO, makeOk } from './_util.mjs';

const L = ledger({ OK: '🔗', ECON: '📉', BROKEN: '❌' }, ['BROKEN']);
const ok = makeOk(L);

const syms = (lineBase) => [
  { file: 'src/auth.ts', container: 'AuthService', name: 'login', kind: 'method', arity: 2, start: lineBase + 10 },
  { file: 'src/auth.ts', container: 'AuthService', name: 'logout', kind: 'method', arity: 0, start: lineBase + 20 },
  { file: 'src/db.ts', name: 'connect', kind: 'function', arity: 1, start: lineBase + 8 },
  { file: 'src/db.ts', name: 'query', kind: 'function', arity: 2, start: lineBase + 14 },
];

// ── 1. symbolsToPack emits a moniker-keyed pack that DECLARES its mode (D8: ; caps byte-level) ──
{
  const { bytes, assigned } = symbolsToPack(syms(0), { mode: 'lite' });
  const dec = decode(bytes);
  ok('CAPS-LITE', 'symbolsToPack emits a byte-level "; caps moniker:lite" line and a moniker-keyed symbols table',
    bytes.includes('; caps moniker:lite') && dec.tables.get('symbols').rows.length === 4 && dec.tables.get('symbols').rows[0][0].includes('#'),
    `capToken=${assigned.capToken}, rows=${dec.tables.get('symbols').rows.length}`);
}

// ── 2. addSymbols writes a master and head() reconstructs the moniker-keyed rows ──
{
  const s = new ChainStore(memIO());
  const r = addSymbols(s, syms(0), { mode: 'lite' });
  ok('ADD', 'addSymbols writes a master; head() reconstructs the symbols; verify() passes',
    r.action === 'master' && s.head().get('symbols').rows.length === 4 && s.verify().ok, `action=${r.action}`);
}

// ── 3. a pure code MOVE is a nochange diff through the integration (position-free monikers) ──
{
  const s = new ChainStore(memIO());
  addSymbols(s, syms(0), { mode: 'lite' });
  const r = addSymbols(s, syms(500), { mode: 'lite' });
  ok('MOVE', 'shifting every symbol line is a nochange diff through addSymbols (monikers are position-free)',
    r.action === 'nochange', `action=${r.action}`);
}

// ── 4. SAFETY: a fragile lite assignment forces a re-index at the seam — never a probabilistic delta (A2) ──
{
  const frag = () => [{ file: 'a.ts', name: 'tmp', kind: 'const', start: 1 }, { file: 'a.ts', name: 'tmp', kind: 'const', start: 2 }];
  const s = new ChainStore(memIO());
  const r1 = addSymbols(s, frag(), { mode: 'lite' });
  const r2 = addSymbols(s, frag(), { mode: 'lite' });
  ok('SAFE-ENFORCED', 'a fragile lite assignment (confident:false) forces a re-index master — addSymbols never keys a probabilistic +/x delta',
    r1.confident === false && r2.action === 'master' && r2.reason === 'reindex', `confident=${r1.confident}, 2nd=${r2.action}/${r2.reason}`);
}

// ── 5. a confident (collision-free) change emits a small diff — the guard does NOT
//       over-trigger a re-index on a good assignment (the diff happens BECAUSE confident) ──
{
  const s = new ChainStore(memIO());
  addSymbols(s, syms(0), { mode: 'lite' });
  const r = addSymbols(s, syms(0).concat([{ file: 'src/api.ts', name: 'handler', kind: 'function', arity: 1, start: 5 }]), { mode: 'lite' });
  ok('REALCHANGE', 'a confident (no-collision) change emits a diff, not a re-index — the safety guard does not over-trigger',
    r.action === 'diff' && r.confident === true, `action=${r.action}, confident=${r.confident}, ${r.bytes} B`);
}

// ── 6. strict mode declares moniker:strict and is authoritative + chain-safe ──
{
  const { bytes, assigned } = symbolsToPack([{ file: 'a.ts', name: 'f', kind: 'function', arity: 0, moniker: 'a.ts#f().' }], { mode: 'strict' });
  ok('STRICT', 'strict mode emits "; caps moniker:strict" and is authoritative', bytes.includes('; caps moniker:strict') && assigned.authoritative && assigned.confident, `capToken=${assigned.capToken}`);
}

// ── 7. STRICT collision regression: two overloads sharing an input SCIP moniker must get
//       UNIQUE keys — not a duplicate primary key that wedges the chain (adversarial HIGH) ──
{
  const overloads = [
    { file: 'src/math.ts', name: 'clamp', kind: 'function', arity: 1, signature: '(x: number)', moniker: 'src/math.ts#clamp().' },
    { file: 'src/math.ts', name: 'clamp', kind: 'function', arity: 1, signature: '(x: bigint)', moniker: 'src/math.ts#clamp().' },
  ];
  const { assigned } = symbolsToPack(overloads, { mode: 'strict' });
  const uniq = new Set(assigned.rows.map((r) => r.moniker)).size;
  const s = new ChainStore(memIO());
  const r1 = addSymbols(s, overloads, { mode: 'strict' });
  let secondThrew = false;
  try { addSymbols(s, overloads, { mode: 'strict' }); } catch { secondThrew = true; }
  ok('STRICT-COLLIDE', 'two strict overloads sharing an input moniker get UNIQUE keys — no duplicate-PK master, no computeDiff throw on the next add',
    uniq === 2 && r1.action === 'master' && !secondThrew, `uniqueKeys=${uniq}, 1st=${r1.action}, 2nd-threw=${secondThrew}`);
}

// ── 8. column-name collision is a silently-malformed schema (the dedupe class hardened in
//       c2f0211) — symbolsToPack must reject keyName overlapping a data column (adversarial) ──
{
  let threw = false;
  try { symbolsToPack([{ file: 'a.ts', name: 'f', kind: 'function', arity: 0 }], { mode: 'lite', keyName: 'kind', cols: ['kind', 'name'] }); } catch { threw = true; }
  ok('KEYNAME-GUARD', 'symbolsToPack throws when keyName collides with a data column (no duplicate column names ship)', threw, `threw=${threw}`);
}

L.finish(({ failed, total }) => failed === 0
  ? `${total} symbol-chain checks pass — addSymbols self-declares its moniker mode, makes a code move a no-op, gives colliding overloads unique keys, and FORCES a re-index for any fragile (probabilistic) key.`
  : `${failed}/${total} symbol-chain checks FAILED.`);
