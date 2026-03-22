// Stay Drops v5 — Matching 2026.reset.club/drops design
// Supabase-backed API, season scroll-snap, rich rows

const API_URL = 'https://reset-inventory-sync.doug-6f9.workers.dev/api/drops';
// Init from URL param
window.__dropType = new URLSearchParams(window.location.search).get('type') === 'midweek' ? 1 : 0;

// Season windows (from reset-site windows.ts)
const WINDOWS = [
  { slug: 'deep-winter', name: 'Deep Winter', dates: 'Jan 1–14', startMonth: 1, startDay: 1, endMonth: 1, endDay: 14, theme: 'haze', description: 'The quietest two weeks of the year. Snow on the ground, fires all day, hot tub every night.' },
  { slug: 'long-nights', name: 'Long Nights', dates: 'Jan 15–28', startMonth: 1, startDay: 15, endMonth: 1, endDay: 28, theme: 'wave', description: 'The nights are still long but the days are getting brighter. Mid-January in the mountains has a particular kind of quiet.' },
  { slug: 'frost', name: 'Frost', dates: 'Feb 1–14', startMonth: 2, startDay: 1, endMonth: 2, endDay: 14, theme: 'wave', description: 'Valentine\u2019s season. Cold outside, warm inside. The best two weeks for a couples trip.' },
  { slug: 'thaw', name: 'Thaw', dates: 'Feb 15–28', startMonth: 2, startDay: 15, endMonth: 2, endDay: 28, theme: 'haze', description: 'The ice is breaking up. You can feel spring coming but it\u2019s not here yet.' },
  { slug: 'false-spring', name: 'False Spring', dates: 'Mar 1–14', startMonth: 3, startDay: 1, endMonth: 3, endDay: 14, theme: 'dirt', description: 'The snow is melting, the trails are soft, and the mornings are still cold enough to justify staying in bed.' },
  { slug: 'early-spring', name: 'Early Spring', dates: 'Mar 15–28', startMonth: 3, startDay: 15, endMonth: 3, endDay: 28, theme: 'moss', description: 'The first real warmth. Buds on the trees, longer light, the deck starts being usable again.' },
  { slug: 'first-green', name: 'First Green', dates: 'Apr 1–14', startMonth: 4, startDay: 1, endMonth: 4, endDay: 14, theme: 'mist', description: 'Everything starts to turn. Farm stands set up, trails dry out, hiking season begins.' },
  { slug: 'bloom', name: 'Bloom', dates: 'Apr 15–28', startMonth: 4, startDay: 15, endMonth: 4, endDay: 28, theme: 'tree', description: 'Peak spring. Wildflowers on the trails, open windows all day, grilling outside for the first time.' },
  { slug: 'late-spring', name: 'Late Spring', dates: 'May 1–14', startMonth: 5, startDay: 1, endMonth: 5, endDay: 14, theme: 'mint', description: 'The Catskills are fully open. Farm stands everywhere, hiking trails dry and fast.' },
  { slug: 'warm-days', name: 'Warm Days', dates: 'May 15–28', startMonth: 5, startDay: 15, endMonth: 5, endDay: 28, theme: 'moon', description: 'Summer is coming. The days are long, the evenings are perfect.' },
  { slug: 'early-summer', name: 'Early Summer', dates: 'Jun 1–14', startMonth: 6, startDay: 1, endMonth: 6, endDay: 14, theme: 'sand', description: 'Summer arrives. Creek swimming, firefly season, the longest light of the year approaching.' },
  { slug: 'solstice', name: 'Solstice', dates: 'Jun 15–28', startMonth: 6, startDay: 15, endMonth: 6, endDay: 28, theme: 'sand', description: 'The longest day of the year. Golden hour lasts forever.' },
  { slug: 'high-summer', name: 'High Summer', dates: 'Jul 1–14', startMonth: 7, startDay: 1, endMonth: 7, endDay: 14, theme: 'pine', description: 'Peak summer. Fourth of July in the mountains \u2014 swimming holes, cookouts, fireworks.' },
  { slug: 'dog-days', name: 'Dog Days', dates: 'Jul 15–28', startMonth: 7, startDay: 15, endMonth: 7, endDay: 28, theme: 'melo', description: 'The hottest weeks. Creek swimming every day, cold drinks on the porch.' },
  { slug: 'late-summer', name: 'Late Summer', dates: 'Aug 1–14', startMonth: 8, startDay: 1, endMonth: 8, endDay: 14, theme: 'pine', description: 'The days are still hot but the light is changing. Last chance for swimming holes.' },
  { slug: 'golden-hour', name: 'Golden Hour', dates: 'Aug 15–28', startMonth: 8, startDay: 15, endMonth: 8, endDay: 28, theme: 'melo', description: 'The light goes golden. Labor Day is coming.' },
  { slug: 'early-fall', name: 'Early Fall', dates: 'Sep 1–14', startMonth: 9, startDay: 1, endMonth: 9, endDay: 14, theme: 'toma', description: 'The first cool mornings. Apple season starts.' },
  { slug: 'harvest', name: 'Harvest', dates: 'Sep 15–28', startMonth: 9, startDay: 15, endMonth: 9, endDay: 28, theme: 'melo', description: 'Apple picking, farm stands overflowing, the first hints of color.' },
  { slug: 'peak-foliage', name: 'Peak Foliage', dates: 'Oct 1–14', startMonth: 10, startDay: 1, endMonth: 10, endDay: 14, theme: 'melo', description: 'The main event. Every mountainside on fire. Book early or miss it.' },
  { slug: 'late-autumn', name: 'Late Autumn', dates: 'Oct 15–28', startMonth: 10, startDay: 15, endMonth: 10, endDay: 28, theme: 'dirt', description: 'The leaves are falling. Quieter than peak foliage, just as beautiful.' },
  { slug: 'first-frost', name: 'First Frost', dates: 'Nov 1–14', startMonth: 11, startDay: 1, endMonth: 11, endDay: 14, theme: 'sand', description: 'The first real cold. Frost on the windows, bare branches.' },
  { slug: 'bare-branches', name: 'Bare Branches', dates: 'Nov 15–28', startMonth: 11, startDay: 15, endMonth: 11, endDay: 28, theme: 'soak', description: 'The trees are bare and the views open up. You can see for miles.' },
  { slug: 'early-winter', name: 'Early Winter', dates: 'Dec 1–14', startMonth: 12, startDay: 1, endMonth: 12, endDay: 14, theme: 'haze', description: 'Winter arrives. The first snow is always a surprise.' },
  { slug: 'holidays', name: 'Holidays', dates: 'Dec 15–28', startMonth: 12, startDay: 15, endMonth: 12, endDay: 28, theme: 'wave', description: 'The holiday season in the mountains.' },
  { slug: 'new-years', name: "New Year's", dates: 'Dec 29–31', startMonth: 12, startDay: 29, endMonth: 12, endDay: 31, theme: 'ink', description: 'End the year somewhere quiet.' },
];

const THEMES = {
  ink:  { bg: '#000000', text: '#fcf6e9' },
  sand: { bg: '#fcf6e9', text: '#000000' },
  toma: { bg: '#ff551e', text: '#fcf6e9' },
  melo: { bg: '#ffc974', text: '#000000' },
  pine: { bg: '#fcddab', text: '#000000' },
  dirt: { bg: '#9c8336', text: '#fcf6e9' },
  tree: { bg: '#019740', text: '#fcf6e9' },
  moss: { bg: '#9c9b34', text: '#fcf6e9' },
  moon: { bg: '#e9f782', text: '#000000' },
  mint: { bg: '#bbf5d0', text: '#000000' },
  mist: { bg: '#d3f7e0', text: '#000000' },
  wave: { bg: '#3f65f6', text: '#fcf6e9' },
  haze: { bg: '#e6edfd', text: '#000000' },
  soak: { bg: '#d2e6f1', text: '#000000' },
};

const DISPLAY = { COOK: 'Cook', ZINK: 'Zink', HILL4: 'Hill', BARN: 'Barn' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (n) => `$${Math.round(n).toLocaleString()}`;
const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

function timeAgo(date) {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return '1 hour ago';
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function getFilters() {
  const p = new URLSearchParams(window.location.search);
  return {
    property: (p.get('property') || '').toUpperCase() || null,
    type: (p.get('type') || '').toLowerCase() || null,
  };
}

function getWindowForDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  for (const w of WINDOWS) {
    if (month === w.startMonth && day >= w.startDay && day <= w.endDay) return w;
    if (w.startMonth !== w.endMonth) {
      if ((month === w.startMonth && day >= w.startDay) || (month === w.endMonth && day <= w.endDay)) return w;
    }
  }
  return null;
}

// Get current season window
function getCurrentWindow() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  for (const w of WINDOWS) {
    if (month === w.startMonth && day >= w.startDay && day <= w.endDay) return w;
  }
  return WINDOWS[0];
}

// Relative heading: "This Weekend", "Next Weekend", etc.
function getRelativeHeading(drops, isWeekend) {
  const word = isWeekend ? 'Weekend' : 'Midweek';
  if (drops.length === 0) return word;
  const firstDate = new Date(drops[0].arrival + 'T12:00:00Z');
  const now = new Date();
  const getWeekStart = (d) => { const s = new Date(d); s.setUTCDate(s.getUTCDate() - s.getUTCDay()); s.setUTCHours(0,0,0,0); return s; };
  const weeksDiff = Math.round((getWeekStart(firstDate).getTime() - getWeekStart(now).getTime()) / (7 * 86400000));
  if (weeksDiff === 0) return `This ${word}`;
  if (weeksDiff === 1) return `Next ${word}`;
  return word;
}

// Format drop detail line (without property): "Thu–Sun · Mar 26–29 · 3 nights"
function formatDropDetail(drop) {
  const checkIn = new Date(drop.arrival + 'T12:00:00Z');
  const checkOut = drop.departure ? new Date(drop.departure + 'T12:00:00Z') : new Date(checkIn.getTime() + (drop.nights || 3) * 86400000);
  const dayRange = `${DAYS[checkIn.getUTCDay()]}\u2013${DAYS[checkOut.getUTCDay()]}`;
  const sameMonth = checkIn.getUTCMonth() === checkOut.getUTCMonth();
  const dateRange = sameMonth
    ? `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${checkOut.getUTCDate()}`
    : `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${MONTHS[checkOut.getUTCMonth()]} ${checkOut.getUTCDate()}`;
  const n = drop.nights || 3;
  return `${dayRange} \u00b7 ${dateRange} \u00b7 ${n} night${n !== 1 ? 's' : ''}`;
}

const ARROW_SVG = '<svg class="drop-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
const DOWN_SVG = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M12 5v14M5 13l7 7 7-7"/></svg>';

const QUOTE_URL = 'https://reset-price-quote.doug-6f9.workers.dev/quote';

// Generate all possible arrival dates within a season window
// Weekend: Thu(4) + Fri(5), Midweek: Sun(0) + Mon(1)
const PROPERTIES = ['COOK', 'ZINK', 'HILL4', 'BARN'];
const PROP_LABELS = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };
const PROP_NIGHTS = { Weekend: 3, Weekday: 3 };

function generateExpectedDrops(window, year) {
  const results = [];
  const startDate = new Date(Date.UTC(year, window.startMonth - 1, window.startDay));
  const endDate = new Date(Date.UTC(year, window.endMonth - 1, window.endDay));

  // For weekends: generate one drop per weekend (Fri arrival) not two (Thu+Fri)
  // For midweek: generate one drop per midweek (Sun arrival) not two (Sun+Mon)
  // This way a sold weekend = one row, not two
  const weekendDay = 5; // Fri
  const midweekDay = 0; // Sun

  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    const arrival = d.toISOString().split('T')[0];
    const nights = 3;
    const dep = new Date(d.getTime() + nights * 86400000);
    const departure = dep.toISOString().split('T')[0];

    if (dow === weekendDay) {
      for (const code of PROPERTIES) {
        results.push({ arrival, departure, nights, stayType: 'Weekend', property: { code, label: PROP_LABELS[code] } });
      }
    }
    if (dow === midweekDay) {
      for (const code of PROPERTIES) {
        results.push({ arrival, departure, nights, stayType: 'Weekday', property: { code, label: PROP_LABELS[code] } });
      }
    }
  }
  return results;
}

function buildSoldRow(drop) {
  const div = document.createElement('div');
  div.className = 'drop-row drop-row-sold';

  const checkIn = new Date(drop.arrival + 'T12:00:00Z');
  const checkOut = new Date(drop.departure + 'T12:00:00Z');
  const dayRange = `${DAYS[checkIn.getUTCDay()]}\u2013${DAYS[checkOut.getUTCDay()]}`;
  const sameMonth = checkIn.getUTCMonth() === checkOut.getUTCMonth();
  const dateRange = sameMonth
    ? `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${checkOut.getUTCDate()}`
    : `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${MONTHS[checkOut.getUTCMonth()]} ${checkOut.getUTCDate()}`;
  const nightsText = `${drop.nights} night${drop.nights !== 1 ? 's' : ''}`;

  div.innerHTML = `<span class="drop-days">${esc(dayRange)}</span><span class="drop-sep">\u00b7</span><span class="drop-dates">${esc(dateRange)}</span><span class="drop-sep drop-sep-nights">\u00b7</span><span class="drop-nights">${esc(nightsText)}</span><span class="drop-tag"></span><span class="drop-spacer"></span><span class="drop-price">SOLD</span>${ARROW_SVG}`;
  return div;
}

function buildDropRow(drop) {
  const a = document.createElement('a');
  a.className = 'drop-row';
  a.href = drop.bookingUrl || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const checkIn = new Date(drop.arrival + 'T12:00:00Z');
  const checkOut = drop.departure ? new Date(drop.departure + 'T12:00:00Z') : new Date(checkIn.getTime() + (drop.nights || 3) * 86400000);
  const dayRange = `${DAYS[checkIn.getUTCDay()]}\u2013${DAYS[checkOut.getUTCDay()]}`;
  const sameMonth = checkIn.getUTCMonth() === checkOut.getUTCMonth();
  const dateRange = sameMonth
    ? `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${checkOut.getUTCDate()}`
    : `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${MONTHS[checkOut.getUTCMonth()]} ${checkOut.getUTCDate()}`;
  const n = drop.nights || 3;
  const nightsText = `${n} night${n !== 1 ? 's' : ''}`;
  const total = drop.pricing?.total ? parseFloat(drop.pricing.total) : 0;
  const priceHtml = total > 0 ? fmt(total) : '';

  // Data attributes for live price refresh
  a.dataset.property = drop.property.code;
  a.dataset.checkin = drop.arrival;
  a.dataset.checkout = drop.departure || checkOut.toISOString().split('T')[0];

  // Pick tag: holiday > vibe > moon > timing
  const tags = drop.tags || {};
  let tag = '';
  const holiday = Array.isArray(tags.holiday) ? tags.holiday[0] : tags.holiday;
  const vibe = Array.isArray(tags.vibe) ? tags.vibe[0] : tags.vibe;
  const moon = Array.isArray(tags.moon) ? tags.moon[0] : tags.moon;
  const timing = Array.isArray(tags.timing) ? tags.timing[0] : tags.timing;
  if (holiday) tag = holiday;
  else if (vibe) tag = vibe;
  else if (moon) tag = moon;
  else if (timing) tag = timing;
  const tagHtml = tag ? `<span class="drop-tag">\u00b7 ${esc(tag)}</span>` : '<span class="drop-tag"></span>';

  a.innerHTML = `<span class="drop-days">${esc(dayRange)}</span><span class="drop-sep">\u00b7</span><span class="drop-dates">${esc(dateRange)}</span><span class="drop-sep drop-sep-nights">\u00b7</span><span class="drop-nights">${esc(nightsText)}</span>${tagHtml}<span class="drop-spacer"></span><span class="drop-price">${priceHtml}</span>${ARROW_SVG}`;
  return a;
}

// Track which sections have been refreshed
const refreshedSections = new Set();

// Fetch live prices for drop rows in a specific section
// Slot machine price animation
// Keeps $ and , in place, cycles all digit positions
function startSlotMachine(priceEl) {
  if (priceEl._slotInterval) return;
  const cached = priceEl.dataset.cached || '$1,000';
  // Extract the structure: positions of digits vs fixed chars ($, ,)
  const template = cached.split('').map(c => /\d/.test(c) ? 'D' : c);

  // Lock the first digit, cycle the rest
  const firstDigitIdx = template.indexOf('D');
  const firstDigit = cached.split('').find(c => /\d/.test(c)) || '1';

  const cycle = () => {
    priceEl.textContent = template.map((c, i) => {
      if (c !== 'D') return c;
      if (i === firstDigitIdx) return firstDigit;
      return Math.floor(Math.random() * 10);
    }).join('');
  };
  cycle();
  priceEl._slotInterval = setInterval(cycle, 60);
}

function stopSlotMachine(priceEl, finalPrice) {
  if (priceEl._slotInterval) {
    clearInterval(priceEl._slotInterval);
    priceEl._slotInterval = null;
  }
  const target = fmt(finalPrice);
  const chars = target.split('');
  // Find digit positions
  const digitPositions = chars.map((c, i) => /\d/.test(c) ? i : -1).filter(i => i >= 0);

  let step = 1; // skip first digit — already locked

  function revealNext() {
    if (step >= digitPositions.length) {
      priceEl.textContent = target;
      return;
    }
    // Lock one more digit from the left
    step++;
    const lockedUpTo = digitPositions[step - 1];
    let display = '';
    for (let i = 0; i < chars.length; i++) {
      if (!/\d/.test(chars[i])) {
        display += chars[i]; // $ and , always show
      } else if (i <= lockedUpTo) {
        display += chars[i]; // locked digit
      } else {
        display += Math.floor(Math.random() * 10); // still cycling
      }
    }
    priceEl.textContent = display;
    setTimeout(revealNext, 100);
  }

  revealNext();
}

async function refreshSectionPrices(section) {
  if (!section || refreshedSections.has(section.id)) return;
  refreshedSections.add(section.id);

  const rows = section.querySelectorAll('.drop-row[data-property]');
  if (rows.length === 0) return;

  // Save cached prices — show them immediately, no animation on load
  rows.forEach(row => {
    const priceEl = row.querySelector('.drop-price');
    if (priceEl) {
      priceEl.dataset.cached = priceEl.textContent.trim();
    }
  });

  // Process all visible rows in parallel
  const batchSize = 8;
  const allRows = Array.from(rows);
  for (let i = 0; i < allRows.length; i += batchSize) {
    const batch = allRows.slice(i, i + batchSize);
    await Promise.all(batch.map(async (row) => {
      const { property, checkin, checkout } = row.dataset;
      const priceEl = row.querySelector('.drop-price');
      try {
        const res = await fetch(`${QUOTE_URL}?property=${property}&checkin=${checkin}&checkout=${checkout}&guests=2`);
        if (!res.ok) {
          if (priceEl) stopSlotMachine(priceEl, parseFloat(priceEl.textContent.replace(/[$,]/g, '')) || 0);
          return;
        }
        const data = await res.json();
        if (data.total && data.total > 0 && priceEl) {
          const livePrice = fmt(data.total);
          const cached = priceEl.dataset.cached || '';
          if (livePrice !== cached) {
            // Price changed — animate the transition
            startSlotMachine(priceEl);
            setTimeout(() => stopSlotMachine(priceEl, data.total), 400);
          }
          // If same, no visual change needed
        }
      } catch (e) {
        // Stop animation, keep whatever price is showing
        if (priceEl && priceEl._slotInterval) { clearInterval(priceEl._slotInterval); priceEl._slotInterval = null; }
      }
    }));
  }

  // Update status bar
  const statusBar = section._priceStatus;
  if (statusBar) {
    statusBar.querySelector('.price-status-left').textContent = 'Prices updated';
    statusBar.querySelector('.price-status-right').textContent = 'just now';
    statusBar.classList.add('price-status-done');
  }
}

// Append property rows into a shared grid container
// Property name goes in column 1 on first row, blank on rest
function appendPropertyToGrid(grid, propCode, drops, isLast) {
  const propName = DISPLAY[propCode] || propCode;

  drops.forEach((drop, i) => {
    // Property name cell (column 1)
    const propCell = document.createElement('span');
    propCell.className = 'drop-prop';
    if (i === 0) {
      propCell.textContent = propName;
    }
    grid.appendChild(propCell);

    // Drop row (columns 2+)
    const row = drop._sold ? buildSoldRow(drop) : buildDropRow(drop);
    if (i < drops.length - 1) {
      row.classList.add('drop-row-inner');
    }
    grid.appendChild(row);
  });

  // Full-width property divider (unless last property)
  if (!isLast) {
    const divider = document.createElement('div');
    divider.className = 'property-divider';
    grid.appendChild(divider);
  }
}

function buildSoldOutRow(type, themeText) {
  const div = document.createElement('div');
  div.className = 'sold-row';
  div.style.borderColor = themeText;
  div.innerHTML = `<span class="group-sold-label">Sold out</span>`;
  return div;
}

function buildSection(w, weekendDrops, midweekDrops, isLast, nextWindow, isCurrent, filters) {
  const theme = THEMES[w.theme] || THEMES.sand;
  const section = document.createElement('section');
  section.className = 'section';
  section.id = `season-${w.slug}`;
  section.style.backgroundColor = theme.bg;
  section.style.color = theme.text;
  section.dataset.theme = w.theme;
  section.dataset.navBg = theme.bg;
  section.dataset.navText = theme.text;

  const inner = document.createElement('div');
  inner.className = 'section-inner';

  // Filter notice (property only — type is handled by toggle)
  if (filters.property) {
    const notice = document.createElement('div');
    notice.className = 'filter-notice';
    notice.innerHTML = `Showing: ${filters.property} &nbsp; <a href="/v5">Clear</a>`;
    inner.appendChild(notice);
  }

  // Title
  const title = document.createElement('h2');
  title.className = 'text-scaled';
  const descenders = /[gjpqy]/i;
  const firstWord = w.name.split(' ')[0];
  title.style.lineHeight = descenders.test(firstWord) ? '0.95' : '0.85';
  title.textContent = w.name;
  inner.appendChild(title);

  // Meta: NOW OPEN / UPCOMING · dates
  const meta = document.createElement('p');
  meta.className = 'section-meta';
  meta.textContent = `${isCurrent ? 'NOW OPEN' : 'UPCOMING'} \u00b7 ${w.dates}`;
  inner.appendChild(meta);

  // Description
  if (w.description) {
    const desc = document.createElement('p');
    desc.className = 'section-description';
    desc.textContent = w.description;
    inner.appendChild(desc);
  }

  // Drops content wrapper (fades in)
  const content = document.createElement('div');
  content.className = 'drops-content loaded';

  const showWeekend = true;
  const showMidweek = true;
  const maxPerGroup = 7;

  // Helper: group drops by property, preserving order of first appearance
  function groupByProperty(drops) {
    const order = [];
    const map = {};
    for (const drop of drops) {
      const code = drop.property.code;
      if (!map[code]) { map[code] = []; order.push(code); }
      map[code].push(drop);
    }
    return order.map(code => ({ code, drops: map[code] }));
  }

  // Inline toggle replaces group headings (when not URL-filtered)
  {
    const toggleRow = document.createElement('div');
    toggleRow.className = 'toggle-heading';

    const toggle = document.createElement('div');
    toggle.className = 'drop-toggle';
    toggle.setAttribute('role', 'switch');
    toggle.style.borderColor = theme.text;

    const selector = document.createElement('div');
    selector.className = 'drop-toggle-selector';
    selector.style.backgroundColor = theme.text;

    const activeIndex = window.__dropType || 0;
    selector.style.transform = `translateX(${activeIndex * 100}%)`;

    const labels = ['Weekend', 'Midweek'];
    labels.forEach((label, i) => {
      const span = document.createElement('span');
      span.className = 'drop-toggle-option';
      span.textContent = label;
      span.dataset.index = String(i);
      span.style.color = i === activeIndex ? theme.bg : `${theme.text}50`;
      toggle.appendChild(span);
    });

    toggle.insertBefore(selector, toggle.firstChild);

    toggle.addEventListener('click', (e) => {
      const target = e.target;
      let newIndex;
      if (target.dataset && target.dataset.index !== undefined) {
        newIndex = parseInt(target.dataset.index);
      } else {
        newIndex = (window.__dropType || 0) === 0 ? 1 : 0;
      }
      window.__dropType = newIndex;
      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('type', newIndex === 0 ? 'weekend' : 'midweek');
      history.replaceState(null, '', url);
      // Update ALL toggles on page
      document.querySelectorAll('.drop-toggle').forEach(t => {
        const sel = t.querySelector('.drop-toggle-selector');
        const secEl = t.closest('section');
        const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
        if (sel) sel.style.transform = `translateX(${newIndex * 100}%)`;
        t.querySelectorAll('.drop-toggle-option').forEach((opt, idx) => {
          opt.style.color = idx === newIndex ? secTheme.bg : `${secTheme.text}50`;
        });
      });
      // Show/hide weekend vs midweek groups
      document.querySelectorAll('.drops-group-weekend').forEach(el => {
        el.style.display = newIndex === 0 ? '' : 'none';
      });
      document.querySelectorAll('.drops-group-midweek').forEach(el => {
        el.style.display = newIndex === 1 ? '' : 'none';
      });
    });

    toggleRow.appendChild(toggle);
    content.appendChild(toggleRow);
  }

  // Weekend group
  if (showWeekend) {
    const weekendGroup = document.createElement('div');
    weekendGroup.className = 'drops-group-weekend';
    if ((window.__dropType || 0) !== 0) weekendGroup.style.display = 'none';
    const limited = weekendDrops.slice(0, maxPerGroup);
    if (limited.length === 0) {
      weekendGroup.appendChild(buildSoldOutRow('Weekend', theme.text));
    } else {
      const grid = document.createElement('div');
      grid.className = 'drops-grid';
      const groups = groupByProperty(limited);
      groups.forEach((g, i) => appendPropertyToGrid(grid, g.code, g.drops, i === groups.length - 1));
      weekendGroup.appendChild(grid);
    }
    content.appendChild(weekendGroup);
  }

  // Midweek group
  if (showMidweek) {
    const midweekGroup = document.createElement('div');
    midweekGroup.className = 'drops-group-midweek';
    if ((window.__dropType || 0) !== 1) midweekGroup.style.display = 'none';
    const limited = midweekDrops.slice(0, maxPerGroup);
    if (limited.length === 0) {
      midweekGroup.appendChild(buildSoldOutRow('Midweek', theme.text));
    } else {
      const grid = document.createElement('div');
      grid.className = 'drops-grid';
      const groups = groupByProperty(limited);
      groups.forEach((g, i) => appendPropertyToGrid(grid, g.code, g.drops, i === groups.length - 1));
      midweekGroup.appendChild(grid);
    }
    content.appendChild(midweekGroup);
  }

  // Price status bar
  const priceStatus = document.createElement('div');
  priceStatus.className = 'price-status';
  // Show "prices from" timestamp if available
  const asOf = window.__pricesAsOf;
  priceStatus.innerHTML = `<span class="price-status-left">Updating prices\u2026</span><span class="price-status-right">${asOf ? 'Prices from ' + timeAgo(asOf) : ''}</span>`;
  content.appendChild(priceStatus);
  section._priceStatus = priceStatus;

  inner.appendChild(content);

  // Footer on last section
  if (isLast) {
    const footer = document.createElement('div');
    footer.className = 'footer-row';
    footer.innerHTML = `<span class="footer-brand">RESET</span><span class="footer-location">Space for what matters</span>`;
    inner.appendChild(footer);
  }

  section.appendChild(inner);

  // Down arrow (not on last)
  if (!isLast && nextWindow) {
    const btn = document.createElement('button');
    btn.className = 'scroll-btn bounce';
    btn.innerHTML = DOWN_SVG;
    btn.addEventListener('click', () => {
      document.getElementById(`season-${nextWindow.slug}`)?.scrollIntoView({ behavior: 'smooth' });
    });
    inner.appendChild(btn);
  }

  return section;
}

// Nav scroll observer
function setupScrollObserver() {
  const nav = document.getElementById('nav');
  const sections = document.querySelectorAll('.section');
  let scrollTimer;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
        const theme = THEMES[entry.target.dataset.theme] || THEMES.sand;
        nav.style.color = theme.text;
        nav.style.backgroundColor = theme.bg;
        document.body.style.backgroundColor = theme.bg;
        if (entry.target.id) history.replaceState(null, '', `#${entry.target.id}`);
        // Refresh live prices when section becomes visible
        refreshSectionPrices(entry.target);
      }
    }
  }, { threshold: [0.3, 0.5, 0.7] });

  sections.forEach(s => observer.observe(s));

  window.addEventListener('scroll', () => {
    nav.classList.add('hidden');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => nav.classList.remove('hidden'), 200);
  }, { passive: true });
}

// Main
async function init() {
  const filters = getFilters();
  const currentWin = getCurrentWindow();

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    let drops = data.drops || [];
    const generatedAt = data.generated ? new Date(data.generated) : null;
    window.__pricesAsOf = generatedAt;

    if (filters.property) {
      drops = drops.filter(d => d.property.code === filters.property);
    }

    // Hide drops with no price
    drops = drops.filter(d => {
      const total = d.pricing?.total ? parseFloat(d.pricing.total) : 0;
      return total > 0;
    });

    // Build a set of available weekends/midweeks per property
    // A weekend is keyed by the Friday date, a midweek by the Sunday date
    // If ANY arrival in that window exists (Thu or Fri for weekends), it's not sold
    const availableWeekends = new Set(); // "COOK|2026-04-10" (Fri date)
    const availableMidweeks = new Set(); // "COOK|2026-04-12" (Sun date)
    for (const drop of drops) {
      const d = new Date(drop.arrival + 'T12:00:00Z');
      const dow = d.getUTCDay();
      const code = drop.property.code;
      if (drop.stayType === 'Weekend') {
        // Map Thu(4) to its Fri, Fri(5) stays as-is
        const fri = dow === 4 ? new Date(d.getTime() + 86400000) : d;
        availableWeekends.add(`${code}|${fri.toISOString().split('T')[0]}`);
      } else {
        // Map Mon(1) to its Sun, Sun(0) stays as-is
        const sun = dow === 1 ? new Date(d.getTime() - 86400000) : d;
        availableMidweeks.add(`${code}|${sun.toISOString().split('T')[0]}`);
      }
    }

    // Group available drops by window
    const windowDrops = new Map();
    for (const drop of drops) {
      const w = getWindowForDate(drop.arrival);
      if (!w) continue;
      if (!windowDrops.has(w.slug)) windowDrops.set(w.slug, []);
      drop._sold = false;
      windowDrops.get(w.slug).push(drop);
    }

    // Generate expected drops and add sold ones
    const now = new Date();
    const year = now.getFullYear();
    for (const w of WINDOWS) {
      const expected = generateExpectedDrops(w, year);
      for (const exp of expected) {
        // Only add future dates
        if (exp.arrival < now.toISOString().split('T')[0]) continue;
        const key = `${exp.property.code}|${exp.arrival}`;
        const isAvailable = exp.stayType === 'Weekend'
          ? availableWeekends.has(key)
          : availableMidweeks.has(key);
        if (!isAvailable) {
          exp._sold = true;
          if (!windowDrops.has(w.slug)) windowDrops.set(w.slug, []);
          windowDrops.get(w.slug).push(exp);
        }
      }
    }

    // Get upcoming windows (starting from current, max 6)
    const currentIdx = WINDOWS.findIndex(w => w.slug === currentWin.slug);
    const upcoming = [];
    for (let i = currentIdx; i < WINDOWS.length && upcoming.length < 6; i++) {
      upcoming.push(WINDOWS[i]);
    }

    // All upcoming windows have drops (available + sold calendar)
    const activeWindows = upcoming.filter(w => {
      const wDrops = windowDrops.get(w.slug) || [];
      return wDrops.length > 0;
    });

    if (activeWindows.length === 0) {
      const main = document.getElementById('main');
      main.innerHTML = `<section class="section" style="background:#fcf6e9;color:#000;justify-content:center;align-items:center">
        <div class="section-inner" style="justify-content:center;align-items:center">
          <h2 class="text-scaled" style="line-height:0.85;text-align:center">Sold Out</h2>
          <p class="section-description" style="text-align:center;max-width:none">No drops available right now. Check back soon.</p>
        </div>
      </section>`;
      return;
    }

    const main = document.getElementById('main');
    main.innerHTML = '';

    activeWindows.forEach((w, i) => {
      const wDrops = windowDrops.get(w.slug) || [];
      const isLast = i === activeWindows.length - 1;
      const nextWindow = isLast ? null : activeWindows[i + 1];
      const isCurrent = w.slug === currentWin.slug;

      // Sort: available first, then sold. Within each group, by arrival date.
      const sortDrops = (a, b) => {
        if (a._sold !== b._sold) return a._sold ? 1 : -1;
        return a.arrival.localeCompare(b.arrival);
      };
      const weekend = wDrops.filter(d => d.stayType === 'Weekend').sort(sortDrops);
      const midweek = wDrops.filter(d => d.stayType !== 'Weekend').sort(sortDrops);

      main.appendChild(buildSection(w, weekend, midweek, isLast, nextWindow, isCurrent, filters));
    });

    // First season is already the first with visible drops
    const firstWithDrops = activeWindows[0];

    // Set initial nav + body color from first visible section
    const hash = window.location.hash;
    const scrollTarget = hash ? hash.slice(1) : `season-${firstWithDrops.slug}`;
    const scrollTargetWin = activeWindows.find(w => `season-${w.slug}` === scrollTarget) || firstWithDrops;
    const initTheme = THEMES[scrollTargetWin.theme] || THEMES.sand;
    const navEl = document.getElementById('nav');
    navEl.style.color = initTheme.text;
    navEl.style.backgroundColor = initTheme.bg;
    document.body.style.backgroundColor = initTheme.bg;

    setupScrollObserver();

    // Auto-scroll to hash or first available season
    setTimeout(() => {
      const el = document.getElementById(scrollTarget);
      if (el) el.scrollIntoView({ behavior: 'instant' });
    }, 50);

    // Refresh live prices for the first visible section
    const firstSection = document.getElementById(`season-${firstWithDrops.slug}`);
    if (firstSection) refreshSectionPrices(firstSection);

  } catch (error) {
    console.error('Error loading drops:', error);
    document.getElementById('main').innerHTML = `<section class="section" style="background:#fcf6e9;color:#000;justify-content:center;align-items:center">
      <div class="section-inner" style="justify-content:center;align-items:center">
        <h2 class="text-scaled" style="line-height:0.85;text-align:center">Error</h2>
        <p class="section-description" style="text-align:center">Could not load drops. Try again.</p>
      </div>
    </section>`;
  }
}

init();
