// Stay Drops v2 - Frontend App

// Redirect legacy 'holiday' parameter to 'occasion'
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('holiday')) {
    const holiday = params.get('holiday');
    params.delete('holiday');
    params.set('occasion', holiday);
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.location.replace(newURL);
  }
})();

// Apply accent color from URL parameter
(function() {
  const params = new URLSearchParams(window.location.search);
  const color = params.get('color');
  if (color) {
    // Validate hex color format
    const hexPattern = /^[0-9A-Fa-f]{6}$/;
    if (hexPattern.test(color)) {
      const accentColor = `#${color}`;
      // Calculate luminance to determine text color
      const r = parseInt(color.substr(0, 2), 16) / 255;
      const g = parseInt(color.substr(2, 2), 16) / 255;
      const b = parseInt(color.substr(4, 2), 16) / 255;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const textColor = luminance > 0.5 ? '#000000' : '#ffffff';

      document.documentElement.style.setProperty('--accent-color', accentColor);
      document.documentElement.style.setProperty('--accent-text', textColor);
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

// Toggle filter drawer open/closed
function toggleFilterDrawer() {
  const drawer = document.getElementById('filter-drawer');
  const toggle = document.getElementById('filter-toggle');
  drawer.classList.toggle('is-open');
  toggle.classList.toggle('is-open');
}

// Update hero filter summary text
function updateHeroFilterSummary() {
  const heroSummary = document.getElementById('hero-filter-summary');
  if (!heroSummary) return;
  heroSummary.textContent = getFilterSummaryText();
}

// Fetch drops from API
async function fetchDrops() {
  try {
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

    // Open drawer if filters are active from URL
    if (hasActiveFilters()) {
      document.getElementById('filter-drawer').classList.add('is-open');
      document.getElementById('filter-toggle').classList.add('is-open');
    }

    // Update filter availability, hero summary, and render grid
    updateFilterAvailability();
    updateHeroFilterSummary();
    renderDrops();
  } catch (error) {
    console.error('Error fetching drops:', error);
    document.getElementById('drops-grid').innerHTML = `
      <div class="no-results">ERROR LOADING DROPS. PLEASE TRY AGAIN.</div>
    `;
  }
}

// Apply current filters to UI buttons
function applyFiltersToUI() {
  // Timing
  const timingContainer = document.getElementById('timing-filters');
  timingContainer.querySelectorAll('.choice-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.timing);
  });

  // Nights
  const nightsContainer = document.getElementById('nights-filters');
  nightsContainer.querySelectorAll('.choice-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.nights);
  });

  // Stay Type
  const stayTypeContainer = document.getElementById('stay-type-filters');
  stayTypeContainer.querySelectorAll('.choice-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.stayType);
  });

  // Property
  const propertyContainer = document.getElementById('property-filters');
  propertyContainer.querySelectorAll('.choice-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.property);
  });

  // Vibe
  const vibeContainer = document.getElementById('vibe-filters');
  vibeContainer.querySelectorAll('.choice-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.vibe);
  });

  // Occasion
  const occasionContainer = document.getElementById('occasion-filters');
  occasionContainer.querySelectorAll('.choice-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.occasion);
  });
}

// Build property filter buttons
function buildPropertyFilters() {
  const properties = [...new Set(allDrops.map(d => d.property.code))].sort();
  const container = document.getElementById('property-filters');

  let html = '<button class="choice-option choice-option--selected" data-filter="all">ALL</button>';
  properties.forEach(code => {
    const safeCode = escapeHtml(code);
    const displayCode = escapeHtml(code.slice(0, 4));
    html += `<button class="choice-option" data-filter="${safeCode}">${displayCode}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.choice-option').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('property', btn));
  });
}

// Build stay type filter buttons (excludes Gap Fill - not consumer friendly)
function buildStayTypeFilters() {
  const types = [...new Set(allDrops.map(d => d.stayType))].filter(t => t !== 'Gap Fill');
  const container = document.getElementById('stay-type-filters');
  const order = ['Weekend', 'Weekday'];
  types.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  let html = '<button class="choice-option choice-option--selected" data-filter="all">ALL</button>';
  types.forEach(type => {
    const safeType = escapeHtml(type);
    html += `<button class="choice-option" data-filter="${safeType}">${safeType.toUpperCase()}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.choice-option').forEach(btn => {
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

  let html = '<button class="choice-option choice-option--selected" data-filter="all">ALL</button>';
  vibeList.forEach(vibe => {
    const safeVibe = escapeHtml(vibe);
    html += `<button class="choice-option" data-filter="${safeVibe}">${safeVibe}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.choice-option').forEach(btn => {
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

  let html = '<button class="choice-option choice-option--selected" data-filter="all">ALL</button>';
  occasionList.forEach(occasion => {
    const safeOccasion = escapeHtml(occasion);
    html += `<button class="choice-option" data-filter="${safeOccasion}">${safeOccasion.toUpperCase()}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.choice-option').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('occasion', btn));
  });
}

// Handle filter button click
function handleFilterClick(filterType, btn) {
  const newValue = btn.dataset.filter;

  // Update active state for clicked filter
  const container = btn.parentElement;
  container.querySelectorAll('.choice-option').forEach(b => b.classList.remove('choice-option--selected'));
  btn.classList.add('choice-option--selected');
  filters[filterType] = newValue;

  // Check if current filters yield any results
  let results = getFilteredDrops();

  // If no results, progressively reset other filters until we have results
  if (results.length === 0 && newValue !== 'all') {
    const resetOrder = ['occasion', 'vibe', 'stayType', 'property', 'timing', 'nights'];
    const otherFilters = resetOrder.filter(f => f !== filterType);

    for (const resetType of otherFilters) {
      const defaultValue = resetType === 'nights' ? '3' : 'all';
      if (filters[resetType] === defaultValue) continue;

      // Reset this filter
      filters[resetType] = defaultValue;

      // Update UI for reset filter
      const resetContainerId = resetType === 'stayType' ? 'stay-type-filters' : `${resetType}-filters`;
      const resetContainer = document.getElementById(resetContainerId);
      if (resetContainer) {
        resetContainer.querySelectorAll('.choice-option').forEach(b => {
          b.classList.toggle('choice-option--selected', b.dataset.filter === defaultValue);
        });
      }

      // Check if we now have results
      results = getFilteredDrops();
      if (results.length > 0) break;
    }
  }

  updateURL();
  updateFilterAvailability();
  updateHeroFilterSummary();
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

    container.querySelectorAll('.choice-option').forEach(btn => {
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

// Get urgency messaging based on days until arrival
function getUrgencyInfo(daysOut, stayType) {
  if (daysOut <= 0) {
    return { text: 'STARTS TODAY', class: 'urgency-hot' };
  }
  if (daysOut === 1) {
    return { text: 'STARTS TOMORROW', class: 'urgency-hot' };
  }
  if (daysOut === 2) {
    return { text: 'IN 2 DAYS', class: 'urgency-hot' };
  }
  if (daysOut === 3) {
    return { text: 'IN 3 DAYS', class: '' };
  }
  // For weekends arriving in 4-7 days
  if (stayType === 'Weekend' && daysOut <= 7) {
    return { text: 'THIS WEEKEND', class: '' };
  }
  if (daysOut <= 7) {
    return { text: 'THIS WEEK', class: '' };
  }
  // No urgency for further out
  return null;
}

// Get scarcity indicator - simulated based on daysOut and engagement
function getScarcityInfo(drop) {
  const daysOut = drop.daysOut || 0;

  // Higher urgency = show scarcity more
  // This creates FOMO without lying about actual inventory
  if (daysOut <= 3) {
    return { text: '1 LEFT', class: 'scarcity-hot' };
  }
  if (daysOut <= 7 && drop.isNewlyAvailable) {
    return { text: '2 LEFT', class: 'scarcity-warm' };
  }
  if (daysOut <= 14) {
    return { text: 'FEW LEFT', class: '' };
  }
  return null;
}

// Render a single drop card
function renderDropCard(drop) {
  // Sanitize property code for CSS class (alphanumeric only)
  const propClass = (drop.property.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Validate and escape image URL
  const imageUrl = drop.property.image;
  const imageStyle = isValidUrl(imageUrl) ? `background-image: url('${escapeHtml(imageUrl)}')` : '';
  const showInitial = !isValidUrl(imageUrl);

  const arrivalDate = new Date(drop.arrival + 'T12:00:00Z');
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dateDisplay = `${dayNames[arrivalDate.getUTCDay()]} ${monthNames[arrivalDate.getUTCMonth()]} ${arrivalDate.getUTCDate()}`;

  // Determine tag based on source and recency
  let tagText = escapeHtml(drop.tags?.default || 'AVAILABLE');
  let tagClass = '';

  if (drop.isNewlyAvailable) {
    tagText = 'JUST OPENED';
    tagClass = 'tag-newly-available';
  }

  // Get urgency and scarcity info
  const urgency = getUrgencyInfo(drop.daysOut, drop.stayType);
  const scarcity = getScarcityInfo(drop);

  // Escape all text content from API
  const propertyCode = escapeHtml(drop.property.code || '');
  const propertyLabel = escapeHtml(drop.property.label || '');
  const nights = drop.nights || 0;

  // Add data attribute for engagement tracking
  const dropId = drop.dropId ? `data-drop-id="${escapeHtml(drop.dropId)}"` : '';

  // Make entire card clickable if valid booking URL
  const hasValidUrl = isValidUrl(drop.bookingUrl);
  const cardTag = hasValidUrl ? 'a' : 'div';
  const cardAttrs = hasValidUrl
    ? `href="${escapeHtml(drop.bookingUrl)}" target="_blank" rel="noopener noreferrer" onclick="trackDropClick('${escapeHtml(drop.dropId || '')}')"`
    : '';

  // Format price with nights
  const totalPrice = drop.pricing?.total ? `$${Math.round(drop.pricing.total).toLocaleString()}` : '';
  const pricePerNight = drop.pricing?.total && nights > 0
    ? `$${Math.round(drop.pricing.total / nights)}/nt`
    : '';

  return `
    <${cardTag} class="drop" ${dropId} ${cardAttrs}>
      <div class="drop-image ${propClass}" style="${imageStyle}">
        ${showInitial ? `<span class="property-initial">${propertyCode}</span>` : ''}
        <span class="drop-badge ${tagClass}">${tagText}</span>
        ${scarcity ? `<span class="drop-scarcity ${scarcity.class}">${scarcity.text}</span>` : ''}
        ${urgency ? `<div class="drop-urgency ${urgency.class}">${urgency.text}</div>` : ''}
      </div>
      <div class="drop-body">
        <div class="drop-property">${propertyCode}</div>
        <div class="drop-title">${propertyLabel}</div>
        <div class="drop-dates">${dateDisplay} · ${nights} night${nights !== 1 ? 's' : ''}</div>
        <div class="drop-footer">
          <div class="drop-price">
            ${totalPrice}${pricePerNight ? `<span class="drop-price-nights">${pricePerNight}</span>` : ''}
          </div>
          <span class="drop-cta">${hasValidUrl ? 'BOOK NOW →' : 'COMING SOON'}</span>
        </div>
      </div>
    </${cardTag}>
  `;
}

// Initialize filters and event listeners
function initFilters() {
  // Filter toggle button
  document.getElementById('filter-toggle').addEventListener('click', toggleFilterDrawer);

  // Timing filters
  document.getElementById('timing-filters').querySelectorAll('.choice-option').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('timing', btn));
  });

  // Nights filters
  document.getElementById('nights-filters').querySelectorAll('.choice-option').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('nights', btn));
  });
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
  fetch(`${baseUrl}/drops/${dropId}/engagement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'click' })
  }).catch(() => {}); // Silent fail - engagement tracking is non-critical
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
  document.querySelectorAll('.drop[data-drop-id]').forEach(card => {
    viewObserver.observe(card);
  });
}

// Scroll snap: stop when header becomes sticky (only on scroll down)
function initScrollSnap() {
  const header = document.getElementById('site-header');
  if (!header) return;

  let lastScrollY = 0;
  let hasSnapped = false;

  // Use IntersectionObserver to detect when header hits top
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const scrollingDown = window.scrollY > lastScrollY;
      lastScrollY = window.scrollY;

      // Only snap when scrolling DOWN and header leaves viewport
      if (!entry.isIntersecting && !hasSnapped && scrollingDown) {
        hasSnapped = true;
        const headerTop = header.offsetTop;
        window.scrollTo({ top: headerTop, behavior: 'auto' });
      }
      // Reset when header comes back into view (scrolling up)
      if (entry.isIntersecting) {
        hasSnapped = false;
      }
    });
  }, {
    threshold: 0,
    rootMargin: '0px 0px 0px 0px'
  });

  observer.observe(header);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  initScrollSnap();
  fetchDrops();
});
