/**
 * security.mjs — security regression suite for the FactsPack codec + shipped web engine.
 *
 * An independent 5-surface adversarial probe (XSS, codec injection, DoS, integrity bypass,
 * parser confusion) found ZERO exploitable vulnerabilities — every property below "fails
 * closed". This suite pins those defenses so a future change cannot silently regress them,
 * and it FLAGS (does not fail on) the consumer-side / governance-gated gaps the probe
 * confirmed, so they stay visible rather than forgotten.
 *
 * confirm(): a security property that MUST hold — breaks the build if violated.
 * flag():    a known consumer-side gap (the canonical decoder/spec, not this repo's app);
 *            grounded and reported, never silently passed, never failed here.
 *
 * Run: node test/security.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  decode,
  decodeLegacy,
  encode,
  PackDecodeError,
  STRICT_DEFAULT_LIMITS,
} from './factspack.bundle.mjs';
import { convert } from './harness.mjs';
import { ledger } from './_report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const L = ledger({ DEFENDED: '🛡️ ', BROKEN: '❌', GAP: '⚠️ ' }, ['BROKEN']);
function confirm(id, title, cond, detail) {
  L.add(cond ? 'DEFENDED' : 'BROKEN', `[${id}] ${title}`, detail);
}
function flag(id, title, detail) {
  L.add('GAP', `[${id}] ${title}`, detail);
}
/** Returns {threw, err} for strict decode(text). */
function tryDecode(text) {
  try { decode(text); return { threw: false, err: '' }; }
  catch (e) { return { threw: true, err: (e && e.message) || String(e) }; }
}
/** Returns {threw, err} for an arbitrary thunk (e.g. decode with opts / legacy). */
function tryRun(fn) {
  try { fn(); return { threw: false, err: '' }; }
  catch (e) { return { threw: true, err: (e && e.message) || String(e) }; }
}
/** A valid master pack with the given single-column rows (literal column 'c'). */
function pack(rows, colName = 'c') {
  return encode({
    header: { producer: 'sec', schema: 'paste-v1', snapshotId: 'x', seq: 1, kind: 'master' },
    meta: { legend: ['t ' + colName] },
    tables: [{ name: 't', columns: [{ name: colName }], rows: rows.map((v) => [v]) }],
  });
}

/* ============================================================
   1. STRUCTURAL INJECTION — a cell value can never become structure.
   ============================================================ */
{
  const payloads = [
    'tab\there', 'line\nbreak', 'back\\slash',
    '; end rows=99 tables=9 sha256=deadbeefdead', // trailer lookalike
    '@ X1=evil',                                   // dict lookalike
    '& fake\tcols',                                // schema lookalike
    'forged row',                                  // row-ish text
  ];
  const p = pack(payloads);
  const d = decode(p);
  const t = d.tables.get('t');
  const roundTrips = payloads.every((v, i) => t.rows[i][0] === v);
  confirm('INJ-1', 'Cell values (tab/newline/backslash/trailer/dict/schema lookalikes) round-trip into their own cell',
    roundTrips, `${t.rows.length} rows decoded, all values preserved verbatim`);
  confirm('INJ-2', 'No injected structure: exactly one table, row count matches, no forged trailer',
    d.tables.size === 1 && t.rows.length === payloads.length && d.trailer.rows === payloads.length,
    `tables=${d.tables.size} rows=${t.rows.length} trailer.rows=${d.trailer.rows}`);

  // Interned (UPPERCASE) value containing '=' and newline cannot forge a dict key.
  const evil = 'evil\tTAB\nNL=here\n@ Z9=forged';
  const pi = encode({
    header: { producer: 'sec', schema: 'paste-v1', snapshotId: 'x', seq: 1, kind: 'master' },
    meta: { legend: ['t C'] },
    tables: [{ name: 't', columns: [{ name: 'C' }], rows: [[evil], [evil]] }],
  });
  const di = decode(pi);
  const dictLines = pi.split('\n').filter((l) => l.startsWith('@ '));
  confirm('INJ-3', "Interned value with '=' and newline stays ONE dict entry and round-trips (no forged key)",
    dictLines.length === 1 && di.tables.get('t').rows[0][0] === evil,
    `${dictLines.length} dict line; value preserved`);
}

/* ============================================================
   2. INTEGRITY — tamper / truncation are REJECTED, and the emitter cannot be
   forced into an unverifiable zero-hash trailer (it always seals a real digest).
   ============================================================ */
{
  const good = pack(['alpha', 'beta', 'gamma']);
  // Tamper: flip a byte in the body (before the trailer). sha must reject.
  const idx = good.indexOf('alpha');
  const tampered = good.slice(0, idx) + 'alphX' + good.slice(idx + 5);
  const r1 = tryDecode(tampered);
  confirm('INT-1', 'Tampering a body byte is rejected by the trailer SHA-256',
    r1.threw && /tamper|truncat|hash/i.test(r1.err), r1.err.slice(0, 80));

  // Truncation: drop a data row but keep the trailer (which counts 3). Count mismatch rejects.
  const lines = good.split('\n');
  const rowLineIdx = lines.findIndex((l) => l.startsWith('- '));
  lines.splice(rowLineIdx, 1);
  const r2 = tryDecode(lines.join('\n'));
  confirm('INT-2', 'Dropping a row while keeping the trailer is rejected (count or hash mismatch)',
    r2.threw, r2.err.slice(0, 80));

  // No zero-hash fallback: even with crypto.subtle unavailable, the web engine
  // seals a real synchronous SHA-256 (never the 000…0 sentinel), and the strict
  // decoder ACCEPTS it. Proves the emitter cannot be forced into an
  // unverifiable trailer — the integrity gap §06 flagged is closed.
  const subtle = globalThis.crypto.subtle;
  const orig = subtle.digest;
  Object.defineProperty(subtle, 'digest', { value: async () => { throw new Error('no subtle'); }, configurable: true, writable: true });
  let offline;
  try { offline = (await convert(JSON.stringify([{ id: 1, n: 'a' }, { id: 2, n: 'b' }]))).pack; }
  finally { Object.defineProperty(subtle, 'digest', { value: orig, configurable: true, writable: true }); }
  const r3 = tryDecode(offline);
  confirm('INT-3', 'No zero-hash fallback: with crypto.subtle unavailable the emitter still seals a real, verifiable digest the strict decoder accepts',
    !/sha256=000000000000/.test(offline) && /sha256=[0-9a-f]{12}$/.test(offline.trim()) && !r3.threw,
    r3.threw ? r3.err.slice(0, 80) : 'real digest sealed offline; strict decoder accepts');
}

/* ============================================================
   3. PARSER CONFUSION — malformed input is REJECTED, not mis-accepted.
   ============================================================ */
{
  const valid = pack(['ok']);
  const cases = [
    ['BOM at start of pack', '﻿' + valid],
    ['reserved first-byte', '# p\ts\tx\t0\n! danger\n'],
    ['missing space after prefix', '#p\ts\tx\t0\n'],
    ['duplicate dictionary key', '# p\ts\tx\t0\n@ K=a\n@ K=b\n'],
    ['unterminated escape (trailing backslash)', '# p\ts\tx\t1\n& t\tc\n- bad\\\n'],
    ['unknown escape (\\x)', '# p\ts\tx\t1\n& t\tc\n- a\\xb\n'],
    ['content after trailer', valid + 'extra line\n'],
    ['schema redeclared with different columns', '# p\ts\tx\t0\n& t\ta\tb\n& t\ta\tc\n'],
    ['unresolved dictionary key (interned col)', '# p\ts\tx\t1\n& t\tC\n- K9\n'],
    ['row with no active schema', '# p\ts\tx\t1\n- orphan\n'],
  ];
  for (const [name, text] of cases) {
    const r = tryDecode(text);
    confirm('PARSE: ' + name, 'Rejected: ' + name, r.threw, r.err.slice(0, 70) || '(no error!)');
  }
}

/* ============================================================
   4. v0.2a STRICT DEFENSES + residual consumer-side gaps.
   Strict mode (now the default) closes the trailer-optional and
   unbounded-decode gaps the earlier review flagged. The residual items
   are legacy-mode artifacts or canonical-spec notes — grounded and
   flagged, never failed here. The shipped web app is encode-only.
   ============================================================ */
{
  // DoS — strict mode now enforces resource ceilings (Finding 06, repaired).
  const N = 20000;
  const big = encode({
    header: { producer: 'sec', schema: 'paste-v1', snapshotId: 'x', rowCount: null },
    tables: [{ name: 't', columns: [{ name: 'id' }], rows: Array.from({ length: N }, (_, i) => [String(i)]) }],
  });
  const capped = tryRun(() => decode(big, { limits: { maxRows: 1000 } }));
  confirm('DOS-STRICT', 'Strict mode enforces a maxRows ceiling — an over-limit pack is rejected mid-parse',
    capped.threw && /maxRows/.test(capped.err), capped.err.slice(0, 70));
  flag('GAP-DOS-LEGACY', 'Legacy mode still applies no resource ceilings (use strict, or pass explicit limits)',
    `STRICT_DEFAULT_LIMITS.maxRows=${STRICT_DEFAULT_LIMITS.maxRows}; legacy decode is uncapped by design`);

  // Trailer — strict mode now REQUIRES it; legacy tolerates absence (Finding 03, repaired).
  const noTrailer = pack(['a', 'b']).replace(/; end [^\n]*\n$/, '');
  const rStrict = tryDecode(noTrailer);
  confirm('INT-TRAILER', 'Strict mode rejects a trailer-less pack (kills the truncation ambiguity)',
    rStrict.threw && /requires a `; end` trailer/.test(rStrict.err), rStrict.err.slice(0, 70));
  let legacyRows = -1;
  try { legacyRows = decodeLegacy(noTrailer).tables.get('t').rows.length; } catch { /* */ }
  flag('GAP-TRAILER-LEGACY', 'Legacy mode still accepts a trailer-less pack unverified (pre-v0.2 compatibility)',
    legacyRows === 2 ? 'decodeLegacy returns the rows with no integrity check' : 'unexpected');

  // CRLF — a trailing CR is retained inside a decoded cell (legacy-mode artifact; strict
  // rejects a CRLF pack because the \r-suffixed trailer line no longer matches the form).
  const crlf = '# p\ts\tx\t1\n& t\tc\n- val\r\n';
  let crVal = '';
  try { crVal = decodeLegacy(crlf).tables.get('t').rows[0][0]; } catch { /* */ }
  flag('GAP-CRLF', 'Legacy decode retains a trailing CR (CRLF line endings) inside the cell value',
    `decoded cell = ${JSON.stringify(crVal)} (contains \\r: ${crVal.includes('\r')}) — upstream normalization proposed`);

  // Empty column name: the decoder accepts what the encoder forbids (both modes' parser).
  const emptyCol = '# p\ts\tx\t0\n& t\t\tcol2\n';
  const de = tryRun(() => decodeLegacy(emptyCol));
  flag('GAP-EMPTYCOL', 'The decoder accepts an empty column name the encoder forbids',
    de.threw ? 'rejected (encoder/decoder agree)' : 'accepted — decoder/encoder asymmetry, upstream');

  // 48-bit truncated SHA: a 12-hex-char checksum is integrity-but-not-cryptographic.
  flag('GAP-SHA48', 'The trailer SHA-256 is truncated to 12 hex chars (48 bits) — a checksum, not anti-tamper',
    'canonical-spec note: detects accidental corruption/truncation, not a motivated forger');
}

/* ============================================================
   5. SHIPPED-APP HARDENING — escHtml is a full entity-escaper.
   The pack preview renders into innerHTML; escaping all five metacharacters
   keeps the helper context-safe (defense-in-depth for the encode-only app).
   ============================================================ */
{
  const html = readFileSync(join(ROOT, 'docs', 'index.html'), 'utf8');
  const m = /const escHtml = s => s\.replace\([^\n]*/.exec(html);
  const line = m ? m[0] : '(escHtml not found)';
  const all5 = ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'].every((e) => line.includes(e));
  confirm('HARDEN-escHtml', "escHtml escapes all five HTML metacharacters (& < > \" ')",
    all5, line.slice(0, 110));
}

/* ---------- report ---------- */
L.finish(({ n, failed }) =>
  `${n('DEFENDED')} defended · ${n('GAP')} consumer-side gaps flagged · ${failed} broken\n` +
  (failed === 0
    ? 'All shipped-surface security properties hold. Flagged gaps are consumer-side / governance-gated, not regressions.'
    : 'A defended security property REGRESSED — investigate immediately.'));
