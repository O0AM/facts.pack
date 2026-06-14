"""Shared harness for the FactsPack web-app test suites.

Why a real HTTP origin (not file://): both pages persist theme + checklist state to
localStorage and use relative links (next-steps.html). Chromium restricts localStorage
on file:// origins, so a genuine http://127.0.0.1 origin is required to exercise the
real persistence paths rather than the page's silent try/catch fallback.

The server is a stdlib ThreadingHTTPServer on an ephemeral port, rooted at docs/, run
in a daemon thread — no external dependency, nothing left running after the process exits.

Reporting mirrors test/validate.mjs: every assertion prints PASS/FAIL and the process
exits non-zero if any check fails, so the suite composes with CI the same way.
"""
from __future__ import annotations

import contextlib
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

# Windows consoles default to cp1252 and cannot encode the ✅/❌/− glyphs we print
# (and that appear in the page content). Force UTF-8 so output is faithful everywhere.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

DOCS = Path(__file__).resolve().parents[2] / "docs"


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):  # silence per-request logging
        pass


@contextlib.contextmanager
def serve(directory: Path = DOCS):
    """Serve `directory` over http on an ephemeral port for the block's duration."""
    handler = functools.partial(_QuietHandler, directory=str(directory))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()


class Checker:
    """Tiny PASS/FAIL tally with the same surface as the Node battery's check()."""

    def __init__(self, title: str):
        self.title = title
        self.passed = 0
        self.failed = 0
        self._fails: list[str] = []

    def check(self, name: str, cond: bool, detail: str = "") -> bool:
        if cond:
            self.passed += 1
            print(f"  ✅ {name}" + (f"  · {detail}" if detail else ""))
        else:
            self.failed += 1
            self._fails.append(name + (f" — {detail}" if detail else ""))
            print(f"  ❌ {name}" + (f"  · {detail}" if detail else ""))
        return cond

    def section(self, label: str):
        print(f"\n—— {label}")

    def summary(self) -> int:
        total = self.passed + self.failed
        print(f"\n{self.passed}/{total} checks pass — {self.title}")
        if self._fails:
            print("FAILURES:")
            for f in self._fails:
                print("  - " + f)
        return 1 if self.failed else 0
