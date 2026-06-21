"""Behavioural test suite for the prior shipped feature: the landing-page converter
app (docs/index.html) and the other reachable doc pages.

The converter's BYTE correctness is already proven by test/validate.mjs (the engine is
extracted verbatim and round-tripped through the reference decoder). This suite proves
the UI WIRES that engine up correctly: detection gates the button, sample + custom
inputs both produce a sealed pack, the download/copy actions deliver the real bytes,
the savings simulator responds, and the theme key is shared across pages.

To avoid trusting the page's own "it worked" text, the converter test captures the real
downloaded .pack and RE-VERIFIES its SHA-256 trailer in Python — the same seal the
decoder checks — so a stubbed or corrupt output cannot pass.

Run: python test/webapp/test_landing_app.py
Exit 0 iff every check passes.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from playwright.sync_api import sync_playwright

from _harness import serve, Checker

PAGE = "/index.html"
DOC_PAGES = [
    "index.html",
    "next-steps.html",
    "next-steps.v2.html",
    "v0.index.html",
    "v1.editorial.index.html",
    "comparison-grid.html",
    "status.html",
    "eli5/caveman/index.html",
]


def reseal_matches(pack: str) -> tuple[bool, str]:
    """Recompute the trailer SHA-256 the way the decoder does and compare."""
    idx = pack.rfind("; end ")
    if idx < 0:
        return False, "no trailer line"
    body = pack[:idx]
    m = re.search(r"sha256=([0-9a-f]{12})", pack[idx:])
    if not m:
        return False, "no sha256 in trailer"
    calc = hashlib.sha256(body.encode("utf-8")).hexdigest()[:12]
    return calc == m.group(1), f"trailer={m.group(1)} recomputed={calc}"


def run() -> int:
    c = Checker("index.html (converter app) + reachable pages")
    with serve() as base, sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        url = base + PAGE

        # ---- LA. Load, console health, self-contained ----
        c.section("LA. Load, console health, self-contained")
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        errors: list[str] = []
        reqs: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: reqs.append(r.url))
        page.goto(url, wait_until="networkidle")
        c.check("LA1 title mentions FactsPack", "FactsPack" in page.title(), page.title())
        c.check("LA2 exactly one <h1>", page.locator("h1").count() == 1)
        c.check("LA3 no console errors on load", len(errors) == 0, "; ".join(errors[:3]))
        external = [u for u in reqs if not u.startswith(base) and not u.startswith("data:")]
        c.check("LA4 LIVE: zero external network requests (system fonts only)",
                len(external) == 0, f"external={external}" if external else "all same-origin")
        ctx.close()

        # ---- LB. Theme (index convention: light=data-theme=light, dark=absent) ----
        c.section("LB. Theme toggle + persistence + cross-page key sharing")
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        theme = lambda: page.get_attribute("html", "data-theme")
        btn_txt = lambda: page.locator("#theme-toggle").inner_text()
        c.check("LB1 default (dark scheme) has no data-theme attr", theme() is None, str(theme()))
        c.check("LB2 button offers '☀️ Light' in dark mode", "Light" in btn_txt(), btn_txt())
        page.locator("#theme-toggle").click()
        c.check("LB3 click sets data-theme=light", theme() == "light", str(theme()))
        c.check("LB4 button now offers '🌙 Dark'", "Dark" in btn_txt(), btn_txt())
        c.check("LB5 light persisted to fp-theme",
                page.evaluate("() => localStorage.getItem('fp-theme')") == "light")
        page.reload(wait_until="networkidle")
        c.check("LB6 light survives reload", theme() == "light", str(theme()))
        # Cross-page: the v2 review reads the SAME fp-theme key on the same origin.
        page.goto(base + "/next-steps.v2.html", wait_until="networkidle")
        c.check("LB7 fp-theme shared → v2 review also renders light",
                page.get_attribute("html", "data-theme") == "light",
                str(page.get_attribute("html", "data-theme")))
        ctx.close()

        # ---- LC. Converter core: detection gate, sample modes, custom input, seal ----
        c.section("LC. Converter (the shipped feature)")
        ctx = browser.new_context(
            color_scheme="dark", permissions=["clipboard-read", "clipboard-write"]
        )
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")

        # The convert handler is async (awaits crypto.subtle.digest), and #lab-out — once
        # shown — is never re-hidden, so "lab-out visible" is a STALE gate after the first
        # conversion. Wait instead for #lab-pre to hold a NEW pack, written only after the
        # seal completes. (This race was caught by the adversarial audit: deferring the
        # digest 600ms made the old gate read the prior sample's output.)
        def convert_via(trigger):
            prev = page.locator("#lab-pre").inner_text()
            trigger()
            page.wait_for_function(
                "prev => { const el = document.getElementById('lab-pre');"
                " return el && el.textContent.startsWith('# ') && el.textContent !== prev; }",
                arg=prev, timeout=8000,
            )
            return page.locator("#lab-pre").inner_text()

        c.check("LC1 convert button starts disabled (nothing pasted)",
                page.locator("#lab-convert").is_disabled())

        # Malformed JSON is detected as badjson and KEEPS the button disabled (the only
        # input-driven disable path; index.html:701/978).
        page.locator("#lab-in").fill('{ "id": 1, "role": "admin",, }')
        page.wait_for_function(
            "() => document.getElementById('lab-detect').textContent !== 'awaiting input'",
            timeout=4000)
        c.check("LC2 malformed JSON → detection says it does not parse",
                "does not parse" in page.locator("#lab-detect").inner_text(),
                page.locator("#lab-detect").inner_text())
        c.check("LC3 malformed JSON keeps the convert button disabled",
                page.locator("#lab-convert").is_disabled())
        page.locator("#lab-in").fill("")

        # The web emitter's producer is 'factspack-web/0.1' (validate.mjs:161); the spec's
        # '# facts/0.1' is only an illustrative producer value, not what ships.
        HEADER = "# factspack-web/0.1"
        pre = convert_via(lambda: page.locator("#smp-json").click())
        c.check("LC4 'try JSON' yields a pack header", pre.startswith(HEADER), pre[:30])
        c.check("LC5 JSON sample is lossless mode → data.pack",
                page.locator("#lab-name").inner_text() == "data.pack",
                page.locator("#lab-name").inner_text())
        c.check("LC6 pack listing carries a legend (;) and a sealed trailer",
                "\n; " in ("\n" + pre) and re.search(r"; end rows=\d+ tables=\d+ sha256=[0-9a-f]{12}", pre) is not None)

        # The five-agent token-cost table renders with the real published rates.
        c.check("LC7 cost table renders 5 agent rows",
                page.locator("#lab-cost-before .crow").count() == 5,
                str(page.locator("#lab-cost-before .crow").count()))
        cost_text = page.locator("#lab-cost-before").inner_text()
        for agent in ["Claude Code", "Cursor", "GitHub Copilot", "OpenAI Codex", "Gemini CLI"]:
            c.check(f"LC7·'{agent}' present in cost table", agent in cost_text)
        c.check("LC7·Claude Opus rate $5.00/M rendered", "$5.00" in cost_text, cost_text[:60])
        c.check("LC8 'after' cost column also renders 5 rows",
                page.locator("#lab-cost-after .crow").count() == 5)

        # Data-mode messaging.
        c.check("LC9 data mode: comparison title mentions 'pack'",
                "pack" in page.locator("#lab-cmp-title").inner_text().lower(),
                page.locator("#lab-cmp-title").inner_text())
        c.check("LC10 data mode: read-out sentence is populated",
                len(page.locator("#lab-read").inner_text()) > 10)

        # Code sample → map mode (distinct schema + messaging).
        code_pre = convert_via(lambda: page.locator("#smp-code").click())
        c.check("LC11 'try code' switches to map mode → map.pack",
                page.locator("#lab-name").inner_text() == "map.pack",
                page.locator("#lab-name").inner_text())
        c.check("LC12 map-pack uses the map-v1 schema header",
                "map-v1" in code_pre.split("\n")[0], code_pre.split("\n")[0][:60])
        c.check("LC13 map mode: comparison title mentions 'map-pack'",
                "map-pack" in page.locator("#lab-cmp-title").inner_text().lower(),
                page.locator("#lab-cmp-title").inner_text())

        # CSV sample → lossless.
        convert_via(lambda: page.locator("#smp-csv").click())
        c.check("LC14 'try CSV' is lossless → data.pack",
                page.locator("#lab-name").inner_text() == "data.pack",
                page.locator("#lab-name").inner_text())

        # Custom typed input goes through the 250ms debounce → button enables, then convert.
        page.locator("#lab-in").fill('[{"id":1,"role":"admin"},{"id":2,"role":"viewer"}]')
        page.wait_for_selector("#lab-convert:not([disabled])", timeout=4000)
        c.check("LC15 detection chip reacts to custom input",
                "detected" in page.locator("#lab-detect").inner_text(),
                page.locator("#lab-detect").inner_text())
        convert_via(lambda: page.locator("#lab-convert").click())

        # End-to-end seal proof: capture the REAL download and re-verify its SHA-256.
        with page.expect_download() as dl_info:
            page.locator("#lab-dl").click()
        dl = dl_info.value
        c.check("LC16 download filename is data.pack", dl.suggested_filename == "data.pack",
                dl.suggested_filename)
        content = open(dl.path(), encoding="utf-8").read()
        ok, detail = reseal_matches(content)
        c.check("LC17 downloaded pack's SHA-256 trailer recomputes correctly (real seal)", ok, detail)
        c.check("LC18 downloaded pack ends with a newline", content.endswith("\n"))

        # Copy actions deliver the real bytes (clipboard granted).
        page.locator("#lab-copy").click()
        clip = page.evaluate("() => navigator.clipboard.readText()")
        c.check("LC19 'Copy .pack only' puts the pack on the clipboard",
                clip.startswith(HEADER), clip[:30])
        page.locator("#lab-copy-prompt").click()
        clip2 = page.evaluate("() => navigator.clipboard.readText()")
        c.check("LC20 'Copy for my agent' prepends the teaching preamble then the pack",
                clip2.startswith("You are receiving data in the FactsPack") and HEADER in clip2,
                clip2[:40])
        # #copy-preamble lives inside the collapsed <details id="pipeline"> — open it first.
        page.locator("#pipeline").evaluate("d => { d.open = true; }")
        page.locator("#copy-preamble").click()
        clip3 = page.evaluate("() => navigator.clipboard.readText()")
        c.check("LC21 'Copy the agent preamble' copies the preamble alone (no pack)",
                "You are receiving data in the FactsPack" in clip3 and HEADER not in clip3)
        ctx.close()

        # ---- LD. Savings simulator (playground) ----
        c.section("LD. Savings simulator")
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        json_before = page.locator("#sim-json-l").inner_text()
        tsv_before = page.locator("#sim-tsv-l").inner_text()
        page.locator("#sim-rows-n").fill("40000")
        page.locator("#sim-rows-n").dispatch_event("input")
        page.wait_for_timeout(50)
        json_after = page.locator("#sim-json-l").inner_text()
        c.check("LD1 raising rows changes the JSON token estimate",
                json_after != json_before, f"{json_before} -> {json_after}")
        pack_label = page.locator("#sim-pack-l").inner_text()
        c.check("LD2 pack row reports a savings figure", "saves" in pack_label and "%" in pack_label,
                pack_label)
        c.check("LD3 read-out sentence is populated", len(page.locator("#sim-read").inner_text()) > 10)
        c.check("LD4 TSV label updates with the inputs",
                page.locator("#sim-tsv-l").inner_text() != tsv_before,
                f"{tsv_before} -> {page.locator('#sim-tsv-l').inner_text()}")
        # The range slider syncs into the paired number input (index.html:682).
        page.locator("#sim-rows-r").evaluate(
            "el => { el.value = '30000'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
        c.check("LD5 moving the rows slider mirrors into the rows number input",
                page.locator("#sim-rows-n").input_value() == "30000",
                page.locator("#sim-rows-n").input_value())
        # files > rows must clamp to rows (index.html:661).
        page.locator("#sim-rows-n").fill("150")
        page.locator("#sim-rows-n").dispatch_event("input")
        page.locator("#sim-files-n").fill("4000")
        page.locator("#sim-files-n").dispatch_event("input")
        page.wait_for_timeout(50)
        c.check("LD6 files clamps down to the row count when files > rows",
                page.locator("#sim-files-n").input_value() == "150",
                page.locator("#sim-files-n").input_value())
        ctx.close()

        # ---- LG. Copy fallback with NO clipboard permission ----
        c.section("LG. Clipboard fallback path (no permission)")
        ctx = browser.new_context(color_scheme="dark")  # deliberately no clipboard grant
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        prev = page.locator("#lab-pre").inner_text()
        page.locator("#smp-json").click()
        page.wait_for_function(
            "prev => { const el = document.getElementById('lab-pre');"
            " return el && el.textContent.startsWith('# ') && el.textContent !== prev; }",
            arg=prev, timeout=8000)
        before = page.locator("#lab-copy").inner_text()
        page.locator("#lab-copy").click()
        # Without permission, navigator.clipboard.writeText rejects → the handler runs its
        # execCommand fallback and surfaces feedback ('copied ✓' or a 'copy failed' message)
        # either way. We assert the fallback path executes and reports a result.
        page.wait_for_function(
            "b => document.getElementById('lab-copy').textContent !== b", arg=before, timeout=4000)
        after = page.locator("#lab-copy").inner_text()
        c.check("LG1 copy without permission still runs the fallback and reports a result",
                after != before and ("copied" in after.lower() or "failed" in after.lower()),
                f"'{before}' -> '{after}'")
        ctx.close()

        # ---- LH. XSS / hostile-input safety (proves the preview render is inert) ----
        c.section("LH. XSS / hostile-input safety")
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        dialogs: list[str] = []
        page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
        page.goto(url, wait_until="networkidle")
        hostile = [
            {"id": 1, "v": "<script>window.__pwned=1</script>"},
            {"id": 2, "v": "</span><img src=x onerror=\"window.__pwned=1\">"},
            {"id": 3, "v": "\"><svg onload=\"window.__pwned=1\">"},
            {"id": 4, "v": "mix > \" ' & < end"},
        ]
        page.locator("#lab-in").fill(json.dumps(hostile))
        page.wait_for_selector("#lab-convert:not([disabled])", timeout=4000)
        prev = page.locator("#lab-pre").inner_text()
        page.locator("#lab-convert").click()
        page.wait_for_function(
            "prev => { const el = document.getElementById('lab-pre');"
            " return el && el.textContent.startsWith('# ') && el.textContent !== prev; }",
            arg=prev, timeout=8000)
        c.check("LH1 no payload executed (window.__pwned stays unset)",
                page.evaluate("() => window.__pwned || 0") == 0,
                f"__pwned={page.evaluate('() => window.__pwned || 0')}")
        c.check("LH2 no dialog fired", len(dialogs) == 0, str(dialogs))
        foreign = page.evaluate(
            "() => document.querySelectorAll('#lab-pre script, #lab-pre img, #lab-pre svg').length")
        c.check("LH3 no foreign nodes injected into the preview", foreign == 0, f"foreign={foreign}")
        # The payload survives as inert TEXT (rendered via escHtml), not as live markup.
        c.check("LH4 hostile <script> renders as literal text, not an element",
                "<script>window.__pwned=1</script>" in page.locator("#lab-pre").inner_text())
        c.check("LH5 the preview's '<' is the &lt; entity in the HTML (tag injection blocked)",
                "&lt;script" in page.evaluate("() => document.getElementById('lab-pre').innerHTML").lower())
        ctx.close()

        # ---- LI. Encoder-fault surfacing (the contract the codec swap introduced) ----
        c.section("LI. Encoder-fault surfacing")
        # The convert handler wraps emitPack (reference codec encodeAuto) in try/catch.
        # When the codec throws a PackEncodeError, the ONLY surface is the detection chip
        # ('conversion failed: …') + #lab-status ('Conversion failed.') — the encoder swap's
        # new error-surfacing contract. No pasted input can currently reach this catch (table
        # names + header fields are internal constants and column names are whitespace-cleaned),
        # so to force a GENUINE codec throw we wrap encodeAuto to inject a tab into the schema
        # header — tripping the encoder's own 'Header.schema must not contain tab or newline'
        # PackEncodeError. The codec is reachable only because index.html exposes it on window
        # under automation (navigator.webdriver); that seam is inert for real users. This locks
        # the contract so a future regression to a SILENT failure (dropping the catch or
        # swallowing the message) is caught.
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        # The automation-only seam must expose the codec; if it ever stops, the override below
        # would silently no-op and the failure path would never run — so assert it loudly.
        c.check("LI0 codec is exposed on window under automation (the test seam)",
                page.evaluate(
                    "() => !!(window.__FPCODEC && typeof window.__FPCODEC.encodeAuto === 'function')"))
        # Wrap the REAL encodeAuto so its next call hits the encoder's header validation.
        page.evaluate(
            "() => { const orig = window.__FPCODEC.encodeAuto;"
            " window.__FPCODEC.encodeAuto = (opts) => orig(Object.assign({}, opts, {"
            "   header: Object.assign({}, opts.header,"
            "     { schema: String(opts.header.schema) + String.fromCharCode(9) + 'x' }) })); }")
        # Paste valid data so detection ENABLES the button — the failure must come from the
        # encoder, not from input gating.
        page.locator("#lab-in").fill('[{"id":1,"role":"admin"},{"id":2,"role":"viewer"}]')
        page.wait_for_selector("#lab-convert:not([disabled])", timeout=4000)
        page.locator("#lab-convert").click()
        page.wait_for_function(
            "() => document.getElementById('lab-detect').textContent.startsWith('conversion failed:')",
            timeout=4000)
        chip_txt = page.locator("#lab-detect").inner_text()
        status_txt = page.locator("#lab-status").inner_text()
        c.check("LI1 detection chip surfaces the failure ('conversion failed: …')",
                chip_txt.startswith("conversion failed:"), chip_txt)
        c.check("LI2 chip carries the real PackEncodeError text (a genuine codec throw)",
                "Header.schema" in chip_txt, chip_txt)
        c.check("LI3 #lab-status reads exactly 'Conversion failed.'",
                status_txt == "Conversion failed.", status_txt)
        c.check("LI4 chip drops its 'live' class on failure (visual failure state)",
                "live" not in (page.get_attribute("#lab-detect", "class") or "").split(),
                page.get_attribute("#lab-detect", "class"))
        ctx.close()

        # ---- LE. Deep-link opens collapsed accordions ----
        c.section("LE. Deep-link accordions")
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        page.goto(base + "/index.html#honest", wait_until="networkidle")
        c.check("LE1 navigating to #honest opens that <details>",
                page.locator("#honest").get_attribute("open") is not None)
        ctx.close()

        # ---- LF. Every reachable doc page loads cleanly ----
        c.section("LF. Reachable pages smoke test")
        for path in DOC_PAGES:
            ctx = browser.new_context(color_scheme="dark")
            page = ctx.new_page()
            errs: list[str] = []
            page.on("console", lambda m, E=errs: E.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e, E=errs: E.append(str(e)))
            resp = page.goto(base + "/" + path, wait_until="networkidle")
            status = resp.status if resp else 0
            c.check(f"LF·{path} HTTP 200", status == 200, str(status))
            c.check(f"LF·{path} has a non-empty <title>", len(page.title()) > 0, page.title()[:50])
            c.check(f"LF·{path} no console errors", len(errs) == 0, "; ".join(errs[:2]))
            ctx.close()

        # ---- LK. Input formats advertised + detected but not previously exercised ----
        # NDJSON/JSON-Lines and Markdown tables are advertised (index.html:297) and have their
        # own detect() branches (index.html:759/763), yet LC only covered JSON, CSV, and code.
        # Cover them end-to-end: detection label, lossless data.pack, row count, and real seal.
        c.section("LK. NDJSON + Markdown-table conversion (newly covered)")
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")

        def convert_expecting(text, label):
            # Wait for the detect chip to REACH the expected label (not merely 'not awaiting'),
            # so a stale label left by a prior conversion can't be mistaken for this one.
            page.locator("#lab-in").fill("")
            page.locator("#lab-in").fill(text)
            page.wait_for_function(
                "lbl => (document.getElementById('lab-detect').textContent || '').includes(lbl)",
                arg=label, timeout=4000)
            prev = page.locator("#lab-pre").inner_text()
            page.wait_for_selector("#lab-convert:not([disabled])", timeout=4000)
            page.locator("#lab-convert").click()
            page.wait_for_function(
                "prev => { const el = document.getElementById('lab-pre');"
                " return el && el.textContent.startsWith('# ') && el.textContent !== prev; }",
                arg=prev, timeout=8000)
            return page.locator("#lab-pre").inner_text()

        # NDJSON: three one-object-per-line records → a 3-row lossless data.pack.
        nd_pre = convert_expecting('{"id":1,"role":"admin"}\n{"id":2,"role":"user"}\n{"id":3,"role":"guest"}', "NDJSON")
        c.check("LK1 NDJSON detected as 'NDJSON / JSON Lines'",
                "NDJSON" in page.locator("#lab-detect").inner_text(), page.locator("#lab-detect").inner_text())
        c.check("LK2 NDJSON → lossless data.pack", page.locator("#lab-name").inner_text() == "data.pack",
                page.locator("#lab-name").inner_text())
        c.check("LK3 NDJSON trailer counts the 3 records", re.search(r"; end rows=3 ", nd_pre) is not None,
                nd_pre.splitlines()[-1] if nd_pre else "")
        c.check("LK4 NDJSON pack carries the admin/user/guest cells",
                all(v in nd_pre for v in ("admin", "user", "guest")))
        ok_nd, det_nd = reseal_matches(nd_pre)
        c.check("LK5 NDJSON pack's SHA-256 trailer recomputes (real seal)", ok_nd, det_nd)

        # Markdown table: header + separator + 2 data rows → a 2-row data.pack. (This is the
        # case the racy recon mis-read as NDJSON; the label-aware wait confirms the mdtable branch.)
        md_pre = convert_expecting("| id | role | active |\n|----|------|--------|\n| 1 | admin | yes |\n| 2 | user | no |", "Markdown table")
        c.check("LK6 Markdown table detected as 'Markdown table' (not shadowed by NDJSON)",
                "Markdown table" in page.locator("#lab-detect").inner_text(), page.locator("#lab-detect").inner_text())
        c.check("LK7 Markdown table → data.pack", page.locator("#lab-name").inner_text() == "data.pack",
                page.locator("#lab-name").inner_text())
        c.check("LK8 Markdown table yields 2 data rows (header + separator dropped)",
                re.search(r"; end rows=2 ", md_pre) is not None, md_pre.splitlines()[-1] if md_pre else "")
        c.check("LK9 Markdown-table pack carries the row cells (admin/user)",
                "admin" in md_pre and "user" in md_pre)
        ok_md, det_md = reseal_matches(md_pre)
        c.check("LK10 Markdown-table pack's SHA-256 trailer recomputes (real seal)", ok_md, det_md)
        ctx.close()

        browser.close()
    return c.summary()


if __name__ == "__main__":
    sys.exit(run())
