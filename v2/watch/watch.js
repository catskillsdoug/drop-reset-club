/**
 * Watch Page - Bundle Browser
 * Fetches and displays film bundles from the API
 */

const API_BASE = 'https://reset-inventory-sync.doug-6f9.workers.dev';

// State
let bundles = [];
let drops = [];
let properties = [];

/**
 * Fetch bundles from API
 */
async function fetchBundles() {
  try {
    const response = await fetch(`${API_BASE}/api/bundles?category=Watch`);
    if (!response.ok) throw new Error('Failed to fetch bundles');
    const data = await response.json();
    return data.bundles || [];
  } catch (error) {
    console.error('Error fetching bundles:', error);
    return [];
  }
}

/**
 * Fetch drops from API (for the drops section)
 */
async function fetchDrops() {
  try {
    const response = await fetch(`${API_BASE}/api/drops`);
    if (!response.ok) throw new Error('Failed to fetch drops');
    const data = await response.json();
    return data.drops || [];
  } catch (error) {
    console.error('Error fetching drops:', error);
    return [];
  }
}

/**
 * Fetch properties from API (for footer)
 */
async function fetchProperties() {
  try {
    const response = await fetch(`${API_BASE}/api/properties`);
    if (!response.ok) throw new Error('Failed to fetch properties');
    const data = await response.json();
    return data.properties || [];
  } catch (error) {
    console.error('Error fetching properties:', error);
    return [];
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Render bundle card
 */
function renderBundleCard(bundle) {
  const imageStyle = bundle.heroImage
    ? `background-image: url('${escapeHtml(bundle.heroImage)}')`
    : '';

  const placeholderClass = bundle.heroImage ? '' : 'bundle-card-image--placeholder';

  return `
    <a href="/watch/${escapeHtml(bundle.slug)}" class="bundle-card">
      <div class="bundle-card-image ${placeholderClass}" style="${imageStyle}">
        ${!bundle.heroImage ? `<span>${escapeHtml(bundle.theme?.charAt(0) || 'W')}</span>` : ''}
      </div>
      <div class="bundle-card-body">
        <div class="bundle-card-category">${escapeHtml(bundle.category)}</div>
        <h3 class="bundle-card-title">${escapeHtml(bundle.theme)}</h3>
        <p class="bundle-card-description">${escapeHtml(truncate(bundle.intro, 120))}</p>
      </div>
    </a>
  `;
}

/**
 * Truncate text to max length
 */
function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Render drop arrow link
 */
function renderDropLink(drop) {
  const date = new Date(drop.arrival + 'T12:00:00');
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = date.getDate();

  return `
    <a href="${escapeHtml(drop.bookingUrl)}" target="_blank" class="arrow-link">
      <span class="arrow-link-title">${escapeHtml(drop.property.label)} · ${month} ${day} · ${drop.nights} night${drop.nights > 1 ? 's' : ''}</span>
      <span class="arrow-link-arrow">→</span>
    </a>
  `;
}

/**
 * Render bundles grid
 */
function renderBundles() {
  const container = document.getElementById('bundles-grid');
  if (!container) return;

  if (bundles.length === 0) {
    container.innerHTML = '<p class="loading">No collections available</p>';
    return;
  }

  container.innerHTML = bundles.map(renderBundleCard).join('');
}

/**
 * Render drops section (limited to 5)
 */
function renderDrops() {
  const container = document.getElementById('drops-list');
  if (!container) return;

  if (drops.length === 0) {
    container.innerHTML = '<p class="loading">No drops available</p>';
    return;
  }

  // Show up to 5 drops
  const limitedDrops = drops.slice(0, 5);
  container.innerHTML = limitedDrops.map(renderDropLink).join('');
}

/**
 * Initialize page
 */
async function init() {
  // Fetch bundles and drops in parallel
  const [bundlesData, dropsData] = await Promise.all([
    fetchBundles(),
    fetchDrops(),
  ]);

  bundles = bundlesData;
  drops = dropsData;

  renderBundles();
  renderDrops();
}

// Start
document.addEventListener('DOMContentLoaded', init);
