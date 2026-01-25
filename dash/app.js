// Reset Home Dashboard App

const WEATHER_API = 'https://reset-inventory-weather.doug-6f9.workers.dev';
const ST_API = 'https://reset-st-weather-seam-task-udl.doug-6f9.workers.dev';

// Track which thermostats are included in average calculation (stored in localStorage)
let thermostatSelections = JSON.parse(localStorage.getItem('thermostatSelections') || '{}');

// Properties loaded dynamically from API
let PROPERTIES = {};

// Weather areas
const WEATHER_AREAS = {
  'catskills-1': { name: 'Catskills - West', lat: 42.1957, lon: -74.3093 },
  'catskills-2': { name: 'Catskills - East', lat: 42.15, lon: -74.15 },
  'porto': { name: 'Porto', lat: 41.1579, lon: -8.6291 }
};

let selectedProperty = 'all';
let propertyStates = {};
let weatherData = {};
let staysData = [];
let temperatureData = [];
let temperatureHistory = {};

// Security: Escape HTML
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// Initialize dashboard
async function init() {
  setupPropertySelector();

  // Load data in parallel
  await Promise.all([
    loadPropertyStates(),
    loadTemperatureData(),
    loadTemperatureHistory(),
    loadWeatherData(),
    loadStays()
  ]);

  renderAll();
}

// Setup property selector event listener
function setupPropertySelector() {
  const select = document.getElementById('property-select');
  select.addEventListener('change', (e) => {
    selectedProperty = e.target.value;
    renderAll();
  });
}

// Update property selector options from loaded data
function updatePropertySelector() {
  const select = document.getElementById('property-select');

  // Clear existing options except "All"
  while (select.options.length > 1) {
    select.remove(1);
  }

  Object.entries(PROPERTIES).forEach(([code, info]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = code;
    select.appendChild(option);
  });
}

// Load property states from SmartThings worker
async function loadPropertyStates() {
  try {
    const response = await fetch(`${ST_API}/check-all`);
    const data = await response.json();

    if (data.success && data.properties) {
      propertyStates = data.properties;

      // Build PROPERTIES from API response
      PROPERTIES = {};
      Object.keys(data.properties).sort().forEach(code => {
        PROPERTIES[code] = {
          name: code, // Use code as name for now
          area: 'catskills-1' // Default area
        };
      });

      // Update property selector with real properties
      updatePropertySelector();
    }
  } catch (error) {
    console.error('Failed to load property states:', error);
    propertyStates = {};
  }
}

// Load weather data from Airtable via weather worker
async function loadWeatherData() {
  try {
    const response = await fetch(`${WEATHER_API}/api/weather`);
    const data = await response.json();

    if (data.success) {
      weatherData = data;
    }
  } catch (error) {
    console.error('Failed to load weather data:', error);
    // Use mock data as fallback
    weatherData = {
      areas: {
        'catskills-1': {
          name: 'Catskills - West',
          current: { high: 45, low: 28, condition: 'Partly Cloudy' },
          forecast: generateMockForecast()
        },
        'catskills-2': {
          name: 'Catskills - East',
          current: { high: 43, low: 26, condition: 'Clear' },
          forecast: generateMockForecast()
        },
        'porto': {
          name: 'Porto',
          current: { high: 58, low: 48, condition: 'Cloudy' },
          forecast: generateMockForecast()
        }
      }
    };
  }
}

// Generate mock forecast data
function generateMockForecast() {
  const forecast = [];
  const today = new Date();

  for (let i = -7; i <= 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    forecast.push({
      date: date.toISOString().split('T')[0],
      high: Math.round(35 + Math.random() * 20),
      low: Math.round(20 + Math.random() * 15)
    });
  }

  return forecast;
}

// Load upcoming stays from Airtable via weather worker
async function loadStays() {
  try {
    const response = await fetch(`${WEATHER_API}/api/stays/upcoming`);
    const data = await response.json();

    if (data.success && data.stays) {
      staysData = data.stays;
    }
  } catch (error) {
    console.error('Failed to load stays:', error);
    // Empty fallback
    staysData = [];
  }
}

// Load temperature dashboard data from SmartThings worker
async function loadTemperatureData() {
  try {
    const response = await fetch(`${ST_API}/thermostats/dashboard`);
    const data = await response.json();

    if (data.success && data.properties) {
      temperatureData = data.properties;
    }
  } catch (error) {
    console.error('Failed to load temperature data:', error);
    temperatureData = [];
  }
}

// Load temperature history for trend charts (last 8 hours)
async function loadTemperatureHistory() {
  try {
    const response = await fetch(`${ST_API}/thermostats/history?hours=8`);
    const data = await response.json();

    if (data.success && data.history) {
      temperatureHistory = data.history;
    }
  } catch (error) {
    console.error('Failed to load temperature history:', error);
    temperatureHistory = {};
  }
}

// Render all sections
function renderAll() {
  renderUnifiedProperties();
  renderTemperatureTrend();
  renderChart();
  renderControls();
  renderStays();
}

// Toggle thermostat expansion
function toggleThermostats(propertyCode) {
  const details = document.getElementById(`thermostats-${propertyCode}`);
  const toggle = document.getElementById(`toggle-${propertyCode}`);
  if (details) {
    const isExpanded = details.classList.toggle('expanded');
    if (toggle) {
      toggle.textContent = isExpanded ? '▲' : '▼';
    }
  }
}

// Toggle thermostat inclusion in average
function toggleThermostatSelection(propertyCode, thermostatName, checkbox) {
  if (!thermostatSelections[propertyCode]) {
    thermostatSelections[propertyCode] = {};
  }
  thermostatSelections[propertyCode][thermostatName] = checkbox.checked;
  localStorage.setItem('thermostatSelections', JSON.stringify(thermostatSelections));

  // Recalculate and update average display
  updatePropertyAverage(propertyCode);
}

// Calculate average from selected thermostats
function calculateSelectedAverage(propertyCode, thermostats) {
  if (!thermostats || thermostats.length === 0) return null;

  const selections = thermostatSelections[propertyCode] || {};

  // Filter to selected thermostats (default all selected if no selections made)
  const hasSelections = Object.keys(selections).length > 0;
  const selectedThermostats = thermostats.filter(t => {
    if (!hasSelections) return true;
    return selections[t.name] !== false; // Include if not explicitly excluded
  });

  if (selectedThermostats.length === 0) return null;

  const temps = selectedThermostats.map(t => t.temp).filter(t => t != null);
  if (temps.length === 0) return null;

  return Math.round(temps.reduce((a, b) => a + b, 0) / temps.length * 10) / 10;
}

// Update property average display after selection change
function updatePropertyAverage(propertyCode) {
  const prop = temperatureData.find(p => p.propertyCode === propertyCode);
  if (!prop || !prop.thermostats) return;

  const avgTemp = calculateSelectedAverage(propertyCode, prop.thermostats);
  const avgDisplay = document.getElementById(`avg-temp-${propertyCode}`);
  if (avgDisplay && avgTemp != null) {
    avgDisplay.textContent = `${avgTemp}°F`;
  }
}

// Render unified property cards (occupancy + temperature combined)
// Layout per PRD Section 9.1
function renderUnifiedProperties() {
  const grid = document.getElementById('properties-grid');

  // Filter by selected property
  let properties = temperatureData;
  if (selectedProperty !== 'all') {
    properties = properties.filter(p => p.propertyCode === selectedProperty);
  }

  if (properties.length === 0) {
    grid.innerHTML = '<div class="empty-state">No properties found</div>';
    return;
  }

  grid.innerHTML = properties.map(prop => {
    const code = prop.propertyCode;
    const thermostats = prop.thermostats || [];
    const hasThermostats = thermostats.length > 0;

    // Calculate average from selected thermostats
    const avgTemp = hasThermostats ? calculateSelectedAverage(code, thermostats) : (prop.indoor?.temp || null);
    const targetTemp = prop.target?.temp ?? '--';
    const mode = prop.thermostatMode || 'off';
    const progress = avgTemp != null ? calculateTempProgress(avgTemp, prop.target?.temp, mode) : 0;

    // Calculate average humidity from thermostats
    const humidities = thermostats.map(t => t.humidity).filter(h => h != null);
    const avgHumidity = humidities.length > 0
      ? Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length)
      : null;

    // Mode-based styling
    let modeClass = 'temp-progress-fill--off';
    let modeLabel = 'OFF';
    if (mode === 'heat') {
      modeClass = 'temp-progress-fill--heat';
      modeLabel = 'HEAT';
    } else if (mode === 'cool') {
      modeClass = 'temp-progress-fill--cool';
      modeLabel = 'COOL';
    } else if (mode === 'auto') {
      modeClass = prop.operatingState === 'cooling' ? 'temp-progress-fill--cool' : 'temp-progress-fill--heat';
      modeLabel = 'AUTO';
    }

    // Outdoor info
    const outdoorTemp = prop.outdoor?.temp ?? null;
    const weatherIcon = getWeatherIcon(outdoorTemp);

    // Last update (use most recent thermostat timestamp)
    const timestamps = thermostats.map(t => t.timestamp).filter(Boolean);
    const lastUpdate = timestamps.length > 0
      ? timestamps.sort().reverse()[0]
      : prop.lastUpdate;

    // Booking info
    const booking = prop.booking;
    let stayInfo = '';
    if (booking && booking.start && booking.end) {
      const startDate = new Date(booking.start);
      const endDate = new Date(booking.end);
      const dateFormat = { month: 'short', day: 'numeric' };
      stayInfo = `${startDate.toLocaleDateString('en-US', dateFormat)} - ${endDate.toLocaleDateString('en-US', dateFormat)}`;
    }

    // Build thermostat rows
    const thermostatRows = thermostats.map(t => {
      const selections = thermostatSelections[code] || {};
      const hasSelections = Object.keys(selections).length > 0;
      const isSelected = hasSelections ? selections[t.name] !== false : true;
      const tempDisplay = t.temp != null ? `${Math.round(t.temp * 10) / 10}°F` : '--';
      const humidityDisplay = t.humidity != null ? `${t.humidity}%` : '--';

      // Determine thermostat state icon
      let stateIcon = '';
      if (t.isHeating) stateIcon = '🔥';
      else if (t.isCooling) stateIcon = '❄️';

      return `
        <div class="thermostat-row">
          <label class="thermostat-select">
            <input type="checkbox"
              ${isSelected ? 'checked' : ''}
              onchange="toggleThermostatSelection('${code}', '${escapeHtml(t.name)}', this)"
            />
          </label>
          <span class="thermostat-name">${escapeHtml(t.name)}</span>
          <span class="thermostat-reading">${tempDisplay} ${stateIcon}</span>
          <span class="thermostat-humidity">${humidityDisplay}</span>
        </div>
      `;
    }).join('');

    // PRD status icons: ✓ Green ≤2°F, ⚠️ Yellow 3-5°F, 🔴 Red >5°F
    const statusIcon = getStatusIcon(prop.status);

    return `
      <div class="unified-card ${prop.status === 'CRITICAL' ? 'unified-card--critical' : ''}">
        <div class="unified-card-header">
          <div class="unified-card-title-row">
            <span class="unified-card-title">🏠 ${escapeHtml(code)}</span>
          </div>
          <span class="guest-state-badge ${getStateBadgeClass(prop.guestState)}">
            ${escapeHtml(getStateLabel(prop.guestState))}
          </span>
        </div>

        <div class="unified-card-body">
          ${stayInfo ? `<p class="stay-info">${stayInfo}</p>` : ''}

          <div class="temp-display-row">
            <span class="temp-label">Indoor:</span>
            <span class="temp-display-current" id="avg-temp-${code}">${avgTemp != null ? avgTemp + '°F' : '--'}</span>
            <span class="temp-display-arrow">→</span>
            <span class="temp-label">Target:</span>
            <span class="temp-display-target">${targetTemp}°F</span>
            ${statusIcon}
          </div>

          <div class="temp-progress">
            <div class="temp-progress-bar">
              <div class="temp-progress-fill ${modeClass}" style="width: ${progress}%"></div>
            </div>
            <span class="temp-mode-label">${modeLabel}</span>
          </div>

          <div class="temp-meta-row">
            <span>Outside: ${outdoorTemp != null ? outdoorTemp + '°F' : '--'} ${weatherIcon}</span>
            <span>Humidity: ${avgHumidity != null ? avgHumidity + '%' : '--'}</span>
          </div>

          <div class="temp-update-row">
            <span>Last Update: ${formatLastUpdate(lastUpdate)}</span>
          </div>
        </div>

        ${hasThermostats ? `
          <div class="thermostats-toggle" onclick="toggleThermostats('${code}')">
            <span>Thermostats (${thermostats.length})</span>
            <span id="toggle-${code}">▼</span>
          </div>
          <div class="thermostats-details" id="thermostats-${code}">
            <div class="thermostats-header">
              <span></span>
              <span>Name</span>
              <span>Temp</span>
              <span>Humidity</span>
            </div>
            ${thermostatRows}
          </div>
        ` : ''}

        ${prop.error ? `<p class="error-message">${escapeHtml(prop.error)}</p>` : ''}
      </div>
    `;
  }).join('');
}

// Get CSS class for status
function getStatusClass(status) {
  switch (status) {
    case 'OK': return 'status-ok';
    case 'WARNING': return 'status-warning';
    case 'CRITICAL': return 'status-critical';
    default: return 'status-unknown';
  }
}

// Get status icon per PRD (✓ Green ≤2°F, ⚠️ Yellow 3-5°F, 🔴 Red >5°F)
function getStatusIcon(status) {
  switch (status) {
    case 'OK': return '<span class="status-icon status-icon--ok">✓</span>';
    case 'WARNING': return '<span class="status-icon status-icon--warning">⚠️</span>';
    case 'CRITICAL': return '<span class="status-icon status-icon--critical">🔴</span>';
    default: return '<span class="status-icon status-icon--unknown">–</span>';
  }
}

// Format relative time for "Last Update"
function formatLastUpdate(timestamp) {
  if (!timestamp) return 'Unknown';

  const now = new Date();
  const updated = new Date(timestamp);
  const diffMs = now - updated;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  return updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get weather icon based on outdoor temp
function getWeatherIcon(outdoorTemp) {
  if (outdoorTemp === null || outdoorTemp === undefined) return '';
  if (outdoorTemp < 33) return '❄️';
  if (outdoorTemp > 85) return '🔥';
  if (outdoorTemp > 72) return '☀️';
  return '';
}

// Get human-readable guest state label
function getStateLabel(state) {
  switch (state) {
    case 'ARRIVED': return 'Guest Arrived';
    case 'BOOKED': return 'Booked';
    case 'CLEANING': return 'Cleaning';
    case 'EMPTY': return 'Empty';
    default: return state;
  }
}

// Get guest state badge class
function getStateBadgeClass(state) {
  switch (state) {
    case 'ARRIVED': return 'guest-state-badge--arrived';
    case 'BOOKED': return 'guest-state-badge--booked';
    case 'CLEANING': return 'guest-state-badge--cleaning';
    default: return '';
  }
}

// Calculate progress bar percentage (how close to target)
function calculateTempProgress(current, target, mode) {
  if (current == null || target == null) return 0;

  // For heating: 100% when at or above target
  // For cooling: 100% when at or below target
  const isHeating = mode === 'heat' || mode === 'auto';
  const diff = Math.abs(current - target);
  const maxDiff = 10; // Consider 10 degrees as 0% progress

  if (isHeating) {
    if (current >= target) return 100;
    return Math.max(0, Math.min(100, ((maxDiff - diff) / maxDiff) * 100));
  } else {
    if (current <= target) return 100;
    return Math.max(0, Math.min(100, ((maxDiff - diff) / maxDiff) * 100));
  }
}

// renderTemperature is now integrated into renderUnifiedProperties

// Render 8-hour temperature trend chart
function renderTemperatureTrend() {
  const container = document.getElementById('temp-chart');

  // Filter by selected property
  let propertyKeys = Object.keys(temperatureHistory);
  if (selectedProperty !== 'all') {
    propertyKeys = propertyKeys.filter(k => k === selectedProperty);
  }

  if (propertyKeys.length === 0) {
    container.innerHTML = '<div class="empty-state">No temperature history available</div>';
    return;
  }

  // For multi-property view, show first property (user can filter)
  // For single property, show that property's detail
  const propCode = propertyKeys[0];
  const propHistory = temperatureHistory[propCode];

  if (!propHistory || (!propHistory.average?.length && !Object.keys(propHistory.devices || {}).length)) {
    container.innerHTML = '<div class="empty-state">No temperature history for this period</div>';
    return;
  }

  // Prepare data series
  const series = [];
  const colors = ['#22c55e', '#3B82F6', '#eab308', '#ef4444', '#8b5cf6', '#ec4899'];
  let colorIndex = 0;

  // Add average line (thick, prominent)
  if (propHistory.average && propHistory.average.length > 0) {
    series.push({
      name: 'Average',
      data: propHistory.average,
      color: '#000',
      strokeWidth: 3,
      isAverage: true
    });
  }

  // Add individual device lines (thinner, lighter)
  if (propHistory.devices) {
    for (const [deviceName, readings] of Object.entries(propHistory.devices)) {
      series.push({
        name: deviceName,
        data: readings,
        color: colors[colorIndex % colors.length],
        strokeWidth: 1.5,
        isAverage: false
      });
      colorIndex++;
    }
  }

  if (series.length === 0) {
    container.innerHTML = '<div class="empty-state">No data points available</div>';
    return;
  }

  // Chart dimensions
  const width = container.clientWidth || 600;
  const height = 250;
  const padding = { top: 30, right: 20, bottom: 40, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find data range
  let allTemps = [];
  let allTimes = [];
  for (const s of series) {
    for (const d of s.data) {
      allTemps.push(d.temp);
      allTimes.push(new Date(d.timestamp).getTime());
    }
  }

  if (allTemps.length === 0) {
    container.innerHTML = '<div class="empty-state">No data points available</div>';
    return;
  }

  const minTemp = Math.floor(Math.min(...allTemps) - 2);
  const maxTemp = Math.ceil(Math.max(...allTemps) + 2);
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);

  // Scale functions
  const xScale = (timestamp) => {
    const t = new Date(timestamp).getTime();
    return padding.left + ((t - minTime) / (maxTime - minTime)) * chartWidth;
  };

  const yScale = (temp) => {
    return padding.top + (1 - (temp - minTemp) / (maxTemp - minTemp)) * chartHeight;
  };

  // Generate paths for each series
  const paths = series.map(s => {
    const pathData = s.data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.timestamp)} ${yScale(d.temp)}`)
      .join(' ');

    return `<path class="trend-line ${s.isAverage ? 'trend-line--average' : ''}"
      d="${pathData}"
      stroke="${s.color}"
      stroke-width="${s.strokeWidth}"
      fill="none"
      opacity="${s.isAverage ? 1 : 0.6}"
    />`;
  }).join('');

  // Generate grid lines
  const gridLines = [];
  const tempStep = 5;
  for (let temp = Math.ceil(minTemp / tempStep) * tempStep; temp <= maxTemp; temp += tempStep) {
    const y = yScale(temp);
    gridLines.push(`<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />`);
    gridLines.push(`<text class="chart-axis-label" x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${temp}°</text>`);
  }

  // Generate time labels (every 2 hours)
  const timeLabels = [];
  const timeStep = 2 * 60 * 60 * 1000; // 2 hours
  const startTime = Math.ceil(minTime / timeStep) * timeStep;
  for (let t = startTime; t <= maxTime; t += timeStep) {
    const x = xScale(t);
    const date = new Date(t);
    const label = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    timeLabels.push(`<text class="chart-axis-label" x="${x}" y="${height - 10}" text-anchor="middle">${label}</text>`);
  }

  // Generate legend
  const legendItems = series.map((s, i) => {
    const displayName = s.name.length > 20 ? s.name.substring(0, 18) + '...' : s.name;
    return `
      <div class="trend-legend-item">
        <span class="trend-legend-color" style="background-color: ${s.color}; height: ${s.isAverage ? '3px' : '2px'}"></span>
        <span class="trend-legend-name">${escapeHtml(displayName)}</span>
      </div>
    `;
  }).join('');

  // Title
  const title = selectedProperty === 'all'
    ? `${propCode} - 8 Hour Temperature Trend`
    : `${propCode} - 8 Hour Temperature Trend`;

  container.innerHTML = `
    <div class="trend-header">
      <span class="trend-title">${title}</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      ${gridLines.join('')}
      ${paths}
      ${timeLabels.join('')}
    </svg>
    <div class="trend-legend">
      ${legendItems}
    </div>
  `;
}

// Render weather cards (deprecated - kept for reference)
function renderWeather() {
  const grid = document.getElementById('weather-grid');
  const areas = weatherData.areas || {};

  // Filter areas based on selected property
  let relevantAreas = Object.keys(WEATHER_AREAS);
  if (selectedProperty !== 'all') {
    const propertyArea = PROPERTIES[selectedProperty]?.area;
    if (propertyArea) {
      relevantAreas = [propertyArea];
    }
  }

  if (relevantAreas.length === 0) {
    grid.innerHTML = '<div class="empty-state">No weather data available</div>';
    return;
  }

  grid.innerHTML = relevantAreas.map(areaKey => {
    const areaInfo = WEATHER_AREAS[areaKey];
    const data = areas[areaKey] || { current: { high: '--', low: '--', condition: 'Unknown' } };
    const current = data.current || {};

    return `
      <div class="weather-card">
        <div class="weather-card-header">
          <span class="weather-card-location">${escapeHtml(areaInfo.name)}</span>
          <span class="weather-card-temp">${current.high || '--'}°F</span>
        </div>
        <p class="weather-card-condition">${escapeHtml(current.condition || 'Unknown')}</p>
        <div class="weather-card-details">
          <div class="weather-detail">
            <span class="weather-detail-label">High</span>
            <span class="weather-detail-value">${current.high || '--'}°F</span>
          </div>
          <div class="weather-detail">
            <span class="weather-detail-label">Low</span>
            <span class="weather-detail-value">${current.low || '--'}°F</span>
          </div>
          <div class="weather-detail">
            <span class="weather-detail-label">Sunrise</span>
            <span class="weather-detail-value">${current.sunrise || '--'}</span>
          </div>
          <div class="weather-detail">
            <span class="weather-detail-label">Sunset</span>
            <span class="weather-detail-value">${current.sunset || '--'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render temperature chart
function renderChart() {
  const container = document.getElementById('temp-chart');

  // Get forecast data for selected area
  let areaKey = 'catskills-1';
  if (selectedProperty !== 'all' && PROPERTIES[selectedProperty]) {
    areaKey = PROPERTIES[selectedProperty].area;
  }

  const areas = weatherData.areas || {};
  const areaData = areas[areaKey];
  const forecast = areaData?.forecast || generateMockForecast();

  if (!forecast || forecast.length === 0) {
    container.innerHTML = '<div class="empty-state">No forecast data</div>';
    return;
  }

  // Chart dimensions
  const width = container.clientWidth || 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get min/max temps
  const allTemps = forecast.flatMap(d => [d.high, d.low]);
  const minTemp = Math.min(...allTemps) - 5;
  const maxTemp = Math.max(...allTemps) + 5;

  // Scale functions
  const xScale = (i) => padding.left + (i / (forecast.length - 1)) * chartWidth;
  const yScale = (temp) => padding.top + (1 - (temp - minTemp) / (maxTemp - minTemp)) * chartHeight;

  // Generate path data
  const highPath = forecast.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.high)}`).join(' ');
  const lowPath = forecast.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.low)}`).join(' ');

  // Generate grid lines
  const gridLines = [];
  const tempStep = 10;
  for (let temp = Math.ceil(minTemp / tempStep) * tempStep; temp <= maxTemp; temp += tempStep) {
    const y = yScale(temp);
    gridLines.push(`<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />`);
    gridLines.push(`<text class="chart-axis-label" x="${padding.left - 5}" y="${y + 3}" text-anchor="end">${temp}°</text>`);
  }

  // Generate date labels
  const dateLabels = [];
  const labelInterval = Math.ceil(forecast.length / 7);
  forecast.forEach((d, i) => {
    if (i % labelInterval === 0 || i === forecast.length - 1) {
      const date = new Date(d.date);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      dateLabels.push(`<text class="chart-axis-label" x="${xScale(i)}" y="${height - 5}" text-anchor="middle">${label}</text>`);
    }
  });

  // Find today's index
  const today = new Date().toISOString().split('T')[0];
  const todayIndex = forecast.findIndex(d => d.date === today);
  let todayMarker = '';
  if (todayIndex >= 0) {
    const x = xScale(todayIndex);
    todayMarker = `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="var(--color-ink)" stroke-dasharray="4,4" opacity="0.3" />`;
  }

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      ${gridLines.join('')}
      ${todayMarker}
      <path class="chart-line chart-line--high" d="${highPath}" />
      <path class="chart-line chart-line--low" d="${lowPath}" />
      ${dateLabels.join('')}
    </svg>
    <div class="chart-legend">
      <div class="chart-legend-item">
        <span class="chart-legend-color chart-legend-color--high"></span>
        <span>High</span>
      </div>
      <div class="chart-legend-item">
        <span class="chart-legend-color chart-legend-color--low"></span>
        <span>Low</span>
      </div>
    </div>
  `;
}

// Render smart home controls
function renderControls() {
  const grid = document.getElementById('controls-grid');
  const properties = selectedProperty === 'all'
    ? Object.keys(PROPERTIES)
    : [selectedProperty];

  // For now, show placeholder controls since we don't have Seam/Nest API integration yet
  grid.innerHTML = properties.map(code => {
    const info = PROPERTIES[code];
    const state = propertyStates[code] || {};

    return `
      <div class="control-card">
        <div class="control-card-header">
          <span class="control-card-title">Thermostat</span>
          <span class="control-card-property">${escapeHtml(code)}</span>
        </div>
        <div class="control-card-body">
          <div class="thermostat">
            <div class="thermostat-current">
              <div class="thermostat-temp">--°</div>
              <div class="thermostat-label">CURRENT</div>
            </div>
            <div class="thermostat-target">
              <button class="thermostat-btn" disabled>-</button>
              <span class="thermostat-setpoint">68°</span>
              <button class="thermostat-btn" disabled>+</button>
            </div>
          </div>
        </div>
      </div>

      <div class="control-card">
        <div class="control-card-header">
          <span class="control-card-title">Front Lock</span>
          <span class="control-card-property">${escapeHtml(code)}</span>
        </div>
        <div class="control-card-body">
          <div class="lock-status">
            <div class="lock-state">
              <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span class="lock-label">Locked</span>
            </div>
            <button class="btn btn--ghost" disabled>Unlock</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render upcoming stays
function renderStays() {
  const list = document.getElementById('stays-list');

  // Filter by selected property
  let stays = staysData;
  if (selectedProperty !== 'all') {
    stays = stays.filter(s => s.propertyCode === selectedProperty);
  }

  if (stays.length === 0) {
    list.innerHTML = '<div class="empty-state">No upcoming stays</div>';
    return;
  }

  // Sort by start date
  stays.sort((a, b) => new Date(a.start) - new Date(b.start));

  list.innerHTML = stays.slice(0, 10).map(stay => {
    const startDate = new Date(stay.start);
    const endDate = new Date(stay.end);
    const now = new Date();

    // Calculate days until check-in
    const daysOut = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));

    let countdownClass = '';
    let countdownText = '';

    if (daysOut <= 0 && now <= endDate) {
      countdownClass = 'stays-countdown--today';
      countdownText = 'IN PROGRESS';
    } else if (daysOut === 1) {
      countdownClass = 'stays-countdown--soon';
      countdownText = 'TOMORROW';
    } else if (daysOut <= 3) {
      countdownClass = 'stays-countdown--soon';
      countdownText = `IN ${daysOut} DAYS`;
    } else {
      countdownText = `IN ${daysOut} DAYS`;
    }

    const dateFormat = { month: 'short', day: 'numeric' };
    const startStr = startDate.toLocaleDateString('en-US', dateFormat);
    const endStr = endDate.toLocaleDateString('en-US', dateFormat);

    return `
      <div class="stays-row">
        <div class="stays-info">
          <span class="stays-property">${escapeHtml(stay.propertyCode)}</span>
          <span class="stays-dates">${startStr} - ${endStr}</span>
          ${stay.reservationId ? `<span class="stays-guest">Res: ${escapeHtml(stay.reservationId)}</span>` : ''}
        </div>
        <div class="stays-status">
          <span class="stays-countdown ${countdownClass}">${countdownText}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Handle window resize for charts
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    renderTemperatureTrend();
    renderChart();
  }, 250);
});

// Expose functions globally for onclick handlers
window.toggleThermostats = toggleThermostats;
window.toggleThermostatSelection = toggleThermostatSelection;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
