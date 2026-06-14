/**
 * grounding.mjs — turns every falsifiable claim in docs/next-steps.v2.html into a
 * RUNNABLE assertion against the real repository bytes and live decoder behaviour.
 *
 * Premise (per the owner's standing instruction): no claim is trusted because the
 * review document, the spec, or this agent asserted it. Each finding is re-derived
 * here from observable facts — exact file bytes and executed experiments. Where a
 * claim references material that is NOT present in this checkout (e.g. the external
 * factstack suite), it is reported as UNVERIFIABLE-FROM-CHECKOUT rather than passed
 * or failed, because asserting either way would itself be a hallucination.
 *
 * v0.2a: the contract-repair findings (02 diff/master counts, 03 strict integrity,
 * 06 resource ceilings) have been FIXED in the reference codec. Those assertions now
 * prove the REPAIRED contract (strict decode is the default; decodeLegacy preserves
 * old behavior) rather than the original defect.
 *
 * The system under test is the SHIPPED reference codec (test/factspack.bundle.mjs,
 * regenerated from ../claude/factstack by test/build-bundle.mjs) and the SHIPPED web
 * engine (extracted verbatim from docs/index.html by harness.mjs).
 *
 * Run: node test/grounding.mjs
 * Exit 0 iff every CONFIRMED/REFUTED expectation matched the bytes; non-zero otherwise.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { platform } from 'node:os';
import { createHash } from 'node:crypto';
import {
  decode,
  decodeLegacy,
  encode,
  encodeAuto,
  encodeIncremental,
  PackDecodeError,
  STRICT_DEFAULT_LIMITS,
} from './factspack.bundle.mjs';
import { convert } from './harness.mjs';
import { ledger } from './_report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const lines = (rel) => read(rel).split('\n');
/** 1-based line accessor mirroring how the review cites "file:N". */
const lineAt = (rel, n) => lines(rel)[n - 1];

/* ---------- reporting ---------- */
const L = ledger({ CONFIRMED: '✅', OBSERVED: '📎', UNVERIFIABLE: '❔', BROKEN: '❌' }, ['BROKEN']);
/** A claim re-derived from bytes that must hold. Fails the run if cond is false. */
function confirm(id, title, cond, detail) {
  L.add(cond ? 'CONFIRMED' : 'BROKEN', `[${id}] ${title}`, detail);
}
/** A claim that cannot be checked from this checkout — recorded, never asserted. */
function unverifiable(id, title, detail) {
  L.add('UNVERIFIABLE', `[${id}] ${title}`, detail);
}
/** A note grounding an observable fact that is context, not pass/fail. */
function note(id, title, detail) {
  L.add('OBSERVED', `[${id}] ${title}`, detail);
}

const hasTab = (s) => typeof s === 'string' && s.indexOf('\t') >= 0;
const tabCount = (s) => (s.match(/\t/g) || []).length;

/* ============================================================
   FINDING 01 (v0.2a — REPAIRED) — canonical examples are byte-exact
   The spec mandates a tab separator; the worked examples are now backed
   by byte-exact fixtures (real 0x09 tabs) that decode under strict and
   re-encode byte-for-byte, and the prose renders each tab as a visible ⇥.
   ============================================================ */
{
  // Content-anchored (not line-anchored) so spec edits elsewhere can't break it.
  const specLines = lines('FACTSPACK.md');
  const sepIdx = specLines.findIndex((l) => /Field separator:\s*ASCII tab \(`0x09`\)/.test(l));
  confirm('01a', 'Spec §grammar mandates ASCII tab as the field separator',
    sepIdx >= 0, sepIdx >= 0 ? `FACTSPACK.md:${sepIdx + 1} — ${JSON.stringify(specLines[sepIdx].trim())}` : 'rule not found');

  // The byte-exact fixtures carry REAL tabs, decode under strict, and re-encode exactly.
  const reencode = (bytes, incremental) => {
    const d = decode(bytes);
    const t = [...d.tables.values()];
    return incremental
      ? encodeIncremental({ header: d.header, meta: { legend: d.meta }, tables: t.map((x) => ({ name: x.name, columns: x.columns, addedRows: x.addedRows, deletedIds: x.deletedIds })) })
      : encode({ header: d.header, meta: { legend: d.meta }, tables: t.map((x) => ({ name: x.name, columns: x.columns, rows: x.rows })) });
  };
  for (const [id, file, inc] of [['01b', 'test/fixtures/symbols-master.pack', false], ['01c', 'test/fixtures/symbols-diff.pack', true]]) {
    let bytes = '', exists = true;
    try { bytes = read(file); } catch { exists = false; }
    const roundOk = exists && (() => { try { return reencode(bytes, inc) === bytes; } catch { return false; } })();
    confirm(id, `Fixture ${file} has real tabs, decodes under strict, and re-encodes byte-for-byte`,
      exists && hasTab(bytes) && roundOk,
      exists ? `tabs=${hasTab(bytes)}, strict round-trip=${roundOk}` : 'MISSING (run node test/build-fixtures.mjs)');
  }

  // The spec prose now renders the visible ⇥ tab marker and points to the fixtures —
  // so no reader mistakes spaces for the wire (the old defect).
  const spec = read('FACTSPACK.md');
  confirm('01e', 'FACTSPACK.md renders the visible ⇥ tab marker and references the byte-exact fixtures',
    spec.includes('⇥') && spec.includes('test/fixtures/symbols-master.pack'),
    'examples are ⇥-rendered with a fixture pointer, not ambiguous spaces');

  // EXPERIMENT: a space-separated row is still rejected by the tab-splitting decoder.
  const fakePack = [
    '# facts/0.1\tsymbols-v1\t88e9a1b\t1',
    '@ F1=src/auth.ts',
    '& symbols\tid\tk\tn\tF\tl',
    '- 1   fn   login   F1   42', // spaces, not tabs
  ].join('\n') + '\n';
  let rejected = false, why = '';
  try { decodeLegacy(fakePack); } catch (e) { rejected = true; why = e.message; }
  confirm('01d', 'EXPERIMENT: a space-separated row is rejected by the tab-splitting decoder (cell-count)',
    rejected && /cells/.test(why), rejected ? why.slice(0, 120) : 'decoder ACCEPTED space-separated row (unexpected)');
}

/* ============================================================
   FINDING 02 (v0.2a — REPAIRED) — diff/master count semantics
   The diff `0` sentinel, the master header==trailer rule, and the
   physical-operation count are now three DISTINCT, enforced quantities.
   ============================================================ */
{
  // The baseline encoder refuses to mint a diff; the count regimes can't be confused.
  let encDiffRejected = false;
  try {
    encode({ header: { producer: 'p', schema: 's', snapshotId: 'x', rowCount: null, kind: 'diff' },
      tables: [{ name: 't', columns: [{ name: 'a' }], rows: [['1']] }] });
  } catch { encDiffRejected = true; }
  confirm('02a', 'encode() now REFUSES kind=diff — baseline and incremental count regimes are disentangled',
    encDiffRejected, 'the baseline encoder rejects a diff header');

  // A real diff carries the 0 sentinel + kind=diff, and the strict decoder ACCEPTS it.
  const diff = encodeIncremental({
    header: { producer: 'factspack-web/0.1', schema: 'symbols-v1', snapshotId: '88e9a1b', seq: 1, kind: 'diff' },
    meta: { legend: ['symbols id k n F l'] },
    tables: [{
      name: 'symbols',
      columns: [{ name: 'id' }, { name: 'k' }, { name: 'n' }, { name: 'F' }, { name: 'l' }],
      addedRows: [['6', 'fn', 'reset', 'src/auth.ts', '70']],
      deletedIds: ['3'],
    }],
  });
  const dh = decode(diff); // strict default
  confirm('02b', 'EXPERIMENT: a valid diff (header 0 sentinel + kind=diff, trailer counts ops) is ACCEPTED under strict default',
    dh.header.kind === 'diff' && dh.header.rowCount === 0 && dh.trailer.rows === 2,
    `decoded kind=${dh.header.kind}, header rowCount=${dh.header.rowCount}, trailer rows=${dh.trailer.rows}`);

  // EXPERIMENT: a master whose header rowCount LIES (99) about its 2 rows is REJECTED
  // even with a valid sha — the header==trailer rule is now enforced for masters.
  const body = '# factspack-web/0.1\tpaste-v1\tx\t99\t-\t-\tmaster\n& records\tid\n- 1\n- 2\n';
  const sha = createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 12);
  const lyingMaster = body + `; end rows=2 tables=1 sha256=${sha}\n`;
  let masterRejected = false, why = '';
  try { decode(lyingMaster); } catch (e) { masterRejected = true; why = e.message; }
  confirm('02c', 'EXPERIMENT: a master with header rowCount=99 over 2 real rows is REJECTED (header==trailer enforced)',
    masterRejected && /master header rowCount=99/.test(why), why.slice(0, 90));
}

/* ============================================================
   FINDING 03 (v0.2a — REPAIRED) — strict v0.2 integrity is now the DEFAULT
   decode() defaults to strictV02: a `; end` trailer is REQUIRED, so a
   v0.2 pack can no longer be silently confused with a truncated one.
   decodeLegacy() preserves the old permissive behavior for pre-v0.2 packs.
   ============================================================ */
{
  const master = encode({
    header: { producer: 'factspack-web/0.1', schema: 'paste-v1', snapshotId: 'deadbee', seq: 1, kind: 'master' },
    meta: { legend: ['records id name'] },
    tables: [{ name: 'records', columns: [{ name: 'id' }, { name: 'name' }], rows: [['1', 'alice'], ['2', 'bob']] }],
  });
  const stripped = master.replace(/; end [^\n]*\n$/, '');

  let fullOk = false;
  try { fullOk = decode(master).trailer.rows === 2; } catch { /* */ }
  confirm('03a', 'EXPERIMENT: a well-formed master decodes under strict default (control)', fullOk, 'baseline');

  let strictRejected = false, why = '';
  try { decode(stripped); } catch (e) { strictRejected = true; why = e.message; }
  confirm('03b', 'EXPERIMENT: the SAME pack with its trailer removed is REJECTED under strict default',
    strictRejected && /requires a `; end` trailer/.test(why), why.slice(0, 90));

  // Legacy mode still tolerates the trailer-less pack (backward compatibility).
  let legacyRows = -1, legacyTrailer = true;
  try { const d = decodeLegacy(stripped); legacyRows = d.tables.get('records').rows.length; legacyTrailer = !!d.trailer; } catch { /* */ }
  confirm('03c', 'EXPERIMENT: decodeLegacy() still accepts the trailer-less pack (pre-v0.2 compat)',
    legacyRows === 2 && !legacyTrailer, `legacy decoded ${legacyRows} rows, trailer=${legacyTrailer}`);
}

/* ============================================================
   FINDING 04 — the validator proves acceptance, not losslessness
   Claim: validate.mjs:21 maps a literal "-" to U+2212, counting the
   loss as a pass; its object flattening descends only one level.
   ============================================================ */
{
  const l21 = lineAt('test/validate.mjs', 21);
  confirm('04a', "validate.mjs:21 substitutes literal '-' with U+2212 inside the EXPECTED normalizer",
    l21.includes("'-'") && l21.includes('−'),
    JSON.stringify(l21.trim()));

  const v = read('test/validate.mjs');
  // The flatten() helper descends exactly one level: it iterates Object.entries(v)
  // for nested objects but does NOT recurse further.
  const flattenSrc = v.slice(v.indexOf('const flatten'), v.indexOf('const sanitize'));
  const recurses = /flatten\s*\(/.test(flattenSrc.replace('const flatten', ''));
  confirm('04b', 'validate.mjs flatten() descends only one object level (no recursion)',
    !recurses && /Object\.entries\(v\)/.test(flattenSrc),
    'flatten contains a single nested Object.entries pass and never calls itself');

  // EXPERIMENT (real engine, not a restatement): push a record whose value is the
  // literal '-' through the SHIPPED web engine, decode it with the reference decoder,
  // and compare the DECODED byte to the ORIGINAL. The shipped engine rewrites '-'
  // (U+002D) to '−' (U+2212) to dodge the null sentinel — an observable round-trip loss.
  const { pack: dashPack } = await convert(JSON.stringify([{ id: 0, v: '-' }, { id: 1, v: 'plain' }]));
  const dashTable = decode(dashPack).tables.get('records');
  const vIdx = dashTable.columns.findIndex((c) => c.name.toLowerCase() === 'v');
  const decodedDash = dashTable.rows[0][vIdx];
  const cp = decodedDash.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  confirm('04c', "EXPERIMENT: the shipped engine round-trips literal '-' to U+2212 — a real, observable loss",
    decodedDash !== '-' && decodedDash === '−',
    `original '-' (U+002D) decoded as '${decodedDash}' (U+${cp})`);
  // Why validate.mjs cannot catch it: its expected normalizer (line 21) applies the
  // SAME rewrite, so its comparison sees '−' == '−' and reports a pass despite the loss.
  confirm('04d', "validate.mjs's expected normalizer applies the same '-'→U+2212 rewrite, so its round-trip check is blind to this loss",
    /s === '-' \? '−'/.test(lineAt('test/validate.mjs', 21)),
    'both the lossy decoded value and the expected value become U+2212 → equality holds even though U+002D ≠ U+2212');
}

/* ============================================================
   FINDING COLDUP — colliding column names no longer degenerate the schema line
   Claim (pre-existing low-severity gap, now CLOSED): cleaning+casing could fuse
   two distinct source columns onto one wire token (e.g. "Name"+"name" ⇒ "name"),
   emitting a `& schema` line with DUPLICATE headers. The strict decoder accepts
   it, so a name-keyed consumer silently MERGES the two fields — values round-trip
   but column identity is lost. The producer profile now suffixes collisions so
   the schema line is duplicate-free and the two source fields stay distinguishable.
   ============================================================ */
{
  // The example from the bug report, encoded by the REFERENCE producer profile
  // (encodeAuto — the same planner the bundle re-exports and the page inlines).
  const collided = encodeAuto({
    header: { producer: 'p', schema: 'paste-v1', snapshotId: 'x', rowCount: null, kind: 'master' },
    tables: [{ name: 'records', columns: ['Name', 'name', 'age'], rows: [['Alice', 'bob', '30']] }],
  });
  const schemaLine = collided.split('\n').find((l) => l.startsWith('& records')) || '';
  const tokens = schemaLine.slice(2).split('\t').slice(1); // drop the table name
  const uniq = new Set(tokens);
  confirm('COLDUP-a', "EXPERIMENT: encodeAuto emits NO duplicate column tokens in the `& schema` line for colliding inputs (\"Name\"+\"name\")",
    tokens.length === 3 && uniq.size === 3,
    `& tokens = ${JSON.stringify(tokens)} (${uniq.size} distinct of ${tokens.length})`);

  // The two source fields stay distinguishable end-to-end: decode yields two
  // distinct columns and BOTH original values survive in their own column.
  const dt = decode(collided).tables.get('records');
  const names = dt.columns.map((c) => c.name);
  const namesUniq = new Set(names).size === names.length;
  confirm('COLDUP-b', 'EXPERIMENT: the colliding pack decodes to two DISTINCT columns; both source values survive (no silent merge)',
    namesUniq && dt.rows.length === 1 && dt.rows[0][0] === 'Alice' && dt.rows[0][1] === 'bob' && dt.rows[0][2] === '30',
    `cols=${JSON.stringify(names)}, row=${JSON.stringify(dt.rows[0])}`);

  // Grounded against the SHIPPED page too: the live converter (engine extracted
  // from docs/index.html) emits the same duplicate-free schema for the same input.
  const { pack: webPack } = await convert(JSON.stringify([{ Name: 'Alice', name: 'bob', age: '30' }]));
  const webTokens = (webPack.split('\n').find((l) => l.startsWith('& ')) || '').slice(2).split('\t').slice(1);
  confirm('COLDUP-c', 'EXPERIMENT: the SHIPPED converter also emits a duplicate-free `& schema` line for the colliding input',
    webTokens.length > 0 && new Set(webTokens).size === webTokens.length,
    `web & tokens = ${JSON.stringify(webTokens)}`);
}

/* ============================================================
   FINDING 05 — byte-determinism is assumed, never tested
   Claim: float formatting, dict-key order, legend wording, and path
   separators are unpinned with zero conformance test.
   ============================================================ */
{
  // Observable: no test file in this checkout pins cross-platform determinism.
  const testFiles = ['test/validate.mjs', 'test/harness.mjs', 'test/grounding.mjs'];
  const determinismHits = testFiles.filter((f) => {
    const s = read(f);
    return /cross-platform|determinism conformance|path separator|POSIX vs|float format/i.test(s)
      && /\bassert|check\(/.test(s) && f !== 'test/grounding.mjs';
  });
  confirm('05a', 'No cross-platform determinism CONFORMANCE test exists in the checkout test/ suite',
    determinismHits.length === 0,
    `searched ${testFiles.length} test files; ${determinismHits.length} contain a determinism conformance assertion`);

  note('05b', 'This checkout is authored on a single platform (determinism is therefore untested across OSes)',
    `os.platform() = ${platform()}; the review notes the v2 doc itself was authored on win32`);

  // EXPERIMENT (honest scope): in-process the reference encoder IS deterministic
  // (same input -> same bytes). The UNTESTED surface is CROSS-platform, which a
  // single machine cannot prove. We assert only what is observable here.
  const mk = () => encode({
    header: { producer: 'p', schema: 's', snapshotId: 'x', seq: 1, kind: 'master' },
    meta: { legend: ['records a B'] },
    tables: [{ name: 'records', columns: [{ name: 'a' }, { name: 'B' }], rows: [['1', '/unix/path'], ['2', 'C:\\win\\path']] }],
  });
  confirm('05c', 'EXPERIMENT: in-process the encoder is deterministic (same input -> identical bytes)',
    mk() === mk(), 'two encodes byte-equal');
  note('05d', 'Path separators travel verbatim into interned cells (unpinned canonicalization)',
    'the encoder stores "C:\\\\win\\\\path" and "/unix/path" as-is; nothing normalizes separators — cross-OS bytes can differ');
}

/* ============================================================
   FINDING 06 (v0.2a — REPAIRED) — the decoder now enforces resource ceilings
   decode(text, opts) accepts per-dimension limits; strict mode applies
   generous defaults (STRICT_DEFAULT_LIMITS); legacy mode applies none.
   ============================================================ */
{
  confirm('06a', 'decode() now takes an options argument (text, opts) and the codec exports STRICT_DEFAULT_LIMITS',
    decode.length === 2 && typeof STRICT_DEFAULT_LIMITS === 'object' && STRICT_DEFAULT_LIMITS.maxRows > 0,
    `decode.length=${decode.length}, STRICT_DEFAULT_LIMITS.maxRows=${STRICT_DEFAULT_LIMITS.maxRows}`);

  // A valid N-row master; strict decode under a tight maxRows REJECTS it mid-parse.
  const N = 50000;
  const rows = Array.from({ length: N }, (_, i) => [String(i)]);
  const big = encode({
    header: { producer: 'p', schema: 's', snapshotId: 'x', rowCount: null },
    tables: [{ name: 'records', columns: [{ name: 'id' }], rows }],
  });
  let capped = false, why = '';
  try { decode(big, { limits: { maxRows: 1000 } }); } catch (e) { capped = true; why = e.message; }
  confirm('06b', `EXPERIMENT: strict decode REJECTS a ${N.toLocaleString()}-row pack under maxRows=1000`,
    capped && /maxRows/.test(why), why.slice(0, 80));

  // Legacy mode applies no ceilings: the same pack decodes in full.
  let legacyRows = 0;
  try { legacyRows = decodeLegacy(big).tables.get('records').rows.length; } catch { /* */ }
  confirm('06c', `EXPERIMENT: legacy mode applies no ceilings — the ${N.toLocaleString()}-row pack decodes in full`,
    legacyRows === N, `${legacyRows} rows decoded under legacy`);

  // The generous strict DEFAULT never trips a legitimate pack.
  let defaultOk = false;
  try { defaultOk = decode(big).tables.get('records').rows.length === N; } catch { /* */ }
  confirm('06d', `EXPERIMENT: the generous strict default ceiling passes the ${N.toLocaleString()}-row pack`,
    defaultOk, `decoded ${N} rows under the default strict limits`);
}

/* ============================================================
   FINDING 07 (REPAIRED) — browser and reference encoders are now ONE encoder.
   Was: the browser converter had its own bespoke emitter and there was no
   byte-for-byte parity test — the two could drift. Now: the converter calls the
   reference codec's encodeAuto, esbuild-inlined into docs/index.html, and a
   dedicated suite proves byte-identical output and guards against drift.
   ============================================================ */
{
  const html = read('docs/index.html');
  const parity = read('test/parity.mjs');
  confirm('07a', 'the browser converter EMITS via the inlined reference codec (no bespoke emitter remains)',
    /CODEC-INLINE-START/.test(html) && /__FPCODEC\.encodeAuto\(/.test(html) && !/const escCell =/.test(html),
    'docs/index.html inlines __FPCODEC and emitPack calls encodeAuto; the old escCell/interning emitter is gone');
  confirm('07b', 'a byte-for-byte encoder PARITY suite exists (inlined codec === reference codec)',
    /__FPCODEC/.test(parity) && /encodeAuto/.test(parity) && /=== *(pack|b)\b/.test(parity) && /byte/i.test(parity),
    'test/parity.mjs asserts the inlined and reference encoders produce identical bytes + reproduces convert() output exactly');
}

/* ============================================================
   ZERO-HASH SEAL FALLBACK — ELIMINATED (v0.3 — REPAIRED).
   §06 recorded a risk: when crypto.subtle was unavailable (e.g. a non-secure
   context) the shipped web emitter sealed with sha256=000000000000 instead of a
   real digest, and the strict decoder then rejected the pack. The emitter now
   computes the trailer with a synchronous pure-JS SHA-256 — byte-for-byte
   identical to node:crypto and the reference codec — so it seals a REAL,
   verifiable digest with no crypto.subtle dependency at all. We PROVE the
   repair: force crypto.subtle.digest to throw, and confirm the emitter STILL
   seals a real digest that (a) is not the zero sentinel, (b) equals node:crypto's
   SHA-256 of the body (digest parity — the hash VALUE matches; this says nothing
   about whether the two emitters produce identical pack BODIES), and (c) the
   strict decoder ACCEPTS.
   ============================================================ */
{
  const subtle = globalThis.crypto.subtle;
  const origDigest = subtle.digest;
  Object.defineProperty(subtle, 'digest', {
    value: async () => { throw new Error('crypto.subtle unavailable (non-secure context)'); },
    configurable: true, writable: true,
  });
  let offlinePack;
  try {
    offlinePack = (await convert(JSON.stringify([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]))).pack;
  } finally {
    Object.defineProperty(subtle, 'digest', { value: origDigest, configurable: true, writable: true });
  }
  const trailer = offlinePack.trim().split('\n').pop();
  confirm('ZH-a', 'EXPERIMENT: with crypto.subtle unavailable the emitter seals a REAL digest, not the old sha256=000000000000 sentinel',
    /sha256=[0-9a-f]{12}$/.test(trailer) && !/sha256=000000000000$/.test(trailer), JSON.stringify(trailer));

  // The body the trailer commits to is everything before the trailer line. Derive
  // it by length (the trailer is the final line + its '\n'), not by searching for
  // '; end rows=' — a cell value could contain that string, but its byte LENGTH
  // is unambiguous. This matches the decoder's sha256hex(text.slice(0, trailer.start)).
  const body = offlinePack.slice(0, offlinePack.length - (trailer.length + 1));
  const expected = createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 12);
  const sealed = (trailer.match(/sha256=([0-9a-f]{12})$/) || [])[1];
  let accepted = false, why = '';
  try { decode(offlinePack); accepted = true; } catch (e) { why = e instanceof PackDecodeError ? e.message : String(e); }
  confirm('ZH-b', 'EXPERIMENT: the offline-sealed digest equals node:crypto SHA-256 of the body AND the strict decoder ACCEPTS the pack (zero-hash fallback gone)',
    sealed === expected && accepted,
    accepted ? `sha=${sealed} == node:crypto; strict decoder round-trips` : `decoder rejected: ${why.slice(0, 70)}`);
}

/* ============================================================
   FINDING 08 (v0.2a — REPAIRED) — the stale hard-coded test count is gone
   FACTSPACK.md no longer asserts "143 tests"; it points at the vitest
   conformance suite so the number can never go stale again.
   ============================================================ */
{
  const md = read('FACTSPACK.md');
  const hits = [...md.matchAll(/\b143 tests?\b/g)].length;
  confirm('08a', 'FACTSPACK.md no longer hard-codes a "143 tests" count',
    hits === 0, `"143 tests" now appears ${hits}× (replaced with a reference to the vitest suite)`);

  note('08b', 'The spec defers the count to the test runner instead of a stale literal',
    'FACTSPACK.md cites "a vitest conformance suite, including a deterministic fuzz" — generated, not hard-coded');

  unverifiable('08c', 'The exact upstream test count is owned by the vitest runner, not this checkout',
    'the vendored bundle carries the codec but not its test suite; run `pnpm vitest` in factstack for the live count');
}

/* ============================================================
   SELF-DESCRIPTION — §07 colophon: "single self-contained file, no web fonts"
   (the no-network claim is also asserted live in the Playwright suite)
   ============================================================ */
{
  const v2 = read('docs/next-steps.v2.html');
  const externalHref = /(href|src)\s*=\s*["']https?:\/\//i;
  // allowable: schema.org / og URLs live in <meta>/<script type=ld+json>, not fetched.
  const fetchableExternal = /<(link|script)\b[^>]*\b(href|src)\s*=\s*["']https?:\/\//i.test(v2);
  confirm('SD-a', 'next-steps.v2.html declares no external <link>/<script> resources (no web fonts/CDN)',
    !fetchableExternal, fetchableExternal ? 'found an external link/script' : 'no fetchable external stylesheet or script');
  confirm('SD-b', 'next-steps.v2.html inlines its CSS and JS (single self-contained file)',
    v2.includes('<style>') && v2.includes('<script>') && !/<link[^>]+rel=["']stylesheet/i.test(v2),
    'has inline <style> + <script>, no external stylesheet link');
}

/* ============================================================
   SOURCE LEDGER — §06 cites four research files; verify they exist.
   ============================================================ */
{
  const cited = [
    'research/2026-06-13-claude-project-state-review.md',
    'research/2026-06-13-antigravity-cross-verification.md',
    'research/2026-06-13-1917-oc-cross-verified-latest-files-review.md',
    'research/2026-06-13-tri-agent-final-verdict.md',
  ];
  for (const f of cited) {
    let exists = true;
    try { read(f); } catch { exists = false; }
    confirm('SRC:' + f.split('/').pop(), `Cited source exists: ${f}`, exists, exists ? 'present' : 'MISSING');
  }
}

/* ============================================================
   DOSSIER CROSS-CHECK — research/pack_v02_vs_v02_2_comparison.md (AG, 2026-06-13).
   The dossier's six sections restate findings already grounded above
   (§1→01, §2→02, §3→03, §4→04, §5→05). Two aspects are sharpened/new and
   grounded here; one (§6 churn) needs an engine absent from this checkout.
   ============================================================ */
{
  // §5 (sharpened): path separators are NOT canonicalized, so the same logical path
  // with Windows vs POSIX separators yields different wire bytes (and thus a different
  // cache key). Backslashes are constructed here in-source so the bytes are exact.
  const winPath = 'src' + '\\' + 'auth' + '\\' + 'session.ts';
  const posixPath = 'src/auth/session.ts';
  const mk = (p) => JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ id: i, F: p, n: 'sym' + i })));
  const pw = (await convert(mk(winPath))).pack;
  const pp = (await convert(mk(posixPath))).pack;
  const bodyW = pw.slice(0, pw.lastIndexOf('; end '));
  const bodyP = pp.slice(0, pp.lastIndexOf('; end '));
  const winDict = pw.split('\n').find((l) => l.startsWith('@ ')) || '(none)';
  const posixDict = pp.split('\n').find((l) => l.startsWith('@ ')) || '(none)';
  confirm('DOS-5', 'EXPERIMENT: Windows vs POSIX path separators yield different pack bytes (uncanonicalized → cache key diverges)',
    bodyW !== bodyP && bodyP.includes('src/auth/session.ts') && !bodyW.includes('src/auth/session.ts'),
    `win ${JSON.stringify(winDict)} vs posix ${JSON.stringify(posixDict)}`);

  // §6: the web engine identifies a symbol by a SEQUENTIAL id + a separate line column,
  // NOT a positional path#name@line moniker. The diff/chain engine whose churn the dossier
  // describes does not exist in this checkout, so that behaviour cannot be exercised here.
  const codeMap = (await convert('// file: src/auth.ts\nexport function login(){}\nexport function logout(){}\n')).pack;
  const symCols = decode(codeMap).tables.get('symbols').columns.map((c) => c.name).join(',');
  confirm('DOS-6a', `Web-engine symbol identity is a sequential id + separate line column (cols: ${symCols})`,
    /(^|,)id(,|$)/.test(symCols) && /(^|,)line(,|$)/.test(symCols),
    'identity is a row counter, not a path#name@line moniker');
  unverifiable('DOS-6b', '§6 positional-moniker diff CHURN references the agent-v5 chain/diff engine',
    'no chain or incremental-diff emitter exists in this checkout, so churn-on-line-shift cannot be exercised here');
}

/* ---------- report ---------- */
// sort:true orders rows by their `[id] …` title prefix — the same id ordering the
// suite printed before, now handled by the shared ledger.
L.finish(({ n, failed }) =>
  `${n('CONFIRMED')} confirmed · ${n('OBSERVED')} observed · ` +
  `${n('UNVERIFIABLE')} unverifiable-from-checkout · ${failed} broken\n` +
  (failed === 0
    ? 'All falsifiable claims re-derived from observable bytes held. Unverifiable items are flagged, not assumed.'
    : 'A claim did NOT match the bytes — investigate before trusting the review document.'),
  { sort: true });
