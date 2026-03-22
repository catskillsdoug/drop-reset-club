/**
 * Bundle Detail Page
 * Displays a single bundle with its recommendations
 */

const API_BASE = 'https://reset-inventory-sync.doug-6f9.workers.dev';

// State
let bundle = null;
let drops = [];

/**
 * Get slug from URL path
 */
function getSlugFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/\/watch\/([^\/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch bundle from API
 */
async function fetchBundle(slug) {
  try {
    const response = await fetch(`${API_BASE}/api/bundles/${encodeURIComponent(slug)}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch bundle');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching bundle:', error);
    return null;
  }
}

/**
 * Fetch drops from API
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Render recommendation (full card)
 */
function renderRecommendation(rec, index) {
  const imageStyle = rec.imageUrl
    ? `background-image: url('${escapeHtml(rec.imageUrl)}')`
    : '';

  const placeholderClass = rec.imageUrl ? '' : 'rec-full-image--placeholder';

  const streamLink = rec.streamLink
    ? `<div class="rec-full-link"><a href="${escapeHtml(rec.streamLink)}" target="_blank">Watch →</a></div>`
    : '';

  return `
    <article class="rec-full">
      <div class="rec-full-image ${placeholderClass}" style="${imageStyle}">
        ${!rec.imageUrl ? `<span>${escapeHtml(rec.title?.charAt(0) || '?')}</span>` : ''}
      </div>
      <div class="rec-full-body">
        <div class="rec-full-meta">
          <span class="rec-index">${index + 1}</span>
          <span>${escapeHtml(rec.subtype)}</span>
          <span>${rec.year || ''}</span>
        </div>
        <h3 class="rec-full-title">${escapeHtml(rec.title)}</h3>
        <p class="rec-full-description">${escapeHtml(rec.description)}</p>
        ${streamLink}
      </div>
    </article>
  `;
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
 * Render bundle details
 */
function renderBundle() {
  if (!bundle) {
    document.getElementById('bundle-title').textContent = 'Not Found';
    document.getElementById('bundle-intro').textContent = 'This collection could not be found.';
    document.getElementById('recs-list').innerHTML = '';
    return;
  }

  // Update page title
  document.title = `${bundle.theme} | Watch | The Reset Club`;

  // Update hero
  const heroEl = document.getElementById('hero');
  const firstRec = bundle.recommendations?.[0];
  if (firstRec?.imageUrl) {
    heroEl.style.backgroundImage = `url('${firstRec.imageUrl}')`;
  }

  document.getElementById('bundle-title').textContent = bundle.theme;
  document.getElementById('bundle-subtitle').textContent = bundle.subjectLine || '';

  // Update meta
  const meta = [
    bundle.category,
    bundle.pillar,
    bundle.seasonTags?.join(', '),
  ].filter(Boolean).join(' · ');
  document.getElementById('bundle-meta').textContent = meta;

  // Update intro
  document.getElementById('bundle-intro').textContent = bundle.intro || '';

  // Render recommendations
  const recsContainer = document.getElementById('recs-list');
  if (bundle.recommendations?.length > 0) {
    recsContainer.innerHTML = bundle.recommendations
      .map((rec, i) => renderRecommendation(rec, i))
      .join('');
  } else {
    recsContainer.innerHTML = '<p class="loading">No recommendations in this collection</p>';
  }
}

/**
 * Render drops section
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
  const slug = getSlugFromUrl();

  if (!slug) {
    window.location.href = '/watch';
    return;
  }

  // Fetch bundle and drops in parallel
  const [bundleData, dropsData] = await Promise.all([
    fetchBundle(slug),
    fetchDrops(),
  ]);

  bundle = bundleData;
  drops = dropsData;

  if (!bundle) {
    // Redirect to /watch if bundle not found
    window.location.href = '/watch';
    return;
  }

  renderBundle();
  renderDrops();
}

// Start
document.addEventListener('DOMContentLoaded', init);
