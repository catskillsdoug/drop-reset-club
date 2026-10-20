// Pure rules and grid model for the house booking calendar. No DOM, no globals read.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalendarCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var DAY = 86400000;

  function parse(iso) {
    var p = iso.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function fmt(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    return fmt(parse(iso) + n * DAY);
  }
  function nightsBetween(a, b) {
    return Math.round((parse(b) - parse(a)) / DAY);
  }

  function dayMap(days) {
    var m = new Map();
    (days || []).forEach(function (d) {
      m.set(d.date, { status: d.status, min_nights: d.min_nights, max_nights: d.max_nights, no_checkout: !!d.no_checkout });
    });
    return m;
  }

  function stayCheck(map, arrival, departure, today) {
    if (arrival < today) return { ok: false, reason: 'past' };
    var n = nightsBetween(arrival, departure), i, d;
    for (i = 0; i < n; i++) {
      if (!map.has(addDays(arrival, i))) return { ok: false, reason: 'unknown' };
    }
    for (i = 0; i < n; i++) {
      if (map.get(addDays(arrival, i)).status !== 'available') return { ok: false, reason: 'booked' };
    }
    var first = map.get(arrival);
    if (first && n < first.min_nights) return { ok: false, reason: 'min_nights' };
    if (first && n > first.max_nights) return { ok: false, reason: 'max_nights' };
    d = map.get(departure);
    if (d && d.no_checkout) return { ok: false, reason: 'no_checkout' };
    return { ok: true };
  }

  function suggestions(drops, map, today) {
    return (drops || [])
      .filter(function (d) {
        return d.dropStatus === 'Available' && stayCheck(map, d.arrival, d.departure, today).ok;
      })
      .map(function (d) {
        return { arrival: d.arrival, departure: d.departure, nights: d.nights, total: d.pricing ? d.pricing.total : null, dropId: d.dropId };
      })
      .sort(function (a, b) { return a.arrival < b.arrival ? -1 : a.arrival > b.arrival ? 1 : 0; });
  }

  function suggestionAt(list, date) {
    var i;
    for (i = 0; i < list.length; i++) if (list[i].arrival === date) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].arrival <= date && date < list[i].departure) return list[i];
    return null;
  }

  function slide(map, sel, offset, today) {
    var arrival = addDays(sel.arrival, offset), departure = addDays(sel.departure, offset);
    return stayCheck(map, arrival, departure, today).ok ? { arrival: arrival, departure: departure } : null;
  }

  function cellsForMonth(year, month1, state) {
    var first = Date.UTC(year, month1 - 1, 1);
    var count = new Date(Date.UTC(year, month1, 0)).getUTCDate();
    var lead = (new Date(first).getUTCDay() + 6) % 7;
    var cells = [], i;
    for (i = 0; i < lead; i++) cells.push(null);

    var sugById = {};
    if (state.mode === 'sug') {
      state.suggestions.forEach(function (s) {
        var n = nightsBetween(s.arrival, s.departure);
        for (var k = 0; k < n; k++) {
          sugById[addDays(s.arrival, k)] = k === 0 ? 'bs' : k === n - 1 ? 'be' : 'bm';
        }
      });
    }
    var sel = state.sel, selN = sel ? nightsBetween(sel.arrival, sel.departure) : 0;

    for (i = 1; i <= count; i++) {
      var date = fmt(first + (i - 1) * DAY);
      var cls = [];
      var past = date < state.today;
      var e = state.map.get(date);
      var off = !past && (!e || e.status !== 'available');
      if (past) cls.push('past');
      if (off) cls.push('off');
      var inSel = sel && date >= sel.arrival && date < sel.departure;
      if (state.mode === 'sug' && !inSel) {
        if (sugById[date]) cls.push('blk', sugById[date]);
        else if (!past && !off) cls.push('nob');
      }
      if (inSel) {
        cls.push('sel');
        if (date === sel.arrival) cls.push('sel-s');
        if (date === addDays(sel.arrival, selN - 1)) cls.push('sel-e');
      }
      var button = !past && !off;
      if (state.pick && date > state.pick) {
        button = stayCheck(state.map, state.pick, date, state.today).ok;
        if (!button) cls.push('nodep');
      }
      cells.push({ date: date, day: i, cls: cls, button: button });
    }
    return cells;
  }

  function monthSpan(today, list) {
    var latest = addDays(today, 180);
    (list || []).forEach(function (s) { if (s.departure > latest) latest = s.departure; });
    var p = latest.split('-');
    var last = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate();
    return { from: today.slice(0, 7) + '-01', to: p[0] + '-' + p[1] + '-' + (last < 10 ? '0' : '') + last };
  }

  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function hex(a) {
    return '#' + a.map(function (v) { return Math.round(v).toString(16).padStart(2, '0'); }).join('');
  }
  function mix(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }
  function lum(c) {
    var x = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function colours(bg, text) {
    var c = rgb(bg);
    var deep = mix(c, [0, 0, 0], 0.35);
    if (contrast(deep, [255, 255, 255]) < 4.5) deep = mix(c, [0, 0, 0], 0.6);
    return { c: bg.toLowerCase(), ink: text.toLowerCase(), tint: hex(mix(c, [255, 255, 255], 0.88)), deep: hex(deep) };
  }

  return {
    addDays: addDays, nightsBetween: nightsBetween, dayMap: dayMap, stayCheck: stayCheck,
    suggestions: suggestions, suggestionAt: suggestionAt, slide: slide,
    cellsForMonth: cellsForMonth, monthSpan: monthSpan, colours: colours,
  };
});
