// Stay Drops - Frontend App

const API_URL = 'https://reset-inventory-sync.doug-6f9.workers.dev/api/drops';

let allDrops = [];
let filters = {
  property: 'all',
  season: 'all',
  nights: 'all'
};

// Fetch drops from API
async function fetchDrops() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    allDrops = data.drops || [];

    // Build property filter buttons dynamically
    buildPropertyFilters();

    // Render drops
    renderDrops();
  } catch (error) {
    console.error('Error fetching drops:', error);
    document.getElementById('drops-grid').innerHTML = `
      <div class="no-results">ERROR LOADING DROPS. PLEASE TRY AGAIN.</div>
    `;
  }
}

// Build property filter buttons from available properties
function buildPropertyFilters() {
  const properties = [...new Set(allDrops.map(d => d.property.code))].sort();
  const container = document.getElementById('property-filters');

  // Keep the ALL button
  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';

  // Add property buttons
  properties.forEach(code => {
    const drop = allDrops.find(d => d.property.code === code);
    const label = drop?.property.label || code;
    html += `<button class="filter-btn" data-filter="${code}">${label.toUpperCase()}</button>`;
  });

  container.innerHTML = html;

  // Re-attach event listeners
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('property', btn));
  });
}

// Handle filter button click
function handleFilterClick(filterType, btn) {
  const container = btn.parentElement;
  const value = btn.dataset.filter;

  // Update active state
  container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Update filter
  filters[filterType] = value;

  // Re-render
  renderDrops();
}

// Filter drops based on current filters
function getFilteredDrops() {
  return allDrops.filter(drop => {
    // Property filter
    if (filters.property !== 'all' && drop.property.code !== filters.property) {
      return false;
    }

    // Season filter
    if (filters.season !== 'all' && drop.season !== filters.season) {
      return false;
    }

    // Nights filter
    if (filters.nights !== 'all' && drop.nights !== parseInt(filters.nights)) {
      return false;
    }

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
  const imageStyle = drop.property.image
    ? `background-image: url('${drop.property.image}')`
    : '';

  const bookingLink = drop.bookingUrl
    ? `<a href="${drop.bookingUrl}" class="drop-card-link" target="_blank">BOOK THIS DROP</a>`
    : `<span class="drop-card-link disabled">COMING SOON</span>`;

  // Format the arrival date nicely
  const arrivalDate = new Date(drop.arrival + 'T12:00:00Z');
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateDisplay = `${monthNames[arrivalDate.getUTCMonth()]} ${arrivalDate.getUTCDate()}`;

  return `
    <article class="drop-card" data-property="${drop.property.code}" data-season="${drop.season}" data-nights="${drop.nights}">
      <div class="drop-card-image" style="${imageStyle}">
        <span class="season-tag">${drop.season}</span>
      </div>
      <div class="drop-card-content">
        <p class="drop-card-property">${drop.property.label}</p>
        <h2 class="drop-card-dates">${dateDisplay}</h2>
        <p class="drop-card-thru">${drop.thru || drop.arrivalFormatted + ' → ' + (drop.departureFormatted || '')}</p>
        <p class="drop-card-nights">${drop.nights} NIGHT${drop.nights > 1 ? 'S' : ''}</p>
        ${bookingLink}
      </div>
    </article>
  `;
}

// Initialize filter event listeners
function initFilters() {
  // Season filters
  document.getElementById('season-filters').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('season', btn));
  });

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
