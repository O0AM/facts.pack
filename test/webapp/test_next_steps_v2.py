"""Behavioural test suite for docs/next-steps.v2.html (the latest "Next Steps" review).

Every point the page makes interactively is exercised against a real Chromium + real
http origin. Filter counts are DERIVED FROM THE LIVE DOM, never hardcoded, so the tests
verify the page's own JS is consistent with its data — and incidentally ground the
printed "8 shown" / "18 shown" labels. The "single self-contained file, no web fonts"
claim from the colophon is verified LIVE via the network panel, not taken on faith.

Run: python test/webapp/test_next_steps_v2.py
Exit 0 iff every check passes.
"""
from __future__ import annotations

import sys
from playwright.sync_api import sync_playwright

from _harness import serve, Checker

PAGE = "/next-steps.v2.html"


def run() -> int:
    c = Checker("next-steps.v2.html")
    with serve() as base, sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        url = base + PAGE

        # ---- A. Load & integrity (+ live self-contained verification) ----
        c.section("A. Load, console health, self-contained")
        ctx = browser.new_context(color_scheme="light")
        page = ctx.new_page()
        console_errors: list[str] = []
        requests: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("request", lambda r: requests.append(r.url))
        page.goto(url, wait_until="networkidle")

        c.check("A1 title is the review title", "FactsPack Final Review" in page.title(), page.title())
        c.check("A2 exactly one <h1>", page.locator("h1").count() == 1)
        c.check("A3 <html lang> is en", page.get_attribute("html", "lang") == "en")
        c.check("A4 #main landmark present", page.locator("#main").count() == 1)
        # Self-contained: every network request must be same-origin as our server.
        external = [u for u in requests if not u.startswith(base) and not u.startswith("data:")]
        c.check("A5 LIVE: zero external network requests (no web fonts/CDN)",
                len(external) == 0, f"external={external}" if external else "all same-origin")
        c.check("A6 no console errors on load", len(console_errors) == 0, "; ".join(console_errors[:3]))
        ctx.close()

        # ---- B. Theme toggle (v2 convention: explicit data-theme dark/light) ----
        c.section("B. Theme toggle + whitelist init + persistence")
        ctx = browser.new_context(color_scheme="light")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        root = lambda: page.get_attribute("html", "data-theme")
        label = lambda: page.locator("#theme-label").inner_text()

        c.check("B1 default theme is light under light color-scheme", root() == "light", root())
        c.check("B2 label reads 'Dark' when light (offers the switch)", label() == "Dark", label())
        page.locator("#theme").click()
        c.check("B3 click toggles to dark", root() == "dark", root())
        c.check("B4 label flips to 'Light'", label() == "Light", label())
        stored = page.evaluate("() => localStorage.getItem('fp-theme')")
        c.check("B5 dark persisted to localStorage fp-theme", stored == "dark", str(stored))
        page.reload(wait_until="networkidle")
        c.check("B6 dark survives reload (read back from storage)", root() == "dark", root())
        page.locator("#theme").click()
        c.check("B7 toggling back to light persists", root() == "light"
                and page.evaluate("() => localStorage.getItem('fp-theme')") == "light", root())
        # Whitelist: a garbage stored value must NOT be honoured.
        page.evaluate("() => localStorage.setItem('fp-theme', 'banana')")
        page.reload(wait_until="networkidle")
        c.check("B8 whitelist: garbage 'banana' falls back to a valid theme",
                root() in ("light", "dark"), root())
        ctx.close()

        # B9: with no stored theme and a DARK system preference, the init script's
        # system-default branch must yield dark (the B1-B8 contexts only exercise light).
        ctx = browser.new_context(color_scheme="dark")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        page.evaluate("() => localStorage.removeItem('fp-theme')")
        page.reload(wait_until="networkidle")
        c.check("B9 no stored theme + dark system → defaults to dark",
                page.get_attribute("html", "data-theme") == "dark",
                str(page.get_attribute("html", "data-theme")))
        ctx.close()

        # ---- C. Findings filter (counts derived from the DOM) ----
        c.section("C. Findings ledger filter + search")
        ctx = browser.new_context(color_scheme="light")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")

        entries = page.eval_on_selector_all(
            "#ledger .entry",
            "els => els.map(e => ({sev: e.getAttribute('data-sev'), kind: e.getAttribute('data-kind')}))",
        )
        total_f = len(entries)
        c.check("C1 ledger has 8 findings", total_f == 8, str(total_f))
        c.check("C2 initial label '8 shown' matches actual count",
                page.locator("#f-count").inner_text().strip() == f"{total_f} shown",
                page.locator("#f-count").inner_text())

        def visible_findings() -> int:
            return page.locator("#ledger .entry:not([hidden])").count()

        def shown_label() -> int:
            return int(page.locator("#f-count").inner_text().split()[0])

        # wireFilter matches data-sev OR data-kind OR data-st == active.
        for key in ["critical", "high", "verified", "integration", "all"]:
            expected = total_f if key == "all" else sum(
                1 for e in entries if e["sev"] == key or e["kind"] == key
            )
            page.locator(f"#findings .chip[data-fil='{key}']").click()
            vis, lab = visible_findings(), shown_label()
            c.check(f"C·filter '{key}': visible rows == DOM-derived expected ({expected})",
                    vis == expected, f"visible={vis}")
            c.check(f"C·filter '{key}': label matches visible", lab == vis, f"label={lab}, visible={vis}")
            pressed = page.get_attribute(f"#findings .chip[data-fil='{key}']", "aria-pressed")
            c.check(f"C·filter '{key}': chip aria-pressed true", pressed == "true", str(pressed))

        # Search narrows; the term 'trailer' appears in findings 02 & 03 explanations.
        page.locator("#findings .chip[data-fil='all']").click()
        page.locator("#findings [data-search]").fill("trailer")
        s_vis = visible_findings()
        c.check("C·search 'trailer' narrows the ledger", 0 < s_vis < total_f, f"visible={s_vis}")
        c.check("C·search label matches visible", shown_label() == s_vis, f"label={shown_label()}")
        page.locator("#findings [data-search]").fill("")
        c.check("C·clearing search restores all", visible_findings() == total_f, str(visible_findings()))
        ctx.close()

        # ---- D. Evidence matrix filter ----
        c.section("D. Evidence matrix filter + search")
        ctx = browser.new_context(color_scheme="light")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")

        states = page.eval_on_selector_all(
            "#matrix-rows .mrow:not(.h)", "els => els.map(e => e.getAttribute('data-st'))"
        )
        total_m = len(states)
        c.check("D1 matrix has 18 claim rows", total_m == 18, str(total_m))
        c.check("D2 initial label '18 shown' matches actual count",
                page.locator("#m-count").inner_text().strip() == f"{total_m} shown",
                page.locator("#m-count").inner_text())

        def visible_rows() -> int:
            return page.locator("#matrix-rows .mrow:not(.h):not([hidden])").count()

        def m_label() -> int:
            return int(page.locator("#m-count").inner_text().split()[0])

        for key in ["measured", "reported", "hypothesis", "unknown", "rejected", "all"]:
            expected = total_m if key == "all" else sum(1 for s in states if s == key)
            page.locator(f"#matrix .chip[data-st='{key}']").click()
            vis = visible_rows()
            c.check(f"D·state '{key}': visible == DOM-derived expected ({expected})",
                    vis == expected, f"visible={vis}")
            c.check(f"D·state '{key}': label matches visible", m_label() == vis, f"label={m_label()}")
        page.locator("#matrix .chip[data-st='all']").click()
        page.locator("#matrix [data-search]").fill("benchmark")
        c.check("D·search 'benchmark' narrows the matrix", 0 < visible_rows() < total_m, str(visible_rows()))
        ctx.close()

        # ---- E. Gate-readiness checklist (counts + persistence + reset) ----
        c.section("E. Gate-readiness checklist")
        ctx = browser.new_context(color_scheme="light")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        boxes = page.locator("[data-gate-check]")
        n_boxes = boxes.count()
        outcome = lambda: page.locator("#readiness-outcome").inner_text()

        c.check("E1 eight gate checkboxes", n_boxes == 8, str(n_boxes))
        c.check("E2 initial outcome '0 of 8 marked' + NO-GO",
                "0 of 8 marked" in outcome() and "NO-GO" in outcome(), outcome())
        for i in range(3):
            boxes.nth(i).check()
        c.check("E3 after 3 checks outcome reads '3 of 8' and still NO-GO",
                "3 of 8 marked" in outcome() and "NO-GO" in outcome(), outcome())
        for i in range(3, 8):
            boxes.nth(i).check()
        c.check("E4 all 8 checked → '8 of 8 marked locally' + governance caveat",
                "8 of 8 marked locally" in outcome() and "governance" in outcome().lower(), outcome())
        saved = page.evaluate("() => JSON.parse(localStorage.getItem('fp-gate-checks') || '[]').length")
        c.check("E5 all 8 persisted to fp-gate-checks", saved == 8, str(saved))
        page.reload(wait_until="networkidle")
        c.check("E6 checks survive reload",
                page.locator("[data-gate-check]:checked").count() == 8,
                str(page.locator("[data-gate-check]:checked").count()))
        page.locator("#reset-checks").click()
        c.check("E7 reset clears every box",
                page.locator("[data-gate-check]:checked").count() == 0,
                str(page.locator("[data-gate-check]:checked").count()))
        c.check("E8 reset restores '0 of 8 marked' NO-GO", "0 of 8 marked" in outcome(), outcome())
        ctx.close()

        # ---- F. Findings disclosure markers ----
        c.section("F. Details open/close marker")
        ctx = browser.new_context(color_scheme="light")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        first = page.locator("#ledger .entry").first
        mark = first.locator(".open-mark")

        def mark_becomes(val: str) -> bool:
            # The <details> 'toggle' event is async per spec, so the marker updates a
            # tick after the click. Wait (auto-retry) for it to settle — this still
            # fails honestly if the page never performs the flip.
            try:
                page.wait_for_function(
                    "v => document.querySelector('#ledger .entry .open-mark')"
                    ".textContent.trim() === v",
                    arg=val, timeout=2000,
                )
                return True
            except Exception:
                return False

        c.check("F1 closed entry shows '+'", mark.inner_text().strip() == "+", mark.inner_text())
        first.locator("summary").click()
        c.check("F2 opening sets [open]", first.get_attribute("open") is not None)
        c.check("F3 open marker flips to '−' (waits for async toggle)", mark_becomes("−"), mark.inner_text())
        first.locator("summary").click()
        c.check("F4 closing flips marker back to '+' (waits for async toggle)", mark_becomes("+"), mark.inner_text())
        ctx.close()

        # ---- G. Navigation, anchors, prior-edition link, skip link ----
        c.section("G. Navigation + cross-page links")
        ctx = browser.new_context(color_scheme="light")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        for anchor in ["verdict", "findings", "roadmap", "agents-sec"]:
            c.check(f"G·anchor #{anchor} resolves to an element",
                    page.locator(f"#{anchor}").count() == 1)
        c.check("G·skip link targets #main", page.get_attribute(".skip", "href") == "#main")
        prior_href = page.get_attribute("a:has-text('Prior edition')", "href")
        c.check("G·'Prior edition' points at next-steps.html", prior_href == "next-steps.html", str(prior_href))
        resp = page.request.get(base + "/" + prior_href)
        c.check("G·prior edition is reachable (HTTP 200)", resp.status == 200, str(resp.status))
        ctx.close()

        # ---- H. Responsive: no horizontal overflow (grounds the 'mobile overflow' finding) ----
        c.section("H. Responsive overflow")
        for w in (375, 414, 768):
            ctx = browser.new_context(viewport={"width": w, "height": 900})
            page = ctx.new_page()
            page.goto(url, wait_until="networkidle")
            metrics = page.evaluate(
                "() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})"
            )
            overflow = metrics["sw"] - metrics["cw"]
            c.check(f"H·@{w}px no horizontal page overflow (Δ={overflow}px)",
                    overflow <= 1, f"scrollWidth={metrics['sw']} clientWidth={metrics['cw']}")
            ctx.close()

        # ---- I. Reduced motion: reveal content is not stuck invisible ----
        c.section("I. Reduced-motion safety")
        ctx = browser.new_context(reduced_motion="reduce", color_scheme="light")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        min_op = page.evaluate(
            "() => Math.min(...[...document.querySelectorAll('.reveal')]"
            ".map(e => parseFloat(getComputedStyle(e).opacity)))"
        )
        c.check("I·all .reveal elements fully opaque under reduced motion",
                min_op == 1, f"min opacity={min_op}")
        ctx.close()

        browser.close()
    return c.summary()


if __name__ == "__main__":
    sys.exit(run())
