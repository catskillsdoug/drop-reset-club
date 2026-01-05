// Stay Drops - Frontend App

const API_URL = 'https://reset-inventory-sync.doug-6f9.workers.dev/api/drops';

let allDrops = [];
let currentView = 'grid';
let currentMonth = new Date();
let filters = {
  property: 'all',
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

    // Render current view
    renderCurrentView();
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

  let html = '<button class="filter-btn active" data-filter="all">ALL</button>';
  properties.forEach(code => {
    const drop = allDrops.find(d => d.property.code === code);
    const label = drop?.property.label || code;
    html += `<button class="filter-btn" data-filter="${code}">${label.toUpperCase()}</button>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('property', btn));
  });
}

// Handle filter button click
function handleFilterClick(filterType, btn) {
  const container = btn.parentElement;
  container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filters[filterType] = btn.dataset.filter;
  renderCurrentView();
}

// Handle view toggle
function handleViewToggle(btn) {
  const container = btn.parentElement;
  container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentView = btn.dataset.view;

  document.getElementById('drops-grid').style.display = currentView === 'grid' ? 'grid' : 'none';
  document.getElementById('calendar-view').style.display = currentView === 'calendar' ? 'block' : 'none';

  renderCurrentView();
}

// Filter drops based on current filters
function getFilteredDrops() {
  return allDrops.filter(drop => {
    if (filters.property !== 'all' && drop.property.code !== filters.property) return false;
    if (filters.nights !== 'all') {
      if (filters.nights === '2' && drop.nights !== 2) return false;
      if (filters.nights === '3' && drop.nights < 3) return false;
    }
    return true;
  });
}

// Render current view
function renderCurrentView() {
  if (currentView === 'grid') {
    renderDrops();
  } else {
    renderCalendar();
  }
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

// Render calendar
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const monthLabel = document.getElementById('calendar-month-label');
  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  monthLabel.textContent = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get filtered drops
  const filtered = getFilteredDrops();

  // Build drops by date for this month
  const dropsByDate = {};
  filtered.forEach(drop => {
    const arrivalDate = new Date(drop.arrival + 'T12:00:00Z');
    if (arrivalDate.getUTCFullYear() === year && arrivalDate.getUTCMonth() === month) {
      const day = arrivalDate.getUTCDate();
      if (!dropsByDate[day]) dropsByDate[day] = [];
      dropsByDate[day].push(drop);
    }
  });

  // Build calendar HTML
  let html = '';

  // Day headers
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  dayNames.forEach(day => {
    html += `<div class="calendar-header">${day}</div>`;
  });

  // Empty cells before first day
  for (let i = 0; i < startDayOfWeek; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isPast = date < today;
    const dayDrops = dropsByDate[day] || [];

    html += `<div class="calendar-day${isPast ? ' past' : ''}">`;
    html += `<div class="calendar-day-number">${day}</div>`;

    if (dayDrops.length > 0 && !isPast) {
      html += '<div class="calendar-day-drops">';
      dayDrops.forEach(drop => {
        const propClass = drop.property.code.toLowerCase();
        if (drop.bookingUrl) {
          html += `<a href="${drop.bookingUrl}" target="_blank" class="calendar-drop ${propClass}" title="${drop.property.label} - ${drop.nights} nights">${drop.property.code} ${drop.nights}N</a>`;
        } else {
          html += `<span class="calendar-drop ${propClass}" title="${drop.property.label} - ${drop.nights} nights">${drop.property.code} ${drop.nights}N</span>`;
        }
      });
      html += '</div>';
    }

    html += '</div>';
  }

  // Empty cells after last day
  const endDayOfWeek = lastDay.getDay();
  for (let i = endDayOfWeek + 1; i < 7; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  grid.innerHTML = html;
}

// Navigate months
function navigateMonth(delta) {
  currentMonth.setMonth(currentMonth.getMonth() + delta);
  renderCalendar();
}

// Initialize filters and event listeners
function initFilters() {
  // View toggle
  document.getElementById('view-toggle').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleViewToggle(btn));
  });

  // Nights filters
  document.getElementById('nights-filters').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => handleFilterClick('nights', btn));
  });

  // Calendar navigation
  document.getElementById('prev-month').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => navigateMonth(1));
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  fetchDrops();
});
