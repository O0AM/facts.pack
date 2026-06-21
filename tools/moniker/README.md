# SCIP-style symbol monikers

Stable, **position-free** symbol identity so the [diff chain](../chain/README.md) works on
symbols, not just file paths. A line-number id (`path#name@line`) churns on any edit *above*
a symbol — making every diff noisy and breaking cross-pack joins. A moniker is the symbol's
**structural path** instead:

```
src/auth.ts#AuthService.login(2).
```

so it survives line moves and body edits. Line/col live in separate `start`/`end` data
columns. Spec: [`FACTSPACK.md` §18](../../FACTSPACK.md).

## API

```js
import { descriptor, assignMonikers, chainSafe, strictMoniker } from './moniker.mjs';

descriptor({ file:'src/auth.ts', container:'AuthService', name:'login', kind:'method', arity:2 });
// -> "src/auth.ts#AuthService.login(2)."

const a = assignMonikers(symbols, { mode:'lite' });
// -> { rows:[{moniker, ...sym}], confident, collisions, capToken:'moniker:lite', authoritative }

chainSafe(a);  // true only if no collision needed a fragile (position-dependent) disambiguator
```

- **`descriptor(sym)`** — the position-free id for one symbol (`{ file, name, kind?, container?, arity? }`).
  Structural delimiters in `file`/`container`/`name` are percent-encoded so two distinct symbols
  can never assemble to the same id.
- **`assignMonikers(symbols, {mode})`** — assign a UNIQUE moniker to every symbol, resolving
  collisions (overloads) by signature → export status → a fragile scope ordinal. Returns
  `confident:false` when any collision could only be resolved by the fragile ordinal.
- **`chainSafe(assigned)`** — safe to key a destructive `+`/`x` chain delta? (`= confident`).
- **`strictMoniker(scip)`** — adopt an authoritative SCIP descriptor (validated wire-safe).

## Two modes (declared via `; caps moniker:strict|lite`)

| mode | source | authority |
|---|---|---|
| **strict** | a real SCIP indexer (CI) | authoritative — safe to key deltas |
| **lite** | heuristic symbol metadata (no build) | a hint with structural disambiguators; a collision that needs a fragile ordinal flags `confident:false` |

**The lite-safety rule:** a probabilistic match is never a primary key. When `chainSafe()` is
false, the chain must **re-index** (a fresh master), not key a `+`/`x`. The safe integration —
[`tools/chain/symbols.mjs`](../chain/symbols.mjs) `addSymbols()` — enforces this for you
(`forceMaster: !chainSafe(...)`), so the safe path is the only path.

Tests: [`test/moniker.mjs`](../../test/moniker.mjs), [`test/symbolchain.mjs`](../../test/symbolchain.mjs).
Real-world run across 14 GitHub repos: [`research/realworld-chain-moniker-test.mjs`](../../research/realworld-chain-moniker-test.mjs).
