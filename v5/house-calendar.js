// The house view's booking calendar: open dates from agent-booking, the house's drops as
// suggestions dotted on their arrival days, a live quote before Book. Dates only through CalendarCore (UTC strings).
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HouseCalendar = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var QUOTE_ERROR = "Couldn't check the price. Try again.";
  var GUEST_DEBOUNCE_MS = 300;
  var FALLBACK = "The calendar didn't load. See open dates on the booking page.";

  function utc(iso) {
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function leafText(iso) {
    var d = utc(iso);
    return { dow: DOW[d.getUTCDay()], day: String(d.getUTCDate()), mon: MON[d.getUTCMonth()] };
  }
  function guestCount(g) { return g.ad + g.ch; }
  function guestLabel(g) {
    var n = guestCount(g);
    var s = n + (n === 1 ? ' guest' : ' guests');
    if (g.inf) s += ' + ' + g.inf + (g.inf === 1 ? ' infant' : ' infants');
    return s;
  }
  function money(cents) {
    return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function centsOf(total) { return Math.round(Number(total) * 100); }
  function shortDate(iso) { var t = leafText(iso); return t.dow + ', ' + t.mon + ' ' + t.day; }

  // Guest copy from the reason. Never body.message: agent-booking writes that for agents.
  function goneText(body) {
    var r = body.reason;
    var s = r === 'booked' ? 'Those dates are taken.'
      : r === 'min_nights' && body.min_nights ? 'Stays from that day are at least ' + body.min_nights + ' nights.'
      : r === 'max_nights' ? 'That stay is longer than this house allows.'
      : "Those dates aren't available.";
    return body.alternatives && body.alternatives.length ? s + ' Nearest open stays:' : s;
  }
  function nightsText(n) { return n + (n === 1 ? ' night' : ' nights'); }
  function footText(total, n) { return total + ' all in \u00b7 ' + nightsText(n); }
  // The line under the grid: the stay, or the pick waiting for its checkout, or nothing.
  function summaryText(sel, pick) {
    if (pick) return shortDate(pick) + ' \u2013 choose checkout';
    if (!sel) return '';
    var CC = root.CalendarCore || require('./calendar-core.js');
    return shortDate(sel.arrival) + ' \u2013 ' + shortDate(sel.departure) + ' \u00b7 ' + nightsText(CC.nightsBetween(sel.arrival, sel.departure));
  }

  // One tap in Any dates. Returns { stay } to set a stay, or the state patch for a new pick,
  // which abandons any current stay and its quote (seq bump drops an in-flight quote).
  function tapAny(st, d, map, today) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    var newPick = { pick: d, sel: null, quote: null, quoting: false, seq: st.seq + 1, hint: '' };
    if (st.pick) {
      return d > st.pick && CC.stayCheck(map, st.pick, d, today).ok ? { stay: { arrival: st.pick, departure: d } } : newPick;
    }
    if (st.sel && d > st.sel.arrival && CC.stayCheck(map, st.sel.arrival, d, today).ok) {
      return { stay: { arrival: st.sel.arrival, departure: d } };
    }
    return newPick;
  }

  // One tap in 3-night stays: the open 3 nights from d, else the drop arriving on d, else a hint.
  // Returns { stay }, { hint }, or null (a night of the current stay: nothing changes).
  function tapThree(st, d, map, today) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    if (selNight(st.sel, d)) return null;
    var end = CC.addDays(d, 3);
    if (CC.stayCheck(map, d, end, today).ok) return { stay: { arrival: d, departure: end } };
    var s = CC.suggestionAt(st.sugs, d);
    if (s && s.arrival === d) return { stay: { arrival: s.arrival, departure: s.departure } };
    return { hint: 'No 3-night stay from that day. Try Any dates.' };
  }

  // A night of the stay. Its checkout day is drawn as part of the stay but is not a night,
  // so taps and drags on it behave as on any other day.
  function selNight(sel, d) { return !!sel && d >= sel.arrival && d < sel.departure; }

  function quoteView(status, body) {
    if (status === 200 && body && body.available === true) {
      var cents = typeof body.total_cents === 'number' ? body.total_cents : centsOf(body.total);
      return { kind: 'ok', total: money(cents), total_cents: cents, href: body.checkout_url };
    }
    if (status === 200 && body && body.available === false) {
      return {
        kind: 'gone',
        message: goneText(body),
        alternatives: (body.alternatives || []).map(function (a) {
          var total = money(centsOf(a.total));
          return { checkin: a.checkin, checkout: a.checkout, total: total, label: shortDate(a.checkin) + ' – ' + shortDate(a.checkout) + ' · ' + total };
        }),
      };
    }
    if (status === 422 && body && body.error) return { kind: 'refused', message: body.error };
    return { kind: 'error', message: QUOTE_ERROR };
  }

  // Calls fn once, ms after the last call. cancel() drops a pending call.
  function debounce(fn, ms) {
    var t = null;
    function d() { clearTimeout(t); t = setTimeout(function () { t = null; fn(); }, ms); }
    d.cancel = function () { clearTimeout(t); t = null; };
    return d;
  }

  function calendarFallback(href) { return { message: FALLBACK, href: href }; }

  // ---- DOM ----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  var ARROW = '<svg viewBox="0 0 48 24" aria-hidden="true"><path d="M3 12h40M37 5l7 7-7 7"/></svg>';

  function open(o) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    var api = o.api || 'https://book.reset.club';
    var track = o.track || function () {};
    var house = o.code;
    var today = todayIso();

    var st = {
      map: null, sugs: [], maxGuests: null, mode: 'sug', month: null,
      sel: null, pick: null, g: { ad: 2, ch: 0, inf: 0 }, more: false,
      hint: '', quote: null, quoting: false, seq: 0,
    };

    var hc = el('div', 'hc');
    var col = CC.colours(o.colour.bg, o.colour.text);
    hc.style.setProperty('--c', col.c);
    hc.style.setProperty('--c-ink', col.ink);
    hc.style.setProperty('--c-tint', col.tint);
    hc.style.setProperty('--c-deep', col.deep);

    var when = el('button', 'hc-when');
    when.type = 'button';
    when.setAttribute('aria-expanded', 'true');
    var panel = el('div', 'hc-panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Choose dates');
    var foot = el('div', 'hc-foot');
    var hintEl = el('span', 'hc-hint');
    var after = el('div');
    after.style.cssText = 'display:grid;gap:12px;padding-top:12px;';

    // The caller owns the expansion around o.mount. close() removes the calendar and tells it.
    function close() {
      quoteSoon.cancel();
      st.seq++;
      hc.remove();
      if (o.onClose) o.onClose();
    }

    o.mount.appendChild(hc);
    track('calendar_opened', { house: house });

    // ---- leaves ----
    function leaf(dow, day, mon) {
      var s = el('span', 'hc-leaf');
      s.appendChild(el('span', 'hc-hint', dow));
      s.appendChild(el('span', 'dp', day));
      var m = el('span', 'hc-hint', mon);
      m.style.whiteSpace = 'nowrap';
      s.appendChild(m);
      return s;
    }
    function paintWhen() {
      when.innerHTML = '';
      var a = st.pick || (st.sel && st.sel.arrival);
      if (!a) {
        var only = el('span', 'hc-leaf');
        only.style.gridColumn = '1 / -1';
        only.style.textAlign = 'left';
        only.appendChild(el('span', 'dp', 'Choose dates'));
        when.appendChild(only);
        return;
      }
      var at = leafText(a);
      when.appendChild(leaf(at.dow, at.day, at.mon + ' · from 4 pm'));
      var span = el('span', 'hc-span');
      var n = st.pick ? 0 : CC.nightsBetween(st.sel.arrival, st.sel.departure);
      span.appendChild(el('span', null, n ? nightsText(n) : ''));
      span.insertAdjacentHTML('beforeend', ARROW);
      span.appendChild(el('span', null, guestLabel(st.g)));
      when.appendChild(span);
      if (st.pick) {
        when.appendChild(leaf('Checkout', '–', 'choose a day'));
      } else {
        var dt = leafText(st.sel.departure);
        when.appendChild(leaf(dt.dow, dt.day, dt.mon + ' · by noon'));
      }
    }
    when.addEventListener('click', function () {
      var openNow = when.getAttribute('aria-expanded') === 'true';
      when.setAttribute('aria-expanded', String(!openNow));
      panel.hidden = openNow;
    });

    // ---- panel: month, mode, grid, guests ----
    var head = el('div', 'hc-head');
    var prev = el('button');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous month');
    prev.textContent = '←';
    var title = el('b');
    var next = el('button');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next month');
    next.textContent = '→';
    head.appendChild(prev); head.appendChild(title); head.appendChild(next);

    var mode = el('div', 'hc-mode');
    var mSug = el('button', null, '3-night stays'); mSug.type = 'button';
    var mAny = el('button', null, 'Any dates'); mAny.type = 'button';
    mode.appendChild(mSug); mode.appendChild(mAny);

    var dow = el('div', 'hc-dow');
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (d) { dow.appendChild(el('span', null, d)); });
    var grid = el('div', 'hc-grid');
    var sum = el('p', 'hc-sum');
    var who = el('div', 'hc-who');

    var span; // monthSpan, set on load
    function ym(iso) { return iso.slice(0, 7); }
    function shiftMonth(m, n) {
      var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n;
      y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
      return y + '-' + (mo < 9 ? '0' : '') + (mo + 1);
    }

    function paintGrid() {
      var y = +st.month.slice(0, 4), m = +st.month.slice(5, 7);
      title.textContent = MONL[m - 1] + ' ' + y;
      prev.disabled = st.month <= ym(span.from);
      next.disabled = st.month >= ym(span.to);
      mSug.setAttribute('aria-pressed', String(st.mode === 'sug'));
      mAny.setAttribute('aria-pressed', String(st.mode === 'any'));
      var cells = CC.cellsForMonth(y, m, { mode: st.mode, suggestions: st.sugs, sel: st.sel, pick: st.pick, map: st.map, today: today });
      grid.innerHTML = '';
      cells.forEach(function (c) {
        if (!c) { grid.appendChild(el('span')); return; }
        var b = el(c.button ? 'button' : 'span', c.cls.join(' '), String(c.day));
        if (c.button) {
          b.type = 'button';
          b.dataset.k = c.date;
          b.setAttribute('aria-label', MONL[m - 1] + ' ' + c.day);
        } else {
          b.setAttribute('aria-disabled', 'true');
        }
        grid.appendChild(b);
      });
      sum.textContent = summaryText(st.sel, st.pick);
      sum.hidden = !sum.textContent;
    }

    function stepper(label, small, key, min, maxFn) {
      var row = el('div', 'hc-guests');
      var name = el('span', null, label);
      if (small) name.appendChild(el('small', null, small));
      var step = el('span', 'hc-step');
      var minus = el('button', null, '−'); minus.type = 'button';
      minus.setAttribute('aria-label', 'Fewer ' + label.toLowerCase());
      var n = el('b');
      var plus = el('button', null, '+'); plus.type = 'button';
      plus.setAttribute('aria-label', 'More ' + label.toLowerCase());
      step.appendChild(minus); step.appendChild(n); step.appendChild(plus);
      row.appendChild(name); row.appendChild(step);
      minus.addEventListener('click', function () { if (st.g[key] > min) { st.g[key]--; guestsChanged(); } });
      plus.addEventListener('click', function () { if (!maxFn()) { st.g[key]++; guestsChanged(); } });
      return { row: row, paint: function () { n.textContent = st.g[key]; minus.disabled = st.g[key] <= min; plus.disabled = maxFn(); } };
    }
    function full() { return st.maxGuests != null && guestCount(st.g) >= st.maxGuests; }
    var sAd = stepper('Adults', null, 'ad', 1, full);
    var sCh = stepper('Children', 'Ages 2–12', 'ch', 0, full);
    var sIn = stepper('Infants', 'Under 2 · crib on request', 'inf', 0, function () { return st.g.inf >= 2; });
    var more = el('button', 'hc-more'); more.type = 'button';
    var extra = el('div');
    extra.appendChild(sCh.row); extra.appendChild(sIn.row);
    who.appendChild(sAd.row); who.appendChild(more); who.appendChild(extra);
    function paintWho() {
      sAd.paint(); sCh.paint(); sIn.paint();
      extra.hidden = !st.more;
      more.setAttribute('aria-expanded', String(st.more));
      more.textContent = st.more ? 'Just adults' : 'Anyone else coming along?';
    }
    more.addEventListener('click', function () { st.more = !st.more; paintWho(); });

    // ---- foot: hint or total, Book, quote outcomes ----
    function nights() { return st.sel ? CC.nightsBetween(st.sel.arrival, st.sel.departure) : 0; }
    function defaultHint() {
      if (st.mode === 'sug') return 'Tap a day to pick 3 nights';
      return st.pick ? 'Now choose your departure' : 'Choose your arrival';
    }
    function paintFoot() {
      foot.innerHTML = '';
      after.innerHTML = '';
      var q = st.quote;
      var text = st.hint || (st.quoting ? 'Checking price' : q && q.kind === 'ok' ? footText(q.total, nights()) : st.sel ? '' : defaultHint());
      hintEl.textContent = text;
      foot.appendChild(hintEl);
      var book;
      if (!st.quoting && q && q.kind === 'ok') {
        book = el('a', 'hc-book', 'Book');
        book.href = q.href;
        book.addEventListener('click', function () {
          track('calendar_book_pressed', { house: house, nights: nights(), total: q.total_cents / 100 });
        });
      } else {
        book = el('button', 'hc-book', 'Book');
        book.type = 'button';
        book.disabled = true;
      }
      foot.appendChild(book);
      if (st.quoting || !q) return;
      if (q.kind === 'gone' || q.kind === 'refused' || q.kind === 'error') after.appendChild(el('p', 'hc-msg', q.message));
      if (q.kind === 'gone' && q.alternatives.length) {
        var alts = el('div', 'hc-alts');
        q.alternatives.forEach(function (a) {
          var b = el('button', null, a.label); b.type = 'button';
          b.setAttribute('aria-pressed', 'false');
          b.addEventListener('click', function () { setStay({ arrival: a.checkin, departure: a.checkout }); });
          alts.appendChild(b);
        });
        after.appendChild(alts);
      }
      if (q.kind === 'error') {
        var retry = el('button', 'hc-more', 'Try again'); retry.type = 'button';
        retry.addEventListener('click', requestQuote);
        after.appendChild(retry);
      }
    }

    function paintAll() { paintWhen(); paintGrid(); paintWho(); paintFoot(); }

    function requestQuote() {
      if (!st.sel) return;
      var my = ++st.seq;
      st.quoting = true; st.quote = null; st.hint = '';
      paintFoot();
      var body = { property_code: house, checkin: st.sel.arrival, checkout: st.sel.departure, guests: guestCount(st.g) };
      fetch(api + '/v1/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (b) { return quoteView(r.status, b); }); })
        .catch(function () { return quoteView(0, null); })
        .then(function (v) {
          if (my !== st.seq) return;
          st.quoting = false; st.quote = v;
          paintFoot();
        });
    }

    function fromDrop(sel) {
      return st.sugs.some(function (s) { return s.arrival === sel.arrival && s.departure === sel.departure; });
    }
    function setStay(sel, quiet) {
      quoteSoon.cancel();
      st.sel = sel; st.pick = null; st.hint = ''; st.quote = null; st.seq++; st.quoting = false;
      paintAll();
      if (quiet) return;
      track('calendar_range_picked', { house: house, nights: nights(), from_drop: fromDrop(sel) });
      requestQuote();
    }
    // Guest steps settle for 300 ms before one quote. Stay changes still quote at once.
    var quoteSoon = debounce(requestQuote, GUEST_DEBOUNCE_MS);
    function guestsChanged() {
      paintWhen(); paintWho();
      if (st.sel) quoteSoon();
    }

    prev.addEventListener('click', function () { st.month = shiftMonth(st.month, -1); paintGrid(); });
    next.addEventListener('click', function () { st.month = shiftMonth(st.month, 1); paintGrid(); });
    mSug.addEventListener('click', function () { st.mode = 'sug'; st.pick = null; st.hint = ''; paintAll(); });
    mAny.addEventListener('click', function () { st.mode = 'any'; st.hint = ''; paintAll(); });

    // Drag a selected stay to slide it (3-night stays mode), as in the design.
    var drag = { on: false, grab: null, orig: null, moved: false, until: 0 };
    grid.addEventListener('pointerdown', function (e) {
      if (st.mode !== 'sug' || !st.sel) return;
      var b = e.target.closest('button[data-k]');
      if (!b || !selNight(st.sel, b.dataset.k)) return;
      e.preventDefault();
      drag.on = true; drag.moved = false; drag.grab = b.dataset.k; drag.orig = st.sel;
      grid.classList.add('dragging');
      grid.setPointerCapture(e.pointerId);
    });
    grid.addEventListener('pointermove', function (e) {
      if (!drag.on) return;
      var t = document.elementFromPoint(e.clientX, e.clientY);
      var b = t && t.closest && t.closest('.hc-grid button[data-k]');
      if (!b) return;
      var ns = CC.slide(st.map, drag.orig, CC.nightsBetween(drag.grab, b.dataset.k), today);
      if (!ns || ns.arrival === st.sel.arrival) return;
      drag.moved = true;
      setStay(ns, true);
    });
    function endDrag() {
      if (!drag.on) return;
      drag.on = false;
      grid.classList.remove('dragging');
      if (drag.moved) { drag.until = Date.now() + 350; setStay(st.sel); }
      drag.moved = false;
    }
    grid.addEventListener('pointerup', endDrag);
    grid.addEventListener('pointercancel', endDrag);

    grid.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-k]');
      if (!b) return;
      var d = b.dataset.k;
      if (st.mode === 'sug') {
        if (Date.now() < drag.until) return;
        var r = tapThree(st, d, st.map, today);
        if (!r) return;
        if (r.stay) { setStay(r.stay); return; }
        st.hint = r.hint;
        paintFoot();
        return;
      }
      var t = tapAny(st, d, st.map, today);
      if (t.stay) { setStay(t.stay); return; }
      Object.assign(st, t);
      paintAll();
    });

    // ---- load ----
    var dropSpan = CC.monthSpan(today, o.drops);
    var to = dropSpan.to < CC.addDays(today, 399) ? dropSpan.to : CC.addDays(today, 399);
    var url = api + '/v1/calendar?property_code=' + encodeURIComponent(house) + '&from=' + today + '&to=' + to;
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        if (!data || !Array.isArray(data.days)) throw new Error('bad calendar');
        st.map = CC.dayMap(data.days);
        st.maxGuests = data.max_guests;
        if (st.maxGuests != null) st.g.ad = Math.max(1, Math.min(st.g.ad, st.maxGuests));
        st.sugs = CC.suggestions(o.drops, st.map, today);
        span = CC.monthSpan(today, st.sugs);
        st.month = ym(st.sugs.length ? st.sugs[0].arrival : today);
        panel.appendChild(head); panel.appendChild(mode); panel.appendChild(dow);
        panel.appendChild(grid); panel.appendChild(sum); panel.appendChild(who);
        hc.appendChild(when); hc.appendChild(panel); hc.appendChild(foot); hc.appendChild(after);
        paintAll();
      })
      .catch(function () {
        var fb = calendarFallback(o.fallbackHref);
        var box = el('div', 'hc-panel');
        box.style.paddingTop = '16px';
        box.appendChild(el('p', 'hc-msg', fb.message));
        var a = el('a', 'hc-more', 'Booking page');
        a.href = fb.href;
        box.appendChild(a);
        hc.appendChild(box);
      });

    return { close: close };
  }

  return {
    open: open, leafText: leafText, guestCount: guestCount, guestLabel: guestLabel,
    quoteView: quoteView, calendarFallback: calendarFallback, tapAny: tapAny, tapThree: tapThree, footText: footText, summaryText: summaryText, selNight: selNight,
    debounce: debounce, GUEST_DEBOUNCE_MS: GUEST_DEBOUNCE_MS,
  };
});
