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
  // Calm loading (Doug, 2 Nov): days painted this long after the data comes fade in, and the picked stay draws across.
  var INTRO_MS = 700;
  var SHOW_DELAY_MS = 180;
  // How long a strip height change holds the strip in place: longer than its .2s height transition.
  var HOLD_MS = 300;
  // A preset stay OwnerRez refuses (same-day check-in after noon) moves on to the next stay, this many times.
  var PRESET_TRIES = 3;
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
  // After the layout changes between one and two months per view: the month to show. The selected
  // stay's arrival month wins, else the month that was in view before the change.
  function resizeTarget(sel, inView) { return sel ? sel.arrival : inView; }
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
  // The foot shows the total of a current ok quote. A hint from a tap that found no stay leaves it standing.
  function footTotal(st) {
    return !st.edit && !st.quoting && !!st.quote && st.quote.kind === 'ok';
  }
  // Book links only while the foot shows a current ok total.
  function bookLive(st) { return footTotal(st); }
  function money(cents) {
    return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function centsOf(total) { return Math.round(Number(total) * 100); }
  function shortDate(iso) { var t = leafText(iso); return t.dow + ', ' + t.mon + ' ' + t.day; }
  var DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // A focused button that just disabled itself (a stepper at its limit): the other enabled button takes focus.
  function keepFocus(had, btns) {
    if (!had || !had.disabled || btns.indexOf(had) < 0) return null;
    for (var i = 0; i < btns.length; i++) if (btns[i] !== had && !btns[i].disabled) return btns[i];
    return null;
  }
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
    if (c.hol) parts.push(c.hol.label);
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
    var inc = holidayLine(stayHolidays(st.sel, st.hol));
    return name + ', ' + a.dow + ' ' + a.mon + ' ' + a.day + ' to ' + b.dow + ' ' + b.mon + ' ' + b.day + ', '
      + nightsText(CC.nightsBetween(st.sel.arrival, st.sel.departure)) + ', ' + st.quote.total + ' all in' + (inc ? ', i' + inc.slice(1) : '');
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
  // Holidays from /v1/calendar, drawn in place of the date (Doug, 2 Nov). Lucide paths (ISC licence), 20px, stroke 2.25 to sit with the bold dates.
  var HOLIDAY_PATHS = {
    drumstick: ['M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23', 'm8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59'],
    flag: ['M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528'],
    star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
    hammer: ['m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9', 'm18 15 4-4', 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5'],
    feather: ['M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z', 'M16 8 2 22', 'M17.488 15H9'],
    // gift's rect drawn as a path, so every icon is paths only.
    gift: ['M4 7h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z', 'M12 7v14', 'M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8', 'M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5'],
    'party-popper': ['M5.8 11.3 2 22l10.7-3.79', 'M4 3h.01', 'M22 8h.01', 'M15 2h.01', 'M22 20h.01', 'm22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10', 'm22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17', 'm11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7', 'M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z'],
    megaphone: ['M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14', 'M8 6v8'],
    landmark: ['M10 18v-7', 'M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z', 'M14 18v-7', 'M18 18v-7', 'M3 22h18', 'M6 18v-7'],
    // award's circle and unlink's lines drawn as paths too.
    award: ['m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526', 'M6 8a6 6 0 1 0 12 0a6 6 0 1 0-12 0'],
    unlink: ['m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71', 'm5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71', 'M8 2v3', 'M2 8h3', 'M16 19v3', 'M19 16h3'],
    heart: ['M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'],
    ghost: ['M9 10h.01', 'M15 10h.01', 'M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z'],
    beer: ['M17 11h1a3 3 0 0 1 0 6h-1', 'M9 12v6', 'M13 12v6', 'M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z', 'M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8'],
    snowflake: ['m10 20-1.25-2.5L6 18', 'M10 4 8.75 6.5 6 6', 'm14 20 1.25-2.5L18 18', 'm14 4 1.25 2.5L18 6', 'm17 21-3-6h-4', 'm17 3-3 6 1.5 3', 'M2 12h6.5L10 9', 'm20 10-1.5 2 1.5 2', 'M22 12h-6.5L14 15', 'm4 10 1.5 2L4 14', 'm7 21 3-6-1.5-3', 'm7 3 3 6h4'],
    // sun's and flower's circles drawn as paths.
    sun: ['M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
    leaf: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z', 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'],
    sprout: ['M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3', 'M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4', 'M5 21h14'],
    flower: ['M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5', 'M12 7.5V9', 'M7.5 12H9', 'M16.5 12H15', 'M12 16.5V15', 'm8 8 1.88 1.88', 'M14.12 9.88 16 8', 'm8 16 1.88-1.88', 'M14.12 14.12 16 16'],
    'clock-arrow-up': ['M12 6v6l1.56.78', 'M13.227 21.925a10 10 0 1 1 8.767-9.588', 'm14 18 4-4 4 4', 'M18 22v-8'],
    'clock-arrow-down': ['M12 6v6l2 1', 'M12.337 21.994a10 10 0 1 1 9.588-8.767', 'm14 18 4 4 4-4', 'M18 14v8'],
  };
  function holidayIcon(name, size) {
    var paths = Object.prototype.hasOwnProperty.call(HOLIDAY_PATHS, name) ? HOLIDAY_PATHS[name] : null;
    if (!paths) return null;
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</svg>';
  }
  function holidayMap(list) {
    var m = new Map();
    (Array.isArray(list) ? list : []).forEach(function (h) { if (h && h.date) m.set(h.date, h); });
    return m;
  }
  // The hover: the holiday and its short date, e.g. Thanksgiving, Thu 26 Nov.
  function holidayTitle(h) {
    var d = utc(h.date);
    return h.label + ', ' + DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
  }
  function now() { return Date.now(); }
  // The months the skeleton draws before the data comes: this month, and the next on desktop.
  function skeletonMonths(today, two) {
    var y = +today.slice(0, 4), m = +today.slice(5, 7);
    var list = [{ year: y, month1: m }];
    if (two) list.push(m === 12 ? { year: y + 1, month1: 1 } : { year: y, month1: m + 1 });
    return list;
  }
  // How far into the intro a paint falls, so a repaint carries the fade and draw on; null before the data or once played.
  function introAge(t0, t) {
    if (t0 == null) return null;
    var a = t - t0;
    return a < INTRO_MS ? a : null;
  }
  // The band crosses a stay in about 0.3 seconds, never slower than 60ms a day.
  function drawStep(n) { return n > 0 ? Math.min(60, Math.round(300 / n)) : 60; }
  // The holidays on a stay's nights: the arrival day counts, the departure day does not.
  function stayHolidays(sel, hol) {
    if (!sel || !hol) return [];
    var out = [];
    hol.forEach(function (h, d) { if (d >= sel.arrival && d < sel.departure) out.push(h); });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  // Includes Thanksgiving; Includes Christmas and New Year's Day.
  function holidayLine(list) {
    if (!list.length) return '';
    var names = list.map(function (h) { return h.label; });
    var last = names.pop();
    return 'Includes ' + (names.length ? names.join(', ') + ' and ' : '') + last;
  }
  // The foot's holiday line (Doug, 2 Nov): a hovered or keyed-to holiday by name and date, else the stay's holidays, else none.
  function footHoliday(st) {
    var h = st.peek && st.hol && st.hol.get(st.peek);
    if (h) return { list: [h], text: holidayTitle(h) };
    var list = stayHolidays(st.sel, st.hol);
    return list.length ? { list: list, text: holidayLine(list) } : null;
  }
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

  // The Pick dates link, as URL parameters: ?stay=cook&arrive=…&depart=…&adults=2&children=0. Infants are never sent.
  var SHARED_GONE = "Those dates aren't open any more";
  function shareParams(code, sel, g) {
    var p = { stay: String(code).toLowerCase() };
    if (!sel) return p;
    p.arrive = sel.arrival; p.depart = sel.departure; p.adults = String(g.ad); p.children = String(g.ch);
    return p;
  }
  // A link back to { code, sel, g }; sel or g null when they do not parse, null with no house.
  function readShare(search) {
    var CC = root.CalendarCore || require('./calendar-core.js');
    var q = new URLSearchParams(search || '');
    var code = q.get('stay');
    if (!code || !/^[a-z0-9]{1,16}$/i.test(code)) return null;
    var a = q.get('arrive'), d = q.get('depart'), iso = /^\d{4}-\d{2}-\d{2}$/;
    var sel = iso.test(a || '') && iso.test(d || '') && d > a && CC.nightsBetween(a, d) <= 30 ? { arrival: a, departure: d } : null;
    var ad = q.get('adults'), ch = q.get('children'), num = /^\d{1,2}$/;
    var g = num.test(ad || '') && num.test(ch == null ? '0' : ch) && +ad >= 1 ? { ad: +ad, ch: +(ch || 0) } : null;
    return { code: code.toUpperCase(), sel: sel, g: g };
  }
  // The stay pre-selected on open: the earliest open stay from today, as a tap on its arrival day gives it.
  // With after, the earliest one arriving later than that day.
  function firstStay(map, today, drops, after) {
    var days = Array.from(map.keys()).filter(function (d) { return d >= today && !(after && d <= after); }).sort();
    for (var i = 0; i < days.length; i++) {
      var r = tapDay({ sel: null, sugs: drops || [] }, days[i], map, today, drops);
      if (r && r.stay) return r.stay;
    }
    return null;
  }
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

  // Where Book goes: the page's own bookHref(stay, guests) when it gives one (book.reset.club, its checkout), else the quote's hand-off.
  function bookTarget(o, q, sel, g) {
    return o.bookHref ? o.bookHref(sel, g) : q.href;
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
      map: null, sugs: [], maxGuests: null, hol: new Map(), peek: null, t0: null, d0: null,
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
    foot.tabIndex = -1;
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

    // The months' shape, faint, from the first frame; the real days replace it when the data comes.
    function skeleton(list) {
      var sp = el('div', 'hc-panel hc-skel');
      sp.setAttribute('aria-hidden', 'true');
      var sm = el('div', 'hc-mode');
      ['\u2190', '\u2192'].forEach(function (t) { var b = el('button', null, t); b.type = 'button'; b.disabled = true; b.tabIndex = -1; sm.appendChild(b); });
      var ss = el('div', 'hc-strip');
      list.forEach(function (mo) {
        var block = el('div', 'hc-month');
        var head = el('div', 'hc-head');
        head.appendChild(el('span', 'dp', MON[mo.month1 - 1].toUpperCase()));
        head.appendChild(el('span', 'dp', String(mo.year)));
        var dow = el('div', 'hc-dow');
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (d) { dow.appendChild(el('span', null, d)); });
        var grid = el('div', 'hc-grid');
        var first = new Date(Date.UTC(mo.year, mo.month1 - 1, 1));
        var count = new Date(Date.UTC(mo.year, mo.month1, 0)).getUTCDate();
        for (var i = 0; i < (first.getUTCDay() + 6) % 7; i++) grid.appendChild(el('span'));
        for (var d = 1; d <= count; d++) grid.appendChild(el('span', null, String(d)));
        block.appendChild(head); block.appendChild(dow); block.appendChild(grid);
        ss.appendChild(block);
      });
      sp.appendChild(sm); sp.appendChild(ss);
      return sp;
    }
    var skel = skeleton(skeletonMonths(today, !!(root.matchMedia && root.matchMedia('(min-width:768px)').matches)));
    hc.appendChild(skel);

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
      var age = introAge(st.t0, now()), dage = introAge(st.d0, now());
      months.forEach(function (mo) {
        var cells = CC.cellsForMonth(mo.year, mo.month1, { suggestions: st.sugs, sel: st.sel, map: st.map, today: today });
        var grid = mo.grid;
        grid.innerHTML = '';
        cells.forEach(function (c) {
          if (!c) { grid.appendChild(el('span')); return; }
          c.hol = st.hol.get(c.date);
          var icon = c.hol && holidayIcon(c.hol.icon);
          var b;
          if (c.button) {
            b = el('button', c.cls.join(' '), icon ? null : String(c.day));
            if (icon) b.innerHTML = icon;
            b.type = 'button';
            b.dataset.k = c.date;
            b.setAttribute('aria-label', dayLabel(c));
          } else {
            b = el('span', c.cls.join(' '));
            var num = el('span', null, icon ? null : String(c.day));
            if (icon) num.innerHTML = icon;
            num.setAttribute('aria-hidden', 'true');
            b.appendChild(num);
            b.appendChild(el('span', 'hc-sr', dayLabel(c)));
          }
          if (c.hol) b.dataset.hol = c.date;
          if (st.sel && dage != null && c.cls.indexOf('sel') > -1) {
            b.classList.add('hc-draw');
            b.style.setProperty('--age', dage + 'ms');
            b.style.setProperty('--i', CC.nightsBetween(st.sel.arrival, c.date));
            b.style.setProperty('--step', drawStep(nights()) + 'ms');
          } else if (age != null) {
            b.classList.add('hc-in');
            b.style.setProperty('--age', age + 'ms');
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
      if (!h || strip.style.height === h + 'px') return;
      // Not the first height: the page is still scrolling the calendar into place then.
      if (strip.style.height) holdStrip();
      strip.style.height = h + 'px';
    }
    // While the strip's height eases to a new month, the strip keeps its place on screen. Otherwise, with the
    // page scrolled into the calendar, the browser's scroll anchoring can hold a node below it still and move
    // the grid up or down instead.
    var holdUntil = 0, holdTop = 0;
    function holdStrip() {
      var running = Date.now() < holdUntil;
      holdUntil = Date.now() + HOLD_MS;
      if (running) return;
      holdTop = strip.getBoundingClientRect().top;
      requestAnimationFrame(function frame() {
        if (!hc.isConnected) return;
        var d = strip.getBoundingClientRect().top - holdTop;
        if (Math.abs(d) >= 1) root.scrollBy(0, d);
        if (Date.now() < holdUntil) requestAnimationFrame(frame);
      });
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
      return { row: row, paint: function () {
        var had = document.activeElement;
        n.textContent = st.g[key];
        minus.disabled = st.g[key] <= min; plus.disabled = maxFn();
        var to = keepFocus(had, [minus, plus]);
        if (to) to.focus({ preventScroll: true });
      } };
    }
    function full() { return st.maxGuests != null && guestCount(st.g) >= st.maxGuests; }
    var sAd = stepper('Adults', null, 'ad', 1, full);
    var sCh = stepper('Children', 'Ages 2–12', 'ch', 0, full);
    var sIn = stepper('Infants', 'Under 2 · baby accessories available', 'inf', 0, function () { return st.g.inf >= 2; });
    var more = el('button', 'hc-more'); more.type = 'button';
    var extra = el('div', 'hc-extra');
    extra.appendChild(sCh.row); extra.appendChild(sIn.row);

    // The trip: ARRIVE on the left, DEPART on the right, the link-row arrow between.
    var trip = el('div', 'hc-trip');
    who.appendChild(trip);
    function tripSide(label, cls) {
      var side = el('div', 'hc-trip-side ' + cls);
      var v = { side: side, date: el('button', 'hc-trip-date'), time: el('span', 'hc-trip-time') };
      v.date.type = 'button';
      // The time rides on the label line: ARRIVE · 4 PM, then the date.
      var head = el('span', 'hc-trip-label', label);
      head.appendChild(v.time);
      side.appendChild(head);
      side.appendChild(v.date);
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
      var had = document.activeElement;
      nVal.textContent = r.nights == null ? '\u2013' : r.nights;
      nMinus.disabled = !nightsStep(st.map, st.sel, -1, today);
      nPlus.disabled = !nightsStep(st.map, st.sel, 1, today);
      var to = keepFocus(had, [nMinus, nPlus]);
      if (to) to.focus({ preventScroll: true });
    }

    nRow.classList.add('hc-rule');
    who.appendChild(sAd.row); who.appendChild(more); who.appendChild(extra);
    function paintWho() {
      paintRows();
      sAd.paint(); sCh.paint(); sIn.paint();
      extra.hidden = !st.more;
      more.setAttribute('aria-expanded', String(st.more));
      more.textContent = st.more ? 'Just adults' : 'Anyone else coming along?';
      if (o.onChange) o.onChange(shareParams(house, st.sel, st.g));
    }
    // Opening shows the Children and Infants rows above the pinned price bar (html scroll-padding-bottom).
    more.addEventListener('click', function () {
      st.more = !st.more;
      paintWho();
      if (st.more) extra.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    // ---- foot: hint or total, Book, quote outcomes ----
    function nights() { return st.sel ? CC.nightsBetween(st.sel.arrival, st.sel.departure) : 0; }
    function defaultHint() { return 'Tap a day to pick dates'; }
    function paintFoot() {
      // Focus on a control the repaint replaces (Try again, an alternative, Book) comes back to the foot.
      var held = foot.contains(document.activeElement) || after.contains(document.activeElement);
      foot.innerHTML = '';
      after.innerHTML = '';
      paintHoliday();
      var q = st.quote;
      var priced = footTotal(st);
      var text = st.hint || (st.edit ? (st.edit === 'arrive' ? 'Tap your new arrival day' : 'Tap your new departure day') : st.quoting ? 'Checking price' : q && q.kind === 'ok' ? footText(q.total, nights()) : st.sel ? '' : defaultHint());
      var wasChecking = hintEl.classList.contains('hc-checking');
      hintEl.textContent = '';
      hintEl.className = 'hc-hint';
      if (priced) {
        hintEl.setAttribute('aria-label', footText(q.total, nights()));
        hintEl.appendChild(el('span', wasChecking ? 'hc-amount hc-land' : 'hc-amount', q.total));
        hintEl.appendChild(el('span', 'hc-note', 'all in \u00b7 ' + nightsText(nights())));
      } else if (text === 'Checking price' && st.sel) {
        // The price row stays while the price is checked, so it lands in place.
        hintEl.className = 'hc-hint hc-checking';
        hintEl.setAttribute('aria-label', text);
        hintEl.appendChild(el('span', 'hc-amount', '\u00a0'));
        hintEl.appendChild(el('span', 'hc-note', text));
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
        book.href = bookTarget(o, q, st.sel, st.g);
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
      if (held) (book.disabled ? foot : book).focus({ preventScroll: true });
      // Empty, the messages box takes no room between the guests and the foot.
      after.style.display = 'none';
      if (st.quoting || !q) return;
      after.style.display = priced && !st.hint ? 'none' : 'grid';
      if (priced && st.hint) after.appendChild(el('p', 'hc-msg', st.hint));
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

    // The holiday line heads the foot, so showing it pushes the foot up.
    var holEl = null;
    function paintHoliday() {
      var fh = footHoliday(st);
      if (holEl) { holEl.remove(); holEl = null; }
      if (!fh) return;
      holEl = el('div', 'hc-holiday');
      holEl.innerHTML = fh.list.map(function (h) { return holidayIcon(h.icon, 16) || ''; }).join('');
      holEl.appendChild(el('span', null, fh.text));
      foot.insertBefore(holEl, foot.firstChild);
    }
    function peek(d) {
      if (d === st.peek) return;
      st.peek = d;
      paintHoliday();
    }

    function paintAll() { paintGrid(); paintWho(); paintFoot(); }

    // presetLeft: tries left to move a refused preset on; a guest's own pick passes nothing.
    function requestQuote(presetLeft) {
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
          if (v.kind === 'refused' && presetLeft > 0) {
            var next = firstStay(st.map, today, st.sugs, st.sel.arrival);
            if (next) { setStay(next, true); showMonthOf(next.arrival, true); requestQuote(presetLeft - 1); return; }
          }
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
    function showMonthOf(iso, instant) {
      var y = +iso.slice(0, 4), m = +iso.slice(5, 7);
      for (var i = 0; i < months.length; i++) {
        if (months[i].year !== y || months[i].month1 !== m) continue;
        var blk = months[i].block;
        var perPage = blk.offsetWidth * 1.5 < strip.clientWidth ? 2 : 1;
        var left = perPage === 2 ? Math.floor(i / 2) * strip.clientWidth
          : strip.scrollLeft + blk.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        strip.scrollTo({ left: left, behavior: instant ? 'auto' : 'smooth' });
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
    // Which month is in view, and how many months a view holds, so a resize keeps the right month.
    var viewMonth = null, perView = 0;
    function perPageNow() { return months.length && months[0].block.offsetWidth * 1.5 < strip.clientWidth ? 2 : 1; }
    function trackView() {
      var sl = strip.getBoundingClientRect().left;
      for (var i = 0; i < months.length; i++) {
        if (months[i].block.getBoundingClientRect().right > sl + 1) { viewMonth = months[i].year + '-' + String(months[i].month1).padStart(2, '0') + '-01'; break; }
      }
    }
    function refresh() {
      var per = perPageNow();
      if (perView && per !== perView) {
        var target = resizeTarget(st.sel, viewMonth);
        if (target) showMonthOf(target, true);
      }
      perView = per;
      paintNav();
      trackView();
    }
    strip.addEventListener('scroll', trackView, { passive: true });
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
      // Keyboard focus names a holiday as hover does; a tap's focus does not.
      if (e.target.dataset && e.target.matches(':focus-visible')) peek(e.target.dataset.hol || null);
    });
    strip.addEventListener('focusout', function () { peek(null); });
    strip.addEventListener('mouseover', function (e) {
      var c = e.target.closest && e.target.closest('.hc-grid [data-hol]');
      peek(c ? c.dataset.hol : null);
    });
    strip.addEventListener('mouseleave', function () { peek(null); });

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
        skel.remove();
        st.t0 = st.d0 = now();
        st.map = CC.dayMap(data.days);
        st.hol = holidayMap(data.holidays);
        st.maxGuests = data.max_guests;
        // A shared link's guests, held to the house's maximum; children open the Anyone else rows.
        if (o.initial && o.initial.g) { st.g.ad = o.initial.g.ad; st.g.ch = o.initial.g.ch; }
        if (st.maxGuests != null) st.g.ad = Math.max(1, Math.min(st.g.ad, st.maxGuests));
        if (st.maxGuests != null) st.g.ch = Math.max(0, Math.min(st.g.ch, st.maxGuests - st.g.ad));
        st.more = st.g.ch > 0;
        st.sugs = CC.suggestions(o.drops, st.map, today);
        var list = stripMonths(CC.monthSpan(today, st.sugs), to);
        buildMonths(list);
        panel.appendChild(mode); panel.appendChild(strip); panel.appendChild(who);
        hc.appendChild(live); hc.appendChild(panel); hc.appendChild(after); hc.appendChild(foot);
        paintAll();
        // A shared link's stay when it is still open, else the earliest open stay, picked and priced at once;
        // both tracked apart from a guest's own pick. Shared dates that have gone get a note beside the price.
        var shared = o.initial && o.initial.sel && CC.stayCheck(st.map, o.initial.sel.arrival, o.initial.sel.departure, today).ok ? o.initial.sel : null;
        var first = shared || firstStay(st.map, today, st.sugs);
        if (first) { setStay(first, true); track(shared ? 'calendar_shared_opened' : 'calendar_stay_preset', { house: house, nights: nights() }); requestQuote(shared ? 0 : PRESET_TRIES); }
        if (o.initial && o.initial.sel && !shared) { st.hint = SHARED_GONE; paintFoot(); }
        // Open on that stay's month (else the first drop's), or on desktop the two-month page holding it. Picks never move the strip.
        var i = startIndex(list, first || st.sugs[0] || null, today);
        var two = root.matchMedia && root.matchMedia('(min-width:768px)').matches;
        strip.scrollLeft = months[two ? i - (i % 2) : i].block.offsetLeft - strip.offsetLeft;
        refresh();
        paintRove();
        // Focus lands on the months for screen readers, without the keyboard ring around the whole calendar
        // until the guest actually uses keys there.
        strip.setAttribute('data-quiet', '');
        strip.addEventListener('keydown', function () { strip.removeAttribute('data-quiet'); }, { once: true });
        strip.addEventListener('blur', function () { strip.removeAttribute('data-quiet'); }, { once: true });
        if (o.focus !== false) strip.focus({ preventScroll: true });
      })
      .catch(function () {
        skel.remove();
        var fb = calendarFallback(o.fallbackHref);
        var box = el('div', 'hc-panel');
        box.style.paddingTop = '16px';
        box.appendChild(el('p', 'hc-msg', fb.message));
        var a = el('a', 'hc-more', 'Booking page');
        a.href = fb.href;
        box.appendChild(a);
        hc.appendChild(box);
      });

    // A calendar loaded out of sight draws its stay again when shown, starting as the panel finishes sliding in.
    function drawStay() { if (!st.sel) return; st.t0 = null; st.d0 = now() + SHOW_DELAY_MS; paintGrid(); }
    return { close: close, refresh: refresh, focus: function () { strip.focus({ preventScroll: true }); }, drawStay: drawStay };
  }

  return {
    open: open, leafText: leafText, monthLabel: monthLabel, guestCount: guestCount,
    monthsInSpan: monthsInSpan, fetchTo: fetchTo, stripMonths: stripMonths, guestStep: guestStep, bookLive: bookLive, startIndex: startIndex, navEnds: navEnds, resizeTarget: resizeTarget,
    footSticky: footSticky, holidayMap: holidayMap, holidayIcon: holidayIcon, holidayTitle: holidayTitle, skeletonMonths: skeletonMonths, introAge: introAge, drawStep: drawStep, INTRO_MS: INTRO_MS, stayHolidays: stayHolidays, holidayLine: holidayLine, footHoliday: footHoliday, footTotal: footTotal, keepFocus: keepFocus, stripHeight: stripHeight, dayLabel: dayLabel, bookLabel: bookLabel, liveText: liveText, keyStep: keyStep, rovingDate: rovingDate,
    quoteView: quoteView, bookTarget: bookTarget, calendarFallback: calendarFallback, tapDay: tapDay, firstStay: firstStay, shareParams: shareParams, readShare: readShare, tapEdit: tapEdit, toggleEdit: toggleEdit, footText: footText, stayRows: stayRows, nightsStep: nightsStep, selNight: selNight,
    debounce: debounce, GUEST_DEBOUNCE_MS: GUEST_DEBOUNCE_MS, HOLD_MS: HOLD_MS,
  };
});
