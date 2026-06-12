# Real-world cross-evaluation — factstack × facts+ (2026-06-12)

Both tools ran on real repos; three independent evaluators verified every claim against
source. Full reports in `realworld/eval-{accuracy-factstack,orientation-factsplus,headtohead-ecom}.md`;
artifacts in `realworld/`.

## The runs

| Run | Time | Artifact |
|---|---|---|
| facts+ v0.2 audits factstack (~100-commit monorepo) | 873ms | 48KB pack · grade C · 11 fails |
| facts+ v0.2 audits ecom | 0.2s | 59KB pack · grade D · 10 fails |
| factstack analyzes facts+ | 664ms | 106KB agent-v3 map (228 files, 66.3k LOC) |
| factstack analyzes ecom | 148ms | 7KB agent-v3 map |

## Verdict 1 — facts+ accuracy on a real monorepo: trustworthy locator, immature judge

- **Mechanical layer excellent:** 94% of citations land on the exact line; commit pinned;
  "+N more" honest (evaluator's independent grep: 31 vs claimed 30); `related:` cross-links
  byte-exact (same line, same hash).
- **Judgment layer weak: TP 4 · FP 3 · MC 4 → strict precision ~36% (lenient ~73%).** Every
  "serious" finding failed scrutiny: a `<select>` wrapped in an implicit `<label>` called
  unlabelled (twice — FRM-001 + SEM-017 double-count one error); viewport/title checks fired
  on non-document HTML *fragments*; a local-only `@font-face` flagged for FOIT; console.log
  in build tooling called "shipped product code".
- **Misses a human catches:** statically-computable 3.75:1 contrast fail (CLR-003 sat
  unassessed in the review pile marked "critical"), emoji-as-icons with no aria-hidden,
  JS-only document controls.
- **Two small bugs found:** the severity tally omits `info` fails (says 10, there are 11);
  PRF-004 cited 2 wrong lines (end-of-file / comment lines near the real calls).
- **Grade-C at 9% coverage is transparently labeled but anchored entirely on findings that
  didn't survive** — the honest-coverage machinery works; the static checks need context.

**→ Backlog (judgment-layer, priority order):** ancestor-walk implicit labels (kills both FPs);
document-vs-fragment gating (no `<html>`/`<head>` → treat as fragment) for RSP-001/UND-002;
path-class awareness (build scripts/docs vs app code) for PRF-004/FRM-003; local-only
`@font-face` exemption for PRF-003; include `info` in the severity tally; promote computable
contrast pairs from the LLM tier to static.

## Verdict 2 — factstack orientation value: real, and v0.2 wire format validated by evidence

- **Orientation score 5/6** from the pack alone; line-exact answers for "where is scoring
  math" and "where is the pack built". The pack-equipped agent **clearly beats** a
  listing+grep agent (one ~26k-token read vs 5–10 search rounds, plus imp/churn/risks
  grep can never produce).
- **v0.2 wire-format items confirmed against confusions actually hit:** unified ids — YES
  (F6 and T3 are the same file, two lookups per row); legend lines — YES (undocumented
  `1386`, `read/churn/imp/comm/exp/conf` were most of the guesswork); top table — PARTIAL
  (fixes ranking ergonomics; the `imp` metric is barrel-biased toward 8-LOC index files).
- **factstack content bugs found:** `engine.ts` silently misread (`status ok` but
  `loc 0, lang other`) — *silently-wrong is worse than absent*; broken-import risk
  misdiagnosed (dist/ exists, analyzer just doesn't scan it); route path normalized to
  `/index` when the real path is `/`.

## Verdict 3 — head-to-head on ecom: the family thesis holds

- **Accuracy:** facts+ **5/5 byte-exact**; factstack **5/6** (route normalization artifact).
  Zero fabricated citations, zero contradictions between the tools.
- **Near-zero informational overlap** — and composition *changes decisions*: only the map
  reveals that **8 of facts+'s 10 fails live in orphaned prototype files nothing imports**
  (factstack's import graph + byte-identical duplicate detection), inverting the fix order.
- **Token economics:** map ≈ 1.8k tokens; fix-queue ≈ 14.8k; the right default —
  **map first, audit as gate, never one pretending to be the other.**
- Caveats: facts+ ran at 9% assessed coverage (LLM tier keyless); factstack's value should
  compound with repo size (unprovable on 33 files).

## One-line conclusion

v0.2's honesty machinery survived contact with reality (citations, counts, trailers, hashes
all verified); the next frontier is *judgment quality* in facts+'s static checks and
*content correctness* in factstack's analyzer — and the cross-run is the proof the two
products compose rather than compete.
