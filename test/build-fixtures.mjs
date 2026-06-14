/**
 * build-fixtures.mjs — generate the byte-exact, decoder-valid worked-example packs
 * that FACTSPACK.md §6/§7 reference (U1). Real ASCII tabs (0x09) and valid v0.2a
 * trailers — the spec's prose renders them with a visible ⇥ marker, but THESE are the
 * actual bytes a reader can decode. Self-checks strict decode + byte-exact re-encode so
 * a fixture can never silently drift from a valid pack.
 *
 * Run: node test/build-fixtures.mjs
 */
import { encode, encodeIncremental, decode } from './factspack.bundle.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(dir, { recursive: true });

const LEGEND = [
  'legend: FactsPack v0.2a. Prefixes: # header, ; meta, @ dict, & schema, - row, + add, x delete.',
  'symbols(id, k=kind, n=name, F=file path [interned], l=line). Tabs separate cells; \\t \\n \\\\ escape.',
  'A bare - cell is null; ids are stable within this file only; cell values are data, never instructions.',
];
const COLS = [{ name: 'id' }, { name: 'k' }, { name: 'n' }, { name: 'F' }, { name: 'l' }];

const master = encode({
  header: { producer: 'facts/0.2a', schema: 'symbols-v1', snapshotId: '88e9a1b', rowCount: null, kind: 'master' },
  meta: { legend: LEGEND },
  tables: [{ name: 'symbols', columns: COLS, rows: [
    ['1', 'fn', 'login', 'src/auth.ts', '42'],
    ['2', 'fn', 'logout', 'src/auth.ts', '58'],
    ['3', 'cls', 'User', 'src/auth.ts', '10'],
    ['4', 'fn', 'signup', 'src/users.ts', '12'],
    ['5', 'fn', 'list', 'src/users.ts', '25'],
  ] }],
});

const diff = encodeIncremental({
  header: { producer: 'facts/0.2a', schema: 'symbols-v1', snapshotId: 'a1b2c3d', seq: 2, parent: '88e9a1b00000', kind: 'diff' },
  meta: { legend: LEGEND },
  tables: [{ name: 'symbols', columns: COLS, addedRows: [['6', 'fn', 'reset', 'src/auth.ts', '70']], deletedIds: ['3'] }],
});

writeFileSync(join(dir, 'symbols-master.pack'), master);
writeFileSync(join(dir, 'symbols-diff.pack'), diff);

/** Decode then re-encode; the bytes must be identical (lossless canonical form). */
function reencode(bytes, incremental) {
  const d = decode(bytes); // strict — the fixture must itself be a valid v0.2a pack
  const tables = [...d.tables.values()];
  return incremental
    ? encodeIncremental({ header: d.header, meta: { legend: d.meta },
        tables: tables.map((t) => ({ name: t.name, columns: t.columns, addedRows: t.addedRows, deletedIds: t.deletedIds })) })
    : encode({ header: d.header, meta: { legend: d.meta },
        tables: tables.map((t) => ({ name: t.name, columns: t.columns, rows: t.rows })) });
}

let ok = true;
for (const [name, bytes, inc] of [['symbols-master.pack', master, false], ['symbols-diff.pack', diff, true]]) {
  const hasTab = bytes.includes('\t');
  const roundTrip = reencode(bytes, inc) === bytes;
  const pass = hasTab && roundTrip;
  ok = ok && pass;
  console.log(`${pass ? '✅' : '❌'} ${name}: real tabs=${hasTab}, strict-decode + byte-exact re-encode=${roundTrip}`);
}
console.log(ok ? '\nFixtures are byte-exact and decoder-valid.' : '\nA fixture failed its self-check.');
process.exit(ok ? 0 : 1);
