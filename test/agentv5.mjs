/**
 * agentv5.mjs — the agent-v5 wire additions (Gate 3 + Gate 4), proven on bytes.
 *
 * Two are additive (old readers unaffected): the `corpus` header field, and the
 * self-describing `;` capability/datatype/graph-schema meta lines. One is the
 * breaking opt-in change: inline typed `&`-line tokens (`name:type`), which a
 * pack self-declares via a `; caps … typed` line and a pre-agent-v5 reader
 * folds into the column name (the documented break). Everything stays
 * strict-decodable, and v0.2 packs are unaffected.
 */
import { encode, decode, decodeLegacy } from './factspack.bundle.mjs';
import { ledger } from './_report.mjs';

const L = ledger({ V5: '🧬', LEGACY: '🕰️', BROKEN: '❌' }, ['BROKEN']);
const confirm = (id, claim, pass, detail, state = 'V5') => L.add(pass ? state : 'BROKEN', `[${id}] ${claim}`, detail);

/* ── corpus header field (#agent-v5, additive — field 9) ── */
{
  const pack = encode({
    header: { producer: 'a/1', schema: 'agent-v5', snapshotId: 'x', rowCount: 1, kind: 'master', corpus: 'monorepo/web@abc123' },
    tables: [{ name: 't', columns: [{ name: 'id' }], rows: [['1']] }],
  });
  confirm('CORPUS', 'header field 9 `corpus` round-trips (repo-scoped ids for multi-repo packs)',
    decode(pack).header.corpus === 'monorepo/web@abc123', JSON.stringify(pack.split('\n')[0]));
  // additive: a pack without corpus decodes with corpus undefined.
  const plain = encode({ header: { producer: 'a/1', schema: 's', snapshotId: 'x', rowCount: 1, kind: 'master' }, tables: [{ name: 't', columns: [{ name: 'id' }], rows: [['1']] }] });
  confirm('CORPUS-additive', 'a pack WITHOUT corpus still decodes (additive, not breaking)',
    decode(plain).header.corpus === undefined, 'corpus undefined when absent');
  // The reserved '-' absent-placeholder must be rejected as a real value (else it
  // would silently decode back as absent — an encode/decode asymmetry).
  let sentinelThrew = false;
  try { encode({ header: { producer: 'a/1', schema: 's', snapshotId: 'x', rowCount: 1, kind: 'master', corpus: '-' }, tables: [{ name: 't', columns: [{ name: 'id' }], rows: [['1']] }] }); }
  catch { sentinelThrew = true; }
  confirm('CORPUS-sentinel', "corpus='-' (the reserved absent placeholder) is REJECTED by the encoder (no round-trip hole)",
    sentinelThrew, "encode rejects corpus='-'");
}

/* ── typed `&`-line tokens (breaking, opt-in, self-declared) ── */
{
  const pack = encode({
    header: { producer: 'a/1', schema: 'agent-v5', snapshotId: 'x', rowCount: 2, kind: 'master' },
    meta: { legend: ['caps typed chain corpus', 'symbols id kind loc', 'types symbols id=int kind=str loc=int', 'gschema imports=edge(File-IMPORTS->File)'] },
    tables: [{ name: 'symbols', columns: [{ name: 'id', type: 'int' }, { name: 'kind', type: 'str' }, { name: 'loc', type: 'int' }], rows: [['1', 'fn', '42'], ['2', 'cls', '88']] }],
  });
  const schemaLine = pack.split('\n').find((l) => l.startsWith('& '));
  confirm('TYPED-emit', 'the encoder emits inline `name:type` tokens on the & schema line',
    schemaLine === '& symbols\tid:int\tkind:str\tloc:int', JSON.stringify(schemaLine));

  // Self-describing: the `; caps … typed` line auto-enables type parsing.
  const cols = decode(pack).tables.get('symbols').columns;
  confirm('TYPED-selfdescribe', 'a `; caps … typed` line self-enables type parsing (no out-of-band option needed)',
    cols[0].type === 'int' && cols[1].type === 'str' && cols[2].type === 'int',
    cols.map((c) => `${c.name}:${c.type ?? '?'}`).join(' '));

  // Values still round-trip and the pack strict-decodes.
  confirm('TYPED-roundtrip', 'typed pack strict-decodes and row values are intact',
    JSON.stringify(decode(pack).tables.get('symbols').rows) === JSON.stringify([['1', 'fn', '42'], ['2', 'cls', '88']]),
    'rows preserved alongside types');

  // encode() AUTO-emits `; caps typed` whenever a column is typed, so a typed
  // pack is self-describing by construction and round-trips through DEFAULT
  // decode() (no caps line in the legend, no decode option).
  const auto = encode({
    header: { producer: 'a/1', schema: 'agent-v5', snapshotId: 'x', rowCount: 1, kind: 'master' },
    tables: [{ name: 't', columns: [{ name: 'id', type: 'int' }], rows: [['1']] }],
  });
  const autoDec = decode(auto);
  confirm('TYPED-autodeclare', 'encode() auto-emits `; caps typed` for a typed pack, so default decode() reads the types',
    autoDec.meta.some((m) => /^caps\b/.test(m) && m.split(/\s+/).includes('typed')) && autoDec.tables.get('t').columns[0].type === 'int',
    'auto caps line present + default decode reads loc type');

  // REGRESSION (the false-fire fix): a legend line where `typed` is PROSE
  // (`strongly-typed`), not a whitespace-delimited caps token, must NOT enable
  // type parsing — so a literal column whose name contains ':' is preserved.
  const prose = encode({
    header: { producer: 'a/1', schema: 's', snapshotId: 'x', rowCount: 1, kind: 'master' },
    meta: { legend: ['caps strongly-typed graph export'] },
    tables: [{ name: 'deps', columns: [{ name: 'pkg:version' }, { name: 'count' }], rows: [['react:18', '5']] }],
  });
  confirm('TYPED-no-false-fire', 'a prose `typed` substring (strongly-typed) does NOT enable type parsing — a literal `pkg:version` name is preserved',
    decode(prose).tables.get('deps').columns[0].name === 'pkg:version' && decode(prose).tables.get('deps').columns[0].type === undefined,
    'pkg:version stays one literal name (no silent split)', 'LEGACY');
}

/* ── self-describing `;` meta lines (additive: caps / types / gschema) ── */
{
  const pack = encode({
    header: { producer: 'a/1', schema: 'agent-v5', snapshotId: 'x', rowCount: 1, kind: 'master' },
    meta: { legend: ['caps types gschema chain', 'types files loc=int score=ratio', 'gschema calls=edge(Symbol-CALLS->Symbol)'] },
    tables: [{ name: 'files', columns: [{ name: 'path' }, { name: 'loc' }], rows: [['a.ts', '10']] }],
  });
  const meta = decode(pack).meta;
  confirm('META-caps', '`; caps …` capability line is preserved in decoded meta (consumers negotiate, not sniff)',
    meta.some((m) => /^caps\b/.test(m)), meta.find((m) => /^caps/.test(m)) || 'no caps line');
  confirm('META-types', '`; types …` datatype line is preserved (readers never infer semantics from names)',
    meta.some((m) => /^types\b/.test(m)), meta.find((m) => /^types/.test(m)) || 'no types line');
  confirm('META-gschema', '`; gschema …` graph-schema line is preserved (zero-config exporters / query tools)',
    meta.some((m) => /^gschema\b/.test(m)), meta.find((m) => /^gschema/.test(m)) || 'no gschema line');
}

L.finish(({ n, failed, total }) =>
  failed === 0
    ? `${total} agent-v5 wire checks pass — typed tokens + corpus + self-describing ; lines, additive over v0.2.`
    : `${failed}/${total} agent-v5 checks FAILED.`);
