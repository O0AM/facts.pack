/**
 * moniker.mjs — SCIP-style position-free symbol MONIKERS (spec §18, consensus R4).
 *
 * The diff chain (tools/chain) needs a row identity that is STABLE across edits to
 * produce small diffs. A line-number id (`path#name@line`) churns on any edit ABOVE
 * a symbol, so every diff is noisy and cross-pack joins break. A moniker is the
 * symbol's STRUCTURAL path instead — `src/auth.ts#AuthService.login(2).` — so it
 * survives line moves and body edits; line/col live in separate start/end columns.
 *
 * Two modes (declared in the pack via `; caps … moniker:strict|lite`):
 *   - STRICT: ids from a real SCIP indexer (CI). Authoritative — safe to key `+`/`x`.
 *   - LITE:   heuristic ids from symbol metadata (no build toolchain). NON-authoritative
 *             hints. Lite ids carry structural disambiguators (arity, container, export,
 *             normalized signature); when two symbols can only be told apart by a FRAGILE
 *             scope ordinal, the assignment is marked `confident:false` and the chain MUST
 *             re-index (fresh master) rather than risk a probabilistic match keying the
 *             wrong row. A probabilistic match is never a primary key.
 *
 * Input is structured symbol metadata (what an analyzer — factstack, oxc/tree-sitter,
 * or a real SCIP index — already produces); this module computes the id, not the parse.
 */

// SCIP-ish descriptor suffix by symbol kind.
const SUFFIX = {
  function: '().', method: '().', constructor: '().', getter: '().', setter: '().',
  class: '#', interface: '#', type: '#', enum: '#', struct: '#', trait: '#',
  namespace: '/', module: '/', package: '/',
  field: '.', property: '.', const: '.', var: '.', let: '.', enummember: '.', parameter: '.',
};
const kindSuffix = (kind) => SUFFIX[String(kind || '').toLowerCase()] ?? '.';
const isCallable = (kind) => kindSuffix(kind) === '().';
// Collapse whitespace RUNS to a single space (don't strip it entirely): a space's
// PRESENCE inside a string-literal default stays significant (so `"a b"` vs `"ab"` remain
// distinct overloads — strip-all would alias them to one primary key), while incidental
// formatting (indent, run-length) normalizes. encPart escapes the surviving space later.
const normSig = (s) => String(s).replace(/\s+/g, ' ').trim();
// Make an identifier component UNAMBIGUOUS: percent-encode the structural delimiters
// (and whitespace/backslash) so two distinct (file, container, name) tuples can never
// assemble to the same descriptor, and the id stays wire-safe (no tab/newline/backslash).
// The file keeps `/` and `.` readable — only its `#` boundary is encoded; the symbol
// components (container, name, signature) encode every structural delimiter.
const pe = (re) => (s) => String(s).replace(re, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const encPart = pe(/[%#.()<>~/\\\t\n ]/g);
const encFile = pe(/[%#\\\t\n]/g);

/** The position-free descriptor for one symbol (NO line/col — those are data columns). */
export function descriptor(sym) {
  if (!sym || sym.file == null || sym.name == null) throw new Error('moniker: symbol needs at least { file, name }');
  const file = encFile(sym.file);
  const cont = sym.container ? encPart(sym.container) + '.' : '';
  const name = encPart(sym.name);
  // a callable carries its arity (a body edit keeps arity; a signature change is a real
  // API change and SHOULD produce a new id); other kinds use their structural suffix.
  const core = isCallable(sym.kind) ? `${name}(${sym.arity != null ? sym.arity : ''}).` : `${name}${kindSuffix(sym.kind)}`;
  return `${file}#${cont}${core}`;
}

/** Adopt an externally-produced, authoritative SCIP descriptor. */
export function strictMoniker(scipDescriptor) {
  const id = String(scipDescriptor || '').trim();
  if (!id) throw new Error('moniker: empty strict descriptor');
  if (/[\t\n\\]/.test(id)) throw new Error('moniker: strict descriptor has a tab/newline/backslash — not wire-safe');
  if (id === '-') throw new Error('moniker: strict descriptor is the null sentinel "-"');
  return { id, authority: 'strict' };
}

/**
 * Assign monikers to a whole symbol list and resolve collisions. Returns
 *   { mode, capToken, authoritative, confident, collisions, rows }
 * where rows = [{ moniker, ...sym }] with a UNIQUE moniker per row. `confident` is
 * false when any collision could only be resolved by a fragile scope ordinal — the
 * caller (chain producer) must then re-index instead of diffing.
 */
export function assignMonikers(symbols, opts = {}) {
  const mode = opts.mode === 'strict' ? 'strict' : 'lite';
  const base = symbols.map((s) => ({ sym: s, id: mode === 'strict' && s.moniker ? strictMoniker(s.moniker).id : descriptor(s) }));

  const byId = new Map();
  for (const b of base) { if (!byId.has(b.id)) byId.set(b.id, []); byId.get(b.id).push(b); }

  let confident = true;
  const collisions = [];
  for (const [id, group] of byId) {
    if (group.length === 1) continue;
    collisions.push({ id, count: group.length });
    const sigs = group.map((g) => (g.sym.signature != null ? encPart(normSig(g.sym.signature)) : null));
    const exports = group.map((g) => (g.sym.exported ? 'x' : 'i'));
    if (sigs.every(Boolean) && new Set(sigs).size === group.length) {
      group.forEach((g, i) => { g.id = `${id}<${sigs[i]}>`; });        // stable: normalized signature
    } else if (new Set(exports).size === group.length) {
      group.forEach((g, i) => { g.id = `${id}<${exports[i]}>`; });     // stable: export status
    } else {
      group.forEach((g, i) => { g.id = `${id}~${i}`; });               // fragile: a scope ordinal
      confident = false;                                               // -> the chain must re-index
    }
  }

  // Global uniqueness BACKSTOP: with encoded components, per-group disambiguation can't
  // alias across groups — but a caller-supplied strict moniker (or a future change) could.
  // Force any residual duplicate id unique, and mark the assignment not-confident.
  const assignedIds = new Set();
  for (const b of base) {
    if (assignedIds.has(b.id)) {
      let n = 1, cand; do { cand = `${b.id}~${n++}`; } while (assignedIds.has(cand));
      b.id = cand; confident = false;
    }
    assignedIds.add(b.id);
  }

  return {
    mode,
    capToken: `moniker:${mode}`,
    authoritative: mode === 'strict',
    confident,
    collisions,
    // Spread the symbol FIRST, then set the resolved moniker LAST so it always wins. In
    // strict mode the input symbol carries its own `moniker` field (line 75 reads it), so
    // spreading after `moniker: b.id` would clobber the disambiguated/backstopped id back
    // to the raw input — collapsing distinct overloads to a DUPLICATE primary key while
    // `confident` stays true (the safe re-index seam bypassed, computeDiff throws later).
    rows: base.map((b) => ({ ...b.sym, moniker: b.id })),
  };
}

/**
 * Is it safe to key a destructive `+`/`x` chain delta on this assignment? Strict
 * monikers are always authoritative; lite monikers only when no collision needed a
 * fragile disambiguator. When false, the chain producer must re-master (re-index).
 */
export function chainSafe(assigned) {
  // Safe to key a destructive +/x delta only when NO collision needed a fragile
  // (position-dependent) disambiguator — in EITHER mode. `authoritative` (strict) is a
  // separate property: whether the ids are canonical, not whether this snapshot is diffable.
  return assigned.confident === true;
}
