/**
 * oracle.mjs — independent EXACT round-trip oracle for the reference codec (U4).
 *
 * Why this exists: test/validate.mjs maps a literal '-' to U+2212 on BOTH the expected
 * and the actual side, so it cannot detect that exact loss (grounding 04c/04d). This
 * oracle shares NO normalization with the converter: it builds PackTable inputs directly,
 * encodes with the reference encoder, decodes with the STRICT decoder, and asserts the
 * decoded values deep-equal the ORIGINALS byte-for-byte. A value that cannot round-trip
 * losslessly (a literal '-' in a literal column) must be REJECTED with a precise error,
 * never silently coerced. Property: decode(encode(x)) deepEquals x.
 *
 * Run: node test/oracle.mjs
 */
import { strict as assert } from 'node:assert';
import { encode, decode, PackEncodeError } from './factspack.bundle.mjs';

let pass = 0, fail = 0;
const fails = [];
function check(name, fn) {
  try { fn(); pass++; console.log('✅ ' + name); }
  catch (e) { fail++; fails.push(`${name} — ${e.message}`); console.log(`❌ ${name} — ${e.message}`); }
}

/** Encode (reference) → decode (strict) → assert the decoded rows EXACTLY equal input. */
function roundTrip(columns, rows) {
  const enc = encode({
    header: { producer: 'oracle/1', schema: 'o-v1', snapshotId: 'x', rowCount: null, kind: 'master' },
    meta: { legend: ['t — exact round-trip fixture'] },
    tables: [{ name: 't', columns, rows }],
  });
  const dec = decode(enc); // strict — the encoder's own output must satisfy strict
  assert.deepStrictEqual(dec.tables.get('t').rows, rows, 'decoded rows differ from the original');
}

const LIT = [{ name: 'a' }, { name: 'b' }];       // two literal columns
const INTERNED = [{ name: 'id' }, { name: 'F' }]; // F is interned (uppercase)

check('plain strings round-trip exactly', () => {
  roundTrip(LIT, [['hello', 'world'], ['foo', 'bar']]);
});
check('null (-) and empty-string ("") stay distinct and exact', () => {
  roundTrip(LIT, [['x', null], ['y', '']]);
});
check('tab / newline / backslash escape and round-trip exactly', () => {
  roundTrip(LIT, [['a\tb', 'c\nd'], ['e\\f', 'plain']]);
});
check('unicode survives byte-for-byte', () => {
  roundTrip(LIT, [['Ωnaïve', '🦖'], ['café', 'naïve']]);
});
check('interned column round-trips the full literal', () => {
  roundTrip(INTERNED, [['1', 'src/auth.ts'], ['2', 'src/auth.ts'], ['3', 'src/users.ts']]);
});
check('U+2212 and embedded hyphens survive exactly (no normalization)', () => {
  // The exact loss validate.mjs is blind to: a real minus sign must stay U+2212,
  // and an embedded hyphen ("a-b") must stay an ASCII hyphen — neither is coerced.
  roundTrip(LIT, [['minus', '−'], ['dash', 'a-b']]);
});
check('a literal cell that is exactly "-" is REJECTED with a precise error (no silent coercion)', () => {
  let threw = false, msg = '';
  try {
    encode({
      header: { producer: 'o/1', schema: 'o-v1', snapshotId: 'x', rowCount: null },
      tables: [{ name: 't', columns: LIT, rows: [['ok', '-']] }],
    });
  } catch (e) { threw = e instanceof PackEncodeError; msg = e.message; }
  assert.ok(threw, 'encoder did NOT reject a literal "-" cell');
  assert.match(msg, /decode as null|sentinel/, 'rejection should explain the null collision');
});

console.log(`\n${pass}/${pass + fail} exact round-trip properties hold against the reference codec`);
if (fail) { console.log('FAILURES:'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
