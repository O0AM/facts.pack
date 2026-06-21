/**
 * _util.mjs — shared helpers for the chain / moniker / symbol-chain test suites.
 *   memIO()   — an in-memory io adapter (read/write/list/remove over a Map),
 *               the same shape ChainStore expects from a disk adapter.
 *   makeOk(L) — bind the `[id] claim / pass / detail` reporter to a ledger L.
 */
export const memIO = () => {
  const m = new Map();
  return { read: (n) => (m.has(n) ? m.get(n) : null), write: (n, d) => m.set(n, d), list: () => [...m.keys()], remove: (n) => m.delete(n), _m: m };
};

export const makeOk = (L) => (id, claim, pass, detail, state = 'OK') => L.add(pass ? state : 'BROKEN', `[${id}] ${claim}`, detail);
