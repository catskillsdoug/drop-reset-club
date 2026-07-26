#!/usr/bin/env python3
"""Behavioral smoke test for reset.club.

Goes beyond uptime checks: loads pages in headless Chrome and verifies the
site actually *behaves* — every hero lane click moves the page, every in-page
anchor resolves, no console errors, no blank renders. Catches calendar-rot
bugs (e.g. the Summer lane pointing at a season section that stopped
rendering after Jul 14) that plain HTTP monitoring can't see.

Usage:
    python3 scripts/site-smoke.py            # test https://reset.club
    python3 scripts/site-smoke.py <base-url> # test a preview deploy

Requires: Google Chrome + `pip3 install websocket-client`.
Exit code 0 = all pass, 1 = failures (printed in the report).
"""

import json
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from html.parser import HTMLParser

try:
    import websocket
except ImportError:
    sys.exit("Missing dependency: pip3 install websocket-client")

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://reset.club"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CDP_PORT = 9333
UA = "reset-club-site-smoke/1.0"
# Text that should never appear in served HTML — template/data leaks.
LEAK_MARKERS = re.compile(r"\[object Object\]|\bundefined\b(?=[^a-zA-Z-])|NaN(?=[^a-zA-Z])")
# Pages fetched in the browser get this long for the SPA to settle.
RENDER_WAIT = 12
MAX_BROWSER_PAGES = 8

failures = []
warnings = []


def fail(check, detail):
    failures.append((check, detail))
    print(f"  FAIL  {check}: {detail}")


def ok(check, detail=""):
    print(f"  ok    {check}{' — ' + detail if detail else ''}")


def fetch(url, method="GET", timeout=30):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read() if method == "GET" else b""
            return r.status, dict(r.headers), body
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), b""
    except Exception as e:
        return None, {"error": str(e)}, b""


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)


def internal_links(html, page_url):
    p = LinkParser()
    try:
        p.feed(html)
    except Exception:
        pass
    out = set()
    for href in p.links:
        if href.startswith("#") or href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        if href.startswith("/"):
            out.add(BASE + href)
        elif href.startswith(BASE):
            out.add(href)
    return out


# ---------------------------------------------------------------- Phase A
print(f"\n=== Phase A: HTTP sweep ({BASE}) ===")
status, _, body = fetch(f"{BASE}/sitemap.xml")
seeds = set()
if status == 200:
    seeds = set(re.findall(r"<loc>([^<]+)</loc>", body.decode("utf-8", "replace")))
    ok("sitemap.xml", f"{len(seeds)} URLs")
else:
    fail("sitemap.xml", f"status {status}")
seeds.add(BASE + "/")

pages = {}  # url -> html (for pages that returned HTML)
to_check = sorted(seeds)
checked = set()
discovered = set()

for url in to_check:
    if url in checked:
        continue
    checked.add(url)
    status, headers, body = fetch(url)
    if status is None:
        fail("page fetch", f"{url} — {headers.get('error')}")
        continue
    if status >= 400:
        fail("page status", f"{url} — {status}")
        continue
    ctype = headers.get("Content-Type", "")
    if "text/html" in ctype:
        html = body.decode("utf-8", "replace")
        pages[url] = html
        leak = LEAK_MARKERS.search(re.sub(r"<script.*?</script>", "", html, flags=re.S))
        if leak:
            fail("template leak", f"{url} — {leak.group(0)!r} in HTML")
        discovered |= internal_links(html, url)
    ok(f"{status}", url)

# One-level crawl: check every internal link found on the seed pages.
print(f"\n--- link check: {len(discovered - checked)} discovered internal links ---")
for url in sorted(discovered - checked):
    checked.add(url)
    status, headers, body = fetch(url)
    if status is None or status >= 400:
        fail("broken link", f"{url} — {status or headers.get('error')}")
    else:
        if "text/html" in headers.get("Content-Type", "") and len(pages) < 40:
            pages[url] = body.decode("utf-8", "replace")
        ok(f"{status}", url)

# ---------------------------------------------------------------- Phase B/C
print("\n=== Phase B: browser deep checks ===")
chrome = subprocess.Popen(
    [CHROME, "--headless", "--disable-gpu", f"--remote-debugging-port={CDP_PORT}",
     "--remote-allow-origins=*", "--user-data-dir=/tmp/site-smoke-profile",
     "--window-size=1200,900", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    tabs = None
    for _ in range(30):
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json"))
            if tabs:
                break
        except Exception:
            time.sleep(0.5)
    if not tabs:
        sys.exit("Chrome CDP did not come up")
    tab = [t for t in tabs if t.get("type") == "page"][0]
    ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=60)
    msg_id = [0]
    events = []

    def send(method, params=None):
        msg_id[0] += 1
        ws.send(json.dumps({"id": msg_id[0], "method": method, "params": params or {}}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == msg_id[0]:
                return msg.get("result")
            events.append(msg)

    def js(expr):
        r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return (r or {}).get("result", {}).get("value")

    def drain_console():
        """Return console error/exception texts collected since last call."""
        out = []
        while events:
            ev = events.pop(0)
            m = ev.get("method")
            if m == "Runtime.exceptionThrown":
                d = ev["params"]["exceptionDetails"]
                out.append(d.get("exception", {}).get("description", d.get("text", "exception"))[:200])
            elif m == "Runtime.consoleAPICalled" and ev["params"]["type"] == "error":
                args = ev["params"].get("args", [])
                out.append(" ".join(str(a.get("value", a.get("description", "")))[:100] for a in args))
            elif m == "Network.responseReceived":
                resp = ev["params"]["response"]
                if resp["status"] >= 400 and BASE.split("//")[1] in resp["url"]:
                    out.append(f"HTTP {resp['status']} {resp['url'][:120]}")
        return out

    send("Page.enable")
    send("Runtime.enable")
    send("Network.enable")

    def load(url, wait=RENDER_WAIT):
        drain_console()
        send("Page.navigate", {"url": url})
        deadline = time.time() + wait
        while time.time() < deadline:
            if js("document.readyState") == "complete" and js(
                    "document.body && document.body.scrollHeight > window.innerHeight * 1.5"):
                time.sleep(2)  # let late JS settle
                return
            time.sleep(1)

    discovered_dom = set()
    browser_pages = [BASE + "/"] + [u for u in pages if u != BASE + "/"][:MAX_BROWSER_PAGES - 1]
    for url in browser_pages:
        print(f"\n  page: {url}")
        load(url)
        errs = drain_console()
        for e in errs:
            fail("console/network error", f"{url} — {e}")
        body_h = js("document.body ? document.body.scrollHeight : 0") or 0
        # Single-viewport pages are legal, but they must have visible text.
        text_len = js("document.body ? document.body.innerText.trim().length : 0") or 0
        if body_h < 1000 and text_len < 200:
            fail("blank render", f"{url} — body {body_h}px, only {text_len} chars of text")
        else:
            ok("renders", f"body {body_h}px, {text_len} chars")
        discovered_dom |= set(json.loads(js(
            f"""JSON.stringify([...document.querySelectorAll('a[href]')]
                .map(a => a.href)
                .filter(h => h.startsWith('{BASE}') && !h.includes('#')))""") or "[]"))
        # every in-page anchor must resolve
        missing = js("""JSON.stringify([...document.querySelectorAll('a[href^="#"]')]
            .map(a => a.getAttribute('href').slice(1)).filter(Boolean)
            .filter(id => !document.getElementById(id)))""")
        missing = json.loads(missing or "[]")
        for anchor in set(missing):
            fail("dead anchor", f"{url} — #{anchor} has no matching element")
        if not missing:
            ok("anchors resolve")

    # ------------------------------------------------------------ Phase C
    print("\n=== Phase C: homepage lane behavior ===")
    load(BASE + "/")
    lane_count = js("document.querySelectorAll('.hero-nav .hero-option').length") or 0
    if lane_count == 0:
        fail("hero lanes", "no .hero-option lanes rendered on homepage")
    lane_labels = json.loads(js(
        "JSON.stringify([...document.querySelectorAll('.hero-nav .hero-option')]"
        ".map(l => l.querySelector('.hero-option-label')?.textContent.trim() || '?'))") or "[]")
    for i in range(lane_count):
        load(BASE + "/")
        drain_console()
        before_url = js("location.href")
        js(f"document.querySelectorAll('.hero-nav .hero-option')[{i}]?.click()")
        time.sleep(3)
        scrolled = (js("Math.round(window.scrollY)") or 0) > 100
        navigated = js("location.href") != before_url
        overlay = bool(js(
            """[...document.querySelectorAll('[class*="overlay"]')]
               .some(el => el.offsetWidth > 0 && el.offsetHeight > 0)"""))
        label = lane_labels[i] if i < len(lane_labels) else f"#{i}"
        if scrolled or navigated or overlay:
            ok(f"lane '{label}'",
               "scrolled" if scrolled else ("navigated" if navigated else "opened overlay"))
        else:
            fail("dead lane", f"'{label}' click neither scrolled, navigated, nor opened an overlay")
        for e in drain_console():
            fail("console error on lane click", f"'{label}' — {e}")
finally:
    chrome.terminate()

# Content pages (about, faq, news, legal…) only exist in the rendered DOM —
# the SSR HTML has no footer — so they're harvested in Phase B and checked here.
print(f"\n--- rendered-DOM link check: {len(discovered_dom - checked)} new links ---")
for url in sorted(discovered_dom - checked):
    checked.add(url)
    status, headers, _ = fetch(url)
    if status is None or status >= 400:
        fail("broken link (rendered DOM)", f"{url} — {status or headers.get('error')}")
    else:
        ok(f"{status}", url)

# ---------------------------------------------------------------- Report
print("\n=== Report ===")
print(f"HTTP-checked {len(checked)} URLs, browser-checked {len(browser_pages)} pages, "
      f"{lane_count} hero lanes")
if failures:
    print(f"\n{len(failures)} FAILURE(S):")
    for check, detail in failures:
        print(f"  - [{check}] {detail}")
    sys.exit(1)
print("ALL PASS")
