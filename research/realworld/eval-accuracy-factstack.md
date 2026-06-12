All verification complete. Compiling the final report.

---

## Per-issue verdicts (pack @ commit d66ee21, repo HEAD matches)

**ISSUE 1 — FRM-001 (serious), Review.tsx:191** · **FALSE POSITIVE**
Line exists verbatim, but the `<select>` is nested inside a `<label>` (Review.tsx:175–226) containing the text "Baseline" — implicit labelling per WCAG H44; "almost certainly unlabelled" is wrong, and "serious" is unwarranted.

**ISSUE 2 — RSP-001 (serious), legacy/prototype/design-ref.html:1 + scripts/graph-block.html:1** · **MISLEADING-CONTEXT**
Lines match (files do lack viewport meta), but neither is a document: design-ref.html starts with `<style>` (a token reference sheet) and graph-block.html is pure JavaScript in an .html wrapper — fragments injected into the prototype index (which itself has a proper viewport meta), so "page won't adapt to mobile" can't occur.

**ISSUE 3 — SEM-017 (serious), Review.tsx:191** · **FALSE POSITIVE**
Identical line and identical wrong claim as Issue 1 — one incorrect finding double-counted as two serious fails.

**ISSUE 4 — OPR-023 (moderate), briefing.html:591/605/765/779 (×2 copies)** · **TRUE POSITIVE**
All cited lines verified verbatim; h2→h4 skips are real (h2 at 602 → h4 at 605, no h3), h1 count = 1 matches the "0 docs without exactly one h1" claim, and briefing.html is genuinely user-facing (served from the dashboard About tab; docs copy is byte-identical).

**ISSUE 5 — PER-003 (moderate), ThemeToggle.tsx:60/76/86 + graph-block.html:156–159** · **TRUE POSITIVE** (severity caveat)
All 7 lines verified; the SVGs really lack aria-hidden/labels and the fix is correct — but the 3 ThemeToggle icons sit inside a `<button aria-label="Theme: …">` (line 147) so impact is minimal, and the other 4 are in a legacy prototype fragment; "moderate" overstates it.

**ISSUE 6 — SEM-004 (moderate), same briefing.html lines** · **TRUE POSITIVE**
Same verified real skips as Issue 4 — but it's the same underlying defect counted as a second failing checkpoint (disclosed via "related:").

**ISSUE 7 — UND-002 (moderate), same two legacy fragments** · **MISLEADING-CONTEXT**
Files genuinely lack `<title>`, but they're non-document fragments that never name a tab/bookmark — same wrong-context as Issue 2.

**ISSUE 8 — FRM-003 (minor), docs/cto-audit-phase6.html:99–100 + impeccable-audit files:600/568** · **MISLEADING-CONTEXT**
All 4 lines verified verbatim and the buttons do lack `type=`, but cto-audit-phase6.html contains zero `<form>` elements (grep: 0), so the stated accidental-submit risk is impossible there; these are static doc-report pages, not app UI. Minor severity keeps it close to an acceptable lint nit.

**ISSUE 9 — PRF-003 (minor), app.css:19** · **FALSE POSITIVE**
Line verified, but the @font-face has only `local('Helvetica Neue'), local('Arial')` sources — it's a metric-matching fallback face with no network fetch, so FOIT cannot occur and font-display is meaningless; the actual web font loads from Google Fonts with `display=swap` (apps/ui-remix/index.html:20).

**ISSUE 10 — PRF-004 (minor), "47 console statements"** · **MISLEADING-CONTEXT** (with 2 broken citations)
Real console.log calls exist, but: `.pnpmfile.cjs:95:104` cites an empty end-of-file line (the real console.log is at line 84) and `check-bundle-size.mjs:297:36` cites a comment line (real calls at 294/302) — 2 of 8 shown citations point at wrong lines; worse, every shown location is dev/build tooling (.claude skill scripts, pnpm hook, bundle-size reporter) where console output is the intended interface, not "shipped product code."

**ISSUE 11 — ROB-017 (info), MarginColumn.tsx:64** · **TRUE POSITIVE**
Verified: `<aside role="complementary">` — `aside`'s implicit role is complementary, so the explicit role is redundant; "info" severity is exactly right.

## Side-assessments

1. **"+N more" honesty (SEM-004, "+22 more" → 30 total skips):** I independently counted heading-level skips across all 69 HTML files: **31 excluding `apps/ui-remix/dist`, 35 including it** — vs the claimed 30. Off by one (likely my naive regex counting a heading inside markup the audit's parser excludes). Honest. (PRF-004's 47 console claim is also plausible: my repo-wide count is ~60 lines, ~53 after excluding the `.agents` duplicate dir and coverage artifacts.)
2. **Cross-link check (FRM-001 → "related: SEM-017"):** genuinely the same line — both cite `apps/ui-remix/src/routes/Review.tsx:191:15` with identical hash `~5de3`. Accurate. Note the same mechanism is how one defect (or one false positive) becomes two failing checkpoints.
3. **What the audit missed** (sampled docs/briefing.html, docs/cto-audit-phase6.html, apps/ui-remix/src):
   - **Decorative emoji icons with no aria-hidden** — briefing.html uses 🔒🛡️📦📐 etc. as icons and contains zero `aria-hidden` attributes in the entire 896-line file; the SVG check (PER-003) doesn't cover emoji, which screen readers announce as "lock", "shield"….
   - **Sub-AA text contrast that is statically computable** — `--fg-faint: rgba(230,232,234,0.44)` on `#0B0D10` = **3.75:1** (below the 4.5:1 AA threshold), used 18× in briefing.html for real copy; both literals are in the same file, yet CLR-003 sits unassessed in the 397-item review pile flagged "critical."
   - **JS-only document controls** — cto-audit-phase6.html's expand/collapse toolbar is entirely inline `onclick` with no no-JS fallback; the audit flagged those buttons' missing `type=` (an impossible risk — no form) while missing the actual progressive-enhancement problem.
   - Counterpoint: the real app shell is strong (skip link, `<main id="main" tabIndex={-1}>` with focus management, prefers-reduced-motion in 6 files) — the audit finding almost nothing in the live UI is consistent with reality.
4. **Is grade C fair at 9% coverage?** Transparently labeled (severity-weighted, "of assessed", coverage stated) but not a fair characterization: all 3 "serious" fails driving the weighted grade are the 2 FPs + 1 wrong-context flag — zero serious findings survive scrutiny — while all 7 unassessed criticals (including a likely-real contrast failure) could push it the other way. Also internally inconsistent: the severity tally (0+3+4+3) sums to 10, but there are 11 fails (Issue 11's "info" severity isn't in the tally). A C at 9% coverage anchors a judgment the data can't support in either direction.

## Tally and verdict

**TP 4 · FP 3 · MC 4** (of 11 issues; collapsing duplicates: 3 TP / 2 FP / 4 MC across 9 unique defects)

**Precision:** issue-level strict precision **~36%** (4/11 TP); lenient (TP+MC, "real pattern at cited location") **~73%** (8/11). Line-citation accuracy **~94%** (31/33 shown locations match the cited line exactly; both misses are in PRF-004). The "+N more" counts and cross-links check out.

**Verdict:** The pack's mechanical layer is excellent — commit pinned, 94% of citations land on the exact line, counts and cross-links are honest — but its judgment layer is weak: every "serious" finding is either flat wrong (a labelled select called unlabelled, twice; a local-only @font-face flagged for FOIT) or context-blind (viewport/title checks on non-document fragments, console.log in build scripts called "shipped code"). The findings that are true (heading skips, SVG labels, redundant role) are real but low-stakes, while the highest-impact real issues a human would catch (3.75:1 contrast, unhidden emoji icons) sit unassessed in the 397-item review backlog. Net: trustworthy as a *locator*, not yet trustworthy as a *judge* — a developer following this pack top-to-bottom would spend their first hour "fixing" three things that aren't broken.
