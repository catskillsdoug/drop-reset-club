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
  function monthLabel(iso) {
    var p = iso.split('-');
    return { mon: MON[+p[1] - 1].toUpperCase(), year: p[0] };
  }
  // Every month of a CalendarCore.monthSpan, in order.
  function monthsInSpan(span) {
    var y = +span.from.slice(0, 4), m = +span.from.slice(5, 7);
    var ty = +span.to.slice(0, 4), tm = +span.to.slice(5, 7);
    var out = [];
    while (y < ty || (y === ty && m <= tm)) {
      out.push({ year: y, month1: m });
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }
  // The calendar fetch ends on a month's last day, at most 399 days out, so the last month drawn is whole.
  function fetchTo(today, spanTo) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    var cap = CC.addDays(today, 399);
    if (spanTo <= cap) return spanTo;
    if (CC.addDays(cap, 1).slice(8) === '01') return cap;
    return CC.addDays(cap.slice(0, 7) + '-01', -1);
  }
  // The strip's months: the span, never past the month of the fetched to.
  function stripMonths(span, to) {
    return monthsInSpan({ from: span.from, to: span.to < to ? span.to : to });
  }
  // The month the strip opens on: the first suggested drop's, else today's, else the first.
  function startIndex(months, firstSuggestion, today) {
    var iso = firstSuggestion ? firstSuggestion.arrival : today;
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    for (var i = 0; i < months.length; i++) if (months[i].year === y && months[i].month1 === m) return i;
    return 0;
  }
  // Which desktop arrows still lead somewhere, from the strip's scroll position.
  function navEnds(left, width, view) {
    return { prev: left > 1, next: left < width - view - 1 };
  }
  function guestCount(g) { return g.ad + g.ch; }
  // A guest step with a stay set. Adults and children drop the old price at once and bump seq, so a quote
  // in flight for the old count is dropped. Infants are never sent: nothing changes. True when a quote is due.
  function guestStep(st, key) {
    if (!st.sel || key === 'inf') return false;
    st.seq++; st.quote = null; st.quoting = true;
    return true;
  }
  // Book links only while the foot shows a current ok total.
  function bookLive(st) {
    return !st.edit && !st.hint && !st.quoting && !!st.quote && st.quote.kind === 'ok';
  }
  function money(cents) {
    return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function centsOf(total) { return Math.round(Number(total) * 100); }
  function shortDate(iso) { var t = leafText(iso); return t.dow + ', ' + t.mon + ' ' + t.day; }
  var DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // The foot pins to the viewport bottom once a stay is picked, whatever it shows.
  function footSticky(st) { return !!st.sel; }
  // The strip's height: the tallest month in view, so a five-week month leaves no sixth-row gap.
  function stripHeight(blocks, left, view) {
    var h = 0;
    blocks.forEach(function (b) {
      if (b.left < left + view - 1 && b.left + b.width > left + 1 && b.height > h) h = b.height;
    });
    return h;
  }
  // A day's spoken name: the full date, then its state.
  function dayLabel(c) {
    var d = utc(c.date), has = function (k) { return c.cls.indexOf(k) > -1; };
    var parts = [DOWL[d.getUTCDay()] + ', ' + MONL[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear()];
    if (has('sel-s')) parts.push('your arrival');
    else if (has('sel-e')) parts.push('your departure');
    else if (has('sel')) parts.push('in your stay');
    if (has('off')) parts.push('booked');
    else if (has('past')) parts.push('past');
    else if (!has('sel')) parts.push('available');
    if (has('drop')) parts.push('drop starts');
    return parts.join(', ');
  }
  function bookLabel(sel, total, name) {
    var a = leafText(sel.arrival), b = leafText(sel.departure);
    return 'Book ' + name + ', ' + a.mon + ' ' + a.day + ' to ' + (a.mon === b.mon ? '' : b.mon + ' ') + b.day + ', ' + total;
  }
  // What the polite live region says for this state, '' for nothing.
  function liveText(st, name) {
    if (st.hint) return st.hint;
    if (st.edit) return st.edit === 'arrive' ? 'Tap your new arrival day' : 'Tap your new departure day';
    if (st.quoting || !st.sel || !st.quote) return '';
    if (st.quote.kind !== 'ok') return st.quote.message;
    var CC = root.CalendarCore || require('./calendar-core.js');
    var a = leafText(st.sel.arrival), b = leafText(st.sel.departure);
    return name + ', ' + a.dow + ' ' + a.mon + ' ' + a.day + ' to ' + b.dow + ' ' + b.mon + ' ' + b.day + ', '
      + nightsText(CC.nightsBetween(st.sel.arrival, st.sel.departure)) + ', ' + st.quote.total + ' all in';
  }
  // Arrow keys in the months: a day left or right, a week up or down, past booked days. null if none.
  var KEY_DAYS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  function keyStep(iso, key, has) {
    var n = KEY_DAYS[key];
    if (!n) return null;
    var CC = root.CalendarCore || require('./calendar-core.js');
    for (var i = 1, d = iso; i <= 62; i++) { d = CC.addDays(d, n); if (has(d)) return d; }
    return null;
  }
  // The one day button in the tab order: a candidate still open and in view, else the first open day in view.
  function rovingDate(dates, cands, from, to) {
    var inView = function (d) { return d >= from && d <= to; };
    for (var i = 0; i < cands.length; i++) if (cands[i] && dates.indexOf(cands[i]) > -1 && inView(cands[i])) return cands[i];
    for (var j = 0; j < dates.length; j++) if (inView(dates[j])) return dates[j];
    for (var k = 0; k < cands.length; k++) if (cands[k] && dates.indexOf(cands[k]) > -1) return cands[k];
    return dates[0] || null;
  }

  // Guest copy from the reason. Never body.message: agent-booking writes that for agents.
  function goneText(body) {
    var r = body.reason;
    var s = r === 'booked' ? 'Those dates are taken.'
      : r === 'min_nights' && body.min_nights ? 'Stays from that day are at least ' + body.min_nights + ' nights.'
      : r === 'max_nights' ? 'That stay is longer than this house allows.'
      : "Those dates aren't available.";
    return body.alternatives && body.alternatives.length ? s + ' Nearest open stays:' : s;
  }
  // The same arrow the house view's link rows use.
  var ARROW_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
  function nightsText(n) { return n + (n === 1 ? ' night' : ' nights'); }
  function footText(total, n) { return total + ' all in \u00b7 ' + nightsText(n); }
  // The Arrive, Depart and Nights rows under the grid, Arrive and Depart in parts for their columns.
  function stayRows(sel) {
    if (!sel) return { arrive: null, depart: null, nights: null };
    var CC = root.CalendarCore || require('./calendar-core.js');
    function parts(iso, time) { var t = leafText(iso); return { dow: t.dow, date: t.mon + ' ' + t.day, time: time }; }
    return {
      arrive: parts(sel.arrival, '4 pm'),
      depart: parts(sel.departure, '12 pm'),
      nights: CC.nightsBetween(sel.arrival, sel.departure),
    };
  }

  // The Nights stepper: checkout moves by delta days, arrival fixed. null when that stay fails stayCheck.
  function nightsStep(map, sel, delta, today) {
    if (!sel) return null;
    var CC = root.CalendarCore || require('./calendar-core.js');
    var dep = CC.addDays(sel.departure, delta);
    if (dep <= sel.arrival || !CC.stayCheck(map, sel.arrival, dep, today).ok) return null;
    return { arrival: sel.arrival, departure: dep };
  }

  // One tap on a day. Returns { stay }, { hint }, or null (a night of the current stay: nothing changes).
  // 3 nights from d if open, else the shortest open length from the day's min_nights to its max_nights
  // (cap 14), else the drop arriving on d, else a hint.
  function tapDay(st, d, map, today, drops) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    if (selNight(st.sel, d)) return null;
    // A day on or after the checkout extends the stay through that night, when it can.
    if (st.sel && d >= st.sel.departure) {
      var ext = CC.addDays(d, 1);
      if (CC.stayCheck(map, st.sel.arrival, ext, today).ok) return { stay: { arrival: st.sel.arrival, departure: ext } };
    }
    var end = CC.addDays(d, 3);
    if (CC.stayCheck(map, d, end, today).ok) return { stay: { arrival: d, departure: end } };
    var e = map.get(d);
    var lo = (e && e.min_nights) || 1;
    var hi = Math.min(e && e.max_nights != null ? e.max_nights : 14, 14);
    for (var n = lo; n <= hi; n++) {
      end = CC.addDays(d, n);
      if (CC.stayCheck(map, d, end, today).ok) return { stay: { arrival: d, departure: end } };
    }
    var s = CC.suggestionAt(drops || st.sugs, d);
    if (s && s.arrival === d) return { stay: { arrival: s.arrival, departure: s.departure } };
    return { hint: 'No stays from that day' };
  }

  // Which date is being changed after a tap on Arrive or Depart: the same field again turns it off.
  function toggleEdit(st, which) { return st.edit === which ? null : which; }

  // One tap on a day while a date is being changed. Returns { stay } or { hint }.
  function tapEdit(st, d, map, today) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    var sel = st.sel;
    if (st.edit === 'arrive') {
      if (d < sel.departure && CC.stayCheck(map, d, sel.departure, today).ok) return { stay: { arrival: d, departure: sel.departure } };
      var end = CC.addDays(d, CC.nightsBetween(sel.arrival, sel.departure));
      if (CC.stayCheck(map, d, end, today).ok) return { stay: { arrival: d, departure: end } };
      return { hint: "Can't arrive that day with these dates" };
    }
    if (d > sel.arrival && CC.stayCheck(map, sel.arrival, d, today).ok) return { stay: { arrival: sel.arrival, departure: d } };
    return { hint: "Can't depart that day" };
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

  function open(o) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    var api = o.api || 'https://book.reset.club';
    var track = o.track || function () {};
    var house = o.code;
    var today = todayIso();

    var st = {
      map: null, sugs: [], maxGuests: null,
      sel: null, g: { ad: 2, ch: 0, inf: 0 }, more: false,
      hint: '', quote: null, quoting: false, seq: 0, edit: null,
    };

    var hc = el('div', 'hc');
    var col = CC.colours(o.colour.bg, o.colour.text);
    hc.style.setProperty('--c', col.c);
    hc.style.setProperty('--c-ink', col.ink);
    hc.style.setProperty('--c-tint', col.tint);
    hc.style.setProperty('--c-deep', col.deep);

    var panel = el('div', 'hc-panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Dates');
    var foot = el('div', 'hc-foot');
    var hintEl = el('span', 'hc-hint');
    var after = el('div');
    after.style.cssText = 'display:grid;gap:12px;padding-top:12px;';
    // Stay, price and hint changes, spoken once each.
    var live = el('p', 'hc-sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    var lastLive = '';

    // The caller owns the expansion around o.mount. close() removes the calendar and tells it.
    function close() {
      quoteSoon.cancel();
      st.seq++;
      hc.remove();
      if (o.onClose) o.onClose();
    }

    o.mount.appendChild(hc);
    track('calendar_opened', { house: house });

    // ---- panel: months, guests ----
    var prev = el('button');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous month');
    prev.textContent = '←';
    var next = el('button');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next month');
    next.textContent = '→';
    var mode = el('div', 'hc-mode');
    mode.appendChild(prev); mode.appendChild(next);

    // Every month is its own block: header, weekday letters, grid. Phones swipe one month,
    // desktop shows two and pages by two.
    var strip = el('div', 'hc-strip');
    strip.tabIndex = 0;
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Months');
    var who = el('div', 'hc-who');
    var months = []; // { year, month1, grid, block }, built on load

    function buildMonths(list) {
      list.forEach(function (mo) {
        var block = el('div', 'hc-month');
        block.setAttribute('role', 'group');
        block.setAttribute('aria-label', MONL[mo.month1 - 1] + ' ' + mo.year);
        var head = el('div', 'hc-head');
        head.setAttribute('aria-hidden', 'true');
        head.appendChild(el('span', 'dp', MON[mo.month1 - 1].toUpperCase()));
        head.appendChild(el('span', 'dp', String(mo.year)));
        var dow = el('div', 'hc-dow');
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (d) { dow.appendChild(el('span', null, d)); });
        var grid = el('div', 'hc-grid');
        block.appendChild(head); block.appendChild(dow); block.appendChild(grid);
        strip.appendChild(block);
        months.push({ year: mo.year, month1: mo.month1, grid: grid, block: block });
      });
      // Desktop pages by two: an odd count gets an empty half so the last page snaps whole.
      if (list.length % 2) strip.appendChild(el('div', 'hc-month hc-month-pad'));
    }

    function paintGrid() {
      // A repaint replaces the day buttons: a focused day keeps the focus.
      var had = document.activeElement && document.activeElement.dataset && strip.contains(document.activeElement) ? document.activeElement.dataset.k : null;
      months.forEach(function (mo) {
        var cells = CC.cellsForMonth(mo.year, mo.month1, { suggestions: st.sugs, sel: st.sel, map: st.map, today: today });
        var grid = mo.grid;
        grid.innerHTML = '';
        cells.forEach(function (c) {
          if (!c) { grid.appendChild(el('span')); return; }
          var b;
          if (c.button) {
            b = el('button', c.cls.join(' '), String(c.day));
            b.type = 'button';
            b.dataset.k = c.date;
            b.setAttribute('aria-label', dayLabel(c));
          } else {
            b = el('span', c.cls.join(' '));
            var num = el('span', null, String(c.day));
            num.setAttribute('aria-hidden', 'true');
            b.appendChild(num);
            b.appendChild(el('span', 'hc-sr', dayLabel(c)));
          }
          grid.appendChild(b);
        });
      });
      paintRove();
      var back = had && strip.querySelector('.hc-grid button[data-k="' + had + '"]');
      if (back) back.focus({ preventScroll: true });
    }
    // Months in view, by their blocks' place in the strip.
    function inView() {
      var left = strip.scrollLeft, view = strip.clientWidth;
      return months.filter(function (mo) { return mo.block.offsetLeft - strip.offsetLeft < left + view - 1 && mo.block.offsetLeft - strip.offsetLeft + mo.block.offsetWidth > left + 1; });
    }
    var focusDay = null;
    function paintRove() {
      var btns = Array.prototype.slice.call(strip.querySelectorAll('.hc-grid button[data-k]'));
      var vis = inView();
      var from = vis.length ? vis[0].year + '-' + String(vis[0].month1).padStart(2, '0') + '-01' : '';
      var last = vis.length ? vis[vis.length - 1] : null;
      var to = last ? last.year + '-' + String(last.month1).padStart(2, '0') + '-31' : '';
      var rove = rovingDate(btns.map(function (b) { return b.dataset.k; }), [focusDay, st.sel && st.sel.arrival], from, to);
      btns.forEach(function (b) { b.tabIndex = b.dataset.k === rove ? 0 : -1; });
    }
    function paintHeight() {
      var h = stripHeight(months.map(function (mo) {
        return { left: mo.block.offsetLeft - strip.offsetLeft, width: mo.block.offsetWidth, height: mo.block.offsetHeight };
      }), strip.scrollLeft, strip.clientWidth);
      if (h) strip.style.height = h + 'px';
    }
    function paintNav() {
      var e = navEnds(strip.scrollLeft, strip.scrollWidth, strip.clientWidth);
      prev.disabled = !e.prev;
      next.disabled = !e.next;
      paintHeight();
    }

    function stepper(label, small, key, min, maxFn) {
      var row = el('div', 'hc-guests');
      var name = el('span', null, label);
      if (small) name.appendChild(el('small', null, small));
      var step = el('span', 'hc-step');
      step.setAttribute('role', 'group');
      step.setAttribute('aria-label', label);
      var minus = el('button', null, '−'); minus.type = 'button';
      minus.setAttribute('aria-label', 'Fewer ' + label.toLowerCase());
      var n = el('b');
      n.setAttribute('aria-live', 'polite');
      var plus = el('button', null, '+'); plus.type = 'button';
      plus.setAttribute('aria-label', 'More ' + label.toLowerCase());
      step.appendChild(minus); step.appendChild(n); step.appendChild(plus);
      row.appendChild(name); row.appendChild(step);
      minus.addEventListener('click', function () { if (st.g[key] > min) { st.g[key]--; guestsChanged(key); } });
      plus.addEventListener('click', function () { if (!maxFn()) { st.g[key]++; guestsChanged(key); } });
      return { row: row, paint: function () { n.textContent = st.g[key]; minus.disabled = st.g[key] <= min; plus.disabled = maxFn(); } };
    }
    function full() { return st.maxGuests != null && guestCount(st.g) >= st.maxGuests; }
    var sAd = stepper('Adults', null, 'ad', 1, full);
    var sCh = stepper('Children', 'Ages 2–12', 'ch', 0, full);
    var sIn = stepper('Infants', 'Under 2 · crib on request', 'inf', 0, function () { return st.g.inf >= 2; });
    var more = el('button', 'hc-more'); more.type = 'button';
    var extra = el('div');
    extra.appendChild(sCh.row); extra.appendChild(sIn.row);

    // The trip: ARRIVE on the left, DEPART on the right, the link-row arrow between.
    var trip = el('div', 'hc-trip');
    who.appendChild(trip);
    function tripSide(label, cls) {
      var side = el('div', 'hc-trip-side ' + cls);
      var v = { side: side, date: el('button', 'hc-trip-date'), time: el('span', 'hc-trip-time') };
      v.date.type = 'button';
      side.appendChild(el('span', 'hc-trip-label', label));
      side.appendChild(v.date); side.appendChild(v.time);
      trip.appendChild(side);
      return v;
    }
    var vIn = tripSide('Arrive', 'hc-trip-in');
    var arrow = el('span', 'hc-trip-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = ARROW_SVG;
    trip.appendChild(arrow);
    var vOut = tripSide('Depart', 'hc-trip-out');
    function paintWhen(v, p, editing) {
      v.date.disabled = !p;
      v.date.setAttribute('aria-label', (v === vIn ? 'Change arrival' : 'Change departure') + (p ? ', ' + p.dow + ' ' + p.date : ''));
      v.date.setAttribute('aria-pressed', String(editing));
      v.date.classList.toggle('editing', editing);
      v.date.textContent = p ? p.dow + ' ' + p.date : '\u2013';
      v.time.textContent = p ? p.time : '';
    }
    var nRow = el('div', 'hc-guests');
    nRow.appendChild(el('span', null, 'Nights'));
    var nStep = el('span', 'hc-step');
    nStep.setAttribute('role', 'group');
    nStep.setAttribute('aria-label', 'Nights');
    var nMinus = el('button', null, '−'); nMinus.type = 'button';
    nMinus.setAttribute('aria-label', 'Fewer nights');
    var nVal = el('b');
    var nPlus = el('button', null, '+'); nPlus.type = 'button';
    nPlus.setAttribute('aria-label', 'More nights');
    nStep.appendChild(nMinus); nStep.appendChild(nVal); nStep.appendChild(nPlus);
    nRow.appendChild(nStep);
    who.appendChild(nRow);
    function stepNights(delta) {
      var ns = nightsStep(st.map, st.sel, delta, today);
      if (!ns) return;
      st.sel = ns; st.hint = ''; st.quote = null; st.quoting = false; st.seq++;
      paintAll();
      quoteSoon();
    }
    nMinus.addEventListener('click', function () { stepNights(-1); });
    nPlus.addEventListener('click', function () { stepNights(1); });
    function paintRows() {
      var r = stayRows(st.sel);
      paintWhen(vIn, r.arrive, st.edit === 'arrive');
      paintWhen(vOut, r.depart, st.edit === 'depart');
      nVal.textContent = r.nights == null ? '\u2013' : r.nights;
      nMinus.disabled = !nightsStep(st.map, st.sel, -1, today);
      nPlus.disabled = !nightsStep(st.map, st.sel, 1, today);
    }

    nRow.classList.add('hc-rule');
    who.appendChild(sAd.row); who.appendChild(more); who.appendChild(extra);
    function paintWho() {
      paintRows();
      sAd.paint(); sCh.paint(); sIn.paint();
      extra.hidden = !st.more;
      more.setAttribute('aria-expanded', String(st.more));
      more.textContent = st.more ? 'Just adults' : 'Anyone else coming along?';
    }
    more.addEventListener('click', function () { st.more = !st.more; paintWho(); });

    // ---- foot: hint or total, Book, quote outcomes ----
    function nights() { return st.sel ? CC.nightsBetween(st.sel.arrival, st.sel.departure) : 0; }
    function defaultHint() { return 'Tap a day to pick dates'; }
    function paintFoot() {
      foot.innerHTML = '';
      after.innerHTML = '';
      var q = st.quote;
      var text = st.hint || (st.edit ? (st.edit === 'arrive' ? 'Tap your new arrival day' : 'Tap your new departure day') : st.quoting ? 'Checking price' : q && q.kind === 'ok' ? footText(q.total, nights()) : st.sel ? '' : defaultHint());
      hintEl.textContent = '';
      if (!st.hint && !st.edit && !st.quoting && q && q.kind === 'ok') {
        hintEl.setAttribute('aria-label', footText(q.total, nights()));
        hintEl.appendChild(el('span', 'hc-amount', q.total));
        hintEl.appendChild(el('span', 'hc-note', 'all in \u00b7 ' + nightsText(nights())));
      } else {
        hintEl.removeAttribute('aria-label');
        hintEl.textContent = text;
      }
      foot.appendChild(hintEl);
      foot.classList.toggle('stuck', footSticky(st));
      var t = liveText(st, o.name);
      if (t !== lastLive) { lastLive = t; live.textContent = t; }
      var book;
      if (bookLive(st)) {
        book = el('a', 'hc-book', 'Book');
        book.href = q.href;
        book.setAttribute('aria-label', bookLabel(st.sel, q.total, o.name));
        book.addEventListener('click', function () {
          track('calendar_book_pressed', { house: house, nights: nights(), total: q.total_cents / 100 });
        });
      } else {
        book = el('button', 'hc-book', 'Book');
        book.type = 'button';
        book.disabled = true;
      }
      foot.appendChild(book);
      // Empty, the messages box takes no room between the guests and the foot.
      after.style.display = 'none';
      if (st.quoting || !q) return;
      after.style.display = q.kind === 'ok' ? 'none' : 'grid';
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

    function paintAll() { paintGrid(); paintWho(); paintFoot(); }

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
      st.sel = sel; st.hint = ''; st.quote = null; st.seq++; st.quoting = false; st.edit = null;
      paintAll();
      if (quiet) return;
      track('calendar_range_picked', { house: house, nights: nights(), from_drop: fromDrop(sel) });
      requestQuote();
    }
    // Guest steps settle for 300 ms before one quote. Stay changes still quote at once.
    var quoteSoon = debounce(requestQuote, GUEST_DEBOUNCE_MS);
    function guestsChanged(key) {
      paintWho();
      if (guestStep(st, key)) { paintFoot(); quoteSoon(); }
    }

    // Tapping a trip date starts (or ends) changing it, and the strip shows the month holding it.
    function showMonthOf(iso) {
      var y = +iso.slice(0, 4), m = +iso.slice(5, 7);
      for (var i = 0; i < months.length; i++) {
        if (months[i].year !== y || months[i].month1 !== m) continue;
        var blk = months[i].block;
        var perPage = blk.offsetWidth * 1.5 < strip.clientWidth ? 2 : 1;
        var left = perPage === 2 ? Math.floor(i / 2) * strip.clientWidth
          : strip.scrollLeft + blk.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        strip.scrollTo({ left: left, behavior: 'smooth' });
        return;
      }
    }
    function editDate(which) {
      if (!st.sel) return;
      st.edit = toggleEdit(st, which);
      st.hint = '';
      paintAll();
      if (st.edit) showMonthOf(which === 'arrive' ? st.sel.arrival : st.sel.departure);
    }
    vIn.date.addEventListener('click', function () { editDate('arrive'); });
    vOut.date.addEventListener('click', function () { editDate('depart'); });

    // Desktop arrows move one two-month page.
    prev.addEventListener('click', function () { strip.scrollBy({ left: -strip.clientWidth, behavior: 'smooth' }); });
    next.addEventListener('click', function () { strip.scrollBy({ left: strip.clientWidth, behavior: 'smooth' }); });
    strip.addEventListener('scroll', paintNav, { passive: true });
    strip.addEventListener('scrollend', paintNav);
    strip.addEventListener('scrollend', paintRove);

    // Drag a selected stay to slide it as in the design. While it drags the strip does not pan.
    var drag = { on: false, grab: null, orig: null, moved: false, until: 0 };
    strip.addEventListener('pointerdown', function (e) {
      if (!st.sel || st.edit) return;
      var b = e.target.closest('.hc-grid button[data-k]');
      if (!b || !selNight(st.sel, b.dataset.k)) return;
      e.preventDefault();
      drag.on = true; drag.moved = false; drag.grab = b.dataset.k; drag.orig = st.sel;
      strip.classList.add('dragging');
      strip.setPointerCapture(e.pointerId);
    });
    strip.addEventListener('pointermove', function (e) {
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
      strip.classList.remove('dragging');
      if (drag.moved) { drag.until = Date.now() + 350; setStay(st.sel); }
      drag.moved = false;
    }
    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);

    // Arrow keys move between open days, Enter and Space tap (buttons do that natively).
    strip.addEventListener('keydown', function (e) {
      var b = e.target.closest && e.target.closest('.hc-grid button[data-k]');
      if (!b) return;
      var d = keyStep(b.dataset.k, e.key, function (x) { return !!strip.querySelector('.hc-grid button[data-k="' + x + '"]'); });
      if (!d) return;
      e.preventDefault();
      var t = strip.querySelector('.hc-grid button[data-k="' + d + '"]');
      focusDay = d;
      paintRove();
      t.focus({ preventScroll: true });
      if (!inView().some(function (mo) { return mo.year === +d.slice(0, 4) && mo.month1 === +d.slice(5, 7); })) showMonthOf(d);
    });
    strip.addEventListener('focusin', function (e) {
      if (e.target.dataset && e.target.dataset.k) focusDay = e.target.dataset.k;
    });

    strip.addEventListener('click', function (e) {
      var b = e.target.closest('.hc-grid button[data-k]');
      if (!b) return;
      var d = b.dataset.k;
      if (Date.now() < drag.until) return;
      var r = st.edit ? tapEdit(st, d, st.map, today) : tapDay(st, d, st.map, today, st.sugs);
      if (!r) return;
      if (r.stay) { setStay(r.stay); return; }
      st.hint = r.hint;
      paintFoot();
    });

    // ---- load ----
    var to = fetchTo(today, CC.monthSpan(today, o.drops).to);
    var url = api + '/v1/calendar?property_code=' + encodeURIComponent(house) + '&from=' + today + '&to=' + to;
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        if (!data || !Array.isArray(data.days)) throw new Error('bad calendar');
        st.map = CC.dayMap(data.days);
        st.maxGuests = data.max_guests;
        if (st.maxGuests != null) st.g.ad = Math.max(1, Math.min(st.g.ad, st.maxGuests));
        st.sugs = CC.suggestions(o.drops, st.map, today);
        var list = stripMonths(CC.monthSpan(today, st.sugs), to);
        buildMonths(list);
        panel.appendChild(mode); panel.appendChild(strip); panel.appendChild(who);
        hc.appendChild(live); hc.appendChild(panel); hc.appendChild(after); hc.appendChild(foot);
        paintAll();
        // Open on the start month, or on desktop the two-month page holding it. Picks never move the strip.
        var i = startIndex(list, st.sugs[0] || null, today);
        var two = root.matchMedia && root.matchMedia('(min-width:768px)').matches;
        strip.scrollLeft = months[two ? i - (i % 2) : i].block.offsetLeft - strip.offsetLeft;
        paintNav();
        paintRove();
        strip.focus({ preventScroll: true });
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

    return { close: close, refresh: paintNav };
  }

  return {
    open: open, leafText: leafText, monthLabel: monthLabel, guestCount: guestCount,
    monthsInSpan: monthsInSpan, fetchTo: fetchTo, stripMonths: stripMonths, guestStep: guestStep, bookLive: bookLive, startIndex: startIndex, navEnds: navEnds,
    footSticky: footSticky, stripHeight: stripHeight, dayLabel: dayLabel, bookLabel: bookLabel, liveText: liveText, keyStep: keyStep, rovingDate: rovingDate,
    quoteView: quoteView, calendarFallback: calendarFallback, tapDay: tapDay, tapEdit: tapEdit, toggleEdit: toggleEdit, footText: footText, stayRows: stayRows, nightsStep: nightsStep, selNight: selNight,
    debounce: debounce, GUEST_DEBOUNCE_MS: GUEST_DEBOUNCE_MS,
  };
});
