/**
 * ioadapter.mjs — conformance for the chain's `io` ADAPTER seam (the contract documented
 * on ChainStore in tools/chain/store.mjs). The seam is real — two adapters satisfy it
 * (the in-memory memIO used by the test suites, the disk-backed nodeFsIO used by the CLI) —
 * so a third adapter (S3, SQLite, …) needs an executable contract to implement against.
 * `adapterConforms` IS that contract; here it gates both shipped adapters.
 */
import { ledger } from './_report.mjs';
import { memIO, makeOk } from './_util.mjs';
import { nodeFsIO } from '../tools/chain/node-io.mjs';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const L = ledger({ OK: '🔌', BROKEN: '❌' }, ['BROKEN']);
const ok = makeOk(L);

/** Run the io-seam contract against an adapter factory; tags each check with the label. */
function adapterConforms(make, label) {
  const io = make();
  const tag = (id) => `${id}·${label}`;

  // 1. read() of a missing name returns null — and MUST NOT throw (the store reads
  //    optimistically and treats null as "absent", a throw as fatal).
  let missing = 'unset', threw = false;
  try { missing = io.read('nope.pack'); } catch { threw = true; }
  ok(tag('READ-MISSING'), `${label}: read() of a missing file returns null, never throws`,
    missing === null && !threw, `value=${JSON.stringify(missing)}, threw=${threw}`);

  // 2. write→read round-trips the EXACT bytes — tabs, newlines, Unicode, trailing newline
  //    (a pack is tab-delimited with a trailing \n; any mangling corrupts the sealed trailer).
  const payload = '# h\tx\tmaster\n; meta ünïcode\n- a\tb\n; end rows=1 tables=1 sha256=0123456789ab\n';
  io.write('1.master.pack', payload);
  ok(tag('ROUNDTRIP'), `${label}: read(write(x)) === x byte-for-byte (tabs / newlines / Unicode preserved)`,
    io.read('1.master.pack') === payload, `len ${io.read('1.master.pack') ? io.read('1.master.pack').length : 'null'} vs ${payload.length}`);

  // 3. list() reports every written name (stable within the call)
  io.write('2.diff.pack', 'x');
  const names = io.list();
  ok(tag('LIST'), `${label}: list() reports every written file name`,
    names.includes('1.master.pack') && names.includes('2.diff.pack'), `list=${JSON.stringify(names)}`);

  // 4. a second write to the same name OVERWRITES (re-master rewrites the manifest in place)
  io.write('2.diff.pack', 'y');
  ok(tag('OVERWRITE'), `${label}: a second write(name, …) overwrites the first`,
    io.read('2.diff.pack') === 'y', `value=${io.read('2.diff.pack')}`);

  // 5. remove() deletes, and is idempotent on a missing name (prune may double-remove)
  io.remove('2.diff.pack');
  let rmThrew = false;
  try { io.remove('2.diff.pack'); } catch { rmThrew = true; }
  ok(tag('REMOVE'), `${label}: remove() deletes the file and is idempotent on an already-missing name`,
    io.read('2.diff.pack') === null && !rmThrew, `afterRead=${JSON.stringify(io.read('2.diff.pack'))}, idempotentThrew=${rmThrew}`);

  // 6. a removed name must NOT reappear in list() — prune() iterates list() to delete
  //    orphans, so a stale name would make it re-attempt remove on every run.
  ok(tag('LIST-AFTER-REMOVE'), `${label}: list() no longer reports a removed name (prune relies on this)`,
    !io.list().includes('2.diff.pack'), `list=${JSON.stringify(io.list())}`);
}

adapterConforms(memIO, 'memIO');
const dir = mkdtempSync(join(tmpdir(), 'fp-ioconf-'));
try { adapterConforms(() => nodeFsIO(dir), 'nodeFsIO'); } finally { rmSync(dir, { recursive: true, force: true }); }

// Disk-adapter-only: a DIRECTORY shadowing a pack name must read as ABSENT (null), not throw
// EISDIR (which would crash the integrity gate verify()), and must be excluded from list() so
// prune()/nextSeq() can't trip on it. memIO has no directory concept, so this is nodeFsIO-only.
{
  const d = mkdtempSync(join(tmpdir(), 'fp-iodir-'));
  try {
    const io = nodeFsIO(d);
    io.write('1.master.pack', 'real');
    mkdirSync(join(d, '9.diff.pack'));
    let val, threw = false;
    try { val = io.read('9.diff.pack'); } catch { threw = true; }
    ok('DIR-SHADOW·nodeFsIO', 'a directory shadowing a pack name reads as null (not EISDIR) and is excluded from list()',
      val === null && !threw && !io.list().includes('9.diff.pack') && io.list().includes('1.master.pack'),
      `read=${JSON.stringify(val)} threw=${threw} list=${JSON.stringify(io.list())}`);
  } finally { rmSync(d, { recursive: true, force: true }); }
}

L.finish(({ failed, total }) => failed === 0
  ? `${total} io-adapter conformance checks pass — both shipped adapters (in-memory + disk) honour the seam: null-on-missing (incl. a directory-shadowed name), exact UTF-8 round-trip, list visibility, overwrite, idempotent remove.`
  : `${failed}/${total} io-adapter conformance checks FAILED.`);
