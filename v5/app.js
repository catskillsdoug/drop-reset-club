// Stay Drops v2 - Frontend App

// Magic link route handling - detect /d/{SLUG} paths
const MAGIC_LINK_REGEX = /^\/d\/([A-Z0-9]+)$/i;
let magicLinkSlug = null;
let magicLinkHoliday = null;

(function() {
  // Check for magic link path
  const match = window.location.pathname.match(MAGIC_LINK_REGEX);
  if (match) {
    magicLinkSlug = match[1].toUpperCase();
  }

  // Redirect legacy 'holiday' parameter to 'occasion'
  const params = new URLSearchParams(window.location.search);
  if (params.has('holiday')) {
    const holiday = params.get('holiday');
    params.delete('holiday');
    params.set('occasion', holiday);
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.location.replace(newURL);
  }
})();

// Apply accent color from URL parameter (?color=ff551e)
(function() {
  const params = new URLSearchParams(window.location.search);
  const color = params.get('color');
  if (color) {
    const hexPattern = /^[0-9A-Fa-f]{6}$/;
    if (hexPattern.test(color)) {
      const accent = `#${color}`;
      // Luminance check for readable text on the accent
      const r = parseInt(color.substr(0, 2), 16) / 255;
      const g = parseInt(color.substr(2, 2), 16) / 255;
      const b = parseInt(color.substr(4, 2), 16) / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const text = lum > 0.5 ? '#000000' : '#ffffff';
      const textMuted = lum > 0.5 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
      const textFaint = lum > 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';

      const style = document.createElement('style');
      style.textContent = `
        body { background-color: ${accent} !important; color: ${text} !important; }
        .filters { border-bottom-color: ${text} !important; }
        .filter-group label { color: ${textMuted} !important; }
        .filter-btn { border-color: ${text} !important; color: ${text} !important; }
        .filter-btn:hover { background: ${textFaint} !important; }
        .filter-btn.active { background: ${text} !important; color: ${accent} !important; }
        .filter-btn.unavailable::after { background: ${text} !important; }
        .filter-summary-text { color: ${text} !important; }
        .filter-summary-edit { border-color: ${text} !important; color: ${text} !important; }
        .filter-summary-edit:hover { background: ${text} !important; color: ${accent} !important; }
        .drops-section-header { color: ${text} !important; border-bottom-color: ${text} !important; }
        .no-results { color: ${text} !important; }
        .loading { color: ${textMuted} !important; }
        .magic-link-title { color: ${text} !important; }
        .magic-link-hook { color: ${textMuted} !important; }
        .magic-link-back { color: ${text} !important; border-color: ${text} !important; }
        .magic-link-back:hover { background: ${text} !important; color: ${accent} !important; }
      `;
      document.head.appendChild(style);
    }
  }
})();

// Security: Escape HTML to prevent XSS
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// Security: Validate URL is safe (https or relative path only)
function isValidUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

const API_URL = 'https://reset-inventory-sync.doug-6f9.workers.dev/api/drops';

let allDrops = [];
let filters = {
  timing: 'all',
  nights: '3',
  stayType: 'all',
  property: 'all',
  vibe: 'all',
  occasion: 'all'
};

// Read filters from URL parameters
function getFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    timing: params.get('timing') || 'all',
    nights: params.get('nights') || '3',
    stayType: params.get('stayType') || 'all',
    property: params.get('property') || 'all',
    vibe: params.get('vibe') || 'all',
    occasion: params.get('occasion') || 'all'
  };
}

// Update URL with current filters (without page reload)
function updateURL() {
  const params = new URLSearchParams();

  // Only add non-default values to keep URL clean
  if (filters.timing !== 'all') params.set('timing', filters.timing);
  if (filters.nights !== '3') params.set('nights', filters.nights);
  if (filters.stayType !== 'all') params.set('stayType', filters.stayType);
  if (filters.property !== 'all') params.set('property', filters.property);
  if (filters.vibe !== 'all') params.set('vibe', filters.vibe);
  if (filters.occasion !== 'all') params.set('occasion', filters.occasion);

  const newURL = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;

  window.history.replaceState({}, '', newURL);
}

// Check if any non-default filters are active
function hasActiveFilters() {
  return filters.timing !== 'all' ||
         filters.nights !== '3' ||
         filters.stayType !== 'all' ||
         filters.property !== 'all' ||
         filters.vibe !== 'all' ||
         filters.occasion !== 'all';
}

// Generate filter summary text
function getFilterSummaryText() {
  const parts = [];

  // Timing
  if (filters.timing !== 'all') {
    const timingLabels = {
      'last-minute': 'Last Minute',
      'this-week': 'This Week',
      'next-week': 'Next Week',
      'this-month': 'This Month'
    };
    parts.push(timingLabels[filters.timing] || filters.timing);
  }

  // Nights
  if (filters.nights !== 'all') {
    parts.push(`${filters.nights} Night`);
  }

  // Stay type
  if (filters.stayType !== 'all') {
    parts.push(filters.stayType + 's');
  } else {
    parts.push('Resets');
  }

  // Property
  if (filters.property !== 'all') {
    const drop = allDrops.find(d => d.property.code === filters.property);
    const propertyName = drop?.property.label || filters.property;
    parts.push(`at ${propertyName}`);
  }

  // Vibe
  if (filters.vibe !== 'all') {
    parts.push(`- ${filters.vibe}`);
  }

  // Occasion
  if (filters.occasion !== 'all') {
    parts.push(`for ${filters.occasion}`);
  }

  return parts.join(' ');
}

// Show filter summary, hide controls
function showFilterSummary() {
  if (!hasActiveFilters()) return;

  const summary = document.getElementById('filter-summary');
  const controls = document.getElementById('filter-controls');
  const summaryText = document.getElementById('filter-summary-text');

  summaryText.textContent = getFilterSummaryText();
  summary.style.display = 'flex';
  controls.style.display = 'none';
}

// Show filter controls, hide summary
function showFilterControls() {
  const summary = document.getElementById('filter-summary');
  const controls = document.getElementById('filter-controls');

  summary.style.display = 'none';
  controls.style.display = 'flex';
}

// Fetch drops from API
async function fetchDrops() {
  try {
    // Magic link mode: fetch holiday-specific drops
    if (magicLinkSlug) {
      await fetchMagicLinkDrops(magicLinkSlug);
      return;
    }

    const response = await fetch(API_URL);
    const data = await response.json();
    allDrops = data.drops || [];

    // Read filters from URL before building UI
    filters = getFiltersFromURL();

    // Build dynamic filter buttons
    buildStayTypeFilters();
    buildPropertyFilters();
    buildVibeFilters();
    buildOccasionFilters();

    // Apply URL filters to UI
    applyFiltersToUI();

    // Show summary if filters are active from URL
    if (hasActiveFilters()) {
      showFilterSummary();
    }

    // Update filter availability and render grid
    updateFilterAvailability();
    renderDrops();
  } catch (error) {
    console.error('Error fetching drops:', error);
    document.getElementById('drops-grid').innerHTML = `
      <div class="no-results">ERROR LOADING DROPS. PLEASE TRY AGAIN.</div>
    `;
  }
}

// Fetch drops for a magic link (holiday-specific)
async function fetchMagicLinkDrops(slug) {
  try {
    const baseUrl = API_URL.replace('/api/drops', '');
    const response = await fetch(`${baseUrl}/api/holiday/${slug}`);

    if (!response.ok) {
      if (response.status === 404) {
        document.getElementById('drops-grid').innerHTML = `
          <div class="no-results">HOLIDAY NOT FOUND: ${escapeHtml(slug)}</div>
        `;
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    magicLinkHoliday = data.holiday;
    allDrops = data.drops || [];

    // Hide filters in magic link mode - show hero header instead
    document.querySelector('.filters').style.display = 'none';

    // Render magic link hero view
    renderMagicLinkView();
  } catch (error) {
    console.error('Error fetching magic link drops:', error);
    document.getElementById('drops-grid').innerHTML = `
      <div class="no-results">ERROR LOADING DROPS. PLEASE TRY AGAIN.</div>
    `;
  }
}

// Render magic link hero view
function renderMagicLinkView() {
  const grid = document.getElementById('drops-grid');
  const h = magicLinkHoliday;

  if (!h) {
    grid.innerHTML = '<div class="no-results">HOLIDAY NOT FOUND</div>';
    return;
  }

  // Build hero header
  const emoji = h.emoji ? escapeHtml(h.emoji) : '';
  const name = escapeHtml(h.name);
  const hook = h.marketingHook ? escapeHtml(h.marketingHook) : '';

  let heroHtml = `
    <div class="magic-link-hero">
      <h1 class="magic-link-title">${emoji} ${name}</h1>
      ${hook ? `<p class="magic-link-hook">${hook}</p>` : ''}
      <a href="/" class="magic-link-back">← VIEW ALL DROPS</a>
    </div>
  `;

  if (allDrops.length === 0) {
    heroHtml += '<div class="no-results">NO DROPS AVAILABLE FOR THIS OCCASION</div>';
  } else {
    heroHtml += allDrops.map(drop => renderDropCard(drop)).join('');
  }

  grid.innerHTML = heroHtml;
  setupViewTracking();
}

// Apply current filters to UI buttons
function applyFiltersToUI() {
  // Timing
  const timingContainer = document.getElementById('timing-filters');
  timingContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.timing);
  });

  // Nights
  const nightsContainer = document.getElementById('nights-filters');
  nightsContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.nights);
  });

  // Stay Type
  const stayTypeContainer = document.getElementById('stay-type-filters');
  stayTypeContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.stayType);
  });

  // Property
  const propertyContainer = document.getElementById('property-filters');
  propertyContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.property);
  });

  // Vibe
  const vibeContainer = document.getElementById('vibe-filters');
  vibeContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.vibe);
  });

  // Occasion
  const occasionContainer = document.getElementById('occasion-filters');
  occasionContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.occasion);
  });
}

// Build property filter buttons
function buildPropertyFilters() {
  // Property exclusions are managed via Include_In_Marketing in Airtable
  const properties = [...new Set(allDrops.map(d => d.property.code))].sort();
  const container = document.getElementById('property-filters');

  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';
  properties.forEach(code => {
    const safeCode = escapeHtml(code);
    const displayCode = escapeHtml(code.slice(0, 4));
    html += `<button class="filter-btn" data-filter="${safeCode}">${displayCode}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('property', btn));
  });
}

// Build stay type filter buttons (excludes Gap Fill - not consumer friendly)
function buildStayTypeFilters() {
  const types = [...new Set(allDrops.map(d => d.stayType))].filter(t => t !== 'Gap Fill');
  const container = document.getElementById('stay-type-filters');
  const order = ['Weekend', 'Weekday'];
  types.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';
  types.forEach(type => {
    const safeType = escapeHtml(type);
    html += `<button class="filter-btn" data-filter="${safeType}">${safeType.toUpperCase()}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('stayType', btn));
  });
}

// Build vibe filter buttons from Tag_Vibe
function buildVibeFilters() {
  const vibes = new Set();
  allDrops.forEach(drop => {
    const vibeTag = drop.tags?.vibe;
    if (vibeTag && typeof vibeTag === 'string' && vibeTag.trim()) {
      vibes.add(vibeTag.trim());
    } else if (Array.isArray(vibeTag)) {
      vibeTag.forEach(v => v && vibes.add(v.trim()));
    }
  });

  const container = document.getElementById('vibe-filters');
  const vibeList = [...vibes].sort();

  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';
  vibeList.forEach(vibe => {
    const safeVibe = escapeHtml(vibe);
    html += `<button class="filter-btn" data-filter="${safeVibe}">${safeVibe}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('vibe', btn));
  });
}

// Build occasion filter buttons from holiday field (normalized)
function buildOccasionFilters() {
  const occasionMap = new Map(); // lowercase -> display name
  allDrops.forEach(drop => {
    // Use the holiday field as the source of truth
    if (drop.holiday) {
      const key = drop.holiday.toLowerCase();
      if (!occasionMap.has(key)) {
        occasionMap.set(key, drop.holiday);
      }
    }
  });

  const container = document.getElementById('occasion-filters');
  const occasionList = [...occasionMap.values()].sort();

  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';
  occasionList.forEach(occasion => {
    const safeOccasion = escapeHtml(occasion);
    html += `<button class="filter-btn" data-filter="${safeOccasion}">${safeOccasion.toUpperCase()}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('occasion', btn));
  });
}

// Track filter usage for analytics
function trackFilterClick(filterType, filterValue) {
  const baseUrl = API_URL.replace('/drops', '');
  const url = `${baseUrl}/track-filter`;
  const data = JSON.stringify({ filter: filterType, value: filterValue });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, data);
  } else {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data
    }).catch(() => {});
  }
}

// Handle filter button click
function handleFilterClick(filterType, btn) {
  const newValue = btn.dataset.filter;

  // Track this filter selection
  trackFilterClick(filterType, newValue);

  // Update active state for clicked filter
  const container = btn.parentElement;
  container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filters[filterType] = newValue;

  // Check if current filters yield any results
  let results = getFilteredDrops();

  // If no results, progressively reset other filters until we have results
  if (results.length === 0 && newValue !== 'all') {
    const resetOrder = ['occasion', 'vibe', 'stayType', 'property', 'timing', 'nights'];
    const otherFilters = resetOrder.filter(f => f !== filterType);

    for (const resetType of otherFilters) {
      // Reset all filters to 'all' to maximize chances of finding results
      const defaultValue = 'all';
      if (filters[resetType] === defaultValue) continue;

      // Reset this filter
      filters[resetType] = defaultValue;

      // Update UI for reset filter
      const resetContainerId = resetType === 'stayType' ? 'stay-type-filters' : `${resetType}-filters`;
      const resetContainer = document.getElementById(resetContainerId);
      if (resetContainer) {
        resetContainer.querySelectorAll('.filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.filter === defaultValue);
        });
      }

      // Check if we now have results
      results = getFilteredDrops();
      if (results.length > 0) break;
    }
  }

  updateURL();
  updateFilterAvailability();
  renderDrops();
}

// Check if drop matches timing filter
function matchesTiming(drop, timingFilter) {
  if (timingFilter === 'all') return true;

  const daysOut = drop.daysOut;

  switch (timingFilter) {
    case 'last-minute':
      return daysOut <= 3;
    case 'this-week':
      return daysOut <= 7;
    case 'next-week':
      return daysOut > 7 && daysOut <= 14;
    case 'this-month':
      return daysOut <= 30;
    default:
      return true;
  }
}

// Check if drop matches nights filter
function matchesNights(drop, nightsFilter) {
  if (nightsFilter === 'all') return true;
  const nights = parseInt(nightsFilter);
  return !isNaN(nights) && drop.nights === nights;
}

// Check if drop matches stay type filter
function matchesStayType(drop, stayTypeFilter) {
  if (stayTypeFilter === 'all') return true;
  return drop.stayType === stayTypeFilter;
}

// Check if drop matches vibe filter
function matchesVibe(drop, vibeFilter) {
  if (vibeFilter === 'all') return true;

  const vibeTag = drop.tags?.vibe;
  if (typeof vibeTag === 'string') {
    return vibeTag.trim().toLowerCase() === vibeFilter.toLowerCase();
  }
  if (Array.isArray(vibeTag)) {
    return vibeTag.some(v => v && v.trim().toLowerCase() === vibeFilter.toLowerCase());
  }
  return false;
}

// Check if drop matches occasion filter
function matchesOccasion(drop, occasionFilter) {
  if (occasionFilter === 'all') return true;
  return drop.holiday && drop.holiday.toLowerCase() === occasionFilter.toLowerCase();
}

// Filter drops based on current filters
// Property exclusions are handled by the API via Include_In_Marketing in Airtable
function getFilteredDrops() {
  return allDrops.filter(drop => {
    if (!matchesTiming(drop, filters.timing)) return false;
    if (!matchesNights(drop, filters.nights)) return false;
    if (!matchesStayType(drop, filters.stayType)) return false;
    if (filters.property !== 'all' && drop.property.code !== filters.property) return false;
    if (!matchesVibe(drop, filters.vibe)) return false;
    if (!matchesOccasion(drop, filters.occasion)) return false;
    return true;
  });
}

// Get filtered drops with one filter temporarily changed
function getFilteredDropsWithOverride(overrideType, overrideValue) {
  const tempFilters = { ...filters, [overrideType]: overrideValue };
  return allDrops.filter(drop => {
    if (!matchesTiming(drop, tempFilters.timing)) return false;
    if (!matchesNights(drop, tempFilters.nights)) return false;
    if (!matchesStayType(drop, tempFilters.stayType)) return false;
    if (tempFilters.property !== 'all' && drop.property.code !== tempFilters.property) return false;
    if (!matchesVibe(drop, tempFilters.vibe)) return false;
    if (!matchesOccasion(drop, tempFilters.occasion)) return false;
    return true;
  });
}

// Calculate which filter options would yield results
function getAvailableOptions() {
  const available = {
    timing: new Set(['all']),
    nights: new Set(['all']),
    stayType: new Set(['all']),
    property: new Set(['all']),
    vibe: new Set(['all']),
    occasion: new Set(['all'])
  };

  // Timing options
  ['last-minute', 'this-week', 'next-week', 'this-month'].forEach(value => {
    if (getFilteredDropsWithOverride('timing', value).length > 0) {
      available.timing.add(value);
    }
  });

  // Nights options
  ['1', '2', '3'].forEach(value => {
    if (getFilteredDropsWithOverride('nights', value).length > 0) {
      available.nights.add(value);
    }
  });

  // Stay type options
  ['Weekend', 'Weekday'].forEach(value => {
    if (getFilteredDropsWithOverride('stayType', value).length > 0) {
      available.stayType.add(value);
    }
  });

  // Property options
  [...new Set(allDrops.map(d => d.property.code))].forEach(value => {
    if (getFilteredDropsWithOverride('property', value).length > 0) {
      available.property.add(value);
    }
  });

  // Vibe options
  const vibes = new Set();
  allDrops.forEach(drop => {
    const vibeTag = drop.tags?.vibe;
    if (typeof vibeTag === 'string' && vibeTag.trim()) vibes.add(vibeTag.trim());
    if (Array.isArray(vibeTag)) vibeTag.forEach(v => v && vibes.add(v.trim()));
  });
  vibes.forEach(value => {
    if (getFilteredDropsWithOverride('vibe', value).length > 0) {
      available.vibe.add(value);
    }
  });

  // Occasion options (use holiday field only, normalized)
  const occasionMap = new Map();
  allDrops.forEach(drop => {
    if (drop.holiday) {
      const key = drop.holiday.toLowerCase();
      if (!occasionMap.has(key)) {
        occasionMap.set(key, drop.holiday);
      }
    }
  });
  occasionMap.forEach(value => {
    if (getFilteredDropsWithOverride('occasion', value).length > 0) {
      available.occasion.add(value);
    }
  });

  return available;
}

// Update filter button availability
function updateFilterAvailability() {
  const available = getAvailableOptions();

  const filterGroups = [
    { id: 'timing-filters', type: 'timing' },
    { id: 'nights-filters', type: 'nights' },
    { id: 'stay-type-filters', type: 'stayType' },
    { id: 'property-filters', type: 'property' },
    { id: 'vibe-filters', type: 'vibe' },
    { id: 'occasion-filters', type: 'occasion' }
  ];

  filterGroups.forEach(({ id, type }) => {
    const container = document.getElementById(id);
    if (!container) return;

    container.querySelectorAll('.filter-btn').forEach(btn => {
      const value = btn.dataset.filter;
      const isAvailable = available[type].has(value);
      btn.classList.toggle('unavailable', !isAvailable);
    });
  });
}

// Render drops to the grid
function renderDrops() {
  const grid = document.getElementById('drops-grid');
  const filtered = getFilteredDrops();

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="no-results">NO DROPS MATCH YOUR FILTERS</div>';
    return;
  }

  // If 7 or fewer, just render cards
  if (filtered.length <= 7) {
    grid.innerHTML = filtered.map(drop => renderDropCard(drop)).join('');
    // Setup view tracking after rendering
    setupViewTracking();
    return;
  }

  // Group by month for larger sets
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  const grouped = {};
  filtered.forEach(drop => {
    const date = new Date(drop.arrival + 'T12:00:00Z');
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const label = `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    if (!grouped[key]) {
      grouped[key] = { label, drops: [] };
    }
    grouped[key].drops.push(drop);
  });

  // Render with section headers
  let html = '';
  Object.keys(grouped).sort().forEach(key => {
    const group = grouped[key];
    html += `<div class="drops-section-header">${escapeHtml(group.label)}</div>`;
    html += group.drops.map(drop => renderDropCard(drop)).join('');
  });

  grid.innerHTML = html;

  // Setup view tracking after rendering
  setupViewTracking();
}

// Render a single drop card
function renderDropCard(drop) {
  // Sanitize property code for CSS class (alphanumeric only)
  const propClass = (drop.property.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Validate and escape image URL
  const imageUrl = drop.property.image;
  const imageStyle = isValidUrl(imageUrl) ? `background-image: url('${escapeHtml(imageUrl)}')` : '';
  const showInitial = !isValidUrl(imageUrl);

  // Validate booking URL - only allow https URLs
  const bookingLink = isValidUrl(drop.bookingUrl)
    ? `<a href="${escapeHtml(drop.bookingUrl)}" class="drop-card-link" target="_blank" rel="noopener noreferrer" onclick="trackDropClick('${escapeHtml(drop.dropId || '')}')">BOOK THIS DROP</a>`
    : `<span class="drop-card-link disabled">COMING SOON</span>`;

  const arrivalDate = new Date(drop.arrival + 'T12:00:00Z');
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateDisplay = `${monthNames[arrivalDate.getUTCMonth()]} ${arrivalDate.getUTCDate()}`;

  // Determine tag based on source and recency
  let tagText = escapeHtml(drop.tags?.default || 'AVAILABLE');
  let tagClass = '';

  if (drop.isNewlyAvailable) {
    tagText = 'JUST OPENED';
    tagClass = 'tag-newly-available';
  }

  // Escape all text content from API
  const propertyCode = escapeHtml(drop.property.code || '');
  const propertyLabel = escapeHtml(drop.property.label || '');
  const thru = escapeHtml(drop.thru || '');

  // Add data attribute for engagement tracking
  const dropId = drop.dropId ? `data-drop-id="${escapeHtml(drop.dropId)}"` : '';

  return `
    <article class="drop-card" ${dropId}>
      <div class="drop-card-image ${propClass}" style="${imageStyle}">
        ${showInitial ? `<span class="property-initial">${propertyCode}</span>` : ''}
        <span class="drop-card-tag ${tagClass}">${tagText}</span>
      </div>
      <div class="drop-card-footer">
        <div class="drop-card-info">
          <p class="drop-card-property">${propertyLabel}</p>
          <h2 class="drop-card-date">${dateDisplay}</h2>
          <p class="drop-card-days">${thru}</p>
        </div>
        ${bookingLink}
      </div>
    </article>
  `;
}

// Initialize filters and event listeners
function initFilters() {
  // Timing filters
  document.getElementById('timing-filters').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('timing', btn));
  });

  // Nights filters
  document.getElementById('nights-filters').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('nights', btn));
  });

  // Filter summary edit button
  document.getElementById('filter-summary-edit').addEventListener('click', showFilterControls);

  // Click on summary text also opens controls
  document.getElementById('filter-summary-text').addEventListener('click', showFilterControls);
}

// Engagement tracking: Track drop view when card becomes visible
function trackDropView(dropId) {
  if (!dropId) return;
  const baseUrl = API_URL.replace('/drops', '');
  fetch(`${baseUrl}/drops/${dropId}/engagement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'view' })
  }).catch(() => {}); // Silent fail - engagement tracking is non-critical
}

// Engagement tracking: Track click when booking link is clicked
function trackDropClick(dropId) {
  if (!dropId) return;
  const baseUrl = API_URL.replace('/drops', '');
  const url = `${baseUrl}/drops/${dropId}/engagement`;

  // Use sendBeacon for reliable tracking even when navigating away
  // Pass string directly - Blob can be inconsistent across browsers
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, JSON.stringify({ type: 'click' }));
  } else {
    // Fallback for older browsers
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'click' }),
      keepalive: true
    }).catch(() => {});
  }
}

// Setup IntersectionObserver for view tracking
let viewObserver = null;

function setupViewTracking() {
  // Clean up existing observer if any
  if (viewObserver) {
    viewObserver.disconnect();
  }

  // Create new observer
  viewObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const dropId = entry.target.dataset.dropId;
        // Only track once per card per session
        if (dropId && !entry.target.dataset.viewed) {
          trackDropView(dropId);
          entry.target.dataset.viewed = 'true';
        }
      }
    });
  }, {
    threshold: 0.5, // Track when 50% of card is visible
    rootMargin: '0px'
  });

  // Observe all drop cards with a drop ID
  document.querySelectorAll('.drop-card[data-drop-id]').forEach(card => {
    viewObserver.observe(card);
  });
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  fetchDrops();
});
