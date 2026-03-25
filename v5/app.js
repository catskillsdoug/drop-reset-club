// Stay Drops v5 — Matching 2026.reset.club/drops design
// Supabase-backed API, season scroll-snap, rich rows

const API_URL = 'https://reset-inventory-sync.doug-6f9.workers.dev/api/drops';
const SUPABASE_URL = 'https://uakybfvpamxablrzzetn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVha3liZnZwYW14YWJscnp6ZXRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDg0NDIsImV4cCI6MjA4NTY4NDQ0Mn0.PpH8xXDmyDmdIBFZaOg4ykJIE-hFcmyzCo4pauf9lgo';
// Pre-fetch hero lines + season config from Supabase (must resolve before render)
window.__configReady = Promise.all([
  fetch(`${SUPABASE_URL}/rest/v1/site_config?key=eq.drops_hero_lines&select=value`, {
    headers: { apikey: SUPABASE_ANON }
  }).then(r => r.json()).then(data => {
    if (data?.[0]?.value) window.__heroLines = data[0].value;
  }).catch(() => {}),
  fetch(`${SUPABASE_URL}/rest/v1/season_windows?select=slug,name,start_month,start_day,end_month,end_day,color,description&order=start_month,start_day`, {
    headers: { apikey: SUPABASE_ANON }
  }).then(r => r.json()).then(data => {
    if (Array.isArray(data) && data.length > 0) window.__seasonWindows = data;
  }).catch(() => {}),
]);
// Init from URL params
window.__dropType = new URLSearchParams(window.location.search).get('type') === 'midweek' ? 1 : 0;
const _dayParam = (new URLSearchParams(window.location.search).get('day') || '').toLowerCase();
window.__dropDay = (_dayParam === 'fri' || _dayParam === 'mon') ? 1 : 0;

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
  eggs: { bg: '#ffffff', text: '#000000' },
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
  const propRaw = (p.get('property') || '').toUpperCase();
  // Support comma-separated: ?property=HILL4,ZINK
  const properties = propRaw ? propRaw.split(',').filter(Boolean) : null;
  const day = (p.get('day') || '').toLowerCase() || null;
  return {
    property: properties && properties.length === 1 ? properties[0] : null,
    properties: properties,
    type: (p.get('type') || '').toLowerCase() || null,
    day: day,
    feature: (p.get('feature') || '').toLowerCase() || null,
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

// Feature options for hero — property codes that offer each feature
const FEATURE_OPTIONS = [
  { key: 'barn-studio', label: 'Barn Studio', scrollTo: 'property-barn', alwaysShow: true, tag: 'NEW' },
  { key: 'summer', label: 'Summer', seasonTarget: 'early-summer', seasonRange: ['early-summer', 'solstice', 'high-summer'], alwaysShow: true, tag: 'NOW OPEN' },
  { key: 'full-moon', label: 'Full Moon', scrollTo: 'event-full-moon', alwaysShow: true },
  { key: 'cinema', label: 'Cinema', properties: ['COOK', 'HILL4', 'BARN'] },
  { key: 'fireplace', label: 'Fireplace', properties: ['COOK', 'ZINK'] },
  { key: 'fire-pit', label: 'Fire Pit', properties: ['COOK', 'HILL4', 'BARN'] },
  { key: 'star-flood', label: 'Star Flood', tagKey: 'vibe', tagMatch: 'DARK SKY', eventTheme: { bg: '#000000', text: '#3f65f6' }, description: 'New moon weekends with zero light pollution. The Milky Way is visible from every property.', relatedEvent: 'full-moon' },
];

// RESET club logo SVG (from 2026.reset.club)
const LOGO_SVG = '<svg width="100" height="100" viewBox="0 0 1036 1039" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1.095135,0,0,1.097945,-1333.455038,-262.316488)"><g transform="matrix(1.615813,0,0,1.611679,-751.897301,-146.705066)"><g transform="matrix(4.262421,-0,0,4.262421,1457.921775,511.1485)"><path d="M0,6.017L7.244,6.017L7.244,-2.963C-0.173,-5.281 -5.272,-12.134 -5.272,-19.923C-5.272,-29.758 2.736,-37.765 12.57,-37.765C22.405,-37.765 30.412,-29.758 30.412,-19.923C30.412,-12.125 25.313,-5.272 17.906,-2.954L17.906,6.017L25.141,6.017C27.458,-1.4 34.311,-6.499 42.11,-6.499C51.944,-6.499 59.952,1.509 59.952,11.352C59.952,21.187 51.944,29.194 42.11,29.194C34.32,29.194 27.467,24.095 25.15,16.679L17.906,16.679L17.906,33.112L30.421,33.103L30.421,43.773L-5.054,43.782L-5.054,33.112L7.244,33.112L7.244,16.679L0,16.679C-2.318,24.095 -9.171,29.194 -16.969,29.194C-26.804,29.194 -34.811,21.187 -34.811,11.352C-34.811,1.509 -26.804,-6.499 -16.969,-6.499C-9.171,-6.499 -2.318,-1.4 0,6.017" fill-rule="nonzero"></path></g><g transform="matrix(4.262421,-0,0,4.262421,1511.482079,776.71907)"><path d="M0,-114.422C31.548,-114.422 57.216,-88.763 57.216,-57.215C57.216,-25.667 31.548,0.001 0,0.001C-31.548,0.001 -57.207,-25.667 -57.207,-57.215C-57.207,-88.763 -31.548,-114.422 0,-114.422M-67.877,-57.215C-67.877,-19.786 -37.429,10.671 0,10.671C37.429,10.671 67.887,-19.786 67.887,-57.215C67.887,-94.644 37.429,-125.093 0,-125.093C-37.429,-125.093 -67.877,-94.644 -67.877,-57.215" fill-rule="nonzero"></path></g></g></g></svg>';

// L2 arrow (28x28, from 2026.reset.club)
const HERO_ARROW_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';

// Generate all possible arrival dates within a season window
// Weekend: Thu(4) + Fri(5), Midweek: Sun(0) + Mon(1)
const PROPERTIES = ['COOK', 'ZINK', 'HILL4', 'BARN']; // Order matches 2026.reset.club/collection
const PROP_LABELS = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };
const PROP_NIGHTS = { Weekend: 3, Weekday: 3 };
const PROP_INFO = {
  COOK: { label: 'Cook House', tagline: 'The one with the hot tub.', description: 'Hot tub, bedroom cinema, outdoor shower, record player. Sleeps 2.', color: { bg: '#ff551e', text: '#fcf6e9' }, slug: 'cook-house-orp5b5d7d1x' },
  ZINK: { label: 'Zink Cabin', tagline: 'The quiet one.', description: 'Hot tub, fireplace, mountain views, Sonos. Sleeps 2.', color: { bg: '#9c9b34', text: '#fcf6e9' }, slug: 'zink-cabin-orp5b5d7dfx' },
  HILL4: { label: 'Hill Studio', tagline: 'Views from every room.', description: 'Panoramic mountain views, fire pit, bedroom cinema, open kitchen cinema. Sleeps 4.', color: { bg: '#019740', text: '#fcf6e9' }, slug: 'hill-studio-orp5b646dax' },
  BARN: { label: 'Barn Studio', tagline: 'The biggest screen in the Catskills.', description: '16-foot cinema screen, outdoor fireplace, vinyl collection, piano. Sleeps 3.', color: { bg: '#3f65f6', text: '#fcf6e9' }, slug: 'barn-studio-orp5b72cb5x' },
};

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
  div.dataset.dow = String(checkIn.getUTCDay());
  if (drop.tags) div.dataset.tags = JSON.stringify(drop.tags);
  const checkOut = new Date(drop.departure + 'T12:00:00Z');
  const dayRange = `${DAYS[checkIn.getUTCDay()]}\u2013${DAYS[checkOut.getUTCDay()]}`;
  const sameMonth = checkIn.getUTCMonth() === checkOut.getUTCMonth();
  const dateRange = sameMonth
    ? `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${checkOut.getUTCDate()}`
    : `${MONTHS[checkIn.getUTCMonth()]} ${checkIn.getUTCDate()}\u2013${MONTHS[checkOut.getUTCMonth()]} ${checkOut.getUTCDate()}`;
  const nightsLong = `${drop.nights} night${drop.nights !== 1 ? 's' : ''}`;
  const nightsShort = `${drop.nights}n`;

  div.innerHTML = `<span class="drop-days">${esc(dayRange)}</span><span class="drop-sep">\u00b7</span><span class="drop-dates">${esc(dateRange)}</span><span class="drop-sep drop-sep-nights">\u00b7</span><span class="drop-nights"><span class="nights-long">${esc(nightsLong)}</span><span class="nights-short">${esc(nightsShort)}</span></span><span class="drop-tag"></span><span class="drop-spacer"></span><span class="drop-price">SOLD</span>${ARROW_SVG}`;
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
  const nightsLong = `${n} night${n !== 1 ? 's' : ''}`;
  const nightsShort = `${n}n`;
  const total = drop.pricing?.total ? parseFloat(drop.pricing.total) : 0;
  const priceHtml = total > 0 ? fmt(total) : '';

  // Data attributes for live price refresh + day filtering + tag filtering
  a.dataset.property = drop.property.code;
  a.dataset.checkin = drop.arrival;
  a.dataset.checkout = drop.departure || checkOut.toISOString().split('T')[0];
  a.dataset.dow = String(checkIn.getUTCDay());
  if (drop.tags) a.dataset.tags = JSON.stringify(drop.tags);

  // Pick tag: event override > holiday > vibe > moon > timing
  const tags = drop.tags || {};
  let tag = '';
  if (window.__eventTagKey && tags[window.__eventTagKey]) {
    const ev = tags[window.__eventTagKey];
    tag = Array.isArray(ev) ? ev[0] : ev;
  } else {
    const holiday = Array.isArray(tags.holiday) ? tags.holiday[0] : tags.holiday;
    const vibe = Array.isArray(tags.vibe) ? tags.vibe[0] : tags.vibe;
    const moon = Array.isArray(tags.moon) ? tags.moon[0] : tags.moon;
    const timing = Array.isArray(tags.timing) ? tags.timing[0] : tags.timing;
    if (holiday) tag = holiday;
    else if (vibe) tag = vibe;
    else if (moon) tag = moon;
    else if (timing) tag = timing;
  }
  const tagHtml = tag ? `<span class="drop-tag">\u00b7 ${esc(tag)}</span>` : '<span class="drop-tag"></span>';

  a.innerHTML = `<span class="drop-days">${esc(dayRange)}</span><span class="drop-sep">\u00b7</span><span class="drop-dates">${esc(dateRange)}</span><span class="drop-sep drop-sep-nights">\u00b7</span><span class="drop-nights"><span class="nights-long">${esc(nightsLong)}</span><span class="nights-short">${esc(nightsShort)}</span></span>${tagHtml}<span class="drop-spacer"></span><span class="drop-price">${priceHtml}</span>${ARROW_SVG}`;
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

  const rows = section.querySelectorAll('.drop-row[data-property]:not(.drop-row-sold)');
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
    const checkIn = new Date(drop.arrival + 'T12:00:00Z');
    const dow = String(checkIn.getUTCDay());

    // Property name cell (column 1)
    const propCell = document.createElement('span');
    propCell.className = 'drop-prop';
    propCell.dataset.dow = dow;
    propCell.dataset.code = propCode;
    if (i === 0) {
      propCell.textContent = propName;
    }
    grid.appendChild(propCell);

    // Drop row (columns 2+)
    const row = drop._sold ? buildSoldRow(drop) : buildDropRow(drop);
    if (!row.dataset.property) row.dataset.property = propCode;
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

// Scan all drops to find which options have available inventory
function scanAvailableOptions(drops) {
  const options = [];
  const availableDrops = drops.filter(d => !d._sold);

  // Weekend: any available Weekend drops?
  const hasWeekend = availableDrops.some(d => d.stayType === 'Weekend');
  if (hasWeekend) {
    const firstSeason = getWindowForDate(availableDrops.find(d => d.stayType === 'Weekend').arrival);
    options.push({ key: 'weekend', label: 'Weekend', target: firstSeason?.slug, type: 'weekend' });
  }

  // Midweek: any available Weekday drops?
  const hasMidweek = availableDrops.some(d => d.stayType !== 'Weekend');
  if (hasMidweek) {
    const firstSeason = getWindowForDate(availableDrops.find(d => d.stayType !== 'Weekend').arrival);
    options.push({ key: 'midweek', label: 'Midweek', target: firstSeason?.slug, type: 'midweek' });
  }

  // Feature options — check if any available drops match
  for (const feat of FEATURE_OPTIONS) {
    if (options.length >= 5) break;

    let matching;
    if (feat.alwaysShow) {
      // Always include this option — use all drops in season range or all drops as fallback
      if (feat.seasonRange) {
        matching = drops.filter(d => {
          const w = getWindowForDate(d.arrival);
          return w && feat.seasonRange.includes(w.slug);
        });
      }
      if (!matching || matching.length === 0) matching = [{ arrival: '2026-06-01' }]; // dummy to force show
    } else if (feat.seasonTarget) {
      // Season link — check if that season has any available drops
      matching = availableDrops.filter(d => {
        const w = getWindowForDate(d.arrival);
        return w && w.slug === feat.seasonTarget;
      });
    } else if (feat.properties) {
      // Property-based feature
      matching = availableDrops.filter(d => feat.properties.includes(d.property.code));
    } else if (feat.tagKey) {
      // Tag-based feature
      matching = availableDrops.filter(d => {
        const tags = d.tags || {};
        const val = tags[feat.tagKey];
        if (!val) return false;
        const vals = Array.isArray(val) ? val : [val];
        if (feat.tagMatch) return vals.some(v => v.toUpperCase().includes(feat.tagMatch));
        return vals.length > 0;
      });
    }

    if (matching && matching.length > 0) {
      const firstSeason = getWindowForDate(matching[0].arrival);
      options.push({
        key: feat.key,
        label: feat.label,
        tag: feat.tag,
        target: feat.seasonTarget || firstSeason?.slug,
        properties: feat.properties,
        tagKey: feat.tagKey,
        tagMatch: feat.tagMatch,
        seasonTarget: feat.seasonTarget,
        scrollTo: feat.scrollTo,
        navTo: feat.navTo,
        count: matching.length
      });
    }
  }

  return options.slice(0, 5);
}

// Build the hero landing section
function buildHeroSection(options, nextSectionSlug, nextSectionName) {
  const section = document.createElement('section');
  section.className = 'section';
  section.id = 'hero';
  section.style.backgroundColor = '#fcf6e9';
  section.style.color = '#000000';
  section.dataset.theme = 'sand';
  section.dataset.navBg = '#fcf6e9';
  section.dataset.navText = '#000000';

  // Container — matches reset-site container-reset
  const container = document.createElement('div');
  container.className = 'hero-container';

  // Giant RESET title — T1
  const title = document.createElement('h1');
  title.className = 'text-scaled-full';
  title.textContent = 'RESET';
  container.appendChild(title);

  // Description + logo row
  const descRow = document.createElement('div');
  descRow.className = 'hero-desc';
  const desc = document.createElement('p');
  desc.className = 'section-description';
  desc.style.marginBottom = '0';
  // Use pre-fetched hero lines, filtered by current season
  const currentSlug = getCurrentWindow()?.slug || '';
  const rawLines = window.__heroLines || [
    { text: '<strong>Two nights is a weekend. Three nights is a reset.</strong> Two hours north. Four properties. Drops open weekly.', seasons: [] },
  ];
  // Support both old (string) and new ({ text, seasons }) formats
  const allLines = rawLines.map(l => typeof l === 'string' ? { text: l, seasons: [] } : l);
  // Filter to lines matching current season (empty seasons = all)
  const seasonLines = allLines.filter(l => !l.seasons || l.seasons.length === 0 || l.seasons.includes(currentSlug));
  const heroLines = seasonLines.length > 0 ? seasonLines : allLines;
  desc.innerHTML = heroLines[Math.floor(Math.random() * heroLines.length)].text;
  descRow.appendChild(desc);
  const logoDiv = document.createElement('div');
  logoDiv.className = 'hero-logo';
  logoDiv.innerHTML = LOGO_SVG;
  descRow.appendChild(logoDiv);
  container.appendChild(descRow);

  // Options as arrow rows
  const nav = document.createElement('div');
  nav.className = 'hero-nav';

  options.forEach((opt) => {
    const row = document.createElement('a');
    row.className = 'hero-option';
    row.href = '#';
    row.addEventListener('click', (e) => {
      e.preventDefault();
      // Direct navigation
      if (opt.navTo) { window.location.href = opt.navTo; return; }
      // Set the type toggle if weekend/midweek
      if (opt.type === 'weekend') {
        window.__dropType = 0;
        window.__dayFilterActive = true;
      } else if (opt.type === 'midweek') {
        window.__dropType = 1;
        window.__dayFilterActive = true;
      }
      // Update URL and toggles
      if (opt.type) {
        const url = new URL(window.location);
        url.searchParams.set('type', opt.type);
        history.replaceState(null, '', url);
        document.querySelectorAll('.drop-toggle:not(.day-toggle)').forEach(t => {
          const idx = opt.type === 'weekend' ? 0 : 1;
          const sel = t.querySelector('.drop-toggle-selector');
          const secEl = t.closest('section');
          const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
          if (sel) sel.style.transform = `translateX(${idx * 100}%)`;
          t.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
            o.style.color = i === idx ? secTheme.bg : `${secTheme.text}50`;
          });
        });
        document.querySelectorAll('.drops-group-weekend').forEach(el => {
          el.style.display = opt.type === 'weekend' ? '' : 'none';
        });
        document.querySelectorAll('.drops-group-midweek').forEach(el => {
          el.style.display = opt.type === 'midweek' ? '' : 'none';
        });
        // Reset day toggle and apply filters after DOM settles
        window.__dropDay = 0;
        setTimeout(() => {
          if (window.__applyAllFilters) window.__applyAllFilters();
        }, 50);
      }
      // Tag-based features navigate to event page
      if (opt.tagKey) {
        window.location.href = `/v5/?feature=${opt.key}`;
        return;
      }
      // Show breadcrumb for any feature filter (property or tag)
      if (opt.properties || opt.tagKey) {
        const crumb = document.getElementById('nav-crumb');
        if (crumb) {
          crumb.innerHTML = '';
          const dropsLink = document.createElement('a');
          dropsLink.href = '#';
          dropsLink.textContent = 'DROPS';
          dropsLink.style.textDecoration = 'none';
          dropsLink.style.color = 'inherit';
          dropsLink.addEventListener('click', (ev) => {
            ev.preventDefault();
            window.__propertyFilter = null;
            window.__tagFilter = null;
            window.__eventTheme = null;
            const url = new URL(window.location);
            url.search = '';
            history.pushState(null, '', url.pathname);
            document.querySelectorAll('.drop-prop').forEach(el => { el.style.display = ''; });
            document.querySelectorAll('.drop-row').forEach(el => { el.style.display = ''; });
            // Restore original section themes
            document.querySelectorAll('.section').forEach(s => {
              const theme = THEMES[s.dataset.theme] || THEMES.sand;
              s.style.backgroundColor = theme.bg;
              s.style.color = theme.text;
              s.dataset.navBg = theme.bg;
              s.dataset.navText = theme.text;
            });
            document.querySelectorAll('.drop-toggle').forEach(t => {
              const secEl = t.closest('section');
              const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
              t.style.borderColor = secTheme.text;
            });
            window.__dropType = 0;
            window.__dayFilterActive = true;
            document.querySelectorAll('.drop-toggle:not(.day-toggle)').forEach(t => {
              const sel = t.querySelector('.drop-toggle-selector');
              const secEl = t.closest('section');
              const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
              if (sel) { sel.style.display = ''; sel.style.transform = 'translateX(0%)'; }
              t.querySelectorAll('.drop-toggle-option').forEach((o, idx) => {
                o.style.color = idx === 0 ? secTheme.bg : `${secTheme.text}50`;
              });
            });
            document.querySelectorAll('.drops-group-weekend').forEach(el => { el.style.display = ''; });
            document.querySelectorAll('.drops-group-midweek').forEach(el => { el.style.display = 'none'; });
            window.__dropDay = 0;
            window.__applyAllFilters();
            crumb.textContent = 'DROPS';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
          crumb.appendChild(dropsLink);
          const filterDot = document.createElement('span');
          filterDot.className = 'nav-dot';
          filterDot.textContent = '·';
          filterDot.style.margin = '0 4px';
          crumb.appendChild(filterDot);
          crumb.appendChild(document.createTextNode(opt.label.toUpperCase()));
        }
      }
      // Filter by properties if this is a property-based feature option
      if (opt.properties) {
        // Update URL with property codes
        const url = new URL(window.location);
        url.searchParams.set('property', opt.properties.join(','));
        url.searchParams.delete('type');
        history.pushState(null, '', url);
        window.__propertyFilter = opt.properties;
        window.__dayFilterActive = false;
        window.__applyAllFilters();
        // Show both weekend + midweek (no toggle selected)
        document.querySelectorAll('.drops-group-weekend, .drops-group-midweek').forEach(el => {
          el.style.display = '';
        });
        // Deselect toggle — hide the selector pill, keep labels fully visible
        document.querySelectorAll('.drop-toggle:not(.day-toggle)').forEach(t => {
          const sel = t.querySelector('.drop-toggle-selector');
          if (sel) sel.style.display = 'none';
          t.querySelectorAll('.drop-toggle-option').forEach(o => {
            o.style.color = 'inherit';
          });
        });
        // Hide day toggle when no type selected
        document.querySelectorAll('.day-toggle').forEach(t => { t.style.display = 'none'; });
      }
      // Scroll to target — element ID or season
      const scrollId = opt.scrollTo || (opt.target ? `season-${opt.target}` : null);
      if (scrollId) {
        const el = document.getElementById(scrollId);
        if (el) {
          document.documentElement.style.scrollSnapType = 'none';
          el.scrollIntoView({ behavior: 'smooth' });
          setTimeout(() => {
            document.documentElement.style.scrollSnapType = 'y mandatory';
          }, 800);
        }
      }
    });

    const label = document.createElement('span');
    label.className = 'hero-option-label';
    label.appendChild(document.createTextNode(opt.label));
    if (opt.tag) {
      const tag = document.createElement('span');
      tag.className = 'hero-option-tag';
      tag.textContent = opt.tag;
      label.appendChild(tag);
    }
    row.appendChild(label);

    // Arrow — L2 size (28x28)
    const arrow = document.createElement('span');
    arrow.className = 'hero-option-arrow';
    arrow.innerHTML = HERO_ARROW_SVG;
    row.appendChild(arrow);

    nav.appendChild(row);
  });

  // If no options (everything sold), show waitlist
  if (options.length === 0) {
    const waitlist = document.createElement('p');
    waitlist.className = 'section-description';
    waitlist.textContent = 'Everything is booked. Join the waitlist.';
    container.appendChild(waitlist);
  }

  container.appendChild(nav);

  // Down arrow with next micro-season label
  if (nextSectionSlug) {
    const btn = document.createElement('button');
    btn.className = 'scroll-btn bounce';
    btn.style.flexDirection = 'column';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    if (nextSectionName) {
      const label = document.createElement('span');
      label.textContent = nextSectionName;
      label.style.cssText = 'font-size:var(--text-micro);font-weight:700;letter-spacing:0.05em;text-transform:uppercase';
      btn.appendChild(label);
    }
    const arrow = document.createElement('span');
    arrow.innerHTML = DOWN_SVG;
    btn.appendChild(arrow);
    btn.addEventListener('click', () => {
      document.getElementById(`season-${nextSectionSlug}`)?.scrollIntoView({ behavior: 'smooth' });
    });
    container.appendChild(btn);
  }

  section.appendChild(container);
  return section;
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

  // Filter notice moved to footer

  // Title
  const title = document.createElement('h2');
  title.className = 'text-scaled';
  const descenders = /[gjpqy]/i;
  const firstWord = w.name.split(' ')[0];
  title.style.lineHeight = descenders.test(firstWord) ? '0.95' : '0.85';
  title.textContent = w.name;
  inner.appendChild(title);

  // Meta + Description + Logo — logo aligns with meta line
  const hasAvailable = weekendDrops.some(d => !d._sold) || midweekDrops.some(d => !d._sold);
  const metaRow = document.createElement('div');
  metaRow.className = 'hero-desc';
  metaRow.style.marginBottom = '32px';
  const metaLeft = document.createElement('div');
  const meta = document.createElement('p');
  meta.className = 'section-meta';
  meta.style.marginBottom = '8px';
  meta.textContent = `${hasAvailable ? 'NOW OPEN' : 'SOLD OUT'} \u00b7 ${w.dates}`;
  metaLeft.appendChild(meta);
  if (w.description) {
    const desc = document.createElement('p');
    desc.className = 'section-description';
    desc.style.marginBottom = '0';
    desc.textContent = w.description;
    metaLeft.appendChild(desc);
  }
  metaRow.appendChild(metaLeft);
  const logoDiv = document.createElement('div');
  logoDiv.className = 'hero-logo';
  logoDiv.innerHTML = LOGO_SVG;
  metaRow.appendChild(logoDiv);
  inner.appendChild(metaRow);

  // Drops content wrapper (fades in)
  const content = document.createElement('div');
  content.className = 'drops-content loaded';

  const showWeekend = true;
  const showMidweek = true;
  const maxPerGroup = 24;

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
    toggle.setAttribute('aria-checked', 'false');
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
      window.__dayFilterActive = true;
      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('type', newIndex === 0 ? 'weekend' : 'midweek');
      history.replaceState(null, '', url);
      // Update ALL toggles on page — restore selector pill + colors
      document.querySelectorAll('.drop-toggle:not(.day-toggle)').forEach(t => {
        const sel = t.querySelector('.drop-toggle-selector');
        const secEl = t.closest('section');
        const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
        if (sel) { sel.style.display = ''; sel.style.transform = `translateX(${newIndex * 100}%)`; }
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
      // Re-apply all filters
      window.__dropDay = 0;
      if (window.__applyAllFilters) window.__applyAllFilters();
    });

    toggleRow.appendChild(toggle);

    // Day toggle — Thu/Fri for weekend, Sun/Mon for midweek
    const isWeekendMode = (window.__dropType || 0) === 0;
    const hasAvailableWeekend = weekendDrops.some(d => !d._sold);
    const hasAvailableMidweek = midweekDrops.some(d => !d._sold);
    // Only show day toggle if both days have drops
    const activeDrops = isWeekendMode ? weekendDrops : midweekDrops;
    const dow0 = isWeekendMode ? 4 : 0; // Thu or Sun
    const dow1 = isWeekendMode ? 5 : 1; // Fri or Mon
    const hasDow0 = activeDrops.some(d => {
      const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay();
      return dow === dow0;
    });
    const hasDow1 = activeDrops.some(d => {
      const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay();
      return dow === dow1;
    });
    const showDayToggle = hasDow0 && hasDow1;

    const dayToggle = document.createElement('div');
    dayToggle.className = 'drop-toggle day-toggle';
    dayToggle.setAttribute('role', 'switch');
    dayToggle.setAttribute('aria-checked', 'false');
    dayToggle.style.borderColor = theme.text;

    const daySelector = document.createElement('div');
    daySelector.className = 'drop-toggle-selector';
    daySelector.style.backgroundColor = theme.text;
    daySelector.style.transform = 'translateX(0%)';
    const dayLabels = isWeekendMode
      ? ['THU', 'FRI']
      : ['SUN', 'MON'];

    dayLabels.forEach((label, i) => {
      const span = document.createElement('span');
      span.className = 'drop-toggle-option';
      span.textContent = label;
      span.dataset.index = String(i);
      span.style.color = i === 0 ? theme.bg : `${theme.text}50`;
      dayToggle.appendChild(span);
    });

    dayToggle.insertBefore(daySelector, dayToggle.firstChild);
    if (!showDayToggle) dayToggle.style.display = 'none';
    toggleRow.appendChild(dayToggle);

    // When type toggle changes, reset day toggle and update labels
    toggle.addEventListener('click', () => {
      setTimeout(() => {
        window.__dropDay = 0;
        const isWknd = (window.__dropType || 0) === 0;
        const newLabels = isWknd ? ['THU', 'FRI'] : ['SUN', 'MON'];

        document.querySelectorAll('.day-toggle').forEach(t => {
          const sel = t.querySelector('.drop-toggle-selector');
          const secEl = t.closest('section');
          const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
          if (sel) sel.style.transform = 'translateX(0%)';
          const opts = t.querySelectorAll('.drop-toggle-option');
          opts.forEach((o, idx) => {
            o.textContent = newLabels[idx];
            o.dataset.index = String(idx);
            o.style.color = idx === 0 ? secTheme.bg : `${secTheme.text}50`;
          });

          // Show day toggle only if both days have drops
          const activeGroup = secEl?.querySelector(isWknd ? '.drops-group-weekend' : '.drops-group-midweek');
          const groupRows = activeGroup ? Array.from(activeGroup.querySelectorAll('.drop-row[data-dow]')) : [];
          const d0 = isWknd ? '4' : '0';
          const d1 = isWknd ? '5' : '1';
          const bothDays = groupRows.some(r => r.dataset.dow === d0) && groupRows.some(r => r.dataset.dow === d1);
          t.style.display = bothDays ? '' : 'none';
        });
        if (window.__applyAllFilters) window.__applyAllFilters();
      }, 10);
    });

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
      // Trailing divider for last-row full-width line
      const trail = document.createElement('div');
      trail.className = 'property-divider grid-trailing-divider';
      trail.style.display = 'none';
      grid.appendChild(trail);
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
      const trail2 = document.createElement('div');
      trail2.className = 'property-divider grid-trailing-divider';
      trail2.style.display = 'none';
      grid.appendChild(trail2);
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
    // Filter notice in footer
    if (filters.properties) {
      const notice = document.createElement('div');
      notice.className = 'filter-notice';
      const names = filters.properties.map(c => DISPLAY[c] || c).join(', ');
      notice.innerHTML = `Showing: ${esc(names)} &nbsp; <a href="/v5/">Clear</a>`;
      inner.appendChild(notice);
    }
    const footer = document.createElement('div');
    footer.className = 'footer-row';
    footer.innerHTML = `<span class="footer-brand">RESET</span><span class="footer-location">Space for what matters</span>`;
    inner.appendChild(footer);
  }

  section.appendChild(inner);

  // Down arrow with next micro-season label (not on last)
  if (!isLast && nextWindow) {
    const btn = document.createElement('button');
    btn.className = 'scroll-btn bounce';
    btn.style.flexDirection = 'column';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    const label = document.createElement('span');
    label.textContent = nextWindow.name;
    label.style.cssText = `font-size:var(--text-micro);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${theme.text}`;
    const arrow = document.createElement('span');
    arrow.innerHTML = DOWN_SVG;
    btn.appendChild(label);
    btn.appendChild(arrow);
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
        nav.style.color = entry.target.dataset.navText || theme.text;
        nav.style.backgroundColor = entry.target.dataset.navBg || theme.bg;
        document.body.style.backgroundColor = entry.target.dataset.navBg === 'transparent' ? theme.bg : (entry.target.dataset.navBg || theme.bg);
        if (entry.target.id && entry.target.id !== 'hero') history.replaceState(null, '', `#${entry.target.id}`);
        // Hide nav on hero, show on season sections
        const id = entry.target.id || '';
        nav.style.opacity = id === 'hero' ? '0' : '';
        nav.style.pointerEvents = id === 'hero' ? 'none' : '';
        // Update crumb: property/collection sections → "COLLECTION", seasons → "DROPS"
        const crumb = document.getElementById('nav-crumb');
        if (crumb) {
          const navDot = nav.querySelector('.nav-dot');
          if (id === 'collection') {
            // On collection itself — hide crumb + dot
            crumb.style.display = 'none';
            if (navDot) navDot.style.display = 'none';
          } else if (id.startsWith('property-')) {
            crumb.style.display = '';
            if (navDot) navDot.style.display = '';
            // Don't overwrite property filter breadcrumb (COLLECTION · BARN)
            if (!window.__propertyFilter) {
              crumb.textContent = 'COLLECTION';
              crumb.href = '#collection';
              crumb.onclick = (e) => {
                e.preventDefault();
                const el = document.getElementById('collection');
                if (el) {
                  document.documentElement.style.scrollSnapType = 'none';
                  el.scrollIntoView({ behavior: 'smooth' });
                  setTimeout(() => { document.documentElement.style.scrollSnapType = 'y mandatory'; }, 800);
                }
              };
            }
          } else if (id.startsWith('season-') || id.startsWith('event-')) {
            crumb.style.display = '';
            if (navDot) navDot.style.display = '';
            // Don't overwrite property filter breadcrumb (COLLECTION · BARN)
            if (!window.__propertyFilter) {
              crumb.textContent = 'DROPS';
              crumb.href = '#';
              crumb.onclick = (e) => {
                e.preventDefault();
                document.documentElement.style.scrollSnapType = 'none';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => { document.documentElement.style.scrollSnapType = 'y mandatory'; }, 800);
              };
            }
          }
        }
        // Refresh live prices when section becomes visible
        refreshSectionPrices(entry.target);
      }
    }
  }, { threshold: [0.3, 0.5, 0.7] });

  sections.forEach(s => observer.observe(s));

  // RESET logo always clears filters + scrolls to top
  const resetLink = document.getElementById('nav-reset');
  if (resetLink) {
    resetLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Clear all filters
      window.__propertyFilter = null;
      window.__tagFilter = null;
      window.__eventTheme = null;
      window.__dayFilterActive = true;
      window.__dropType = 0;
      const url = new URL(window.location);
      url.search = '';
      history.pushState(null, '', url.pathname);
      // Reset all rows visible
      document.querySelectorAll('.drop-row, .drop-prop').forEach(el => { el.style.display = ''; });
      document.querySelectorAll('.drops-group-weekend').forEach(el => { el.style.display = ''; });
      document.querySelectorAll('.drops-group-midweek').forEach(el => { el.style.display = 'none'; });
      // Reset toggles
      document.querySelectorAll('.section').forEach(s => {
        const theme = THEMES[s.dataset.theme] || THEMES.sand;
        s.style.backgroundColor = theme.bg;
        s.style.color = theme.text;
        s.dataset.navBg = theme.bg;
        s.dataset.navText = theme.text;
      });
      document.querySelectorAll('.drop-toggle:not(.day-toggle)').forEach(t => {
        const sel = t.querySelector('.drop-toggle-selector');
        const secEl = t.closest('section');
        const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
        if (sel) { sel.style.display = ''; sel.style.transform = 'translateX(0%)'; }
        t.querySelectorAll('.drop-toggle-option').forEach((o, idx) => {
          o.style.color = idx === 0 ? secTheme.bg : `${secTheme.text}50`;
        });
      });
      window.__applyAllFilters();
      // Reset breadcrumb
      const crumb = document.getElementById('nav-crumb');
      if (crumb) crumb.textContent = 'DROPS';
      // Scroll to top
      document.documentElement.style.scrollSnapType = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => { document.documentElement.style.scrollSnapType = 'y mandatory'; }, 800);
    });
  }

  window.addEventListener('scroll', () => {
    nav.classList.add('hidden');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => nav.classList.remove('hidden'), 200);
  }, { passive: true });
}

// Main
async function init() {
  // Wait for Supabase config (hero lines + season windows)
  if (window.__configReady) await window.__configReady;

  // Merge Supabase season overrides into WINDOWS (name, description, color)
  if (window.__seasonWindows) {
    const dbMap = {};
    for (const sw of window.__seasonWindows) dbMap[sw.slug] = sw;
    for (const w of WINDOWS) {
      const db = dbMap[w.slug];
      if (db) {
        if (db.name) w.name = db.name;
        if (db.description) w.description = db.description;
        if (db.color && THEMES[db.color]) w.theme = db.color;
      }
    }
  }

  const filters = getFilters();
  const currentWin = getCurrentWindow();

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    let drops = data.drops || [];
    const generatedAt = data.generated ? new Date(data.generated) : null;
    window.__pricesAsOf = generatedAt;

    if (filters.properties) {
      drops = drops.filter(d => filters.properties.includes(d.property.code));
    }

    // Note: drops without pricing still show (price fetched live)

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
        // Skip properties not in filter
        if (filters.properties && !filters.properties.includes(exp.property.code)) continue;
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
    for (let i = currentIdx; i < WINDOWS.length && upcoming.length < 8; i++) {
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

    const hasPropertyFilter = filters.properties && filters.properties.length > 0;
    if (hasPropertyFilter) {
      window.__propertyFilter = filters.properties;
      window.__dayFilterActive = !!filters.type;
    }

    // Collection page — ?feature=collection
    if (filters.feature === 'collection') {
      const section = document.createElement('section');
      section.className = 'section';
      section.style.backgroundColor = '#000000';
      section.style.color = '#fcf6e9';
      section.style.minHeight = '100vh';
      const inner = document.createElement('div');
      inner.className = 'section-inner';

      const title = document.createElement('h1');
      title.className = 'text-scaled';
      title.textContent = 'Collection';
      inner.appendChild(title);

      const metaRow = document.createElement('div');
      metaRow.className = 'hero-desc';
      metaRow.style.marginBottom = '32px';
      const desc = document.createElement('p');
      desc.className = 'section-description';
      desc.style.marginBottom = '0';
      desc.textContent = 'Four properties in the Catskills. Two hours from the city. Each one different. All of them ready.';
      metaRow.appendChild(desc);
      const logoDiv = document.createElement('div');
      logoDiv.className = 'hero-logo';
      logoDiv.innerHTML = LOGO_SVG;
      metaRow.appendChild(logoDiv);
      inner.appendChild(metaRow);

      const nav = document.createElement('div');
      nav.className = 'hero-nav';
      for (const code of PROPERTIES) {
        const info = PROP_INFO[code];
        const row = document.createElement('a');
        row.className = 'hero-option';
        row.href = `/v5/?property=${code}`;
        row.style.borderColor = '#fcf6e940';
        const labelWrap = document.createElement('div');
        const label = document.createElement('span');
        label.className = 'hero-option-label';
        label.textContent = info.label;
        labelWrap.appendChild(label);
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:14px;font-weight:500;margin-top:2px;';
        sub.textContent = info.tagline;
        labelWrap.appendChild(sub);
        row.appendChild(labelWrap);
        const arrow = document.createElement('span');
        arrow.className = 'hero-option-arrow';
        arrow.innerHTML = HERO_ARROW_SVG;
        row.appendChild(arrow);
        nav.appendChild(row);
      }
      inner.appendChild(nav);

      const footer = document.createElement('div');
      footer.className = 'footer-row';
      footer.style.marginTop = 'auto';
      footer.innerHTML = '<span class="footer-brand">RESET CLUB</span><span class="footer-location">Space for what matters</span>';
      inner.appendChild(footer);

      section.appendChild(inner);
      main.appendChild(section);

      document.body.style.backgroundColor = '#000000';
      const navEl = document.getElementById('nav');
      navEl.style.color = '#fcf6e9';
      navEl.style.backgroundColor = '#000000';
      navEl.style.opacity = '1';
      navEl.style.pointerEvents = 'auto';
      const crumb = document.getElementById('nav-crumb');
      if (crumb) {
        crumb.innerHTML = '';
        const dropsLink = document.createElement('a');
        dropsLink.href = '/v5/';
        dropsLink.textContent = 'DROPS';
        dropsLink.style.textDecoration = 'none';
        dropsLink.style.color = 'inherit';
        crumb.appendChild(dropsLink);
        const dot = document.createElement('span');
        dot.className = 'nav-dot';
        dot.textContent = '·';
        dot.style.margin = '0 4px';
        crumb.appendChild(dot);
        crumb.appendChild(document.createTextNode('COLLECTION'));
      }
      return;
    }

    // Property filter (?property=BARN) now goes straight to season view — no standalone page
    if (false) {
      const code = filters.properties[0];
      const info = PROP_INFO[code];
      const et = info.color;

      // Find drops for this property
      const propDrops = drops.filter(d => d.property.code === code);
      const nextAvailable = propDrops.find(d => d.pricing?.total);
      const summerDrops = propDrops.filter(d => {
        const m = new Date(d.arrival + 'T12:00:00Z').getUTCMonth() + 1;
        return m >= 6 && m <= 8;
      });

      const section = document.createElement('section');
      section.className = 'section';
      section.style.backgroundColor = et.bg;
      section.style.color = et.text;
      section.style.minHeight = '100vh';
      const inner = document.createElement('div');
      inner.className = 'section-inner';

      const title = document.createElement('h1');
      title.className = 'text-scaled';
      title.textContent = info.label;
      inner.appendChild(title);

      const metaRow = document.createElement('div');
      metaRow.className = 'hero-desc';
      metaRow.style.marginBottom = '32px';
      const metaLeft = document.createElement('div');
      const tagline = document.createElement('p');
      tagline.className = 'section-meta';
      tagline.style.marginBottom = '8px';
      tagline.textContent = info.tagline;
      metaLeft.appendChild(tagline);
      const desc = document.createElement('p');
      desc.className = 'section-description';
      desc.style.marginBottom = '0';
      desc.textContent = info.description;
      metaLeft.appendChild(desc);
      metaRow.appendChild(metaLeft);
      const logoDiv = document.createElement('div');
      logoDiv.className = 'hero-logo';
      logoDiv.innerHTML = LOGO_SVG;
      metaRow.appendChild(logoDiv);
      inner.appendChild(metaRow);

      // Links — same order as inline property sections
      const nav = document.createElement('div');
      nav.className = 'hero-nav';

      function addRow(label, subtitle, href, opts = {}) {
        const row = document.createElement('a');
        row.className = 'hero-option';
        row.href = href;
        row.style.borderColor = `${et.text}40`;
        if (opts.target) row.target = opts.target;
        if (opts.onClick) row.addEventListener('click', (ev) => { ev.preventDefault(); opts.onClick(); });
        const wrap = document.createElement('div');
        const t = document.createElement('span');
        t.className = 'hero-option-label';
        t.style.fontSize = '24px';
        t.textContent = label;
        wrap.appendChild(t);
        if (subtitle) {
          const s = document.createElement('div');
          s.style.cssText = 'font-size:14px;font-weight:500;margin-top:2px;';
          s.textContent = subtitle;
          wrap.appendChild(s);
        }
        row.appendChild(wrap);
        const arrow = document.createElement('span');
        arrow.className = 'hero-option-arrow';
        arrow.innerHTML = HERO_ARROW_SVG;
        row.appendChild(arrow);
        nav.appendChild(row);
      }

      // 1. Gallery
      addRow('Gallery', null, '#', { onClick: () => openGallery(code, info, et) });

      // 2. Reviews
      const pSlug = { COOK: 'cook-house', ZINK: 'zink-cabin', HILL4: 'hill-studio', BARN: 'barn-studio' }[code];
      addRow('Reviews', null, `https://2026.reset.club/collection/${pSlug}`, { target: '_blank' });

      // 3. Next Available
      if (nextAvailable) {
        const na = new Date(nextAvailable.arrival + 'T12:00:00Z');
        addRow('Next Available', `${MONTHS[na.getUTCMonth()]} ${na.getUTCDate()} \u00b7 ${nextAvailable.nights} nights \u00b7 $${Math.round(nextAvailable.pricing?.total || 0)}`, nextAvailable.bookingUrl || '#', { target: '_blank' });
      }

      // 4. Summer Drops
      if (summerDrops.length > 0) {
        addRow('Summer Drops', `${summerDrops.length} available \u00b7 Jun\u2013Aug`, `/v5/?property=${code}&type=weekend#season-early-summer`);
      }

      // 5. All Drops
      addRow(`All ${info.label} Drops`, null, `/v5/?property=${code}&type=weekend`);

      // 6. Collection
      addRow('Collection', null, '/v5/?feature=collection');

      inner.appendChild(nav);

      const footer = document.createElement('div');
      footer.className = 'footer-row';
      footer.style.marginTop = 'auto';
      footer.innerHTML = '<span class="footer-brand">RESET CLUB</span><span class="footer-location">Space for what matters</span>';
      inner.appendChild(footer);

      section.appendChild(inner);
      main.appendChild(section);

      document.body.style.backgroundColor = et.bg;
      const navEl = document.getElementById('nav');
      navEl.style.color = et.text;
      navEl.style.backgroundColor = et.bg;
      navEl.style.opacity = '1';
      navEl.style.pointerEvents = 'auto';
      const crumb = document.getElementById('nav-crumb');
      if (crumb) {
        crumb.innerHTML = '';
        const dropsLink = document.createElement('a');
        dropsLink.href = '/v5/';
        dropsLink.textContent = 'DROPS';
        dropsLink.style.textDecoration = 'none';
        dropsLink.style.color = 'inherit';
        crumb.appendChild(dropsLink);
        const dot = document.createElement('span');
        dot.className = 'nav-dot';
        dot.textContent = '·';
        dot.style.margin = '0 4px';
        crumb.appendChild(dot);
        crumb.appendChild(document.createTextNode(info.label.toUpperCase()));
      }
      return;
    }

    // Event page — e.g. ?feature=full-moon
    const featureConfig = filters.feature ? FEATURE_OPTIONS.find(f => f.key === filters.feature) : null;
    if (featureConfig && featureConfig.tagKey) {
      const et = featureConfig.eventTheme || { bg: '#fcf6e9', text: '#000000' };

      // Collect all matching drops across all windows
      const allDrops = [];
      for (const w of activeWindows) {
        const wDrops = windowDrops.get(w.slug) || [];
        for (const d of wDrops) {
          const tags = d.tags || {};
          const val = tags[featureConfig.tagKey];
          if (!val) continue;
          const vals = Array.isArray(val) ? val : [val];
          const match = featureConfig.tagMatch ? vals.some(v => v.toUpperCase().includes(featureConfig.tagMatch)) : vals.length > 0;
          if (match) {
            d._season = w;
            allDrops.push(d);
          }
        }
      }
      // Collect arrival dates from tagged drops, then include sold drops on same dates
      const taggedDates = new Set(allDrops.map(d => d.arrival));
      for (const w of activeWindows) {
        const wDrops = windowDrops.get(w.slug) || [];
        for (const d of wDrops) {
          if (d._sold && taggedDates.has(d.arrival)) {
            // Check not already included
            const key = `${d.property.code}|${d.arrival}`;
            const exists = allDrops.some(e => `${e.property.code}|${e.arrival}` === key);
            if (!exists) allDrops.push(d);
          }
        }
      }

      // Sort: available first, then by date
      allDrops.sort((a, b) => {
        if (a._sold !== b._sold) return a._sold ? 1 : -1;
        return a.arrival.localeCompare(b.arrival);
      });

      // Build event page
      const section = document.createElement('section');
      section.className = 'section';
      section.style.backgroundColor = et.bg;
      section.style.color = et.text;
      section.style.minHeight = '100vh';
      const inner = document.createElement('div');
      inner.className = 'section-inner';

      // T1 — event name
      const title = document.createElement('h1');
      title.className = 'text-scaled';
      title.textContent = featureConfig.label;
      inner.appendChild(title);

      // Description + logo row
      const descRow = document.createElement('div');
      descRow.className = 'hero-desc';
      const desc = document.createElement('p');
      desc.className = 'section-description';
      desc.style.marginBottom = '0';
      desc.textContent = featureConfig.description || `${featureConfig.label} drops across all properties.`;
      descRow.appendChild(desc);
      const logoDiv = document.createElement('div');
      logoDiv.className = 'hero-logo';
      logoDiv.innerHTML = LOGO_SVG;
      descRow.appendChild(logoDiv);
      inner.appendChild(descRow);

      // Weekend/Midweek toggle
      const toggleRow = document.createElement('div');
      toggleRow.className = 'toggle-heading';
      toggleRow.style.marginBottom = '16px';
      const toggle = document.createElement('div');
      toggle.className = 'drop-toggle';
      toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', 'false');
      toggle.style.borderColor = et.text;
      const selector = document.createElement('div');
      selector.className = 'drop-toggle-selector';
      selector.style.backgroundColor = et.text;
      selector.style.transform = 'translateX(0%)';
      ['WEEKEND', 'MIDWEEK'].forEach((label, i) => {
        const span = document.createElement('span');
        span.className = 'drop-toggle-option';
        span.textContent = label;
        span.dataset.index = String(i);
        span.style.color = i === 0 ? et.bg : `${et.text}50`;
        toggle.appendChild(span);
      });
      toggle.insertBefore(selector, toggle.firstChild);
      // Day toggle
      const dayToggle = document.createElement('div');
      dayToggle.className = 'drop-toggle day-toggle';
      dayToggle.style.borderColor = et.text;
      const daySelector = document.createElement('div');
      daySelector.className = 'drop-toggle-selector';
      daySelector.style.backgroundColor = et.text;
      daySelector.style.transform = 'translateX(0%)';
      window.__eventDay = 0;

      function buildDayToggle(isWeekend) {
        const labels = isWeekend ? ['THU', 'FRI'] : ['SUN', 'MON'];
        dayToggle.innerHTML = '';
        const ds = document.createElement('div');
        ds.className = 'drop-toggle-selector';
        ds.style.backgroundColor = et.text;
        ds.style.transform = 'translateX(0%)';
        dayToggle.appendChild(ds);
        labels.forEach((label, i) => {
          const span = document.createElement('span');
          span.className = 'drop-toggle-option';
          span.textContent = label;
          span.dataset.index = String(i);
          span.style.color = i === 0 ? et.bg : `${et.text}50`;
          dayToggle.appendChild(span);
        });
        window.__eventDay = 0;
      }

      function rebuildEventGrid() {
        const drops = window.__eventAllDrops || [];
        const fc = window.__eventFeatureConfig;
        const typeIdx = window.__eventType;
        const dayIdx = window.__eventDay;
        const isWeekend = typeIdx === 0;
        // Day DOWs: weekend Thu=4 Fri=5, midweek Sun=0 Mon=1
        const allowedDow = isWeekend ? (dayIdx === 0 ? 4 : 5) : (dayIdx === 0 ? 0 : 1);

        const filtered = drops.filter(d => {
          const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay();
          return dow === allowedDow;
        });
        // Fallback: if no drops for selected day, show all for this type
        const typeFiltered = filtered.length > 0 ? filtered : drops.filter(d => {
          const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay();
          return isWeekend ? dow >= 4 : dow < 4;
        });

        const oldGrid = section.querySelector('#event-grid');
        const newGrid = document.createElement('div');
        newGrid.className = 'drops-grid';
        newGrid.id = 'event-grid';
        if (typeFiltered.length > 0) {
          const byProp = {};
          for (const d of typeFiltered) {
            const code = d.property.code;
            if (!byProp[code]) byProp[code] = [];
            byProp[code].push(d);
          }
          const propCodes = Object.keys(byProp);
          if (fc) window.__eventTagKey = fc.tagKey;
          propCodes.forEach((code, pi) => {
            appendPropertyToGrid(newGrid, code, byProp[code], pi === propCodes.length - 1);
          });
          window.__eventTagKey = null;
        }
        if (oldGrid) oldGrid.replaceWith(newGrid);

        // Show/hide day toggle based on whether both days have drops
        const typeDrops = drops.filter(d => {
          const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay();
          return isWeekend ? dow >= 4 : dow < 4;
        });
        const day0Dow = isWeekend ? 4 : 0;
        const day1Dow = isWeekend ? 5 : 1;
        const hasDay0 = typeDrops.some(d => new Date(d.arrival + 'T12:00:00Z').getUTCDay() === day0Dow);
        const hasDay1 = typeDrops.some(d => new Date(d.arrival + 'T12:00:00Z').getUTCDay() === day1Dow);
        dayToggle.style.display = (hasDay0 && hasDay1) ? '' : 'none';
      }

      // Type toggle click
      toggle.addEventListener('click', (e) => {
        const target = e.target;
        let idx;
        if (target.dataset && target.dataset.index !== undefined) {
          idx = parseInt(target.dataset.index);
        } else {
          idx = window.__eventType === 1 ? 0 : 1;
        }
        window.__eventType = idx;
        selector.style.transform = `translateX(${idx * 100}%)`;
        toggle.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
          o.style.color = i === idx ? et.bg : `${et.text}50`;
        });
        buildDayToggle(idx === 0);
        rebuildEventGrid();
        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('type', idx === 0 ? 'weekend' : 'midweek');
        url.searchParams.delete('day');
        history.replaceState(null, '', url);
      });

      // Day toggle click
      dayToggle.addEventListener('click', (e) => {
        const opt = e.target.closest('.drop-toggle-option');
        if (!opt) return;
        const idx = parseInt(opt.dataset.index);
        if (isNaN(idx)) return;
        window.__eventDay = idx;
        const ds = dayToggle.querySelector('.drop-toggle-selector');
        if (ds) ds.style.transform = `translateX(${idx * 100}%)`;
        dayToggle.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
          o.style.color = i === idx ? et.bg : `${et.text}50`;
        });
        rebuildEventGrid();
        // Update URL
        const isWknd = window.__eventType === 0;
        const dayName = isWknd ? (idx === 0 ? 'thu' : 'fri') : (idx === 0 ? 'sun' : 'mon');
        const url = new URL(window.location);
        url.searchParams.set('day', dayName);
        history.replaceState(null, '', url);
      });

      window.__eventType = 0;
      buildDayToggle(true);
      toggleRow.appendChild(toggle);
      toggleRow.appendChild(dayToggle);
      inner.appendChild(toggleRow);

      // Split drops by type
      const weekendDrops = allDrops.filter(d => {
        const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay();
        return dow >= 4;
      });
      const midweekDrops = allDrops.filter(d => {
        const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay();
        return dow < 4;
      });

      // Default to weekend if available, or use URL param
      const urlType = filters.type;
      const defaultType = urlType === 'midweek' ? 1 : (urlType === 'weekend' ? 0 : (weekendDrops.length > 0 ? 0 : 1));
      window.__eventType = defaultType;
      selector.style.transform = `translateX(${defaultType * 100}%)`;
      toggle.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
        o.style.color = i === defaultType ? et.bg : `${et.text}50`;
      });
      buildDayToggle(defaultType === 0);

      // Apply day from URL if present
      if (filters.day) {
        const dayIdx = (filters.day === 'fri' || filters.day === 'mon') ? 1 : 0;
        window.__eventDay = dayIdx;
        const ds = dayToggle.querySelector('.drop-toggle-selector');
        if (ds) ds.style.transform = `translateX(${dayIdx * 100}%)`;
        dayToggle.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
          o.style.color = i === dayIdx ? et.bg : `${et.text}50`;
        });
      }

      // Store for toggle rebuilds
      window.__eventAllDrops = allDrops;
      window.__eventFeatureConfig = featureConfig;

      // Drops grid placeholder — rendered by rebuildEventGrid
      if (allDrops.length > 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'drops-grid';
        placeholder.id = 'event-grid';
        inner.appendChild(placeholder);
      } else {
        const empty = document.createElement('p');
        empty.className = 'section-description';
        empty.textContent = 'No drops available for this event right now.';
        inner.appendChild(empty);
      }

      // Related event link
      if (featureConfig.relatedEvent) {
        const related = FEATURE_OPTIONS.find(f => f.key === featureConfig.relatedEvent);
        if (related) {
          const relatedRow = document.createElement('a');
          relatedRow.className = 'hero-option';
          relatedRow.href = `/v5/?feature=${related.key}`;
          relatedRow.style.marginTop = '32px';
          relatedRow.style.borderTop = `3px solid ${et.text}30`;
          relatedRow.style.borderBottom = `3px solid ${et.text}30`;
          const relatedLabel = document.createElement('span');
          relatedLabel.className = 'hero-option-label';
          relatedLabel.style.fontSize = '24px';
          relatedLabel.textContent = related.label;
          relatedRow.appendChild(relatedLabel);
          const relatedArrow = document.createElement('span');
          relatedArrow.className = 'hero-option-arrow';
          relatedArrow.innerHTML = HERO_ARROW_SVG;
          relatedRow.appendChild(relatedArrow);
          inner.appendChild(relatedRow);
        }
      }

      // Footer
      const footer = document.createElement('div');
      footer.className = 'footer-row';
      footer.innerHTML = `<span class="footer-brand">RESET CLUB</span><span class="footer-location">Space for what matters</span>`;
      inner.appendChild(footer);

      section.appendChild(inner);
      main.appendChild(section);

      // Nav
      document.body.style.backgroundColor = et.bg;
      const navEl = document.getElementById('nav');
      navEl.style.color = et.text;
      navEl.style.backgroundColor = et.bg;
      navEl.style.opacity = '1';
      navEl.style.pointerEvents = 'auto';
      const crumb = document.getElementById('nav-crumb');
      if (crumb) {
        crumb.innerHTML = '';
        const dropsLink = document.createElement('a');
        dropsLink.href = '/v5/';
        dropsLink.textContent = 'DROPS';
        dropsLink.style.textDecoration = 'none';
        dropsLink.style.color = 'inherit';
        crumb.appendChild(dropsLink);
        const dot = document.createElement('span');
        dot.className = 'nav-dot';
        dot.textContent = '·';
        dot.style.margin = '0 4px';
        crumb.appendChild(dot);
        crumb.appendChild(document.createTextNode(featureConfig.label.toUpperCase()));
      }
      // Initial render with day filter
      if (allDrops.length > 0) rebuildEventGrid();
      return; // skip normal render
    }

    if (!hasPropertyFilter) {
      // Build hero section with smart options
      const allDropsForHero = [];
      for (const w of activeWindows) {
        const wDrops = windowDrops.get(w.slug) || [];
        allDropsForHero.push(...wDrops);
      }
      const heroOptions = scanAvailableOptions(allDropsForHero);
      // Find first season with available drops (skip sold-out)
      const firstAvailable = activeWindows.find(w => {
        const wd = windowDrops.get(w.slug) || [];
        return wd.some(d => !d._sold);
      }) || activeWindows[0];
      const firstSeasonSlug = firstAvailable?.slug;
      const firstSeasonName = firstAvailable?.name;
      const heroSection = buildHeroSection(heroOptions, firstSeasonSlug, firstSeasonName);
      main.appendChild(heroSection);
    }

    // Insert Collection + Property sections between hero and seasons (only on unfiltered view)
    if (!hasPropertyFilter && !filters.feature) {
      // Collection section
      const collSection = document.createElement('section');
      collSection.className = 'section';
      collSection.id = 'collection';
      collSection.style.backgroundColor = '#000000';
      collSection.style.color = '#fcf6e9';
      collSection.dataset.theme = 'ink';
      collSection.dataset.navBg = '#000000';
      collSection.dataset.navText = '#fcf6e9';
      const collInner = document.createElement('div');
      collInner.className = 'section-inner';
      const collTitle = document.createElement('h2');
      collTitle.className = 'text-scaled';
      collTitle.textContent = 'Collection';
      collInner.appendChild(collTitle);
      const collMetaRow = document.createElement('div');
      collMetaRow.className = 'hero-desc';
      collMetaRow.style.marginBottom = '32px';
      const collDesc = document.createElement('p');
      collDesc.className = 'section-description';
      collDesc.style.marginBottom = '0';
      collDesc.textContent = 'Four properties in the Catskills. Two hours from the city. Each one different. All of them ready.';
      collMetaRow.appendChild(collDesc);
      const collLogo = document.createElement('div');
      collLogo.className = 'hero-logo';
      collLogo.innerHTML = LOGO_SVG;
      collMetaRow.appendChild(collLogo);
      collInner.appendChild(collMetaRow);
      const collNav = document.createElement('div');
      collNav.className = 'hero-nav';
      for (const code of PROPERTIES) {
        const info = PROP_INFO[code];
        const row = document.createElement('a');
        row.className = 'hero-option';
        row.href = '#property-' + code.toLowerCase();
        row.style.borderColor = '#fcf6e940';
        row.addEventListener('click', (e) => {
          e.preventDefault();
          const target = document.getElementById('property-' + code.toLowerCase());
          if (target) {
            document.documentElement.style.scrollSnapType = 'none';
            target.scrollIntoView({ behavior: 'smooth' });
            setTimeout(() => { document.documentElement.style.scrollSnapType = 'y mandatory'; }, 800);
          }
        });
        const labelWrap = document.createElement('div');
        const label = document.createElement('span');
        label.className = 'hero-option-label';
        label.textContent = info.label;
        labelWrap.appendChild(label);
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:14px;font-weight:500;margin-top:2px;';
        sub.textContent = info.tagline;
        labelWrap.appendChild(sub);
        row.appendChild(labelWrap);
        const arrow = document.createElement('span');
        arrow.className = 'hero-option-arrow';
        arrow.innerHTML = HERO_ARROW_SVG;
        row.appendChild(arrow);
        collNav.appendChild(row);
      }
      collInner.appendChild(collNav);
      collSection.appendChild(collInner);
      main.appendChild(collSection);

      // Property sections
      for (const code of PROPERTIES) {
        const info = PROP_INFO[code];
        const et = info.color;
        const propDrops = drops.filter(d => d.property.code === code);
        const nextAvailable = propDrops.find(d => d.pricing?.total);
        const summerDrops = propDrops.filter(d => {
          const m = new Date(d.arrival + 'T12:00:00Z').getUTCMonth() + 1;
          return m >= 6 && m <= 8;
        });

        const propSection = document.createElement('section');
        propSection.className = 'section';
        propSection.id = 'property-' + code.toLowerCase();
        propSection.style.backgroundColor = et.bg;
        propSection.style.color = et.text;
        propSection.dataset.navBg = et.bg;
        propSection.dataset.navText = et.text;
        const propInner = document.createElement('div');
        propInner.className = 'section-inner';

        const propTitle = document.createElement('h2');
        propTitle.className = 'text-scaled';
        propTitle.textContent = info.label;
        propInner.appendChild(propTitle);

        const propMetaRow = document.createElement('div');
        propMetaRow.className = 'hero-desc';
        propMetaRow.style.marginBottom = '32px';
        const propMetaLeft = document.createElement('div');
        const propTagline = document.createElement('p');
        propTagline.className = 'section-meta';
        propTagline.style.marginBottom = '8px';
        propTagline.textContent = info.tagline;
        propMetaLeft.appendChild(propTagline);
        const propDesc = document.createElement('p');
        propDesc.className = 'section-description';
        propDesc.style.marginBottom = '0';
        propDesc.textContent = info.description;
        propMetaLeft.appendChild(propDesc);
        propMetaRow.appendChild(propMetaLeft);
        const propLogo = document.createElement('div');
        propLogo.className = 'hero-logo';
        propLogo.innerHTML = LOGO_SVG;
        propMetaRow.appendChild(propLogo);
        propInner.appendChild(propMetaRow);

        const propNav = document.createElement('div');
        propNav.className = 'hero-nav';

        // Helper to add an arrow row
        function addPropRow(label, subtitle, href, opts = {}) {
          const row = document.createElement('a');
          row.className = 'hero-option';
          row.href = href;
          if (opts.target) row.target = opts.target;
          if (opts.onClick) row.addEventListener('click', (ev) => { ev.preventDefault(); opts.onClick(); });
          const wrap = document.createElement('div');
          const title = document.createElement('span');
          title.className = 'hero-option-label';
          title.textContent = label;
          wrap.appendChild(title);
          if (subtitle) {
            const sub = document.createElement('div');
            sub.style.cssText = 'font-size:14px;font-weight:500;margin-top:2px;';
            sub.textContent = subtitle;
            wrap.appendChild(sub);
          }
          row.appendChild(wrap);
          const arrow = document.createElement('span');
          arrow.className = 'hero-option-arrow';
          arrow.innerHTML = HERO_ARROW_SVG;
          row.appendChild(arrow);
          propNav.appendChild(row);
        }

        // 1. Gallery
        addPropRow('Gallery', 'Less words, more pictures', '#', { onClick: () => openGallery(code, info, et) });

        // 2. Reviews — open panel
        const reviewCounts = { COOK: 220, ZINK: 365, HILL4: 30, BARN: 5 };
        const rc = reviewCounts[code] || 0;
        addPropRow('Reviews', rc > 0 ? `${rc} Five Star Reviews` : null, '#', { onClick: () => openReviews(code, info, et) });

        // In-page filter + scroll helper
        function filterAndScroll(scrollToId) {
          const url = new URL(window.location);
          url.searchParams.set('property', code);
          url.searchParams.delete('type');
          history.pushState(null, '', url);
          window.__propertyFilter = [code];
          window.__dayFilterActive = false;
          window.__applyAllFilters();
          document.querySelectorAll('.drops-group-weekend, .drops-group-midweek').forEach(el => { el.style.display = ''; });
          document.querySelectorAll('.drop-toggle:not(.day-toggle)').forEach(t => {
            const sel = t.querySelector('.drop-toggle-selector');
            if (sel) sel.style.display = 'none';
            t.querySelectorAll('.drop-toggle-option').forEach(o => { o.style.color = 'inherit'; });
          });
          document.querySelectorAll('.day-toggle').forEach(t => { t.style.display = 'none'; });
          // Update nav breadcrumb: COLLECTION · BARN
          const crumb = document.getElementById('nav-crumb');
          if (crumb) {
            crumb.innerHTML = '';
            const collLink = document.createElement('a');
            collLink.href = '#collection';
            collLink.textContent = 'COLLECTION';
            collLink.style.cssText = 'text-decoration:none;color:inherit;cursor:pointer;';
            collLink.addEventListener('click', (ev) => {
              ev.preventDefault();
              window.__propertyFilter = null;
              window.__tagFilter = null;
              const resetUrl = new URL(window.location);
              resetUrl.search = '';
              history.pushState(null, '', resetUrl.pathname);
              window.__dayFilterActive = true;
              window.__dropType = 0;
              window.__applyAllFilters();
              document.querySelectorAll('.drop-row, .drop-prop').forEach(el => { el.style.display = ''; });
              document.querySelectorAll('.drops-group-weekend').forEach(el => { el.style.display = ''; });
              document.querySelectorAll('.drops-group-midweek').forEach(el => { el.style.display = 'none'; });
              document.querySelectorAll('.drop-toggle:not(.day-toggle)').forEach(t => {
                const sel = t.querySelector('.drop-toggle-selector');
                const secEl = t.closest('section');
                const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
                if (sel) { sel.style.display = ''; sel.style.transform = 'translateX(0%)'; }
                t.querySelectorAll('.drop-toggle-option').forEach((o, idx) => {
                  o.style.color = idx === 0 ? secTheme.bg : `${secTheme.text}50`;
                });
              });
              crumb.textContent = 'DROPS';
              document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
            });
            crumb.appendChild(collLink);
            const d = document.createElement('span');
            d.className = 'nav-dot';
            d.textContent = '·';
            d.style.margin = '0 4px';
            crumb.appendChild(d);
            crumb.appendChild(document.createTextNode(info.label.toUpperCase()));
          }
          if (scrollToId) {
            const el = document.getElementById(scrollToId);
            if (el) {
              document.documentElement.style.scrollSnapType = 'none';
              el.scrollIntoView({ behavior: 'smooth' });
              setTimeout(() => { document.documentElement.style.scrollSnapType = 'y mandatory'; }, 800);
            }
          }
        }

        // 3. Next Available — filter + scroll to season
        if (nextAvailable) {
          const naWin = getWindowForDate(nextAvailable.arrival);
          const na = new Date(nextAvailable.arrival + 'T12:00:00Z');
          const sub = `${MONTHS[na.getUTCMonth()]} ${na.getUTCDate()} \u00b7 ${nextAvailable.nights} nights \u00b7 $${Math.round(nextAvailable.pricing?.total || 0)}`;
          addPropRow('Next Available', sub, '#', { onClick: () => filterAndScroll(naWin ? `season-${naWin.slug}` : null) });
        }

        // 4. Summer Drops
        if (summerDrops.length > 0) {
          const shortName = { COOK: 'Cook', ZINK: 'Zink', HILL4: 'Hill', BARN: 'Barn' }[code];
          addPropRow(`${shortName} Summer`, `${summerDrops.length} available \u00b7 Jun\u2013Aug`, '#', { onClick: () => filterAndScroll('season-early-summer') });
        }

        // 5. All Drops
        const shortLabel = { COOK: 'Cook', ZINK: 'Zink', HILL4: 'Hill', BARN: 'Barn' }[code];
        addPropRow(`${shortLabel} Drops`, 'All available drops by season', '#', { onClick: () => {
          const firstSeason = document.querySelector('section[id^="season-"]');
          filterAndScroll(firstSeason ? firstSeason.id : null);
        }});

        propInner.appendChild(propNav);
        propSection.appendChild(propInner);
        main.appendChild(propSection);
      }
    }

    // Set body + nav to match hero (sand), hide nav on hero
    document.body.style.backgroundColor = '#fcf6e9';
    const navEl = document.getElementById('nav');
    navEl.style.color = '#000000';
    navEl.style.backgroundColor = '#fcf6e9';
    if (hasPropertyFilter) {
      // Show nav immediately with breadcrumb
      navEl.style.opacity = '1';
      navEl.style.pointerEvents = 'auto';
      const crumb = document.getElementById('nav-crumb');
      if (crumb) {
        crumb.innerHTML = '';
        const collLink = document.createElement('a');
        collLink.href = '/v5/?feature=collection';
        collLink.textContent = 'COLLECTION';
        collLink.style.textDecoration = 'none';
        collLink.style.color = 'inherit';
        crumb.appendChild(collLink);
        // Find a label for the filter
        const propNames = filters.properties.map(c => DISPLAY[c] || c).join(' + ');
        const filterDot = document.createElement('span');
        filterDot.className = 'nav-dot';
        filterDot.textContent = '·';
        filterDot.style.margin = '0 4px';
        crumb.appendChild(filterDot);
        crumb.appendChild(document.createTextNode(propNames.toUpperCase()));
      }
    } else {
      navEl.style.opacity = '0';
      navEl.style.pointerEvents = 'none';
    }

    // Pre-compute which windows have available (non-sold) drops
    const windowHasAvailable = new Map();
    activeWindows.forEach(w => {
      const wDrops = windowDrops.get(w.slug) || [];
      windowHasAvailable.set(w.slug, wDrops.some(d => !d._sold));
    });

    activeWindows.forEach((w, i) => {
      const wDrops = windowDrops.get(w.slug) || [];
      // Find next window that has available drops (skip sold-out seasons)
      let nextWindow = null;
      for (let j = i + 1; j < activeWindows.length; j++) {
        if (windowHasAvailable.get(activeWindows[j].slug)) {
          nextWindow = activeWindows[j];
          break;
        }
      }
      // If no available window found, fall back to literal next (so arrow still works)
      if (!nextWindow && i < activeWindows.length - 1) nextWindow = activeWindows[i + 1];
      const isLast = !nextWindow;
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

    // Event sections after seasons (Full Moon + Star Flood) — only on unfiltered view
    if (!hasPropertyFilter && !filters.feature) {
      const EVENT_SECTIONS = [
        { id: 'event-full-moon', key: 'full-moon', label: 'Full Moon', tagKey: 'moon', theme: { bg: '#000000', text: '#e9f782' }, description: 'Stays that land on or near the full moon. Dark skies, bright light, no screens.' },
        { id: 'event-star-flood', key: 'star-flood', label: 'Star Flood', tagKey: 'vibe', tagMatch: 'DARK SKY', theme: { bg: '#000000', text: '#3f65f6' }, description: 'New moon weekends with zero light pollution. The Milky Way is visible from every property.' },
      ];

      for (let evi = 0; evi < EVENT_SECTIONS.length; evi++) {
        const ev = EVENT_SECTIONS[evi];
        const et = ev.theme;

        // Collect matching drops
        const evDrops = [];
        for (const drop of drops) {
          const tags = drop.tags || {};
          const val = tags[ev.tagKey];
          if (!val) continue;
          const vals = Array.isArray(val) ? val : [val];
          const match = ev.tagMatch ? vals.some(v => v.toUpperCase().includes(ev.tagMatch)) : vals.length > 0;
          if (match) evDrops.push(drop);
        }
        // Also include sold drops on same dates
        const taggedDates = new Set(evDrops.map(d => d.arrival));
        for (const w of activeWindows) {
          const wDrops = windowDrops.get(w.slug) || [];
          for (const d of wDrops) {
            if (d._sold && taggedDates.has(d.arrival)) {
              const key = `${d.property.code}|${d.arrival}`;
              if (!evDrops.some(e => `${e.property.code}|${e.arrival}` === key)) evDrops.push(d);
            }
          }
        }
        evDrops.sort((a, b) => {
          if (a._sold !== b._sold) return a._sold ? 1 : -1;
          return a.arrival.localeCompare(b.arrival);
        });

        // Split by type
        const weekendEvDrops = evDrops.filter(d => { const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay(); return dow >= 4; });
        const midweekEvDrops = evDrops.filter(d => { const dow = new Date(d.arrival + 'T12:00:00Z').getUTCDay(); return dow < 4; });
        const defaultType = weekendEvDrops.length > 0 ? 0 : 1;
        const displayDrops = defaultType === 0 ? weekendEvDrops : midweekEvDrops;

        const section = document.createElement('section');
        section.className = 'section';
        section.id = ev.id;
        section.style.backgroundColor = et.bg;
        section.style.color = et.text;
        section.dataset.navBg = 'transparent';
        section.dataset.navText = et.text;
        section.dataset.theme = 'ink';
        const inner = document.createElement('div');
        inner.className = 'section-inner';

        const title = document.createElement('h2');
        title.className = 'text-scaled';
        title.textContent = ev.label;
        inner.appendChild(title);

        const metaRow = document.createElement('div');
        metaRow.className = 'hero-desc';
        metaRow.style.marginBottom = '32px';
        const desc = document.createElement('p');
        desc.className = 'section-description';
        desc.style.marginBottom = '0';
        desc.textContent = ev.description;
        metaRow.appendChild(desc);
        const logo = document.createElement('div');
        logo.className = 'hero-logo';
        logo.innerHTML = LOGO_SVG;
        metaRow.appendChild(logo);
        inner.appendChild(metaRow);

        // Toggle
        const toggleRow = document.createElement('div');
        toggleRow.className = 'toggle-heading';
        toggleRow.style.marginBottom = '16px';
        const toggle = document.createElement('div');
        toggle.className = 'drop-toggle';
        toggle.style.borderColor = et.text;
        const selector = document.createElement('div');
        selector.className = 'drop-toggle-selector';
        selector.style.backgroundColor = et.text;
        selector.style.transform = `translateX(${defaultType * 100}%)`;
        ['WEEKEND', 'MIDWEEK'].forEach((lbl, i) => {
          const span = document.createElement('span');
          span.className = 'drop-toggle-option';
          span.textContent = lbl;
          span.dataset.index = String(i);
          span.style.color = i === defaultType ? et.bg : `${et.text}50`;
          toggle.appendChild(span);
        });
        toggle.insertBefore(selector, toggle.firstChild);

        // Toggle click — rebuild grid
        let evType = defaultType;
        toggle.addEventListener('click', (e) => {
          const target = e.target;
          let idx;
          if (target.dataset?.index !== undefined) idx = parseInt(target.dataset.index);
          else idx = evType === 0 ? 1 : 0;
          evType = idx;
          selector.style.transform = `translateX(${idx * 100}%)`;
          toggle.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
            o.style.color = i === idx ? et.bg : `${et.text}50`;
          });
          const filtered = idx === 0 ? weekendEvDrops : midweekEvDrops;
          const oldGrid = section.querySelector('.drops-grid');
          if (oldGrid) {
            const newGrid = document.createElement('div');
            newGrid.className = 'drops-grid';
            const byProp = {};
            for (const d of filtered) { const c = d.property.code; if (!byProp[c]) byProp[c] = []; byProp[c].push(d); }
            const codes = Object.keys(byProp);
            window.__eventTagKey = ev.tagKey;
            codes.forEach((c, pi) => appendPropertyToGrid(newGrid, c, byProp[c], pi === codes.length - 1));
            window.__eventTagKey = null;
            oldGrid.replaceWith(newGrid);
          }
        });
        // Day toggle
        const dayToggle = document.createElement('div');
        dayToggle.className = 'drop-toggle day-toggle';
        dayToggle.style.borderColor = et.text;
        let evDay = 0;
        function buildEvDayToggle(isWknd) {
          const labels = isWknd ? ['THU', 'FRI'] : ['SUN', 'MON'];
          dayToggle.innerHTML = '';
          const ds = document.createElement('div');
          ds.className = 'drop-toggle-selector';
          ds.style.backgroundColor = et.text;
          ds.style.transform = 'translateX(0%)';
          dayToggle.appendChild(ds);
          labels.forEach((lbl, i) => {
            const span = document.createElement('span');
            span.className = 'drop-toggle-option';
            span.textContent = lbl;
            span.dataset.index = String(i);
            span.style.color = i === 0 ? et.bg : `${et.text}50`;
            dayToggle.appendChild(span);
          });
          evDay = 0;
        }
        buildEvDayToggle(evType === 0);

        // Check if both days exist
        function checkBothDays(typeDrops, isWknd) {
          const d0 = isWknd ? 4 : 0;
          const d1 = isWknd ? 5 : 1;
          const has0 = typeDrops.some(d => new Date(d.arrival + 'T12:00:00Z').getUTCDay() === d0);
          const has1 = typeDrops.some(d => new Date(d.arrival + 'T12:00:00Z').getUTCDay() === d1);
          return has0 && has1;
        }
        dayToggle.style.display = checkBothDays(displayDrops, evType === 0) ? '' : 'none';

        // Rebuild grid helper
        function rebuildEvGrid() {
          const isWknd = evType === 0;
          const typeDrops = isWknd ? weekendEvDrops : midweekEvDrops;
          const allowedDow = isWknd ? (evDay === 0 ? 4 : 5) : (evDay === 0 ? 0 : 1);
          // Filter by day, fallback to all if none match
          let dayFiltered = typeDrops.filter(d => new Date(d.arrival + 'T12:00:00Z').getUTCDay() === allowedDow);
          if (dayFiltered.length === 0) dayFiltered = typeDrops;

          const oldGrid = section.querySelector('.drops-grid');
          const newGrid = document.createElement('div');
          newGrid.className = 'drops-grid';
          if (dayFiltered.length > 0) {
            const byProp = {};
            for (const d of dayFiltered) { const c = d.property.code; if (!byProp[c]) byProp[c] = []; byProp[c].push(d); }
            const codes = Object.keys(byProp);
            window.__eventTagKey = ev.tagKey;
            codes.forEach((c, pi) => appendPropertyToGrid(newGrid, c, byProp[c], pi === codes.length - 1));
            window.__eventTagKey = null;
          }
          if (oldGrid) oldGrid.replaceWith(newGrid);
          dayToggle.style.display = checkBothDays(typeDrops, isWknd) ? '' : 'none';
        }

        // Type toggle click — update and rebuild
        toggle.addEventListener('click', (e) => {
          const target = e.target;
          let idx;
          if (target.dataset?.index !== undefined) idx = parseInt(target.dataset.index);
          else idx = evType === 0 ? 1 : 0;
          evType = idx;
          selector.style.transform = `translateX(${idx * 100}%)`;
          toggle.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
            o.style.color = i === idx ? et.bg : `${et.text}50`;
          });
          buildEvDayToggle(idx === 0);
          rebuildEvGrid();
        });

        // Day toggle click
        dayToggle.addEventListener('click', (e) => {
          const opt = e.target.closest('.drop-toggle-option');
          if (!opt) return;
          const idx = parseInt(opt.dataset.index);
          if (isNaN(idx)) return;
          evDay = idx;
          const ds = dayToggle.querySelector('.drop-toggle-selector');
          if (ds) ds.style.transform = `translateX(${idx * 100}%)`;
          dayToggle.querySelectorAll('.drop-toggle-option').forEach((o, i) => {
            o.style.color = i === idx ? et.bg : `${et.text}50`;
          });
          rebuildEvGrid();
        });

        toggleRow.appendChild(toggle);
        toggleRow.appendChild(dayToggle);
        inner.appendChild(toggleRow);

        // Initial drops grid
        if (displayDrops.length > 0) {
          const grid = document.createElement('div');
          grid.className = 'drops-grid';
          const byProp = {};
          for (const d of displayDrops) { const c = d.property.code; if (!byProp[c]) byProp[c] = []; byProp[c].push(d); }
          const codes = Object.keys(byProp);
          window.__eventTagKey = ev.tagKey;
          codes.forEach((c, pi) => appendPropertyToGrid(grid, c, byProp[c], pi === codes.length - 1));
          window.__eventTagKey = null;
          inner.appendChild(grid);
        } else {
          const empty = document.createElement('p');
          empty.className = 'section-description';
          empty.textContent = 'No drops available for this event right now.';
          inner.appendChild(empty);
        }

        // Down arrow with "next" label — scroll to next event section, or hide if last
        if (evi < EVENT_SECTIONS.length - 1) {
          const nextEv = EVENT_SECTIONS[evi + 1];
          const scrollBtn = document.createElement('button');
          scrollBtn.className = 'scroll-btn bounce';
          scrollBtn.style.marginTop = 'auto';
          scrollBtn.style.flexDirection = 'column';
          scrollBtn.style.alignItems = 'center';
          scrollBtn.style.gap = '6px';
          const label = document.createElement('span');
          label.textContent = nextEv.label;
          label.style.cssText = `font-size:var(--text-micro);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${et.text}`;
          const arrow = document.createElement('span');
          arrow.innerHTML = DOWN_SVG;
          scrollBtn.appendChild(label);
          scrollBtn.appendChild(arrow);
          scrollBtn.addEventListener('click', () => {
            document.getElementById(nextEv.id)?.scrollIntoView({ behavior: 'smooth' });
          });
          inner.appendChild(scrollBtn);
        }

        section.appendChild(inner);
        main.appendChild(section);
      }
    }

    // First season is already the first with visible drops
    const firstWithDrops = activeWindows[0];

    // Set initial scroll target
    const hash = window.location.hash;
    const scrollTarget = hash ? hash.slice(1) : 'hero';
    if (scrollTarget !== 'hero') {
      const scrollTargetWin = activeWindows.find(w => `season-${w.slug}` === scrollTarget) || firstWithDrops;
      const initTheme = THEMES[scrollTargetWin.theme] || THEMES.sand;
      const navEl2 = document.getElementById('nav');
      navEl2.style.color = initTheme.text;
      navEl2.style.backgroundColor = initTheme.bg;
      document.body.style.backgroundColor = initTheme.bg;
    }

    // Unified filter — single function applies property + day filters together
    // Call this after ANY filter state change. Never call the old individual functions.
    window.__applyAllFilters = function() {
      const propCodes = window.__propertyFilter;
      const tagFilter = window.__tagFilter; // { key: 'moon', match?: 'FULL MOON' }
      const dayActive = window.__dayFilterActive !== false; // default true
      const isWeekend = (window.__dropType || 0) === 0;
      const dayIndex = window.__dropDay || 0;
      const allowedDow = isWeekend ? (dayIndex === 0 ? '4' : '5') : (dayIndex === 0 ? '0' : '1');

      // Tag match helper
      function matchesTag(row) {
        if (!tagFilter) return true;
        try {
          const tags = JSON.parse(row.dataset.tags || '{}');
          const val = tags[tagFilter.key];
          if (!val) return false;
          const vals = Array.isArray(val) ? val : [val];
          if (tagFilter.match) return vals.some(v => v.toUpperCase().includes(tagFilter.match));
          return vals.length > 0;
        } catch { return false; }
      }

      // Step 1: Determine visibility of every row (property AND day must match)
      // Per-section: if the selected day has zero matching rows, show all days for that section
      const visibleRows = new Set();
      if (dayActive) {
        // First pass: check which sections have rows for the selected day
        const sectionHasDay = new Map();
        document.querySelectorAll('.drops-grid').forEach(grid => {
          const section = grid.closest('.section');
          if (!section) return;
          const activeGroup = section.querySelector(
            (window.__dropType || 0) === 0 ? '.drops-group-weekend' : '.drops-group-midweek'
          );
          if (!activeGroup || !activeGroup.contains(grid)) return;
          const hasMatchingDay = Array.from(grid.querySelectorAll('.drop-row[data-dow]')).some(row => {
            const matchesProp = !propCodes || propCodes.includes(row.dataset.property);
            return matchesProp && matchesTag(row) && row.dataset.dow === allowedDow;
          });
          sectionHasDay.set(section.id, hasMatchingDay);
        });

        document.querySelectorAll('.drop-row[data-dow]').forEach(row => {
          const matchesProp = !propCodes || propCodes.includes(row.dataset.property);
          const mTag = matchesTag(row);
          const section = row.closest('.section');
          const sectionHas = section ? sectionHasDay.get(section.id) : true;
          const matchesDay = sectionHas ? row.dataset.dow === allowedDow : true;
          const show = matchesProp && mTag && matchesDay;
          row.style.display = show ? '' : 'none';
          if (show) visibleRows.add(row);
        });
      } else {
        document.querySelectorAll('.drop-row[data-dow]').forEach(row => {
          const matchesProp = !propCodes || propCodes.includes(row.dataset.property);
          const mTag = matchesTag(row);
          row.style.display = (matchesProp && mTag) ? '' : 'none';
          if (matchesProp && mTag) visibleRows.add(row);
        });
      }

      // Step 2: Show/hide prop name cells — visible if their adjacent row is visible
      document.querySelectorAll('.drop-prop').forEach(el => {
        const next = el.nextElementSibling;
        el.style.display = (next && visibleRows.has(next)) ? '' : 'none';
      });

      // Step 3: Fix property names — first visible row per property shows the name
      document.querySelectorAll('.drops-grid').forEach(grid => {
        const seen = {};
        const children = Array.from(grid.children);
        for (let i = 0; i < children.length; i++) {
          const el = children[i];
          if (!el.classList.contains('drop-prop')) continue;
          if (el.style.display === 'none') continue;
          const row = children[i + 1];
          if (!row) continue;
          const prop = row.dataset.property || '';
          if (!seen[prop]) {
            seen[prop] = true;
            el.textContent = DISPLAY[prop] || prop;
          } else {
            el.textContent = '';
          }
        }
      });

      // Hide leading/trailing dividers (no visible content before first or after last row)
      document.querySelectorAll('.drops-grid').forEach(grid => {
        const children = Array.from(grid.children);
        // Hide leading dividers
        for (const el of children) {
          if (el.classList.contains('property-divider')) {
            el.style.display = 'none';
          } else if (el.style.display !== 'none') {
            break; // found first visible non-divider
          }
        }
        // Hide trailing dividers
        for (let i = children.length - 1; i >= 0; i--) {
          const el = children[i];
          if (el.classList.contains('property-divider')) {
            el.style.display = 'none';
          } else if (el.style.display !== 'none') {
            break;
          }
        }
        // Hide dividers between two hidden sections
        let lastVisibleWasRow = false;
        for (const el of children) {
          if (el.classList.contains('property-divider')) {
            if (!lastVisibleWasRow) el.style.display = 'none';
            lastVisibleWasRow = false;
          } else if (el.style.display !== 'none') {
            lastVisibleWasRow = true;
          }
        }
      });
    };

    // Aliases so existing call sites still work
    window.__applyDayFilter = window.__applyAllFilters;
    window.__applyPropertyFilter = window.__applyAllFilters;

    // Day toggle click handler (event delegation)
    document.addEventListener('click', (e) => {
      const opt = e.target.closest('.day-toggle .drop-toggle-option');
      if (!opt) return;
      const newIndex = parseInt(opt.dataset.index);
      if (isNaN(newIndex)) return;
      window.__dropDay = newIndex;

      document.querySelectorAll('.day-toggle').forEach(t => {
        const sel = t.querySelector('.drop-toggle-selector');
        const secEl = t.closest('section');
        const secTheme = THEMES[secEl?.dataset?.theme] || THEMES.sand;
        if (sel) sel.style.transform = `translateX(${newIndex * 100}%)`;
        t.querySelectorAll('.drop-toggle-option').forEach((o, idx) => {
          o.style.color = idx === newIndex ? secTheme.bg : `${secTheme.text}50`;
        });
      });

      // Update URL with day selection
      const isWknd = (window.__dropType || 0) === 0;
      const dayName = isWknd ? (newIndex === 0 ? 'thu' : 'fri') : (newIndex === 0 ? 'sun' : 'mon');
      const url = new URL(window.location);
      url.searchParams.set('day', dayName);
      history.replaceState(null, '', url);

      window.__applyAllFilters();
    });

    // Apply initial filters
    window.__applyAllFilters();

    setupScrollObserver();

    // Auto-scroll to hash or hero
    window.scrollTo(0, 0);
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

// Reviews panel
function openReviews(code, info, theme) {
  document.querySelectorAll('.gallery-overlay').forEach(el => el.remove());
  document.body.classList.remove('gallery-open');

  const overlay = document.createElement('div');
  overlay.className = 'gallery-overlay';
  overlay.style.backgroundColor = theme.bg;
  overlay.style.color = theme.text;

  // Nav
  const nav = document.createElement('div');
  nav.className = 'gallery-nav';
  nav.style.cssText = 'background: #fcf6e9; color: #000;';
  const navLeft = document.createElement('div');
  navLeft.className = 'nav-left';
  const resetLabel = document.createElement('span');
  resetLabel.className = 'nav-logo';
  resetLabel.textContent = 'RESET';
  navLeft.appendChild(resetLabel);
  const dot = document.createElement('span');
  dot.className = 'nav-dot';
  dot.textContent = '\u00b7';
  navLeft.appendChild(dot);
  const propLabel = document.createElement('a');
  propLabel.className = 'nav-logo';
  propLabel.href = '#';
  propLabel.style.cssText = 'text-decoration:none;color:inherit;cursor:pointer;';
  propLabel.textContent = info.label.toUpperCase();
  propLabel.addEventListener('click', (e) => { e.preventDefault(); closeGallery(); });
  navLeft.appendChild(propLabel);
  nav.appendChild(navLeft);
  const closeBtn = document.createElement('a');
  closeBtn.href = '#';
  closeBtn.style.cssText = 'text-decoration:none;color:inherit;cursor:pointer;font-size:24px;font-weight:700;line-height:1;';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeGallery(); });
  nav.appendChild(closeBtn);
  overlay.appendChild(nav);

  // Snap container for reviews
  const snapContainer = document.createElement('div');
  snapContainer.style.cssText = 'flex: 1; overflow-y: auto; scroll-snap-type: y mandatory; -webkit-overflow-scrolling: touch;';
  const loadSlide = document.createElement('div');
  loadSlide.style.cssText = 'min-height: calc(100vh - 60px); display: flex; align-items: center; justify-content: center; scroll-snap-align: start; opacity: 0.4;';
  loadSlide.textContent = 'Loading reviews...';
  snapContainer.appendChild(loadSlide);
  overlay.appendChild(snapContainer);

  document.body.appendChild(overlay);
  document.body.classList.add('gallery-open');
  requestAnimationFrame(() => { requestAnimationFrame(() => { overlay.classList.add('open'); }); });

  // Fetch 2 reviews per season, no airbnb mentions, with guest names
  const propMap = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };
  const propLabel2 = propMap[code];

  // Use RPC or raw query — fetch 8 reviews spread across seasons
  // We'll fetch more and pick 2 per season client-side
  fetch(`${SUPABASE_URL}/rest/v1/rpc/get_property_reviews`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prop_label: propLabel2 })
  })
    .then(r => r.ok ? r.json() : Promise.reject('rpc failed'))
    .catch(() => {
      // Fallback: direct query
      return fetch(`${SUPABASE_URL}/rest/v1/reviews?property_label=eq.${encodeURIComponent(propLabel2)}&stars=eq.5&body=not.is.null&select=body,written_at,reviewer,ownerrez_guest_id&order=written_at.desc&limit=40`, {
        headers: { apikey: SUPABASE_ANON }
      }).then(r => r.json());
    })
    .then(async (reviews) => {
      if (!Array.isArray(reviews)) { snapContainer.innerHTML = '<div style="min-height:calc(100vh - 60px);display:flex;align-items:center;justify-content:center;opacity:0.4">No reviews found.</div>'; return; }

      // Filter out airbnb, kids, and weather mentions
      const excludeWords = ['airbnb', 'kid', 'child', 'baby', 'toddler', 'daughter', 'son ', 'weather', 'rain', 'rained', 'snowed', 'snowstorm', 'storm', 'humid', 'freezing', 'frozen', 'blizzard', 'heat wave', 'heatwave'];
      let filtered = reviews.filter(r => {
        if (!r.body || r.body.length < 50) return false;
        // Exclude reviews with no valid date (shows as 1970)
        if (!r.written_at || new Date(r.written_at).getFullYear() < 2015) return false;
        const lower = r.body.toLowerCase();
        return !excludeWords.some(w => lower.includes(w));
      });

      // Bucket by season — bias toward spring/summer (what's booking now)
      const buckets = { spring: [], summer: [], fall: [], winter: [] };
      for (const r of filtered) {
        const m = new Date(r.written_at).getMonth() + 1;
        const season = m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
        buckets[season].push(r);
      }
      const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

      // Spring/summer get 3 each, fall/winter get 1 each (total 8)
      const picked = [];
      for (const [season, quota] of [['spring', 3], ['summer', 3], ['fall', 1], ['winter', 1]]) {
        picked.push(...shuffle(buckets[season]).slice(0, quota));
      }
      // Fill remaining from spring/summer first, then any
      if (picked.length < 8) {
        const pickedIds = new Set(picked.map(r => r.ownerrez_guest_id + r.written_at));
        const warmRemaining = filtered.filter(r => {
          if (pickedIds.has(r.ownerrez_guest_id + r.written_at)) return false;
          const m = new Date(r.written_at).getMonth() + 1;
          return m >= 3 && m <= 8;
        });
        const coldRemaining = filtered.filter(r => {
          if (pickedIds.has(r.ownerrez_guest_id + r.written_at)) return false;
          const m = new Date(r.written_at).getMonth() + 1;
          return m < 3 || m > 8;
        });
        const fill = [...shuffle(warmRemaining), ...shuffle(coldRemaining)];
        for (const r of fill) { if (picked.length >= 8) break; picked.push(r); }
      }

      if (picked.length === 0) { snapContainer.innerHTML = '<div style="min-height:calc(100vh - 60px);display:flex;align-items:center;justify-content:center;opacity:0.4">No reviews found.</div>'; return; }

      // Try to get guest names
      const guestIds = picked.map(r => r.ownerrez_guest_id).filter(Boolean);
      let guestMap = {};
      if (guestIds.length > 0) {
        try {
          const gRes = await fetch(`${SUPABASE_URL}/rest/v1/guests?ownerrez_guest_id=in.(${guestIds.join(',')})&select=ownerrez_guest_id,first_name,last_name`, {
            headers: { apikey: SUPABASE_ANON }
          });
          const guests = await gRes.json();
          if (Array.isArray(guests)) {
            for (const g of guests) guestMap[g.ownerrez_guest_id] = g;
          }
        } catch {}
      }

      snapContainer.innerHTML = '';
      const total = picked.length;

      picked.forEach((r, idx) => {
        const slide = document.createElement('div');
        slide.style.cssText = 'min-height: calc(100vh - 60px); scroll-snap-align: start; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 24px; max-width: 700px; position: relative;';

        // Quote — T3 size
        const quote = document.createElement('p');
        quote.style.cssText = 'font-size: clamp(24px, 5vw, 36px); font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; margin-bottom: 12px;';
        let text = r.body.trim();
        if (text.length > 250) {
          const cut = text.lastIndexOf('.', 250);
          if (cut > 100) text = text.substring(0, cut + 1);
          else text = text.substring(0, 250) + '...';
        }
        quote.textContent = '\u201c' + text + '\u201d';

        // Attribution — name · month, micro-season (no year — breezier)
        const attr = document.createElement('p');
        attr.style.cssText = 'font-size: 14px; font-weight: 700; opacity: 0.5;';
        const guest = guestMap[r.ownerrez_guest_id];
        const d = new Date(r.written_at);
        const rMonth = d.getMonth() + 1;
        const rDay = d.getDate();
        const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()];
        let seasonName = '';
        for (const w of WINDOWS) {
          if (w.startMonth === w.endMonth) {
            if (rMonth === w.startMonth && rDay >= w.startDay && rDay <= w.endDay) { seasonName = w.name; break; }
          } else {
            if ((rMonth === w.startMonth && rDay >= w.startDay) || (rMonth === w.endMonth && rDay <= w.endDay)) { seasonName = w.name; break; }
          }
        }
        let name = 'Guest';
        if (guest?.first_name) {
          name = guest.first_name;
          if (guest.last_name) name += ' ' + guest.last_name.charAt(0) + '.';
        }
        const datePart = seasonName ? `${monthName}, ${seasonName}` : monthName;
        attr.textContent = `${name} \u00b7 ${datePart}`;
        slide.appendChild(quote);
        slide.appendChild(attr);

        // Counter + down arrow
        const footer = document.createElement('div');
        footer.style.cssText = 'position: absolute; bottom: 24px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 8px;';
        const counter = document.createElement('span');
        counter.style.cssText = 'font-size: 14px; font-weight: 700; font-family: "JetBrains Mono", monospace; opacity: 0.4;';
        counter.textContent = `${idx + 1} / ${total}`;
        footer.appendChild(counter);
        if (idx < total - 1) {
          const arrow = document.createElement('button');
          arrow.className = 'scroll-btn';
          arrow.style.cssText = 'padding: 0; margin: 0;';
          arrow.innerHTML = DOWN_SVG;
          arrow.addEventListener('click', () => {
            const nextSlide = slide.nextElementSibling;
            if (nextSlide) nextSlide.scrollIntoView({ behavior: 'smooth' });
          });
          footer.appendChild(arrow);
        }
        slide.appendChild(footer);

        snapContainer.appendChild(slide);
      });
    })
    .catch(() => {
      snapContainer.innerHTML = '<div style="min-height:calc(100vh - 60px);display:flex;align-items:center;justify-content:center;opacity:0.4">Could not load reviews.</div>';
    });
}

// Gallery overlay
function openGallery(code, info, theme) {
  // Remove existing gallery immediately (no animation)
  document.querySelectorAll('.gallery-overlay').forEach(el => el.remove());
  document.body.classList.remove('gallery-open');

  const overlay = document.createElement('div');
  overlay.className = 'gallery-overlay';
  overlay.style.backgroundColor = theme.bg;
  overlay.style.color = theme.text;

  // Nav bar — sand bg, RESET · PROPERTY NAME + X
  const nav = document.createElement('div');
  nav.className = 'gallery-nav';
  nav.style.cssText = 'background: #fcf6e9; color: #000;';
  const navLeft = document.createElement('div');
  navLeft.className = 'nav-left';
  const resetLabel = document.createElement('span');
  resetLabel.className = 'nav-logo';
  resetLabel.textContent = 'RESET';
  navLeft.appendChild(resetLabel);
  const dot = document.createElement('span');
  dot.className = 'nav-dot';
  dot.textContent = '·';
  navLeft.appendChild(dot);
  const propLabel = document.createElement('a');
  propLabel.className = 'nav-logo';
  propLabel.href = '#';
  propLabel.style.cssText = 'text-decoration: none; color: inherit; cursor: pointer;';
  propLabel.textContent = info.label.toUpperCase();
  propLabel.addEventListener('click', (e) => { e.preventDefault(); closeGallery(); });
  navLeft.appendChild(propLabel);
  nav.appendChild(navLeft);
  const closeBtn = document.createElement('a');
  closeBtn.href = '#';
  closeBtn.style.cssText = 'text-decoration: none; color: inherit; cursor: pointer; font-size: 24px; font-weight: 700; line-height: 1;';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeGallery(); });
  nav.appendChild(closeBtn);
  overlay.appendChild(nav);

  // Counter in nav
  const counter = document.createElement('span');
  counter.className = 'gallery-counter';
  counter.textContent = '';
  nav.insertBefore(counter, closeBtn);

  // Horizontal snap track
  const track = document.createElement('div');
  track.className = 'gallery-track';
  overlay.appendChild(track);

  document.body.appendChild(overlay);
  document.body.classList.add('gallery-open');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('open');
    });
  });

  // Fetch images from Supabase (max 10)
  fetch(`${SUPABASE_URL}/rest/v1/media?property_slug=eq.${code}&r2_url=not.is.null&category=eq.property&select=r2_url,caption,subcategory&limit=10`, {
    headers: { apikey: SUPABASE_ANON }
  })
    .then(r => r.json())
    .then(images => {
      track.innerHTML = '';
      if (!Array.isArray(images) || images.length === 0) {
        track.innerHTML = '<div style="flex:0 0 100%;display:flex;align-items:center;justify-content:center;opacity:0.4">No images yet.</div>';
        return;
      }
      const total = images.length;
      counter.textContent = `1 / ${total}`;
      images.forEach((img, i) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        const imgEl = document.createElement('img');
        imgEl.src = img.r2_url;
        imgEl.alt = info.label;
        imgEl.decoding = 'async';
        if (i > 0) imgEl.loading = 'lazy';
        item.appendChild(imgEl);
        track.appendChild(item);
      });

      // Update counter on scroll (works for both horizontal and vertical)
      let ticking = false;
      track.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const hIdx = track.offsetWidth > 0 ? Math.round(track.scrollLeft / track.offsetWidth) : 0;
          const vIdx = track.offsetHeight > 0 ? Math.round(track.scrollTop / track.offsetHeight) : 0;
          const idx = Math.max(hIdx, vIdx);
          counter.textContent = `${idx + 1} / ${total}`;
          ticking = false;
        });
      });
    })
    .catch(() => {
      track.innerHTML = '<div style="flex:0 0 100%;display:flex;align-items:center;justify-content:center;opacity:0.4">Could not load images.</div>';
    });
}

function closeGallery() {
  const overlay = document.querySelector('.gallery-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('gallery-open');
  setTimeout(() => overlay.remove(), 400);
}

init();
