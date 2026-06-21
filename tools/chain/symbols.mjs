/**
 * symbols.mjs — add a SYMBOL snapshot to a chain, keyed by SCIP monikers, SAFELY.
 *
 * This is the integration SEAM between the two pure modules: the moniker generator
 * (tools/moniker) and the chain producer (tools/chain). Neither imports the other —
 * they meet here. The point of this module is that the lite-safety rule can't be
 * forgotten at a call site: `addSymbols` ALWAYS passes `forceMaster` when the moniker
 * assignment is not chain-safe, so a fragile/probabilistic key forces a re-index
 * instead of keying a destructive `+`/`x` delta (spec §18).
 *
 * The emitted pack also self-declares its moniker mode via `; caps moniker:<mode>`,
 * so a consumer negotiates instead of sniffing.
 */
import { encode } from '../../test/factspack.bundle.mjs';
import { assignMonikers, chainSafe } from '../moniker/moniker.mjs';

/**
 * Encode a symbol snapshot as a moniker-keyed master pack. Column 0 is the moniker
 * (the stable, position-free key); `cols` names the remaining columns, read off each
 * symbol object. The pack declares `; caps moniker:<mode>`. Returns { bytes, assigned }.
 */
export function symbolsToPack(symbols, opts = {}) {
  const mode = opts.mode === 'strict' ? 'strict' : 'lite';
  const keyName = opts.keyName ?? 'sym';
  const cols = opts.cols ?? ['kind', 'name'];
  const table = opts.table ?? 'symbols';
  // Column names must be DISTINCT. The plain `encode` does not dedupe (only encodeAuto
  // does), so a keyName/cols overlap would ship a silently-malformed schema — a consumer
  // mapping columns by name would shadow the moniker key column (last-wins). Fail loud.
  const names = [keyName, ...cols];
  if (new Set(names).size !== names.length) throw new Error(`symbolsToPack: column names must be distinct, got [${names.join(', ')}]`);
  const assigned = assignMonikers(symbols, { mode });
  const columns = names.map((name) => ({ name }));
  const rows = assigned.rows.map((r) => [r.moniker, ...cols.map((c) => (r[c] != null ? String(r[c]) : null))]);
  // Defense-in-depth: the moniker is the chain primary key. assignMonikers guarantees
  // uniqueness, but a duplicate would silently corrupt a master and only surface as a
  // computeDiff throw on the NEXT add — so assert it here, at the producer, with a clear msg.
  const keys = rows.map((r) => r[0]);
  if (new Set(keys).size !== keys.length) throw new Error('symbolsToPack: duplicate moniker primary key — assignMonikers must return a unique moniker per row');
  const bytes = encode({
    header: { producer: opts.producer ?? 'factspack-symbols/0.1', schema: opts.schema ?? 'symbols-v1', snapshotId: opts.snapshotId ?? String(assigned.rows.length), rowCount: null, kind: 'master' },
    // the caps line precedes the schema (legend lines are emitted before the & tables).
    meta: { legend: [`caps ${assigned.capToken}`, `${table} ${[keyName, ...cols].join(' ')}`] },
    tables: [{ name: table, columns, rows }],
  });
  return { bytes, assigned };
}

/**
 * Add a symbol snapshot to a chain SAFELY. A not-chain-safe (fragile lite) assignment
 * forces a re-index master rather than keying a probabilistic delta — the safe path is
 * the ONLY path. Returns the store.add result plus { confident, collisions, capToken }.
 */
export function addSymbols(store, symbols, opts = {}) {
  const { bytes, assigned } = symbolsToPack(symbols, opts);
  const res = store.add(bytes, { ...opts, forceMaster: !chainSafe(assigned) });
  return { ...res, confident: assigned.confident, collisions: assigned.collisions, capToken: assigned.capToken };
}
