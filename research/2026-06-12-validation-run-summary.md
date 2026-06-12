# Detailed validation run — final report (2026-06-12)

Scope: the judgment-layer fixes + pack v0.2 + the merged in-flight Batch-3 engine state.
Method: mechanical sweep (inline) + 3 adversarial validators (workflow) + same-day fixes
for everything that landed, re-verified on the real targets after each fix.
Full evaluator reports: `2026-06-12-validation-{breakfixes,suppression,citations}.md`.

## Mechanical layer — all green

- Build clean; test suites green across the workspace (audit suite grew 49 → 63 in my
  scope during the run; webapp 27, cli 5, store 4, scanner 3).
- All 3 harnesses pass; static coverage now **91** (user's Batch 3 landed mid-run: +27
  new checks, internally consistent — every id in catalog, counts pinned).
- Deploy pack invariants on all 4 targets: v0.2 header, trailer counts exact vs
  audit.json, record counts exact, severity tally sums to fail count, zero absolute
  paths, 0/20 malformed hash lines, next_actions present.
- demo-app planted defects: all caught + the new CLR-003 static catch.
- ecom: byte-stable through every change (same 10 fails in 4 consecutive audits).

## Adversarial layer — verdicts

**Over-suppression audit: clean.** 7/7 removals verified correct against ground truth;
zero wrongly-suppressed; zero new blind spots; all survivors unchanged; plus a NEW
verified true positive (SEM-001 double-h1) — "precision improved strictly with zero
recall loss."

**Citation verification: 100%.** All 6 sampled CLR-003 citations char-exact with
hand-computed WCAG ratios (3.70–3.77:1 dark / 2.74:1 light); all 5 fails' citations
exact; demo contrast math verified (1.0073:1); the degenerate blank-line citation class
gone; **all 18 lms-lxp drift hashes independently recomputed and matching**.

**Break-the-fixes: 9 real weaknesses found (36 fixtures, 0 crashes) — all fixed same-day:**

| Finding | Fix |
|---|---|
| HIGH: isProductUi over-excluded `src/scripts/`, `app/examples/` etc. (blinding ALL static checks there) | tooling segments excluded everywhere EXCEPT directly under a product dir (src/app/pages/components/lib/routes/features); `apps/*/scripts/` stays tooling |
| HIGH: textContrast comment-blind both ways (FP via commented decoy; FN asserting pass) | `maskCss` (length-preserving) on all CSS sources |
| MOD: insideLabel prefix-match (`<label-group>`, `<LabelledField>`, comments, strings, attr values suppressed fails) | tag-boundary regexes + `maskMarkup` (comments + quoted spans) |
| MOD: htmlDocs — body-only page escaped all doc checks; `<html>` in comment faked a document | `<body>` added to the signature; maskMarkup applied |
| buttonType: commented `<form>` fabricated risk; `form=""` attribute ignored | maskMarkup + `el.has("form")` forces risk |
| fontDisplay: `url(` in comment | maskCss |
| parseColor: `!important` suffix hid failing pairs | suffix stripped |
| nested `var(--a, var(--b, #fff))` unresolvable | greedy fallback capture |
| background shorthand `#fff url(x.png)` skipped (white-on-white missed) | first-color-token extraction |

**Validation-of-the-validation — two MORE FP classes caught by re-auditing after fixes:**

1. **Theme-ambiguous variables**: `--fg-muted` defined per theme (dark + light) in one
   file; last-wins resolution paired light text with dark backgrounds → 8 fabricated
   criticals. Fix: a var with conflicting definitions is ambiguous → unresolvable —
   unless every definition is translucent (α<0.45), which keeps the translucency review.
2. **Function sub-token extraction**: `background: color-mix(in oklab, var(--ok) 10%, transparent)`
   → extractor grabbed the inner `var(--ok)` → solid-on-solid 1:1 fail. Fix: any
   non-rgb/var function in the value ⇒ backdrop incomputable ⇒ refuse, never guess.

Both pinned with regression tests (audit falsepos suite: 13 → 27 tests through this run).

## Final real-world state (factstack, commit d66ee21, 91-check engine)

**Grade A · 5 fails · 100% strict precision** — OPR-023, PER-003, ROB-017, SEM-001,
SEM-004: exactly the independently-verified true-positive set. CLR-003 honestly at
review with 10 hand-verified citations. Coverage 11–12% (up from 9% — Batch 3 firing).
CTO audit regenerated (826 points, derives 91); deploy rebuilt with clean v0.2 packs.

## Known open items (not mine to close this run)

- **3 failing Batch-3 tests** (TRU-004, NAV-020, STA-001 in `batch3.test.ts`) — the
  user's in-flight check logic (their fixtures don't use my utils; e.g. NAV-020's
  `role="navigation"` div isn't counted by their nav counter). Isolated; everything
  else green.
- **factstack agent-v4 implementation** — background agent still running; verify on
  completion against the orientation evaluator's confusion list.
- Residual documented limits: JSX label ancestry is raw-text based (AST parentage would
  be exact); hsl()/oklch() colors unsupported (skip, never guess); B3-class fragments
  with document tags in *unquoted* JS remain edge cases.

## The meta-lesson

Every fix this run introduced was itself re-attacked, and two fixes were found to
fabricate new failures (theme-mixing, sub-token extraction) before they could ship.
"Never guess" beat "extract more" three times today — the conservative refusal path is
what keeps 100% precision honest.
