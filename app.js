// Stay Drops - Frontend App

const API_URL = 'https://reset-inventory-sync.doug-6f9.workers.dev/api/drops';

let allDrops = [];
let filters = {
  checkin: 'all',
  property: 'all',
  nights: '3',
  season: 'all',
  stayType: 'all'
};

// Read filters from URL parameters
function getFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    checkin: params.get('checkin') || 'all',
    property: params.get('property') || 'all',
    nights: params.get('nights') || '3',
    season: params.get('season') || 'all',
    stayType: params.get('stayType') || 'all'
  };
}

// Update URL with current filters (without page reload)
function updateURL() {
  const params = new URLSearchParams();

  // Only add non-default values to keep URL clean
  if (filters.checkin !== 'all') params.set('checkin', filters.checkin);
  if (filters.property !== 'all') params.set('property', filters.property);
  if (filters.nights !== '3') params.set('nights', filters.nights);
  if (filters.season !== 'all') params.set('season', filters.season);
  if (filters.stayType !== 'all') params.set('stayType', filters.stayType);

  const newURL = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;

  window.history.replaceState({}, '', newURL);
}

// Fetch drops from API
async function fetchDrops() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    allDrops = data.drops || [];

    // Read filters from URL before building UI
    filters = getFiltersFromURL();

    // Build filter buttons dynamically
    buildCheckinFilters();
    buildPropertyFilters();
    buildSeasonFilters();
    buildStayTypeFilters();

    // Apply URL filters to UI
    applyFiltersToUI();

    // Render grid
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
  // Checkin
  const checkinContainer = document.getElementById('checkin-filters');
  checkinContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.checkin);
  });

  // Nights
  const nightsContainer = document.getElementById('nights-filters');
  nightsContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.nights);
  });

  // Property
  const propertyContainer = document.getElementById('property-filters');
  propertyContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.property);
  });

  // Season
  const seasonContainer = document.getElementById('season-filters');
  seasonContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.season);
  });

  // Stay Type
  const stayTypeContainer = document.getElementById('stay-type-filters');
  stayTypeContainer.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filters.stayType);
  });
}

// Build check-in day filter buttons for next 7 days
function buildCheckinFilters() {
  const container = document.getElementById('checkin-filters');
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find which days in the next 7 days have drops
  const next7Days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i + 1); // Start from tomorrow
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    // Check if any drops arrive on this date
    const hasDrops = allDrops.some(drop => drop.arrival === dateStr);
    if (hasDrops) {
      next7Days.push({
        date: dateStr,
        dayName: dayNames[dayOfWeek],
        dayNum: date.getDate()
      });
    }
  }

  // Build buttons
  let html = '<button class="filter-btn active" data-filter="all">ANY</button>';
  next7Days.forEach(day => {
    html += `<button class="filter-btn" data-filter="${day.date}">${day.dayName} ${day.dayNum}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('checkin', btn));
  });
}

// Build property filter buttons (4-char codes only)
function buildPropertyFilters() {
  const properties = [...new Set(allDrops.map(d => d.property.code))].sort();
  const container = document.getElementById('property-filters');

  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';
  properties.forEach(code => {
    html += `<button class="filter-btn" data-filter="${code}">${code}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('property', btn));
  });
}

// Build season filter buttons (uses seasonSpecific: early winter, winter, late winter, etc.)
function buildSeasonFilters() {
  const seasons = [...new Set(allDrops.map(d => d.seasonSpecific))];
  const container = document.getElementById('season-filters');

  // Order: early X, X, late X for each season
  const order = [
    'early winter', 'winter', 'late winter',
    'early spring', 'spring', 'late spring',
    'early summer', 'summer', 'late summer',
    'early fall', 'fall', 'late fall'
  ];
  seasons.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';
  seasons.forEach(season => {
    html += `<button class="filter-btn" data-filter="${season}">${season.toUpperCase()}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('season', btn));
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
    html += `<button class="filter-btn" data-filter="${type}">${type.toUpperCase()}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('stayType', btn));
  });
}

// Handle filter button click
function handleFilterClick(filterType, btn) {
  const container = btn.parentElement;
  container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filters[filterType] = btn.dataset.filter;

  // Smart nights selection when check-in date is selected
  if (filterType === 'checkin' && filters.checkin !== 'all' && filters.nights !== 'all') {
    const dropsOnDate = allDrops.filter(d => d.arrival === filters.checkin);
    const currentNights = parseInt(filters.nights);
    const hasCurrentNights = dropsOnDate.some(d => d.nights === currentNights);

    if (!hasCurrentNights && dropsOnDate.length > 0) {
      // Find available nights options on this date
      const availableNights = [...new Set(dropsOnDate.map(d => d.nights))].sort((a, b) => b - a);
      if (availableNights.length > 0) {
        // Auto-select the longest available
        filters.nights = availableNights[0].toString();
        // Update nights filter UI
        const nightsContainer = document.getElementById('nights-filters');
        nightsContainer.querySelectorAll('.filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.filter === filters.nights);
        });
      }
    }
  }

  updateURL();
  renderDrops();
}

// Filter drops based on current filters
function getFilteredDrops() {
  return allDrops.filter(drop => {
    // Check-in date filter
    if (filters.checkin !== 'all' && drop.arrival !== filters.checkin) return false;
    // Property filter
    if (filters.property !== 'all' && drop.property.code !== filters.property) return false;
    // Nights filter
    if (filters.nights !== 'all') {
      const filterNights = parseInt(filters.nights);
      if (drop.nights !== filterNights) return false;
    }
    // Season filter (uses seasonSpecific field)
    if (filters.season !== 'all' && drop.seasonSpecific !== filters.season) return false;
    // Stay type filter
    if (filters.stayType !== 'all' && drop.stayType !== filters.stayType) return false;
    return true;
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

  grid.innerHTML = filtered.map(drop => renderDropCard(drop)).join('');
}

// Render a single drop card
function renderDropCard(drop) {
  const propClass = drop.property.code.toLowerCase();
  const imageStyle = drop.property.image ? `background-image: url('${drop.property.image}')` : '';
  const showInitial = !drop.property.image;
  const bookingLink = drop.bookingUrl
    ? `<a href="${drop.bookingUrl}" class="drop-card-link" target="_blank">BOOK THIS DROP</a>`
    : `<span class="drop-card-link disabled">COMING SOON</span>`;

  const arrivalDate = new Date(drop.arrival + 'T12:00:00Z');
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateDisplay = `${monthNames[arrivalDate.getUTCMonth()]} ${arrivalDate.getUTCDate()}`;

  return `
    <article class="drop-card">
      <div class="drop-card-image ${propClass}" style="${imageStyle}">
        ${showInitial ? `<span class="property-initial">${drop.property.code}</span>` : ''}
        <span class="season-tag">${drop.seasonSpecific || drop.season}</span>
      </div>
      <div class="drop-card-content">
        <p class="drop-card-property">${drop.property.code}</p>
        <h2 class="drop-card-dates">${dateDisplay}</h2>
        <p class="drop-card-thru">${drop.thru || drop.arrivalFormatted + ' → ' + (drop.departureFormatted || '')}</p>
        <p class="drop-card-nights">${drop.nights} NIGHT${drop.nights > 1 ? 'S' : ''}${drop.stayType !== 'Gap Fill' ? ' / ' + drop.stayType.toUpperCase() : ''}</p>
        ${bookingLink}
      </div>
    </article>
  `;
}

// Initialize filters and event listeners
function initFilters() {
  // Nights filters
  document.getElementById('nights-filters').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('nights', btn));
  });
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  fetchDrops();
});
