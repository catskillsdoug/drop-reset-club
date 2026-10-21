// Interaction driver for the in-place house calendar: a real browser, real touch, mouse and keys,
// a snapshot of what the screen shows, and the invariants a guest relies on.
// Not a vitest file (vitest only picks up *.test.* and *.spec.*).
import { createRequire } from 'node:module';
import { globSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The calendar's own files as committed at ref, so edits in the working tree (or a parallel
// session) do not change the code under test. app.js gets the preview's API origin.
const PINNED = ['house-calendar.js', 'calendar-core.js', 'app.js', 'styles.css'];
const pinCache = {};
function pinned(ref, file) {
  // E2E_OVERRIDE_DIR: serve a file from there instead (mutation checks, trying a local change).
  const o = process.env.E2E_OVERRIDE_DIR && path.join(process.env.E2E_OVERRIDE_DIR, file);
  if (o && existsSync(o)) {
    const src = readFileSync(o, 'utf8');
    return file === 'app.js' ? src.split("'https://book.reset.club'").join('location.origin') : src;
  }
  const k = ref + ':' + file;
  if (!(k in pinCache)) {
    let src = execFileSync('git', ['show', ref + ':v5/' + file], { cwd: REPO, maxBuffer: 64 << 20 }).toString('utf8');
    if (file === 'app.js') src = src.split("'https://book.reset.club'").join('location.origin');
    pinCache[k] = src;
  }
  return pinCache[k];
}

// playwright-core is not a repo dependency. Resolve it from the repo, then from E2E_DEPS (a folder
// holding node_modules/playwright-core).
export async function loadChromium() {
  const tries = [process.cwd() + '/', ...(process.env.E2E_DEPS ? [path.resolve(process.env.E2E_DEPS) + '/'] : [])];
  for (const base of tries) {
    try { return createRequire(base + 'noop.js')('playwright-core').chromium; } catch { /* next */ }
  }
  throw new Error('playwright-core not found. Install it outside the repo and set E2E_DEPS to that folder.');
}
export function headlessShell() {
  if (process.env.E2E_CHROME) return process.env.E2E_CHROME;
  const hit = globSync(process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell').sort().pop();
  if (!hit) throw new Error('chrome-headless-shell not found. Set E2E_CHROME.');
  return hit;
}

export const PROFILES = {
  phone375: { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, touch: true },
  phone390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, touch: true },
  desktop: { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1, touch: false },
};
export const HOUSES = { cook: 'COOK', hill4: 'HILL4', zink: 'ZINK', barn: 'BARN' };

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tripText = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return DOW[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
const money = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nightsText = (n) => n + (n === 1 ? ' night' : ' nights');

// Runs in the page before its own scripts: Book clicks are recorded and kept from navigating,
// and window.__e2e reads the calendar the way a person sees it.
function pageHelpers() {
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad = (n) => String(n).padStart(2, '0');
  window.__e2eBook = [];
  window.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.hc-book');
    if (a) { window.__e2eBook.push(a.href); e.preventDefault(); }
  }, true);
  function vv() { const v = window.visualViewport; return v ? { l: v.offsetLeft, t: v.offsetTop, w: v.width, h: v.height } : { l: 0, t: 0, w: innerWidth, h: innerHeight }; }
  function navBottom() { const n = document.getElementById('nav'); return n ? Math.max(0, n.getBoundingClientRect().bottom) : 0; }
  function cells() {
    const out = [];
    document.querySelectorAll('.hc .hc-month:not(.hc-month-pad)').forEach((blk, mi) => {
      const [mname, year] = (blk.getAttribute('aria-label') || '').split(' ');
      const m1 = MONL.indexOf(mname) + 1;
      const kids = [...blk.querySelector('.hc-grid').children];
      let lead = 0;
      while (lead < kids.length && kids[lead].tagName === 'SPAN' && !kids[lead].className && !kids[lead].textContent) lead++;
      kids.slice(lead).forEach((el, i) => out.push({ el, date: year + '-' + pad(m1) + '-' + pad(i + 1), mi, lead, cls: el.className.split(/\s+/).filter(Boolean), button: el.tagName === 'BUTTON', k: el.dataset.k || null, text: (el.querySelector('[aria-hidden]') || el).textContent }));
    });
    return out;
  }
  // Where a person would touch el, in visual viewport coordinates, and whether that point hits el.
  function point(el) {
    const r = el.getBoundingClientRect(), v = vv();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = el.closest('#nav') ? 0 : navBottom() + 6, bottom = v.t + v.h - 6;
    let hit = false;
    if (cx >= v.l && cx <= v.l + v.w && cy >= Math.max(top, v.t) && cy <= bottom) {
      const at = document.elementFromPoint(cx, cy);
      hit = !!at && (at === el || el.contains(at));
    }
    const dy = hit ? 0 : Math.round(cy - (v.t + v.h * 0.45));
    return { x: cx - v.l, y: cy - v.t, cx, cy, hit, dy, w: r.width, h: r.height };
  }
  function stripView() {
    const strip = document.querySelector('.hc .hc-strip');
    if (!strip) return null;
    const sr = strip.getBoundingClientRect();
    const blocks = [...strip.querySelectorAll('.hc-month:not(.hc-month-pad)')].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute('aria-label'), full: r.left >= sr.left - 1 && r.right <= sr.right + 1, part: r.right > sr.left + 1 && r.left < sr.right - 1 };
    });
    return { sl: strip.scrollLeft, cw: strip.clientWidth, sw: strip.scrollWidth, rect: { l: sr.left, t: sr.top, w: sr.width, h: sr.height }, blocks };
  }
  function inVisibleMonth(c, sv) { return sv.blocks[c.mi] && sv.blocks[c.mi].full; }
  function describe(el) {
    if (!el) return 'null';
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';
    return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '') + (el.dataset && el.dataset.k ? '{' + el.dataset.k + '}' : '');
  }
  function navLeft() { const n = document.querySelector('#nav .nav-left'); return n ? n.innerText.replace(/\s+/g, ' ').trim() : ''; }
  const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;

  window.__e2e = {
    snap() {
      const hc = document.querySelector('.hc');
      const v = vv();
      const s = {
        cals: document.querySelectorAll('.hc').length,
        openIds: [...document.querySelectorAll('.section.hc-open')].map((x) => x.id),
        nav: navLeft(), crumb: (document.getElementById('nav-crumb') || {}).textContent || '',
        scrollY: Math.round(scrollY), docScrollLeft: document.documentElement.scrollLeft, vvLeft: Math.round(v.l),
        snapStyle: document.documentElement.style.scrollSnapType, active: describe(document.activeElement),
        activeInHc: !!(hc && hc.contains(document.activeElement)), innerWidth, innerHeight,
        book: window.__e2eBook.slice(),
      };
      if (!hc) return s;
      s.loaded = !!hc.querySelector('.hc-strip');
      s.fallback = !s.loaded && !!hc.querySelector('.hc-msg');
      if (!s.loaded) return s;
      const sec = hc.closest('section');
      s.section = sec ? sec.id : null;
      const hr = document.querySelector('.hc-row');
      s.rowTop = hr ? Math.round(hr.getBoundingClientRect().top) : null;
      const sr = sec ? sec.getBoundingClientRect() : null;
      s.sectionUnderNav = !!sr && sr.top <= navBottom() + 2 && Math.min(sr.bottom, v.t + v.h) - navBottom() >= (v.h - navBottom()) * 0.85;
      s.twoUp = window.matchMedia('(min-width:768px)').matches;
      const cs = cells();
      s.months = [...document.querySelectorAll('.hc .hc-month:not(.hc-month-pad)')].map((blk) => {
        const head = [...blk.querySelectorAll('.hc-head .dp')].map((x) => x.textContent);
        const [mname, year] = (blk.getAttribute('aria-label') || '').split(' ');
        const m1 = MONL.indexOf(mname) + 1;
        const days = cs.filter((c) => c.el.closest('.hc-month') === blk);
        const first = Date.UTC(+year, m1 - 1, 1);
        return {
          label: blk.getAttribute('aria-label'), head,
          lead: days.length ? days[0].lead : -1, wantLead: (new Date(first).getUTCDay() + 6) % 7,
          count: days.length, wantCount: new Date(Date.UTC(+year, m1, 0)).getUTCDate(),
          badKeys: days.filter((c) => c.button && c.k !== c.date).map((c) => c.k + '!=' + c.date),
          badText: days.filter((c) => String(+c.date.slice(8)) !== String(c.text).trim()).map((c) => c.date + ':' + c.text),
        };
      });
      s.sel = cs.filter((c) => c.cls.some((k) => k === 'sel' || k === 'sel-s' || k === 'sel-e')).map((c) => ({ date: c.date, cls: c.cls.join(' '), button: c.button }));
      const td = (x) => { const b = hc.querySelector(x + ' .hc-trip-date'); return b ? { text: b.textContent, editing: b.classList.contains('editing'), disabled: b.disabled } : null; };
      s.arrive = td('.hc-trip-in'); s.depart = td('.hc-trip-out');
      const step = (label) => { const g = hc.querySelector('.hc-step[aria-label="' + label + '"]'); return g ? +g.querySelector('b').textContent || g.querySelector('b').textContent : null; };
      s.nights = step('Nights'); s.adults = step('Adults'); s.children = step('Children'); s.infants = step('Infants');
      const more = hc.querySelector('.hc-who > .hc-more');
      s.more = more ? more.getAttribute('aria-expanded') === 'true' : null;
      const foot = hc.querySelector('.hc-foot');
      s.hint = foot ? (foot.querySelector('.hc-hint') || {}).textContent || '' : '';
      s.amount = foot && foot.querySelector('.hc-amount') ? foot.querySelector('.hc-amount').textContent : null;
      const bk = foot && foot.querySelector('.hc-book');
      s.bookLive = !!bk && bk.tagName === 'A';
      s.bookHref = s.bookLive ? bk.href : null;
      s.bookDisabled = !!bk && bk.tagName === 'BUTTON' && bk.disabled;
      s.msgs = [...hc.querySelectorAll('.hc-msg')].map((x) => x.textContent);
      s.alts = hc.querySelectorAll('.hc-alts button').length;
      s.live = (hc.querySelector('.hc-sr[role=status]') || {}).textContent || '';
      s.strip = stripView();
      // Each stepper's minus and plus, by x, for the steppers on screen.
      s.steps = [...hc.querySelectorAll('.hc-step')].filter((g) => vis(g)).map((g) => {
        const [mi, pl] = g.querySelectorAll('button');
        return { label: g.getAttribute('aria-label'), minus: Math.round(mi.getBoundingClientRect().left), plus: Math.round(pl.getBoundingClientRect().left) };
      });
      s.rowsHidden = sec ? [...sec.querySelectorAll('a.hero-option')].filter((a) => !vis(a)).length : 0;
      return s;
    },
    // After close: is the house section back to normal?
    restored(id) {
      const sec = document.getElementById(id);
      if (!sec) return { missing: true };
      return {
        open: sec.classList.contains('hc-open'),
        hiddenRows: [...sec.querySelectorAll('a.hero-option')].filter((a) => !vis(a)).map((a) => a.textContent.trim()),
        hiddenFooter: [...sec.querySelectorAll('.footer-row')].filter((f) => !vis(f)).length,
        mount: !!sec.querySelector('.hc-mount'),
        expanded: [...sec.querySelectorAll('a.hero-option[aria-expanded]')].map((a) => a.getAttribute('aria-expanded')),
        snap: getComputedStyle(document.documentElement).scrollSnapType,
        snapStyle: document.documentElement.style.scrollSnapType,
      };
    },
    // A target for the next action. kind picks the element, f in [0,1) picks among candidates.
    target(kind, f, arg) {
      const sv = stripView();
      const pickOf = (list) => list.length ? list[Math.min(list.length - 1, Math.floor(f * list.length))] : null;
      let el = null, date = null;
      const cs = sv ? cells().filter((c) => inVisibleMonth(c, sv)) : [];
      const sel = cs.filter((c) => c.cls.includes('sel') || c.cls.includes('sel-s') || c.cls.includes('sel-e'));
      const dep = (cells().find((c) => c.cls.includes('sel-e')) || {}).date || null;
      const arr = (cells().find((c) => c.cls.includes('sel-s')) || {}).date || null;
      let c = null;
      if (kind === 'avail') c = pickOf(cs.filter((x) => x.button && !x.cls.includes('sel') && !x.cls.includes('sel-s')));
      else if (kind === 'blocked') c = pickOf(cs.filter((x) => !x.button));
      else if (kind === 'inside') c = pickOf(sel.filter((x) => !x.cls.includes('sel-e') && x.button));
      else if (kind === 'checkout') c = cs.find((x) => x.cls.includes('sel-e')) || null;
      else if (kind === 'later') c = pickOf(cs.filter((x) => x.button && dep && x.date > dep));
      else if (kind === 'anyday') c = pickOf(cs);
      else if (kind === 'date') c = cs.find((x) => x.date === arg) || null;
      else if (kind === 'monthEdge') { const m = cs.filter((x) => x.button); c = arg === 'end' ? m[m.length - 1] : m[0]; }
      if (c) { el = c.el; date = c.date; }
      const hc = document.querySelector('.hc');
      if (kind === 'row' || kind === 'rowLabel') {
        const sec = document.getElementById('property-' + arg);
        const row = sec && [...sec.querySelectorAll('a.hero-option')].find((a) => /stay\//.test(a.getAttribute('href') || ''));
        el = row && (kind === 'rowLabel' ? row.querySelector('.hero-option-label') : row);
      } else if (kind === 'closeX') el = document.querySelector('.hc-row .hero-option-arrow');
      else if (kind === 'dropsRow') {
        const sec = document.getElementById('property-' + arg);
        el = sec && [...sec.querySelectorAll('a.hero-option')].find((a) => /^Drops/.test(a.textContent.trim()));
      } else if (kind === 'crumb') el = document.getElementById('nav-crumb');
      else if (hc && kind === 'label') el = hc.querySelector('[aria-label="' + arg + '"]');
      else if (hc && kind === 'tripIn') el = hc.querySelector('.hc-trip-in .hc-trip-date');
      else if (hc && kind === 'tripOut') el = hc.querySelector('.hc-trip-out .hc-trip-date');
      else if (hc && kind === 'more') el = hc.querySelector('.hc-who > .hc-more');
      else if (hc && kind === 'book') el = hc.querySelector('.hc-foot .hc-book');
      else if (hc && kind === 'stripHead') el = sv && [...hc.querySelectorAll('.hc-month:not(.hc-month-pad)')].find((b, i) => sv.blocks[i].full)?.querySelector('.hc-head');
      else if (hc && kind === 'who') el = hc.querySelector('.hc-who .hc-trip');
      if (!el) return { ok: false, kind, arr, dep };
      const p = point(el);
      return { ok: true, kind, date, arr, dep, disabled: !!el.disabled, ...p };
    },
  };
}

export class Session {
  constructor(browser, profileName, opt = {}) {
    this.browser = browser; this.name = profileName; this.profile = PROFILES[profileName];
    this.base = opt.base || 'http://localhost:8788';
    this.stub = !!opt.stub; this.rand = rng(opt.seed || 1); this.ref = opt.ref || null;
    this.quotes = []; this.calendars = {}; this.errors = []; this.navAttempts = [];
    this.lastAction = Date.now(); this.preOpenCrumb = null; this.openHouse = null; this.labels = {};
    this.lastSettled = null; this.touch = this.profile.touch;
  }
  async start() {
    const { touch, ...ctxOpt } = this.profile;
    this.ctx = await this.browser.newContext(ctxOpt);
    this.page = await this.ctx.newPage();
    const page = this.page;
    await page.addInitScript(pageHelpers);
    page.on('console', (m) => { if (m.type() === 'error') this.errors.push({ at: this.step || 0, text: m.text().slice(0, 300) }); });
    page.on('pageerror', (e) => this.errors.push({ at: this.step || 0, text: 'pageerror: ' + e.message.slice(0, 300) }));
    page.on('response', (r) => { if (r.status() >= 400) this.errors.push({ at: this.step || 0, text: 'http ' + r.status() + ' ' + r.url().slice(0, 200), http: true }); });
    // Never leave the page for reset.club (Book, the fallback link).
    await page.route(/^https:\/\/reset\.club\//, (route) => { this.navAttempts.push(route.request().url()); route.abort(); });
    page.on('request', (req) => {
      if (!/\/v1\/quote/.test(req.url()) || req.method() !== 'POST') return;
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* keep */ }
      this.quotes.push({ req, body, key: body.property_code + '|' + body.checkin + '|' + body.checkout + '|' + body.guests, done: false, resp: null, at: this.step || 0 });
    });
    const finish = async (req, failed) => {
      const q = this.quotes.find((x) => x.req === req);
      if (!q) return;
      if (!failed) { try { const r = await req.response(); q.status = r.status(); q.resp = await r.json(); } catch { q.resp = null; } }
      q.done = true;
    };
    page.on('requestfinished', (req) => finish(req, false));
    page.on('requestfailed', (req) => finish(req, true));
    page.on('response', async (r) => {
      if (!/\/v1\/calendar/.test(r.url())) return;
      try { const j = await r.json(); this.calendars[j.property_code] = j; } catch { /* ignore */ }
    });
    if (this.ref) {
      await page.route(/\/v5\/(house-calendar\.js|calendar-core\.js|app\.js|styles\.css)(\?|$)/, (route) => {
        const file = PINNED.find((f) => new URL(route.request().url()).pathname.endsWith('/v5/' + f));
        route.fulfill({ status: 200, contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript', body: pinned(this.ref, file) });
      });
    }
    if (this.stub) {
      // Deterministic ok quote with a random delay, so responses come back out of order.
      await page.route('**/v1/quote', async (route) => {
        const b = JSON.parse(route.request().postData() || '{}');
        const n = nightsBetween(b.checkin, b.checkout);
        const total = n * 400 + b.guests * 10;
        await sleep(50 + Math.floor(this.rand() * 750));
        const slug = String(b.property_code).toLowerCase() + '-stub';
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          available: true, property_code: b.property_code, checkin: b.checkin, checkout: b.checkout, guests: b.guests,
          total: total.toFixed(2), total_cents: total * 100, nights: n,
          checkout_url: 'https://reset.club/stay/' + slug + '?or_arrival=' + b.checkin + '&or_departure=' + b.checkout + '&or_guests=' + b.guests,
        }) }).catch(() => {});
      });
    }
    if (this.touch) this.cdp = await this.ctx.newCDPSession(page);
    await page.goto(this.base + '/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#property-cook a.hero-option', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#rc-consent button')].find((x) => /decline/i.test(x.textContent)); if (b) b.click(); });
    this.errors = this.errors.filter(() => false); // the home page's own load noise is not the calendar's
    this.today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    this.baseSnap = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
  }
  async close() { await this.ctx.close().catch(() => {}); }

  // ---- input ----
  async tapAt(x, y) {
    if (this.touch) await this.page.touchscreen.tap(x, y);
    else await this.page.mouse.click(x, y);
  }
  async touchPath(pts, stepMs = 16) {
    const c = this.cdp;
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
    for (const [x, y] of pts.slice(1)) { await sleep(stepMs); await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); }
    await sleep(stepMs);
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async mousePath(pts) {
    const m = this.page.mouse;
    await m.move(pts[0][0], pts[0][1]); await m.down();
    for (const [x, y] of pts.slice(1)) await m.move(x, y, { steps: 2 });
    await m.up();
  }
  async drag(from, to, steps = 12) {
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]);
    if (this.touch) await this.touchPath(pts); else await this.mousePath(pts);
  }
  // Resolve a target, scrolling the page the way a person would until it is under a finger.
  async find(kind, f = 0, arg) {
    let t = await this.page.evaluate(([k, ff, a]) => window.__e2e.target(k, ff, a), [kind, f, arg]);
    for (let i = 0; i < 3 && t.ok && !t.hit; i++) {
      await this.page.evaluate((dy) => window.scrollBy(0, dy), t.dy || 1);
      await sleep(250);
      t = await this.page.evaluate(([k, ff, a]) => window.__e2e.target(k, ff, a), [kind, f, arg]);
    }
    return t;
  }
  async snap() { return this.page.evaluate(() => window.__e2e.snap()); }

  // Wait for the screen to stop moving and every quote to land.
  async settle(maxMs = 9000) {
    const t0 = Date.now(); let last = null, stable = 0;
    await sleep(120);
    while (Date.now() - t0 < maxMs) {
      const pend = this.quotes.some((q) => !q.done);
      const s = await this.page.evaluate(() => {
        const hc = document.querySelector('.hc');
        const strip = document.querySelector('.hc-strip');
        return [Math.round(scrollY), strip ? strip.scrollLeft : -1, innerWidth, hc && !hc.querySelector('.hc-strip') && !hc.querySelector('.hc-msg') ? 'loading' : ''];
      });
      const key = JSON.stringify(s);
      if (!pend && key === last && s[3] !== 'loading' && Date.now() - this.lastAction > 450) { if (++stable >= 2) return true; } else stable = 0;
      last = key; await sleep(100);
    }
    return false;
  }
}

// ---- invariants ----
// Each returns a list of { id, msg }. phase: 'now' (just after the action) or 'settled'.
export function checkInvariants(sess, s, ctx) {
  const out = [];
  const bad = (id, msg) => out.push({ id, msg });
  const settled = ctx.phase === 'settled';
  if (s.cals > 1 || s.openIds.length > 1) bad('one-open', 'open calendars ' + s.cals + ' sections ' + s.openIds.join(','));
  if (settled && s.docScrollLeft !== 0) bad('page-scroll-x', 'documentElement.scrollLeft ' + s.docScrollLeft);
  if (settled && s.vvLeft !== 0) bad('page-panned-x', 'the visual viewport is panned ' + s.vvLeft + 'px sideways (layout width ' + s.innerWidth + ')');
  if (ctx.keyboard && ctx.focusWasInHc && (s.active === 'body' || s.active === 'null')) bad('focus-lost', 'focus went to ' + s.active + ' after ' + ctx.action.t);
  if (s.cals && s.loaded) {
    // Month blocks: header, weekday offset, day count, keys.
    for (const m of s.months) {
      const [mname, year] = m.label.split(' ');
      if (m.head[0] !== mname.slice(0, 3).toUpperCase() || m.head[1] !== year) bad('month-header', m.label + ' header ' + m.head.join(' '));
      if (m.lead !== m.wantLead || m.count !== m.wantCount) bad('month-grid', m.label + ' lead ' + m.lead + '/' + m.wantLead + ' days ' + m.count + '/' + m.wantCount);
      if (m.badKeys.length || m.badText.length) bad('month-grid', m.label + ' ' + m.badKeys.concat(m.badText).slice(0, 3).join(','));
    }
    // Selection: one contiguous run, sel-s first, sel-e last, equal to the trip block.
    const sel = s.sel;
    let arr = null, dep = null;
    if (sel.length) {
      arr = sel[0].date; dep = sel[sel.length - 1].date;
      for (let i = 1; i < sel.length; i++) if (sel[i].date !== addDays(sel[i - 1].date, 1)) { bad('sel-contiguous', 'gap between ' + sel[i - 1].date + ' and ' + sel[i].date); break; }
      if (!/\bsel-s\b/.test(sel[0].cls) || sel.filter((c) => /\bsel-s\b/.test(c.cls)).length !== 1) bad('sel-ends', 'arrival cell ' + sel[0].date + ' ' + sel[0].cls);
      if (!/\bsel-e\b/.test(sel[sel.length - 1].cls) || sel.filter((c) => /\bsel-e\b/.test(c.cls)).length !== 1) bad('sel-ends', 'checkout cell ' + dep + ' ' + sel[sel.length - 1].cls);
      if (!s.arrive || s.arrive.text !== tripText(arr)) bad('trip-arrive', 'grid ' + arr + ' trip ' + (s.arrive && s.arrive.text));
      if (!s.depart || s.depart.text !== tripText(dep)) bad('trip-depart', 'grid ' + dep + ' trip ' + (s.depart && s.depart.text));
      if (s.nights !== nightsBetween(arr, dep)) bad('trip-nights', 'nights ' + s.nights + ' for ' + arr + '..' + dep);
      // Never over a booked or past night, min/max from /v1/calendar, no checkout on a no_checkout day.
      const code = HOUSES[(s.section || '').replace('property-', '')];
      const cal = sess.calendars[code];
      if (cal) {
        const map = new Map(cal.days.map((d) => [d.date, d]));
        const n = nightsBetween(arr, dep);
        if (arr < sess.today) bad('stay-past', 'arrival ' + arr + ' before today ' + sess.today);
        for (let i = 0; i < n; i++) { const d = map.get(addDays(arr, i)); if (!d || d.status !== 'available') { bad('stay-booked', 'night ' + addDays(arr, i) + ' is ' + (d ? d.status : 'unknown')); break; } }
        const a = map.get(arr);
        if (a && a.min_nights && n < a.min_nights) bad('stay-min', n + ' nights from ' + arr + ', min ' + a.min_nights);
        if (a && a.max_nights != null && n > a.max_nights) bad('stay-max', n + ' nights from ' + arr + ', max ' + a.max_nights);
        const d = map.get(dep);
        if (d && d.no_checkout) bad('stay-no-checkout', 'departure ' + dep + ' is no_checkout');
      }
    } else if (s.arrive && (s.arrive.text !== '–' || s.depart.text !== '–')) bad('trip-without-sel', 'trip ' + s.arrive.text + ' / ' + s.depart.text + ' with no selected cells');
    // Book: live only for a landed quote of exactly the shown stay and guests.
    const guests = (+s.adults || 0) + (+s.children || 0);
    if (s.bookLive) {
      if (!sel.length) bad('book-no-stay', 'Book live with no stay');
      if (/checking price/i.test(s.hint)) bad('book-while-checking', 'Book live while the foot says Checking price');
      const code = HOUSES[(s.section || '').replace('property-', '')];
      const key = code + '|' + arr + '|' + dep + '|' + guests;
      const mine = sess.quotes.filter((q) => q.body.property_code === code);
      const latest = mine[mine.length - 1];
      if (!latest) bad('book-no-quote', 'Book live, no quote was ever requested');
      else {
        if (latest.key !== key) bad('book-stale', 'Book live for screen ' + key + ' but the latest quote asked ' + latest.key);
        if (!latest.done) bad('book-in-flight', 'Book live while the quote ' + latest.key + ' is in flight');
        const landed = [...mine].reverse().find((q) => q.key === key && q.done && q.resp);
        if (landed && landed.resp.available === true) {
          const cents = typeof landed.resp.total_cents === 'number' ? landed.resp.total_cents : Math.round(Number(landed.resp.total) * 100);
          if (s.amount !== money(cents)) bad('book-total', 'shown ' + s.amount + ', quote for ' + key + ' is ' + money(cents));
          if (sess.stub) { const want = nightsBetween(arr, dep) * 400 + guests * 10; if (s.amount !== money(want * 100)) bad('book-total', 'shown ' + s.amount + ', stub total for screen is ' + money(want * 100)); }
        } else if (!landed) bad('book-no-quote', 'Book live, no landed quote for ' + key);
      }
      try {
        const u = new URL(s.bookHref);
        const qa = u.searchParams.get('or_arrival'), qd = u.searchParams.get('or_departure'), qg = u.searchParams.get('or_guests');
        if (qa !== arr || qd !== dep || +qg !== guests) bad('book-href', 'href ' + qa + '..' + qd + ' x' + qg + ', screen ' + arr + '..' + dep + ' x' + guests);
      } catch { bad('book-href', 'bad href ' + s.bookHref); }
      // The live region speaks the current stay and price.
      if (settled && sel.length && s.amount) {
        const label = (sess.labels[code] || '').toLowerCase();
        const n = nightsBetween(arr, dep);
        const want = ', ' + tripText(arr) + ' to ' + tripText(dep) + ', ' + nightsText(n) + ', ' + s.amount + ' all in';
        if (!s.live.endsWith(want) || (label && !s.live.toLowerCase().startsWith(label))) bad('live-region', 'live "' + s.live + '" want "' + (sess.labels[code] || '?') + want + '"');
      }
    }
    if (settled && s.hint && /^(No stays|Can't)/.test(s.hint) && s.live !== s.hint) bad('live-region', 'hint "' + s.hint + '" but live "' + s.live + '"');
    if (settled && /checking price/i.test(s.hint)) bad('stuck-checking', 'still Checking price after settling');
    // Crumb while open names the house.
    if (s.sectionUnderNav) {
      const code = HOUSES[(s.section || '').replace('property-', '')];
      const want = 'RESET · ' + (sess.labels[code] || '').toUpperCase();
      if (sess.labels[code] && s.nav !== want) bad('crumb-open', 'nav "' + s.nav + '" want "' + want + '"');
    }
    // Fixed-width number slot: every stepper's minus and plus line up.
    if (settled && s.steps && s.steps.length > 1) {
      const m = new Set(s.steps.map((x) => x.minus)), p = new Set(s.steps.map((x) => x.plus));
      if (Math.max(...m) - Math.min(...m) > 1 || Math.max(...p) - Math.min(...p) > 1) bad('stepper-align', s.steps.map((x) => x.label + ' -@' + x.minus + ' +@' + x.plus).join(', '));
    }
    // Phones: exactly one whole month after the strip settles. Desktop: two.
    if (settled && s.strip) {
      const full = s.strip.blocks.filter((b) => b.full).length;
      const want = s.twoUp ? 2 : 1;
      const lastPage = s.strip.sl + s.strip.cw >= s.strip.sw - 2;
      if (full !== want && !(want === 2 && full === 1 && lastPage)) bad('strip-months', full + ' whole months in view (want ' + want + ') at scrollLeft ' + s.strip.sl + ' view ' + s.strip.cw + ': ' + s.strip.blocks.filter((b) => b.part).map((b) => b.label + (b.full ? '' : '(part)')).join(', '));
    }
  }
  return out;
}
export { addDays, nightsBetween, tripText, money, sleep };
