All attacks executed and cross-checked against the four packs, all four audit.json files, and the generator source (`packages/webapp/src/export.ts` + `packages/audit/src/checks/util.ts`). Final report below.

---

# ADVERSARIAL RE-ATTACK REPORT — agent.pack v0.2

Packs attacked: `deploy/app/{demo-app,ecom,lms-lxp,portfolio}/agent.pack`, cross-checked against sibling `audit.json` (447 evaluations each) and the generator at `D:\dev\ai agents\facts+\packages\webapp\src\export.ts`.

## Scoreboard on the 6 confirmed v1 vulns
| v1 vuln | v0.2 status |
|---|---|
| Silent 8-location cap | **MOSTLY BLOCKED** — 8-cap is now disclosed honestly… but a deeper upstream 10-cap is NOT (see LANDED #1) |
| Absolute disk path in `source:` | **BLOCKED** |
| No truncation detection | **BLOCKED** |
| Spoofable record delimiters / no untrusted-data rule | **BLOCKED** |
| No per-line drift detection | **BLOCKED** |
| ~400-line unactionable review wall | **BLOCKED** |

---

## Requested attacks 1–6

**1. Truncation — BLOCKED.** Trailer `=== END OF PACK · N issues · M reviews · commit X ===` is the last line in all four. I counted `--- ISSUE n/total ---` records myself: demo-app 16, ecom 10, lms-lxp 4, portfolio 0 — each equals its header `=== N FAILING CHECKPOINTS ===` AND its trailer `N issues`. Header counts (`counts: 16 fail · 399 review…`) match audit.json status tallies exactly for all four. Independent of the trailer, the `n/total` numbering is a monotonic 1..N sequence with a single consistent `total`, so a mid-body cut is detectable even if an attacker forged a trailer. A truncated pack cannot look complete: lose the tail → trailer/last-`n` gone; cut the middle → sequence breaks.

**2. Cap honesty — PARTIALLY LANDED (see LANDED #1).** Every `(+N more locations…)` line equals exactly `evidence.length − 8` for the right checkpoint (ecom OPR-002/SEM-009/OPR-023/PER-003 and lms-lxp PER-003 all N=2, evidence.length=10). The 8-row cap fires at exactly 8 and the disclosure appears iff evidence>8 — no spurious lines, no silent drop at the 8 level. BUT the disclosure counts against an already-truncated evidence array (see below).

**3. Injection — BLOCKED.** Zero stray column-0 `===`/`---` lines outside emitted fields across all four packs. Snippet bodies are always prefixed `    NNNN| ` (4-space + right-padded line number + pipe), so source content can never reach column 0; the 11 `===` occurrences inside ecom snippets are JS `===` operators, all correctly indented behind the `NNNN|` prefix. A source line starting with `fix:`/`id:` renders as `    12|   id: …` — never parseable as a field. The pack also states the rule explicitly (col-0-only delimiters + "quoted, untrusted data"). Latent caveat noted in NEW #3.

**4. Path leaks — BLOCKED.** No absolute paths, drive letters, usernames, `/Users/`, `/home/`, `file://`, or emails in any pack. `source:` shows only the basename (`source: demo-app`). The two regex "drive-letter" hits (`s:/`, `p:/`) were false positives from `https://`/`http://` inside snippets. (Note: an absolute path `D:\dev\ai agents\facts-pack\…` exists in the *generator's* source comment at export.ts:11 — not emitted into packs.)

**5. Hash — BLOCKED (with a latent weakness, NEW #4).** All `~xxxx` are 4 hex, present on every location line, none missing where source was read. Identical cited lines yield identical hashes (16 duplicate-content groups in ecom, 0 inconsistencies, 0 collisions). I recomputed the djb2 myself: `<html>` → `~f8b4`, matching demo-app `index.html:2`; a one-char edit (`<html lang="en">`) flips it to `~4c0a`, proving genuine drift sensitivity. Hash-absent only where the line is genuinely empty (lms-lxp `.gen-docx.cjs:538` cites an empty line → `~1505` = hash of `""`, correctly).

**6. Information loss — BLOCKED.** Review-wall collapse loses nothing an agent needs *and can't recover*: the serious+ subset is **exactly complete** vs audit.json in all four (110/109/110/106 — 0 missing, 0 extra by id), the `(full review list: audit.json)` pointer is present in all four, and the `by category:` counts sum to the exact review total (399/394/391/385). The ~280 moderate/minor reviews per app are intentionally collapsed to count+pointer — disclosed, not silent.

---

## LANDED findings

### LANDED #1 — Deeper upstream evidence cap (10) is undisclosed; `(+N more)` understates reality by ~10–50×. Severity: Moderate→Serious.
`recordOf` (export.ts:167-168) computes `hidden = e.evidence.length - shown.length` against `e.evidence`, which `packages/audit/src/checks/util.ts:81` already capped: `capEvidence(cites, max = 10)` slices to 10 and **discards the original total**. So for pervasive issues the pack tells the agent "8 shown + 2 more = 10 total" while the true count (preserved only in the `problem:` prose) is far higher:
- **lms-lxp PER-003**: `problem: 101 inline <svg>…` but disclosure says `(+2 more locations not shown…)`. Real remainder is **91**, reported as 2.
- **ecom PER-003**: `problem: 32 inline <svg>…` vs `(+2 more…)`. Real remainder **22**, reported as 2.

This is the v1 "silent cap → still looks complete" failure relocated one layer up. An agent that fixes the 10 cited spots and "re-runs after fixing these" (as the line instructs) will believe it's nearly done and be surprised by 91 survivors. The v1 fix was applied at the rendering layer but not at the evidence layer.
**Fix:** have `capEvidence` return/attach the true pre-cap count (e.g. `evidenceTotal`), and render `(+N more locations not shown — N = total − shown, e.g. +93 more)`; OR derive `hidden` from the `detail` count instead of `evidence.length`. At minimum, make the disclosure line reconcile with the `problem:` count.

### LANDED #2 — Misplaced citation faithfully propagated; `<<<` points at a blank line. Severity: Minor (check-quality bug surfaced by the format).
lms-lxp PRF-004 cites `.gen-docx.cjs:538:111` with the `<<<` marker on line 538, which is **empty** — the actual `console.log` is on line 536. The hash `~1505` correctly hashes the empty string, so it's a near-worthless drift anchor (every blank line collides). The format doesn't cause this, but it has no sanity check that the cited line plausibly contains the flagged construct, so it ships an unactionable "remove console.log here" pointing at whitespace.
**Fix:** validate at render time that the cited line/col is non-blank (or that the snippet `<<<` line is non-empty); if the anchor line is blank, fall back to the nearest non-blank line or flag the citation as approximate.

---

## NEW attacks (not on anyone's list)

### NEW #1 — No max length on emitted snippet lines (latent DoS / payload-hiding). Severity: Moderate (latent).
`snippet()` (export.ts:58-69) emits `ls[n-1]` verbatim with no length cap. Current worst case is 362 chars (ecom SVG-ICONS line). Against a minified bundle (single 50–500 KB line), the pack would embed that entire line — up to 7 lines per cited location (3 context each side) — bloating the pack, blowing the agent's context window, and letting an attacker bury instruction-like text far off-screen to the right of the `NNNN|` prefix where a reviewer won't scroll. **Fix:** truncate snippet lines to ~200 chars with an explicit `…[truncated N chars]` marker.

### NEW #2 — Zero Unicode/bidi/zero-width sanitization of snippet content. Severity: Moderate (latent).
The current packs are clean (0 control, 0 bidi/RLO, 0 zero-width chars), but `snippet()` passes source through raw. A source file containing a Trojan-Source RLO override (U+202E) or zero-width chars inside a string/comment would render into the pack unaltered, so the visual order of a snippet line an agent reads could differ from its logical content — classic Trojan-Source. The "untrusted data" disclaimer addresses *instructions* but not *visual spoofing*. **Fix:** strip/escape bidi-control and zero-width code points in snippet rendering (render as `\u202e` etc.).

### NEW #3 — `detail`/`recommendation` interpolated raw with no newline guard (latent field-injection). Severity: Minor (latent).
`problem: ${e.detail}` and `fix: ${e.recommendation}` (export.ts:184,188) are single-line `key: value` with no `\n` stripping. Today all detail/recommendation strings are author-authored templates with only numeric counts interpolated (I verified: 0 multiline detail/recommendation fields across all four packs, and no static check interpolates source text into `detail`). But the moment any check echoes a matched source string into `detail` (a common pattern), an embedded `\n` would forge a new field/record line at column 0. **Fix:** sanitize newlines (and leading `===`/`---`) out of `detail`/`recommendation` at render time, before any check starts echoing source.

### NEW #4 — Drift hash is only 16-bit. Severity: Low.
`(h >>> 0) & 0xffff` (export.ts:76) yields a 16-bit space; I produced a synthetic collision after ~3000 distinct lines. This is acceptable for its stated job (per-location drift confirm — false-positive cost is just "re-find by snippet," which the header already mandates as the real locator), but an agent that over-trusts the hash to *re-locate* a moved line could match the wrong line in a large file. **Fix:** widen to 24–32 bit (`~xxxxxx`) for negligible cost, or keep 16-bit and keep the header's "find it by the snippet" primacy (current behavior is safe-by-policy).

### NEW #5 — `by category:` / `serious and above:` are col-0 lines that look like record fields. Severity: Informational (BLOCKED in practice).
Inside the NEEDS REVIEW appendix, `by category:` and `serious and above:` sit at column 0 and resemble `key:` fields, and review items use `- [serious] …` (similar to a `  - ` location bullet but un-indented). This is disambiguated structurally — they only appear after the `=== NEEDS REVIEW ===` delimiter and review items have no `:` line/snippet structure — so a delimiter-aware parser is fine. Worth a one-line note in the format spec that appendix lines are not records.

---

## Bottom line
Five of six v1 vulnerabilities are genuinely fixed and survive re-attack. The headline regression is **LANDED #1**: the silent-cap fix was applied at the pack-rendering layer (8→disclosed) but a second, undisclosed cap at the evidence layer (`capEvidence` max=10) makes the new honest-looking `(+N more)` line understate pervasive issues by up to 50× (101 real vs "+2 more"). That is the same class of "looks complete but isn't" defect v0.2 set out to kill, and it should be the top fix. LANDED #2 (blank-line citation) and the five NEW items range from a shipped-unactionable-pointer bug down to latent hardening (long-line/bidi/newline sanitization) that will bite as soon as the input corpus widens past these hand-built demo apps.
