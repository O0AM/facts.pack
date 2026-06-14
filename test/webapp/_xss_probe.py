"""Adversarial XSS / DOM-injection probe against the real docs/index.html converter.

Drives the SHIPPED page over a real HTTP origin with Chromium. Pastes hostile cell
values, clicks Convert, and inspects the rendered #lab-pre preview for:
  - any dialog firing (alert/confirm/prompt)  -> script execution
  - any injected element node (script/img/svg/span beyond our own wrappers)
Reports the exact payload, the resulting innerHTML, and the live DOM node count.
"""
from __future__ import annotations

import json
import sys

from playwright.sync_api import sync_playwright

from _harness import serve

# Each payload is a full textarea value. We craft CSV (lossless mode) and a
# single-line "file:" map case, plus a line engineered to break the
# <span class="ln ..."> wrapper.
PAYLOADS = {
    "script_tag": "name,note\na,<script>window.__pwned=1;alert('xss')</script>\nb,x\nc,y",
    "span_breakout_img": "name,note\na,</span><img src=x onerror=window.__pwned=1>\nb,x\nc,y",
    "attr_quote_svg": 'name,note\na,"><svg onload=window.__pwned=1>\nb,x\nc,y',
    "close_span_reopen": "name,note\na,</span><script>window.__pwned=1</script><span>\nb,x\nc,y",
    "raw_gt_quotes": 'name,note\na,plain > gt " quote \' apos\nb,x\nc,y',
    # A line whose FIRST char is attacker-controlled to try to perturb the class
    # lookup cls[l[0]] (the only place l influences an attribute).
    "first_char_control": "name,note\n\"<x onerror=window.__pwned=1>\",v\nb,x\nc,y",
}


def main() -> int:
    failures = 0
    with serve() as base, sync_playwright() as p:
        browser = p.chromium.launch()
        for label, payload in PAYLOADS.items():
            page = browser.new_page()
            dialogs = []
            page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
            page.goto(base + "/index.html")
            page.evaluate("window.__pwned = 0")
            # Baseline node count under the preview before conversion.
            page.fill("#lab-in", payload)
            page.click("#lab-convert")
            page.wait_for_selector("#lab-out:not([hidden])", timeout=5000)
            # Give any async (digest) + a microtask a beat; also force any
            # would-be onerror by checking image-completeness.
            page.wait_for_timeout(300)

            info = page.evaluate(
                """() => {
                    const pre = document.getElementById('lab-pre');
                    const all = pre.querySelectorAll('*');
                    const tags = {};
                    all.forEach(n => { const t = n.tagName.toLowerCase(); tags[t] = (tags[t]||0)+1; });
                    return {
                        pwned: window.__pwned,
                        innerHTML: pre.innerHTML,
                        tagCounts: tags,
                        hasScript: !!pre.querySelector('script'),
                        hasImg: !!pre.querySelector('img'),
                        hasSvg: !!pre.querySelector('svg'),
                        // Any element that is NOT one of our own <span class="ln ..."> wrappers?
                        foreignNodes: [...all].filter(n => !(n.tagName==='SPAN' && n.classList.contains('ln'))).map(n=>n.outerHTML),
                    };
                }"""
            )
            executed = bool(dialogs) or info["pwned"] == 1
            injected = info["hasScript"] or info["hasImg"] or info["hasSvg"] or len(info["foreignNodes"]) > 0
            verdict = "VULNERABLE" if (executed or injected) else "DEFENDED"
            if executed or injected:
                failures += 1
            print(f"\n=== [{label}] -> {verdict}")
            print(f"    dialogs={dialogs} pwned={info['pwned']}")
            print(f"    tagCounts={json.dumps(info['tagCounts'])}")
            print(f"    foreignNodes={json.dumps(info['foreignNodes'])}")
            # Trim innerHTML to the data rows for readability.
            ih = info["innerHTML"]
            print(f"    innerHTML(last 400)= ...{ih[-400:]}")
            page.close()
        browser.close()
    print(f"\n==== {'FAIL' if failures else 'PASS'}: {failures} payload(s) executed or injected a node ====")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
