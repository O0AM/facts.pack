# Web-app test suites

Playwright (Python) behavioural tests for the FactsPack pages, plus the grounding
battery that re-derives the `docs/next-steps.v2.html` review's factual claims from
observable bytes. Written under the project rule: **no claim is trusted because a
document, tool, or marketing line asserted it — every assertion is re-derived from the
real bytes or an executed experiment, and anything that cannot be verified from this
checkout is flagged, not assumed.**

## Layout

| File | What it proves |
|---|---|
| `_harness.py` | Shared: a stdlib threaded HTTP server (real origin so `localStorage` + relative links work) and a PASS/FAIL `Checker` mirroring `validate.mjs`. |
| `test_next_steps_v2.py` | The v2 review page's interactive behaviour: theme toggle + whitelist + persistence + **dark-system default**, findings/evidence filters (counts **derived from the live DOM**, not hardcoded), the gate-readiness checklist, disclosure markers, navigation, **live** self-contained/no-web-fonts check, mobile no-overflow, reduced-motion. |
| `test_landing_app.py` | The shipped converter app (`docs/index.html`): detection gate (incl. **badjson keeps Convert disabled**), JSON/code/CSV sample modes, custom-input path, **download SHA-256 re-verified in Python**, the five-agent cost table + map/data messaging, clipboard actions + **no-permission fallback**, savings simulator (sliders, file→row clamp, TSV), deep-link accordions, and a smoke test of every reachable doc page. |
| `../grounding.mjs` | Each of the 8 review findings + the §06 zero-hash-fallback risk + the AG dossier's path-separator/identity points + self-description claims turned into a runnable assertion against `FACTSPACK.md`, `factspack.bundle.mjs`, `validate.mjs`, and the live web engine — including decoder experiments (trailer-less pack accepted, diff header/trailer contradiction, no resource ceilings, real `-`→U+2212 loss, zero-hash pack rejected, Windows-vs-POSIX byte divergence). |
| `../languages.mjs` | Map-mode round-trips for Go/Rust/Java/CSS/HTML through the reference decoder (extends `validate.mjs`'s JS+Python map coverage). |
| `../security.mjs` | Security regression suite: pins the codec's **defended** properties (structural-injection neutralisation, tamper/truncation/zero-hash all fail closed, 10 malformed-input rejections) and the shipped-app escHtml hardening; **flags** (does not fail on) the consumer-side gaps (no decode resource ceilings, optional trailer, CRLF retention, empty-column-name acceptance, 48-bit checksum). |

## Running

```bash
# Everything (Node + Python), one exit code:
node test/run-all.mjs

# Individually:
node test/validate.mjs
node test/languages.mjs
node test/grounding.mjs
node test/security.mjs
python test/webapp/test_next_steps_v2.py
python test/webapp/test_landing_app.py
```

## Requirements

- **Node** ≥ 18 (the `.mjs` suites; uses `node:crypto`, `node:fs`).
- **Python** ≥ 3.8 with `playwright` and a Chromium binary:
  ```bash
  pip install playwright
  playwright install chromium
  ```
  `run-all.mjs` skips (does not fail) the Python suites if Playwright is absent.

## Design notes

- **Counts are derived, never hardcoded.** Filter tests read every row's
  `data-sev`/`data-kind`/`data-st` from the DOM, compute the expected visible count the
  same way the page's `wireFilter` does, then assert the page agrees. This catches drift
  in either the data or the filter logic, and grounds the printed "8 shown"/"18 shown".
- **Async-safe.** The `<details>` `toggle` event is asynchronous, so marker assertions
  use `wait_for_function` (auto-retry) rather than an immediate read — still failing
  honestly if the page never performs the flip.
- **Isolated state.** Each logical group uses a fresh browser context, so `localStorage`
  (theme, gate checklist) never leaks between checks; persistence is tested explicitly
  via reload within one context.
- **End-to-end seal proof.** The converter test captures the real downloaded `.pack` and
  recomputes its SHA-256 trailer exactly as the decoder does — a stub or corrupt output
  cannot pass.
- **No "conversion finished" by a stale gate.** `#lab-out` is shown once and never
  re-hidden, so the converter tests wait for `#lab-pre` to hold a *new* pack (written only
  after the async seal). Verified robust by re-deferring `crypto.subtle.digest` 600ms — the
  exact condition that made the naive `#lab-out:not([hidden])` gate read the previous
  sample's output.

## Provenance

These suites were hardened by an independent 5-lens adversarial audit (vacuous-assertion,
grounding-fidelity, coverage-gaps, race/false-pass, and an independent re-grounding that
re-derived the review's claims from source without seeing the test code). It found and we
fixed: one vacuous self-comparison (the `-`→U+2212 check now exercises the real engine),
one real timing race (the stale-gate above), and added coverage for the zero-hash seal
fallback, the `badjson` disable path, the cost table, map/data messaging, the simulator
sliders/clamp, and per-language map round-trips. The grounding-fidelity and re-grounding
lenses returned **zero** contradictions — the review document's factual claims hold against
the bytes.

A second independent 5-surface **security** probe (XSS, codec injection, DoS, integrity
bypass, parser confusion) found **zero exploitable vulnerabilities** — every property fails
closed. It surfaced one in-repo defense-in-depth item (escHtml escaped only `&`/`<`), now
patched to a full entity-escaper in `docs/index.html` (a behaviour-preserving change outside
the engine-extraction region, so `validate.mjs` is unaffected). The DoS / optional-trailer /
CRLF / empty-column / 48-bit-checksum gaps are **consumer-side or canonical-spec** (the
shipped app is encode-only and never decodes untrusted packs); they are governance-gated, so
`security.mjs` flags them with evidence rather than editing the wire format or vendored codec.
