#!/usr/bin/env node
// House calendar interaction harness. A scripted pass against the real API, then a seeded monkey
// pass with a stubbed /v1/quote, checking the invariants in driver.mjs after every action.
//
//   node tests/e2e/calendar.e2e.mjs [--base http://localhost:8788] [--seed N] [--runs N]
//        [--actions N] [--profiles phone375,phone390,desktop] [--scripted-only] [--monkey-only]
//        [--no-shrink] [--replay file.json] [--ref <git ref> | --working-tree]
//
// Needs a running preview (drops site with /v1/* reaching agent-booking) and playwright-core
// resolvable from the repo or from E2E_DEPS (a folder with node_modules/playwright-core).
// The calendar files (v5 house-calendar.js, calendar-core.js, app.js, styles.css) are served from
// git ref --ref (default HEAD), so parallel edits on disk do not move the code under test.
// E2E_OVERRIDE_DIR serves any of those files from a folder instead (mutation checks).
// E2E_TRACE=1 screenshots every step. --plan 0,2 picks scripted plans by index.
// Writes screenshots, DOM state, logs and shrunk repros to tests/e2e/out/<stamp>/ (gitignored).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadChromium, headlessShell, Session, PROFILES, HOUSES, rng, checkInvariants, sleep, addDays } from './driver.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const BASE = opt('base', 'http://localhost:8788');
const SEED = +opt('seed', 1);
const RUNS = +opt('runs', 3);
const ACTIONS = +opt('actions', 100);
const PROFS = opt('profiles', 'phone375,phone390,desktop').split(',');
// Serve the calendar's files from this git ref (default HEAD), not from the running preview's disk.
const REF = flag('working-tree') ? null : opt('ref', 'HEAD');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(OUT, { recursive: true });
const LABELS = { COOK: 'Cook House', HILL4: 'Hill Studio', ZINK: 'Zink Cabin', BARN: 'Barn Studio' };

let shotN = 0;
const log = (...a) => console.log(...a);

// ---- actions ----
// Every action is plain data, so a failing sequence can be replayed and shrunk.
async function act(sess, a) {
  const p = sess.page;
  const info = { keyboard: false };
  const tap = async (kind, f, arg) => {
    const t = await sess.find(kind, f, arg);
    if (!t.ok) return (info.skipped = kind + ' not found', null);
    if (!t.hit) return (info.skipped = kind + ' not reachable', null);
    await sess.tapAt(t.x, t.y);
    return t;
  };
  switch (a.t) {
    case 'open': {
      const s = await sess.snap();
      if (!s.cals) sess.preOpenCrumb = null;
      const t = await sess.find('row', 0, a.h);
      if (!t.ok || !t.hit) { info.skipped = 'row not reachable'; break; }
      if (!s.cals) sess.preOpenCrumb = (await sess.snap()).nav;
      info.prevSection = s.section || null; info.target = 'property-' + a.h;
      await sess.tapAt(t.x, t.y);
      sess.openHouse = a.h;
      break;
    }
    case 'closeX': case 'closeRow': {
      const s = await sess.snap();
      if (!s.cals) { info.skipped = 'nothing open'; break; }
      info.prevSection = s.section; info.closing = true;
      const t = a.t === 'closeX' ? await tap('closeX', 0) : await tap('rowLabel', 0, s.section.replace('property-', ''));
      if (!t) break;
      break;
    }
    case 'tap': info.tap = await tap(a.kind, a.f); break; // avail, blocked, inside, checkout, later
    case 'dbl': {
      const t = a.kind === 'nightsPlus' ? await sess.find('label', 0, 'More nights') : await sess.find('avail', a.f);
      if (!t.ok || !t.hit) { info.skipped = 'dbl target'; break; }
      await sess.tapAt(t.x, t.y); await sleep(60); await sess.tapAt(t.x, t.y);
      break;
    }
    case 'drag': {
      const g = await sess.find('inside', a.f);
      if (!g.ok || !g.hit) { info.skipped = 'no stay night to grab'; break; }
      const want = addDays(g.date, a.d);
      let t = await sess.page.evaluate(([w]) => window.__e2e.target('date', 0, w), [want]);
      if (!t.ok) t = await sess.page.evaluate(([e]) => window.__e2e.target('monthEdge', 0, e), [a.d > 0 ? 'end' : 'start']);
      if (!t.ok) { info.skipped = 'no drop cell'; break; }
      const g2 = await sess.page.evaluate(([f]) => window.__e2e.target('inside', f), [a.f]);
      info.drag = { grab: g2.date, to: t.date, want };
      await sess.drag([g2.x, g2.y], [t.x, t.y]);
      break;
    }
    case 'swipe': {
      const h = await sess.find(a.on === 'grid' ? 'anyday' : 'stripHead', a.f || 0.5);
      if (!h.ok || !h.hit) { info.skipped = 'strip not reachable'; break; }
      const s = await sess.snap();
      info.swipeY = s.rowTop;
      const w = s.strip.rect.w, x0 = s.strip.rect.l + w * (a.dir > 0 ? 0.8 : 0.2), x1 = s.strip.rect.l + w * (a.dir > 0 ? 0.15 : 0.85);
      const drift = a.drift || 0;
      if (sess.touch) await sess.drag([x0 - s.vvLeft, h.y], [x1 - s.vvLeft, h.y + drift], 10);
      else await p.mouse.wheel(a.dir * w, 0);
      break;
    }
    case 'arrow': info.tap = await tap('label', 0, a.dir > 0 ? 'Next month' : 'Previous month'); break;
    case 'edit': info.tap = await tap(a.which === 'arrive' ? 'tripIn' : 'tripOut', 0); break;
    case 'step': info.tap = await tap('label', 0, a.label); break; // More nights, Fewer adults, ...
    case 'more': info.tap = await tap('more', 0); break;
    case 'book': {
      const s = await sess.snap();
      info.bookBefore = s.book.length; info.bookScreen = s;
      info.tap = await tap('book', 0);
      break;
    }
    case 'other': {
      const s = await sess.snap();
      info.prevSection = s.section || null; info.target = 'property-' + a.h;
      if (!s.cals) sess.preOpenCrumb = null;
      await p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start' }), 'property-' + a.h);
      await sleep(400);
      const t = await sess.find('row', 0, a.h);
      if (!t.ok || !t.hit) { info.skipped = 'other row'; break; }
      await sess.tapAt(t.x, t.y);
      break;
    }
    case 'filter': {
      // The Drops row of a house (a property filter) while a calendar is open.
      const s = await sess.snap();
      info.prevSection = s.section || null; info.closingByNav = true;
      await p.evaluate((id) => document.getElementById(id) && document.getElementById(id).scrollIntoView({ block: 'start' }), 'property-' + a.h);
      await sleep(400);
      info.tap = await tap('dropsRow', 0, a.h);
      break;
    }
    case 'crumb': {
      const s = await sess.snap();
      info.prevSection = s.section || null; info.closingByNav = true;
      info.tap = await tap('crumb', 0);
      break;
    }
    case 'resize': {
      const v = p.viewportSize();
      const base = sess.profile.viewport;
      const next = sess.touch ? { width: v.height, height: v.width } : (v.width === base.width ? { width: 760, height: 900 } : base);
      await p.setViewportSize(next);
      info.resized = next;
      break;
    }
    case 'scroll': {
      if (sess.touch) {
        const t = await sess.find('who', 0);
        const h = p.viewportSize().height;
        const x = 8, y0 = a.dy > 0 ? h * 0.8 : h * 0.2;
        await sess.drag([x, y0], [x, y0 - Math.sign(a.dy) * Math.min(Math.abs(a.dy), h * 0.6)], 8);
      } else await p.mouse.wheel(0, a.dy);
      break;
    }
    case 'key': {
      info.keyboard = true;
      const s = await sess.snap();
      info.focusWasInHc = s.activeInHc;
      // Keys only go to the calendar: outside it they would drive the rest of the page.
      if (!s.activeInHc && s.active !== 'body') { info.skipped = 'focus outside the calendar: ' + s.active; break; }
      for (let i = 0; i < (a.n || 1); i++) await p.keyboard.press(a.key);
      break;
    }
    case 'tabToGrid': {
      info.keyboard = true;
      const s = await sess.snap();
      info.focusWasInHc = s.activeInHc;
      for (let i = 0; i < 60; i++) {
        const onDay = await p.evaluate(() => !!(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k));
        if (onDay) break;
        await p.keyboard.press(a.shift ? 'Shift+Tab' : 'Tab');
      }
      break;
    }
    case 'tabTo': {
      // Tab (as a keyboard user would) until the control named label has focus.
      info.keyboard = true;
      info.focusWasInHc = (await sess.snap()).activeInHc;
      let on = false;
      for (const k of ['Tab', 'Shift+Tab']) {
        for (let i = 0; i < 80 && !on; i++) {
          on = await p.evaluate((l) => !!document.activeElement && document.activeElement.getAttribute('aria-label') === l, a.label);
          if (!on) await p.keyboard.press(k);
        }
      }
      if (!on) info.skipped = 'could not tab to ' + a.label;
      info.focusWasInHc = true;
      break;
    }
    case 'wait': await sleep(a.ms || 500); break;
    default: throw new Error('unknown action ' + a.t);
  }
  return info;
}

// Checks that belong to one action, on top of the invariants.
async function actionChecks(sess, a, info, before, s) {
  const out = [];
  const bad = (id, msg) => out.push({ id, msg });
  if (info.skipped) return out;
  const sameSel = (x, y) => JSON.stringify((x.sel || []).map((c) => c.date)) === JSON.stringify((y.sel || []).map((c) => c.date));
  if (a.t === 'tap' && a.kind === 'blocked' && before.cals && !sameSel(before, s)) bad('blocked-tap-changed', 'tapping a past or booked day changed the stay');
  if (a.t === 'tap' && a.kind === 'inside' && before.cals && !(before.arrive && before.arrive.editing) && !(before.depart && before.depart.editing) && !sameSel(before, s)) bad('inside-tap-changed', 'tapping a night of the stay changed it');
  // What a person sees: the calendar's own row must not move up or down from a sideways swipe.
  // (scrollY alone moves with scroll anchoring while sections above change height.)
  if (a.t === 'swipe' && info.swipeY != null && s.rowTop != null && Math.abs(s.rowTop - info.swipeY) > 3) bad('swipe-scrolled-page', 'the calendar moved from y ' + info.swipeY + ' to ' + s.rowTop + ' on a horizontal swipe');
  if (a.t === 'swipe' && sess.touch && info.swipeY != null && s.strip && before.strip && !before.sel.length) {
    // A swipe with no stay to drag must move a month, unless the strip is at that end.
    const atEnd = a.dir > 0 ? before.strip.sl + before.strip.cw >= before.strip.sw - 2 : before.strip.sl <= 1;
    if (!atEnd && Math.abs(s.strip.sl - before.strip.sl) < 10) bad('swipe-no-move', 'strip stayed at ' + s.strip.sl);
  }
  if ((a.t === 'closeX' || a.t === 'closeRow') && s.cals) bad('close-failed', a.t + ' left the calendar open');
  if (info.prevSection && (info.closing || info.closingByNav || (a.t === 'open' || a.t === 'other') && info.prevSection !== info.target || (a.t === 'open' && info.prevSection === info.target))) {
    if (!s.cals && info.closingByNav) await sleep(1200); // the page's own snap restore runs after its scroll
    const r = await sess.page.evaluate((id) => window.__e2e.restored(id), info.prevSection);
    if (!s.openIds.includes(info.prevSection)) {
      if (r.open || r.mount || r.hiddenRows.length || r.hiddenFooter) bad('close-restore', info.prevSection + ' not restored: ' + JSON.stringify(r));
      if (!s.cals && r.snap !== sess.baseSnap) bad('close-snap', 'html scroll-snap-type is "' + r.snap + '" after close, was "' + sess.baseSnap + '"');
      if ((info.closing || (a.t === 'open' && info.prevSection === info.target)) && sess.preOpenCrumb && s.nav !== sess.preOpenCrumb && !s.cals) bad('crumb-restore', 'nav "' + s.nav + '" after close, was "' + sess.preOpenCrumb + '"');
      if (!s.cals && /RESET · (COOK|HILL|ZINK|BARN)/.test(s.nav)) bad('crumb-stale', 'nav still names a house after close: "' + s.nav + '"');
    }
  }
  // Resize between two months and one keeps the stay's arrival month in view, else the month that was.
  if (a.t === 'resize' && before.strip && s.strip) {
    const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthOf = (iso) => MONL[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
    const full = s.strip.blocks.filter((x) => x.full).map((x) => x.label);
    // Across the 768 px breakpoint: the stay's month, else the first month in view. Within one layout: the first month in view stays.
    const cross = before.twoUp !== s.twoUp;
    const stayMonth = cross && before.sel.length ? monthOf(before.sel[0].date) : null;
    const want = stayMonth || (before.strip.blocks.find((x) => x.full) || {}).label;
    if (want && !full.includes(want)) bad('resize-month', 'after resize to ' + JSON.stringify(info.resized) + ' the strip shows ' + (full.join(', ') || 'no whole month') + ', want ' + want + (stayMonth ? ' (the stay, layout changed)' : ' (the month in view)'));
  }
  // A tap that finds no stay must not take the price and Book away from the stay still on screen.
  if (a.t === 'tap' && before.bookLive && sameSel(before, s) && s.hint && !s.bookLive && !(before.arrive && before.arrive.editing) && !(before.depart && before.depart.editing)) bad('hint-hides-book', 'tapping a day with no stays hid the price and Book of the unchanged stay (' + s.hint + ')');
  if (a.t === 'book') {
    const b = before;
    const got = s.book.slice(info.bookBefore);
    if (b.bookLive && !got.length) bad('book-no-nav', 'tapped a live Book, no navigation');
    if (!b.bookLive && got.length) bad('book-dead-nav', 'Book was not live, navigated to ' + got[0]);
    if (got.length) {
      const u = new URL(got[0]);
      const arr = b.sel[0] && b.sel[0].date, dep = b.sel.length && b.sel[b.sel.length - 1].date;
      const g = (+b.adults || 0) + (+b.children || 0);
      if (u.searchParams.get('or_arrival') !== arr || u.searchParams.get('or_departure') !== dep || +u.searchParams.get('or_guests') !== g) bad('book-href', 'Book went to ' + u.search + ' for screen ' + arr + '..' + dep + ' x' + g);
    }
  }
  return out;
}

// ---- one run ----
async function runSequence(browser, profile, seq, o = {}) {
  const sess = new Session(browser, profile, { base: BASE, stub: o.stub, seed: o.seed, ref: REF });
  Object.assign(sess.labels, LABELS);
  const fails = [];
  const done = [];
  try {
    await sess.start();
  } catch (e) { await sess.close(); return { fails: [{ id: 'harness-start', msg: e.message, step: -1 }], done, sess }; }
  let s = await sess.snap();
  for (let i = 0; i < seq.length; i++) {
    const a = typeof seq[i] === 'function' ? seq[i](s) : seq[i];
    if (!a) continue;
    sess.step = i;
    const before = s;
    let info;
    try { info = await act(sess, a); } catch (e) { info = { skipped: 'error ' + e.message.slice(0, 120) }; }
    sess.lastAction = Date.now();
    done.push({ ...a, skipped: info.skipped, drag: info.drag });
    const found = [];
    // The in-between state: right after the input, before quotes land.
    await sleep(40);
    let now; try { now = await sess.snap(); } catch { now = null; }
    if (now) for (const f of checkInvariants(sess, now, { phase: 'now', action: a, ...info })) if (/^(book|sel|trip|stay|one-open)/.test(f.id)) found.push({ ...f, phase: 'now' });
    const ok = await sess.settle();
    s = await sess.snap();
    Object.assign(done[done.length - 1], { focus: s.active, stay: s.sel && s.sel.length ? s.sel[0].date + '..' + s.sel[s.sel.length - 1].date : null, hint: s.hint || null, book: s.bookLive ? s.amount : null });
    if (process.env.E2E_TRACE) await sess.page.screenshot({ path: path.join(OUT, `trace-${profile}-${String(i).padStart(3, '0')}-${a.t}.png`) }).catch(() => {});
    if (!ok) found.push({ id: 'no-settle', msg: 'screen or quotes did not settle in 9 s', phase: 'settled' });
    for (const f of checkInvariants(sess, s, { phase: 'settled', action: a, ...info })) found.push({ ...f, phase: 'settled' });
    for (const f of await actionChecks(sess, a, info, before, s)) found.push({ ...f, phase: 'settled' });
    const errs = sess.errors.filter((e) => e.at === i && (!e.http || /\/v1\//.test(e.text)));
    for (const e of errs) found.push({ id: 'console-error', msg: e.text, phase: 'settled' });
    if (sess.navAttempts.length) { found.push({ id: 'left-page', msg: 'navigation to ' + sess.navAttempts.join(', '), phase: 'settled' }); sess.navAttempts = []; }
    sess.errors = sess.errors.filter((e) => e.at !== i);
    if (found.length) {
      for (const f of found) {
        const rec = { ...f, step: i, action: a, info: { skipped: info.skipped, drag: info.drag } };
        if (o.capture !== false && !fails.some((x) => x.id === f.id)) {
          const n = ++shotN;
          rec.shot = path.join(OUT, `fail-${n}-${profile}-${f.id}.png`);
          await sess.page.screenshot({ path: rec.shot }).catch(() => {});
          rec.dom = path.join(OUT, `fail-${n}-${profile}-${f.id}.json`);
          const hc = await sess.page.evaluate(() => (document.querySelector('.hc') || {}).outerHTML || '').catch(() => '');
          fs.writeFileSync(rec.dom, JSON.stringify({ failure: f, actions: done, snapshot: s, now, quotes: sess.quotes.map((q) => ({ key: q.key, at: q.at, done: q.done, status: q.status, total: q.resp && q.resp.total })), hc }, null, 1));
        }
        fails.push(rec);
      }
      if (o.stopAt && found.some((f) => f.id === o.stopAt)) break;
    }
  }
  await sess.close();
  return { fails, done, sess };
}

// ---- scripted pass (real API) ----
const T = (kind, f = 0.5) => ({ t: 'tap', kind, f });
const STEPS = (labels) => labels.map((label) => ({ t: 'step', label }));
function scripted(house, other) {
  return [
    { t: 'open', h: house },
    T('blocked', 0.5),
    T('avail', 0.4),
    T('inside', 0.5),
    T('blocked', 0.2),
    T('checkout'),
    T('later', 0.2),
    { t: 'drag', d: 1, f: 0 }, { t: 'drag', d: -1, f: 0 }, { t: 'drag', d: 4, f: 0.5 }, { t: 'drag', d: -6, f: 0.5 }, { t: 'drag', d: 10, f: 0 },
    { t: 'swipe', dir: 1 }, { t: 'swipe', dir: 1 }, { t: 'swipe', dir: -1 },
    T('avail', 0.97), { t: 'drag', d: 10, f: 0 }, // across the month's end
    { t: 'swipe', dir: 1 }, T('avail', 0.02), { t: 'drag', d: -10, f: 0 }, // back across the start
    { t: 'edit', which: 'arrive' }, T('avail', 0.3),
    { t: 'edit', which: 'depart' }, T('later', 0.5),
    { t: 'edit', which: 'depart' }, T('blocked', 0.5),
    { t: 'edit', which: 'arrive' }, { t: 'edit', which: 'arrive' }, // toggle off
    ...STEPS(['More nights', 'More nights', 'Fewer nights']),
    ...STEPS(['Fewer adults', 'More adults']),
    { t: 'more' }, ...STEPS(['More children', 'Fewer children', 'More infants', 'Fewer infants']), { t: 'more' },
    { t: 'book' },
    { t: 'dbl', kind: 'avail', f: 0.6 }, { t: 'dbl', kind: 'nightsPlus' },
    { t: 'book' },
    { t: 'closeX' }, { t: 'open', h: house }, T('avail', 0.5), { t: 'closeRow' },
    { t: 'open', h: house }, { t: 'other', h: other }, { t: 'other', h: house },
    { t: 'resize' }, T('avail', 0.3), { t: 'resize' },
    { t: 'scroll', dy: 300 }, { t: 'scroll', dy: -300 },
    { t: 'crumb' },
    { t: 'open', h: house }, { t: 'filter', h: other },
    { t: 'open', h: house }, { t: 'closeX' },
  ];
}
function scriptedDesktop(house, other) {
  return [
    { t: 'open', h: house },
    { t: 'arrow', dir: 1 }, { t: 'arrow', dir: 1 }, { t: 'arrow', dir: -1 },
    T('avail', 0.5), { t: 'drag', d: 3, f: 0 }, { t: 'drag', d: -2, f: 0.5 }, T('later', 0.1), T('blocked', 0.4),
    { t: 'tabToGrid' }, { t: 'key', key: 'ArrowRight' }, { t: 'key', key: 'ArrowDown' }, { t: 'key', key: 'Enter' },
    { t: 'key', key: 'ArrowRight', n: 3 }, { t: 'key', key: 'Enter' }, { t: 'key', key: 'ArrowUp', n: 6 }, { t: 'key', key: 'Enter' },
    { t: 'key', key: 'Tab' }, { t: 'key', key: 'Tab' }, { t: 'key', key: 'Enter' }, { t: 'key', key: 'Tab', n: 2 }, { t: 'key', key: 'Enter' },
    { t: 'key', key: 'Tab', n: 3 }, { t: 'key', key: 'Enter' }, { t: 'key', key: 'Enter' },
    { t: 'edit', which: 'arrive' }, T('avail', 0.2), { t: 'edit', which: 'depart' }, T('later', 0.4),
    ...STEPS(['More nights', 'Fewer nights', 'Fewer adults', 'More adults']), { t: 'more' }, ...STEPS(['More children', 'More infants']),
    { t: 'tabTo', label: 'Fewer adults' }, { t: 'key', key: 'Enter' }, { t: 'key', key: 'Tab' }, { t: 'tabTo', label: 'More adults' }, { t: 'key', key: 'Enter' },
    { t: 'book' },
    { t: 'resize' }, { t: 'resize' },
    { t: 'closeX' }, { t: 'open', h: other }, T('avail', 0.6), { t: 'book' }, { t: 'other', h: house }, { t: 'closeRow' },
  ];
}

// ---- monkey (stubbed quote) ----
function pick(r, list) {
  const tot = list.reduce((s, x) => s + x[0], 0);
  let v = r() * tot;
  for (const [w, a] of list) { if ((v -= w) < 0) return a; }
  return list[list.length - 1][1];
}
function monkeySeq(seed, n, profile) {
  const r = rng(seed * 7919 + profile.length);
  const houses = ['cook', 'hill4', 'cook', 'hill4', 'zink'];
  const desk = profile === 'desktop';
  const seq = [];
  // Actions are chosen from the live screen, with a recorded descriptor so they replay exactly.
  for (let i = 0; i < n; i++) {
    const roll = r(), roll2 = r(), roll3 = r();
    seq.push((s) => {
      const h = houses[Math.floor(roll2 * houses.length)];
      if (!s.cals) return pick(() => roll, [[8, { t: 'open', h }], [1, { t: 'scroll', dy: roll3 > 0.5 ? 250 : -250 }], [1, { t: 'resize' }]]);
      const list = [
        [14, T('avail', roll3)], [3, T('blocked', roll3)], [3, T('inside', roll3)], [3, T('checkout')], [5, T('later', roll3)],
        [10, { t: 'drag', d: (roll3 < 0.5 ? -1 : 1) * (1 + Math.floor(roll3 * 20) % 10), f: roll2 }],
        [desk ? 2 : 6, { t: 'swipe', dir: roll3 < 0.5 ? -1 : 1, on: roll2 < 0.3 ? 'grid' : 'head', f: roll2, drift: Math.round((roll3 - 0.5) * 10) }],
        [4, { t: 'edit', which: roll3 < 0.5 ? 'arrive' : 'depart' }],
        [6, { t: 'step', label: roll3 < 0.5 ? 'More nights' : 'Fewer nights' }],
        [4, { t: 'step', label: roll3 < 0.5 ? 'More adults' : 'Fewer adults' }],
        [2, { t: 'more' }],
        [3, { t: 'step', label: ['More children', 'Fewer children', 'More infants', 'Fewer infants'][Math.floor(roll3 * 4)] }],
        [4, { t: 'book' }],
        [3, { t: 'dbl', kind: roll3 < 0.5 ? 'avail' : 'nightsPlus', f: roll2 }],
        [1, { t: 'closeX' }], [1, { t: 'closeRow' }], [1, { t: 'open', h }], [1, { t: 'other', h }],
        [0.6, { t: 'filter', h }], [0.6, { t: 'crumb' }], [1, { t: 'resize' }], [1.5, { t: 'scroll', dy: roll3 > 0.5 ? 200 : -200 }],
        [1, { t: 'wait', ms: 300 }],
      ];
      if (desk) list.push([4, { t: 'arrow', dir: roll3 < 0.5 ? -1 : 1 }], [3, { t: 'tabToGrid', shift: roll3 < 0.2 }],
        [8, { t: 'key', key: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Shift+Tab', ' '][Math.floor(roll3 * 8)] }]);
      return pick(() => roll, list);
    });
  }
  return seq;
}

// Shrink a failing sequence (concrete actions) to a shorter one that still fails with the same id.
async function shrink(browser, profile, actions, id, seed, budgetMs) {
  const t0 = Date.now();
  const fails = async (seq) => {
    const r = await runSequence(browser, profile, seq, { stub: true, seed, capture: false, stopAt: id });
    return r.fails.some((f) => f.id === id);
  };
  let cur = actions.filter((a) => !a.skipped).map(({ skipped, drag, focus, stay, hint, book, ...a }) => a);
  if (!(await fails(cur))) return { seq: cur, reproduced: false };
  let n = 2;
  while (cur.length > 1 && Date.now() - t0 < budgetMs) {
    const size = Math.ceil(cur.length / n);
    let cut = false;
    for (let i = 0; i < cur.length && Date.now() - t0 < budgetMs; i += size) {
      const cand = cur.slice(0, i).concat(cur.slice(i + size));
      if (cand.some((a) => a.t === 'open' || a.t === 'other')) {
        if (await fails(cand)) { cur = cand; n = Math.max(n - 1, 2); cut = true; break; }
      }
    }
    if (!cut) { if (size === 1) break; n = Math.min(cur.length, n * 2); }
  }
  return { seq: cur, reproduced: true };
}

// ---- main ----
const chromium = await loadChromium();
const browser = await chromium.launch({ executablePath: headlessShell() });
const report = { base: BASE, ref: REF && execFileSync('git', ['rev-parse', '--short', REF], { cwd: path.resolve(HERE, '../..') }).toString().trim(), started: new Date().toISOString(), scripted: [], monkey: [], shrunk: [], actions: 0 };
const allFails = [];
const t0 = Date.now();

if (flag('replay')) {
  const f = JSON.parse(fs.readFileSync(opt('replay'), 'utf8'));
  const r = await runSequence(browser, f.profile, f.actions, { stub: !!f.stub, seed: f.seed || 1 });
  fs.writeFileSync(path.join(OUT, 'log-replay.json'), JSON.stringify(r.done, null, 1));
  log(JSON.stringify(r.fails.map((x) => ({ id: x.id, step: x.step, msg: x.msg, shot: x.shot })), null, 1));
  await browser.close();
  process.exit(r.fails.length ? 1 : 0);
}

if (!flag('monkey-only')) {
  const plan = [
    ['phone375', scripted('cook', 'hill4')], ['phone390', scripted('hill4', 'cook')],
    ['desktop', scriptedDesktop('cook', 'hill4')], ['desktop', scriptedDesktop('hill4', 'cook')],
    // Landscape phone: scroll past the open calendar and back.
    ['phone390', [{ t: 'resize' }, { t: 'open', h: 'hill4' }, T('avail', 0.4), ...Array(5).fill({ t: 'scroll', dy: 250 }), ...Array(5).fill({ t: 'scroll', dy: -250 }), { t: 'closeX' }]],
  ].filter(([p], i) => PROFS.includes(p) && (!opt('plan') || opt('plan').split(',').includes(String(i))));
  for (const [profile, seq] of plan) {
    const r = await runSequence(browser, profile, seq, { stub: false });
    report.actions += r.done.length;
    fs.writeFileSync(path.join(OUT, `log-scripted-${profile}-${report.scripted.length}.json`), JSON.stringify(r.done, null, 1));
    const skipped = r.done.filter((a) => a.skipped).map((a) => a.t + ':' + a.skipped);
    report.scripted.push({ profile, actions: r.done.length, skipped, fails: r.fails.map((f) => ({ id: f.id, step: f.step, phase: f.phase, msg: f.msg, shot: f.shot })) });
    for (const f of r.fails) allFails.push({ pass: 'scripted', profile, ...f, log: r.done });
    log(`scripted ${profile}: ${r.done.length} actions, ${r.fails.length} failures, ${skipped.length} skipped`);
    for (const f of r.fails) log(`  [${f.phase}] step ${f.step} ${JSON.stringify(f.action)} ${f.id}: ${f.msg}`);
    if (skipped.length) log('  skipped: ' + skipped.join(' | '));
  }
}

if (!flag('scripted-only')) {
  for (const profile of PROFS) {
    for (let k = 0; k < RUNS; k++) {
      const seed = SEED + k;
      const r = await runSequence(browser, profile, monkeySeq(seed, ACTIONS, profile), { stub: true, seed });
      report.actions += r.done.length;
      fs.writeFileSync(path.join(OUT, `log-monkey-${profile}-${seed}.json`), JSON.stringify(r.done, null, 1));
      const ids = [...new Set(r.fails.map((f) => f.id))];
      report.monkey.push({ profile, seed, actions: r.done.length, skipped: r.done.filter((a) => a.skipped).length, fails: ids.map((id) => ({ id, count: r.fails.filter((f) => f.id === id).length, first: r.fails.find((f) => f.id === id) })) });
      log(`monkey ${profile} seed ${seed}: ${r.done.length} actions, ${r.done.filter((a) => a.skipped).length} skipped, failures: ${ids.map((id) => id + 'x' + r.fails.filter((f) => f.id === id).length).join(' ') || 'none'}`);
      for (const id of ids) {
        const f = r.fails.find((x) => x.id === id);
        log(`  step ${f.step} ${JSON.stringify(f.action)} ${id}: ${f.msg}`);
        allFails.push({ pass: 'monkey', profile, seed, ...f, log: r.done.slice(0, f.step + 1) });
      }
    }
  }
  // Shrink the first monkey failure of each id.
  if (!flag('no-shrink')) {
    const seen = new Set();
    for (const f of allFails.filter((x) => x.pass === 'monkey')) {
      if (seen.has(f.id) || ['console-error', 'no-settle'].includes(f.id) && seen.has(f.id)) continue;
      seen.add(f.id);
      const s = await shrink(browser, f.profile, f.log, f.id, f.seed, 6 * 60e3);
      const file = path.join(OUT, `repro-${f.profile}-${f.id}.json`);
      fs.writeFileSync(file, JSON.stringify({ profile: f.profile, stub: true, seed: f.seed, id: f.id, msg: f.msg, actions: s.seq }, null, 1));
      report.shrunk.push({ id: f.id, profile: f.profile, from: f.log.length, to: s.seq.length, reproduced: s.reproduced, file });
      log(`shrunk ${f.id} (${f.profile}) ${f.log.length} -> ${s.seq.length} actions, reproduced ${s.reproduced}: ${s.seq.map((a) => JSON.stringify(a)).join(' ')}`);
    }
  }
}

report.seconds = Math.round((Date.now() - t0) / 1000);
report.distinct = [...new Set(allFails.map((f) => f.id))];
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(OUT, 'failures.json'), JSON.stringify(allFails, null, 1));
log(`\n${report.actions} actions in ${report.seconds}s. Distinct failures: ${report.distinct.join(', ') || 'none'}. Out: ${OUT}`);
await browser.close();
process.exit(allFails.length ? 1 : 0);
