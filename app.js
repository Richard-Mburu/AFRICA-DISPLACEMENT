// Global application state
const AppState = {
  rawRecords: [],
  filteredRecords: [],
  aggregatedFlows: [],
  
  // Timeline variables
  timelineDates: [], // Array of unique "YYYY-MM" strings
  timelineIndex: 0,
  isPlayingTimeline: false,
  playTimerId: null,
  
  // Map and visualization layers
  map: null,
  currentVizMode: 'flow', // 'flow', 'heat', 'cluster', 'choropleth'
  theme: 'dark', // 'dark', 'light'
  
  tileLayers: {
    dark: null,
    light: null
  },
  
  layers: {
    flows: null,       // L.layerGroup
    arrows: null,      // L.layerGroup
    markers: null,     // L.layerGroup
    heat: null,        // L.heatLayer
    cluster: null,     // L.markerClusterGroup
    choropleth: null   // L.geoJSON
  },

  geoJson: null,
  
  // Charts references
  charts: {
    destinations: null,
    origins: null,
    popTypes: null,
    trend: null
  },
  
  // Dynamic filter selections
  filters: {
    destination: 'all',
    origin: 'all',
    popType: 'all',
    minIndividuals: 0,
    startDate: 'all',
    endDate: 'all',
    selectedDate: 'all' // Holds current 'YYYY-MM' timeline month, or 'all'
  },
  
  // Quantile break points for flow styling
  breaks: []
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('flow-mode');
  try {
    initMap();
  } catch (err) {
    console.error('Map initialization error:', err);
    AppState.map = null;
    showMapFallback('Map could not initialize. Data, filters, and lists are still active.');
  }
  loadData();
});

/**
 * Initialize Leaflet Map and base tile layers
 */
function initMap() {
  if (typeof L === 'undefined') {
    showMapFallback('Map library unavailable. Data, filters, and lists are still active.');
    return;
  }

  // Center of Africa
  const defaultCenter = [1.3, 17.3];
  const defaultZoom = 4;
  
  AppState.map = L.map('map', {
    zoomControl: false, // Custom position below
    minZoom: 3,
    maxZoom: 10
  }).setView(defaultCenter, defaultZoom);
  
  // Add zoom control in top-right
  L.control.zoom({ position: 'topright' }).addTo(AppState.map);
  
  // Tile Layers definition
  // CartoDB Dark Matter
  AppState.tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  });
  
  // CartoDB Positron (Light)
  AppState.tileLayers.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  });
  
  // Add dark layer by default
  AppState.tileLayers.dark.addTo(AppState.map);
  
  // Initialize map overlay layers
  AppState.layers.flows = L.layerGroup().addTo(AppState.map);
  AppState.layers.arrows = L.layerGroup().addTo(AppState.map);
  AppState.layers.markers = L.layerGroup().addTo(AppState.map);
  AppState.layers.heat = null; // Loaded dynamically
  AppState.layers.cluster = typeof L.markerClusterGroup === 'function'
    ? L.markerClusterGroup({
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
      })
    : L.layerGroup();
  AppState.layers.choropleth = null; // Loaded dynamically

  AppState.map.on('zoomend', () => {
    if (AppState.currentVizMode === 'flow' || AppState.currentVizMode === 'topCorridors') {
      renderMapLayer();
    }
  });
}

/**
 * Load normalized records from a local JS data module first, with CSV fetch as a server-only fallback.
 */
function loadData() {
  if (Array.isArray(window.UNHCR_SITUATIONS_DATA) && window.UNHCR_SITUATIONS_DATA.length > 0) {
    processCSVRecords(window.UNHCR_SITUATIONS_DATA);
    return;
  }

  fetch('unhcr-situations.csv')
    .then(response => {
      if (!response.ok) throw new Error(`CSV request failed with ${response.status}`);
      return response.text();
    })
    .then(text => {
      const rows = parseCSVText(text);
      if (rows.length === 0) throw new Error('CSV file is empty or could not be parsed.');
      processCSVRecords(rows);
    })
    .catch(err => {
      console.error('Data load error:', err);
      showDataLoadError('Data could not be loaded. Check that unhcr-situations-data.js is present beside index.html.');
    });
}

function parseCSVText(text) {
  const rows = [];
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return rows;

  const headers = parseCSVLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function showDataLoadError(message) {
  const mutedStyle = 'color: var(--text-muted); font-size:13px; padding: 10px;';
  const totalEl = document.getElementById('stat-total-displaced');
  const dateEl = document.getElementById('stat-latest-date-label');
  const timelineEl = document.querySelector('#timeline-display-date span');
  const destListEl = document.getElementById('top-destinations-list');
  const origListEl = document.getElementById('top-origins-list');

  if (totalEl) totalEl.textContent = '0';
  if (dateEl) dateEl.textContent = message;
  if (timelineEl) timelineEl.textContent = 'Data not loaded';
  if (destListEl) destListEl.innerHTML = `<div style="${mutedStyle}">${message}</div>`;
  if (origListEl) origListEl.innerHTML = `<div style="${mutedStyle}">${message}</div>`;
}

function showMapFallback(message) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  mapEl.innerHTML = `<div class="map-fallback">${message}</div>`;
}

/**
 * Standardize dates and extract values
 */
function processCSVRecords(data) {
  const datesSet = new Set();
  const popTypesSet = new Set();
  const destSet = new Set();
  const origSet = new Set();
  
  AppState.rawRecords = data.map((row, idx) => {
    const rawDate = row.Date ? row.Date.trim() : '';
    const parsedDate = parseCSVDate(rawDate);
    
    // Formatting monthly key as YYYY-MM
    let dateKey = 'unknown';
    if (parsedDate) {
      const y = parsedDate.getFullYear();
      const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
      dateKey = `${y}-${m}`;
      datesSet.add(dateKey);
    }
    
    const popType = row['Population type'] ? row['Population type'].trim() : 'Unknown';
    if (popType && popType !== 'Unknown') popTypesSet.add(popType);
    
    const destName = row.Country ? row.Country.trim() : '';
    const destIso = row.ISO3 ? row.ISO3.trim().toUpperCase() : '';
    const origName = row['Country of Origin'] ? row['Country of Origin'].trim() : '';
    const origIso = row['ISO3 of Origin'] ? row['ISO3 of Origin'].trim().toUpperCase() : '';
    
    if (destIso) destSet.add(`${destIso}:${destName}`);
    if (origIso) origSet.add(`${origIso}:${origName}`);
    
    const individuals = parseInt(row.Individuals) || 0;
    
    return {
      id: idx,
      destName,
      destIso,
      origName,
      origIso,
      popType,
      source: row.Source ? row.Source.trim() : 'UNHCR',
      dateRaw: rawDate,
      dateParsed: parsedDate,
      dateKey,
      individuals
    };
  }).filter(r => r.individuals > 0 && r.destIso && r.origIso); // keep only valid entries
  
  // Sort timeline dates chronologically
  AppState.timelineDates = Array.from(datesSet).sort();
  
  // Populate dropdown lists in UI
  populateFilterDropdowns(
    Array.from(popTypesSet).sort(),
    Array.from(destSet).sort(),
    Array.from(origSet).sort()
  );
  
  // Set timeline dates limits in UI
  initTimelineUI();
  
  // Apply initial filters
  applyFilters();
}

/**
 * Parse date strings: YYYY-MM-DD or DD/MM/YYYY
 */
function parseCSVDate(dateStr) {
  if (!dateStr) return null;
  
  // Check format: YYYY-MM-DD
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }
  
  // Check format: DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }
  
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Populate UI drop-downs with dynamic options from the CSV
 */
function populateFilterDropdowns(popTypes, destinations, origins) {
  const popSelect = document.getElementById('filter-pop-type');
  const destSelect = document.getElementById('filter-destination');
  const origSelect = document.getElementById('filter-origin');
  
  // Populate population types
  popTypes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    popSelect.appendChild(opt);
  });
  
  // Populate host countries
  destinations.forEach(item => {
    const [iso, name] = item.split(':');
    const opt = document.createElement('option');
    opt.value = iso;
    opt.textContent = name;
    destSelect.appendChild(opt);
  });
  
  // Populate origin countries
  origins.forEach(item => {
    const [iso, name] = item.split(':');
    const opt = document.createElement('option');
    opt.value = iso;
    opt.textContent = name;
    origSelect.appendChild(opt);
  });
}

/**
 * Initialize timeline slider properties
 */
function initTimelineUI() {
  const slider = document.getElementById('timeline-slider');
  const startLabel = document.getElementById('timeline-start-label');
  const endLabel = document.getElementById('timeline-end-label');
  const startSelect = document.getElementById('filter-start-date');
  const endSelect = document.getElementById('filter-end-date');
  
  if (AppState.timelineDates.length === 0) {
    document.getElementById('timeline-display-date').innerHTML = '<span>No dates found</span>';
    return;
  }
  
  slider.min = 0;
  slider.max = AppState.timelineDates.length - 1;
  slider.value = 0;
  AppState.timelineIndex = 0;
  AppState.filters.selectedDate = 'all';
  
  startLabel.textContent = formatMonthYearString(AppState.timelineDates[0]);
  endLabel.textContent = formatMonthYearString(AppState.timelineDates[AppState.timelineDates.length - 1]);

  if (startSelect && endSelect) {
    const optionsHtml = '<option value="all">All Dates</option>' + AppState.timelineDates
      .map(dateKey => `<option value="${dateKey}">${formatMonthYearString(dateKey)}</option>`)
      .join('');
    startSelect.innerHTML = optionsHtml;
    endSelect.innerHTML = optionsHtml;
    startSelect.value = 'all';
    endSelect.value = 'all';
  }
  
  updateTimelineDisplayLabel();
}

/**
 * Convert YYYY-MM into readable "MMM YYYY"
 */
function formatMonthYearString(dateKey) {
  if (!dateKey || dateKey === 'all') return 'All Time';
  const parts = dateKey.split('-');
  if (parts.length !== 2) return dateKey;
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIndex = parseInt(parts[1]) - 1;
  return `${monthNames[mIndex]} ${parts[0]}`;
}

function updateTimelineDisplayLabel() {
  const displaySpan = document.querySelector('#timeline-display-date span');
  const currentKey = AppState.filters.selectedDate;
  displaySpan.textContent = currentKey === 'all' ? 'All Time (Aggregated)' : formatMonthYearString(currentKey);
}

/**
 * Apply filters, perform data updates, aggregate flow routes, and redraw
 */
function applyFilters() {
  const destVal = document.getElementById('filter-destination').value;
  const origVal = document.getElementById('filter-origin').value;
  const popVal = document.getElementById('filter-pop-type').value;
  const threshVal = parseInt(document.getElementById('filter-threshold').value);
  let startDateVal = document.getElementById('filter-start-date')?.value || 'all';
  let endDateVal = document.getElementById('filter-end-date')?.value || 'all';
  if (startDateVal !== 'all' && endDateVal !== 'all' && startDateVal > endDateVal) {
    [startDateVal, endDateVal] = [endDateVal, startDateVal];
  }
  
  AppState.filters.destination = destVal;
  AppState.filters.origin = origVal;
  AppState.filters.popType = popVal;
  AppState.filters.minIndividuals = threshVal;
  AppState.filters.startDate = startDateVal;
  AppState.filters.endDate = endDateVal;
  
  // Filter raw records
  AppState.filteredRecords = AppState.rawRecords.filter(r => {
    // 1. Destination filter
    if (destVal !== 'all' && r.destIso !== destVal) return false;
    
    // 2. Origin filter
    if (origVal !== 'all' && r.origIso !== origVal) return false;
    
    // 3. Population type filter
    if (popVal !== 'all' && r.popType !== popVal) return false;
    
    // 4. Threshold filter
    if (r.individuals < threshVal) return false;
    
    // 5. Date filter: flow mode uses timeline playback; analytical layers use range selectors.
    if (AppState.currentVizMode === 'flow') {
      if (AppState.filters.selectedDate !== 'all' && r.dateKey !== AppState.filters.selectedDate) return false;
    } else {
      if (startDateVal !== 'all' && r.dateKey < startDateVal) return false;
      if (endDateVal !== 'all' && r.dateKey > endDateVal) return false;
    }
    
    return true;
  });
  
  // Group and aggregate flows for routes rendering
  aggregateFlows();
  
  // Compute quantiles
  calculateQuantileBreaks();
  
  // Update dashboard numbers
  updateStatsPanel();
  
  // Update charts
  updateCharts();
  
  // Render visual layer depending on active mode
  renderMapLayer();
}

/**
 * Aggregates individual records into origin-destination routes
 */
function aggregateFlows() {
  const groups = {};
  
  AppState.filteredRecords.forEach(r => {
    // We only aggregate if coordinates exist for both origin and destination
    if (!CountryCentroids[r.origIso] || !CountryCentroids[r.destIso]) return;
    
    const key = `${r.origIso}_${r.destIso}`;
    if (!groups[key]) {
      groups[key] = {
        origIso: r.origIso,
        origName: r.origName,
        destIso: r.destIso,
        destName: r.destName,
        individuals: 0,
        popTypes: new Set(),
        sources: new Set(),
        dateKey: AppState.filters.selectedDate === 'all' ? 'all' : r.dateKey
      };
    }
    groups[key].individuals += r.individuals;
    groups[key].popTypes.add(r.popType);
    groups[key].sources.add(r.source);
  });
  
  AppState.aggregatedFlows = Object.values(groups);
}

/**
 * Compute 5-class breaks based on quantiles (percentiles) of active individuals
 */
function calculateQuantileBreaks() {
  if (AppState.aggregatedFlows.length === 0) {
    AppState.breaks = [0, 0, 0, 0];
    return;
  }
  
  const values = AppState.aggregatedFlows.map(f => f.individuals).sort((a, b) => a - b);
  
  AppState.breaks = [
    values[Math.floor(values.length * 0.2)] || 0,
    values[Math.floor(values.length * 0.4)] || 0,
    values[Math.floor(values.length * 0.6)] || 0,
    values[Math.floor(values.length * 0.8)] || 0
  ];
}

/**
 * Get intensity class (1 to 5) for a given value
 */
function getIntensityClass(value) {
  if (value <= AppState.breaks[0]) return 1;
  if (value <= AppState.breaks[1]) return 2;
  if (value <= AppState.breaks[2]) return 3;
  if (value <= AppState.breaks[3]) return 4;
  return 5;
}

/**
 * Define styles for each of the 5 intensity classes
 */
function getClassStyles(intensityClass) {
  const isLight = (AppState.theme === 'light');
  switch(intensityClass) {
    case 1:
      return {
        color: isLight ? '#f59e0b' : '#fcd34d', // amber/gold
        weight: 1.5,
        opacity: 0.4,
        arrowSize: 8,
        duration: '4s'
      };
    case 2:
      return {
        color: '#f59e0b', // amber
        weight: 3.0,
        opacity: 0.55,
        arrowSize: 11,
        duration: '3s'
      };
    case 3:
      return {
        color: '#f97316', // orange
        weight: 4.5,
        opacity: 0.7,
        arrowSize: 14,
        duration: '2.2s'
      };
    case 4:
      return {
        color: '#ea580c', // dark orange-red
        weight: 6.5,
        opacity: 0.8,
        arrowSize: 18,
        duration: '1.5s'
      };
    case 5:
    default:
      return {
        color: '#ef4444', // deep red
        weight: 9.0,
        opacity: 0.95,
        arrowSize: 22,
        duration: '0.9s'
      };
  }
}

/**
 * Helper: Interpolate curved coordinates using quadratic Bezier curve
 */
function getCurvePoints(from, to, offsetFraction = 0.22) {
  const lat1 = from[0], lng1 = from[1];
  const lat2 = to[0], lng2 = to[1];
  
  // Midpoint
  const latM = (lat1 + lat2) / 2;
  const lngM = (lng1 + lng2) / 2;
  
  // Perpendicular offset vector calculation
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  
  // Midpoint + perpendicular offset (-dLng, dLat)
  const latC = latM - dLng * offsetFraction;
  const lngC = lngM + dLat * offsetFraction;
  
  const points = [];
  const segments = 30; // smooth curved segments
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Quadratic Bezier interpolation
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * latC + t * t * lat2;
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * lngC + t * t * lng2;
    points.push([lat, lng]);
  }
  return points;
}

/**
 * Render corresponding layers based on Viz Mode Selection
 */
function renderMapLayer() {
  if (!AppState.map || !AppState.layers.flows) return;

  // Clear all layers
  AppState.layers.flows.clearLayers();
  AppState.layers.arrows.clearLayers();
  AppState.layers.markers.clearLayers();
  AppState.layers.cluster.clearLayers();
  
  if (AppState.layers.heat) {
    AppState.map.removeLayer(AppState.layers.heat);
    AppState.layers.heat = null;
  }
  if (AppState.layers.choropleth) {
    AppState.map.removeLayer(AppState.layers.choropleth);
    AppState.layers.choropleth = null;
  }
  
  // Re-enable elements in Leaflet Map if needed
  if (AppState.currentVizMode === 'flow') {
    renderFlowLayer();
    updateMapLegend('flow');
  } else if (AppState.currentVizMode === 'incoming') {
    renderCountryImpactLayer('incoming');
    updateMapLegend('incoming');
  } else if (AppState.currentVizMode === 'outgoing') {
    renderCountryImpactLayer('outgoing');
    updateMapLegend('outgoing');
  } else if (AppState.currentVizMode === 'net') {
    renderCountryImpactLayer('net');
    updateMapLegend('net');
  } else if (AppState.currentVizMode === 'topCorridors') {
    renderTopCorridorsLayer();
    updateMapLegend('topCorridors');
  }
}

function updateMapLegend(mode) {
  const legend = document.getElementById('map-legend');
  if (!legend) return;

  if (mode === 'net') {
    legend.innerHTML = `
      <div class="map-legend-title">Net displacement</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#08306b"></span>Large net inflow</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#9ecae1"></span>Small net inflow</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#9ca3af"></span>Balanced / neutral</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#fcae91"></span>Small net outflow</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#99000d"></span>Large net outflow</div>
    `;
    return;
  }

  if (mode === 'incoming') {
    legend.innerHTML = `
      <div class="map-legend-title">Incoming displacement</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#deebf7"></span>Lower inflow</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#3182bd"></span>Higher inflow</div>
      <div class="legend-row">Circle size also increases with incoming population.</div>
    `;
    return;
  }

  if (mode === 'outgoing') {
    legend.innerHTML = `
      <div class="map-legend-title">Outgoing displacement</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#fee0d2"></span>Lower outflow</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#de2d26"></span>Higher outflow</div>
      <div class="legend-row">Circle size also increases with outgoing population.</div>
    `;
    return;
  }

  legend.innerHTML = `
    <div class="map-legend-title">${mode === 'topCorridors' ? 'Top displacement corridors' : 'Directional flows'}</div>
    <div class="legend-row"><span class="legend-swatch" style="background:#fcd34d"></span>Lower volume</div>
    <div class="legend-row"><span class="legend-swatch" style="background:#f97316"></span>Medium volume</div>
    <div class="legend-row"><span class="legend-swatch" style="background:#ef4444"></span>Higher volume</div>
    <div class="legend-row">Line thickness and arrow size represent displacement magnitude.</div>
  `;
}

function getCountryImpactStats() {
  const stats = {};

  function ensureCountry(iso, name) {
    if (!iso) return null;
    if (!stats[iso]) {
      stats[iso] = {
        iso,
        name: name || CountryCentroids[iso]?.name || iso,
        incoming: 0,
        outgoing: 0,
        sources: {},
        destinations: {},
        trend: {}
      };
    }
    return stats[iso];
  }

  AppState.filteredRecords.forEach(r => {
    const dest = ensureCountry(r.destIso, r.destName);
    const origin = ensureCountry(r.origIso, r.origName);
    if (!dest || !origin) return;

    dest.incoming += r.individuals;
    dest.sources[r.origName] = (dest.sources[r.origName] || 0) + r.individuals;
    dest.trend[r.dateKey] = (dest.trend[r.dateKey] || 0) + r.individuals;

    origin.outgoing += r.individuals;
    origin.destinations[r.destName] = (origin.destinations[r.destName] || 0) + r.individuals;
    origin.trend[r.dateKey] = (origin.trend[r.dateKey] || 0) - r.individuals;
  });

  Object.values(stats).forEach(stat => {
    stat.net = stat.incoming - stat.outgoing;
  });

  return stats;
}

function getTopListHtml(values, emptyLabel) {
  const entries = Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (entries.length === 0) return `<div class="popup-row"><span>${emptyLabel}</span></div>`;
  return entries.map(([name, value]) => `
    <div class="popup-row"><span>${name}</span><span><strong>${value.toLocaleString()}</strong></span></div>
  `).join('');
}

function getTrendSummaryHtml(stat) {
  const entries = Object.entries(stat.trend).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return '<span>No trend data</span>';
  const first = entries[0];
  const last = entries[entries.length - 1];
  const delta = last[1] - first[1];
  const direction = delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'remained stable';
  return `<span>${formatMonthYearString(first[0])} to ${formatMonthYearString(last[0])}: net ${direction} by ${Math.abs(delta).toLocaleString()}</span>`;
}

function getCountryPopupHtml(iso, name, stat) {
  const safeStat = stat || {
    incoming: 0,
    outgoing: 0,
    net: 0,
    sources: {},
    destinations: {},
    trend: {}
  };

  return `
    <div class="popup-container impact-popup">
      <div class="popup-header"><i class="fa-solid fa-globe-africa"></i> ${name || safeStat.name || iso}</div>
      <div class="popup-row"><span>Total incoming displacement</span><span><strong>${safeStat.incoming.toLocaleString()}</strong></span></div>
      <div class="popup-row"><span>Total outgoing displacement</span><span><strong>${safeStat.outgoing.toLocaleString()}</strong></span></div>
      <div class="popup-row"><span>Net displacement</span><span><strong>${safeStat.net.toLocaleString()}</strong></span></div>
      <div class="popup-section-title">Top source countries</div>
      ${getTopListHtml(safeStat.sources, 'No incoming sources in selection')}
      <div class="popup-section-title">Top destination countries</div>
      ${getTopListHtml(safeStat.destinations, 'No outgoing destinations in selection')}
      <div class="popup-section-title">Trend over time</div>
      <div class="popup-row">${getTrendSummaryHtml(safeStat)}</div>
    </div>
  `;
}

function getImpactValue(stat, metric) {
  if (!stat) return 0;
  if (metric === 'incoming') return stat.incoming;
  if (metric === 'outgoing') return stat.outgoing;
  return stat.net;
}

function getImpactColor(value, metric, maxAbs) {
  if (metric === 'incoming') {
    if (value <= 0) return 'rgba(156, 163, 175, 0.35)';
    const ratio = value / Math.max(maxAbs, 1);
    return ratio > 0.75 ? '#08519c' : ratio > 0.45 ? '#3182bd' : ratio > 0.2 ? '#6baed6' : '#deebf7';
  }
  if (metric === 'outgoing') {
    if (value <= 0) return 'rgba(156, 163, 175, 0.35)';
    const ratio = value / Math.max(maxAbs, 1);
    return ratio > 0.75 ? '#a50f15' : ratio > 0.45 ? '#de2d26' : ratio > 0.2 ? '#fb6a4a' : '#fee0d2';
  }

  const neutralThreshold = maxAbs * 0.05;
  if (Math.abs(value) <= neutralThreshold) return '#9ca3af';
  const ratio = Math.abs(value) / Math.max(maxAbs, 1);
  if (value > 0) return ratio > 0.75 ? '#08306b' : ratio > 0.45 ? '#2171b5' : '#9ecae1';
  return ratio > 0.75 ? '#99000d' : ratio > 0.45 ? '#cb181d' : '#fcae91';
}

function renderCountryImpactLayer(metric) {
  if (!AppState.map || typeof L === 'undefined') return;

  const stats = getCountryImpactStats();
  const values = Object.values(stats).map(stat => Math.abs(getImpactValue(stat, metric)));
  const maxAbs = values.reduce((max, value) => Math.max(max, value), 1);

  const styleFeature = feature => {
    const iso = feature.properties.iso_a3 || feature.properties.iso3 || feature.properties.ISO_A3;
    const value = getImpactValue(stats[iso], metric);
    return {
      fillColor: getImpactColor(value, metric, maxAbs),
      weight: 1,
      opacity: 1,
      color: AppState.theme === 'dark' ? '#111827' : '#ffffff',
      fillOpacity: stats[iso] ? 0.78 : 0.08
    };
  };

  const onEachFeature = (feature, layer) => {
    const iso = feature.properties.iso_a3 || feature.properties.iso3 || feature.properties.ISO_A3;
    const name = feature.properties.name || feature.properties.NAME || CountryCentroids[iso]?.name || iso;
    layer.bindPopup(getCountryPopupHtml(iso, name, stats[iso]));
  };

  const drawGeoJson = geoData => {
    AppState.layers.choropleth = L.geoJSON(geoData, { style: styleFeature, onEachFeature }).addTo(AppState.map);
    renderImpactCentroidBubbles(stats, metric, maxAbs, false);
  };

  if (AppState.geoJson) {
    drawGeoJson(AppState.geoJson);
    return;
  }

  fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/africa.geojson')
    .then(res => res.json())
    .then(geoData => {
      AppState.geoJson = geoData;
      drawGeoJson(geoData);
    })
    .catch(err => {
      console.warn('Could not fetch Africa GeoJSON boundaries. Falling back to centroid impact symbols.', err);
      renderImpactCentroidBubbles(stats, metric, maxAbs, true);
    });
}

function renderImpactCentroidBubbles(stats, metric, maxAbs, includeAll) {
  Object.values(stats).forEach(stat => {
    const country = CountryCentroids[stat.iso];
    if (!country) return;
    const value = getImpactValue(stat, metric);
    if (!includeAll && value === 0) return;
    const radius = Math.max(6, Math.min(34, 5 + Math.sqrt(Math.abs(value)) * 0.025));
    const color = getImpactColor(value, metric, maxAbs);

    const marker = L.circleMarker(country.coords, {
      radius,
      color,
      fillColor: color,
      fillOpacity: includeAll ? 0.72 : 0.45,
      weight: 2,
      className: 'impact-marker'
    }).bindPopup(getCountryPopupHtml(stat.iso, country.name, stat));

    AppState.layers.markers.addLayer(marker);
  });
}

function renderTopCorridorsLayer() {
  renderFlowLayer({ topOnly: true });
}

/**
 * RENDER MODE: Flow Map (Animated curved lines + Proportional centroids)
 */
function renderFlowLayer(options = {}) {
  if (!AppState.map || typeof L === 'undefined') return;

  const originTotals = {};
  const destTotals = {};
  const zoom = AppState.map.getZoom ? AppState.map.getZoom() : 4;
  const maxFlows = options.topOnly ? 25 : (zoom >= 6 ? 140 : zoom >= 5 ? 100 : 70);
  const flowsToRender = AppState.aggregatedFlows
    .slice()
    .sort((a, b) => b.individuals - a.individuals)
    .slice(0, maxFlows);
  
  flowsToRender.forEach(flow => {
    const origin = CountryCentroids[flow.origIso];
    const destination = CountryCentroids[flow.destIso];
    
    // Track totals for proportional marker circles
    originTotals[flow.origIso] = (originTotals[flow.origIso] || 0) + flow.individuals;
    destTotals[flow.destIso] = (destTotals[flow.destIso] || 0) + flow.individuals;
    
    // Draw Curved Geodesic Arc
    const curvePoints = getCurvePoints(origin.coords, destination.coords);
    const intensity = getIntensityClass(flow.individuals);
    const style = getClassStyles(intensity);
    
    const polyline = L.polyline(curvePoints, {
      color: style.color,
      weight: style.weight,
      opacity: style.opacity,
      className: `flow-path flow-path-speed-${intensity}`,
      interactive: true
    });
    
    // Bind tooltip info
    const tooltipContent = `
      <div class="flow-tooltip-popup">
        <strong>Route:</strong> ${flow.origName} &rarr; ${flow.destName}<br/>
        <strong>Individuals:</strong> ${flow.individuals.toLocaleString()}<br/>
        <strong>Population Type:</strong> ${Array.from(flow.popTypes).join(', ')}<br/>
        <strong>Source:</strong> ${Array.from(flow.sources).join(', ')}<br/>
        <strong>Date:</strong> ${formatMonthYearString(flow.dateKey)}
      </div>
    `;
    polyline.bindTooltip(tooltipContent, {
      sticky: true,
      className: 'flow-tooltip'
    });
    
    AppState.layers.flows.addLayer(polyline);
    
    // Add arrowheads decoration at destination end
    if (typeof L.polylineDecorator === 'function' && L.Symbol && typeof L.Symbol.arrowHead === 'function') {
      const decorator = L.polylineDecorator(polyline, {
        patterns: [
          {
            offset: '80%', // near destination
            repeat: flow.individuals > AppState.breaks[2] ? '32%' : 0,
            symbol: L.Symbol.arrowHead({
              pixelSize: style.arrowSize,
              polygon: true,
              headAngle: 55,
              pathOptions: {
                stroke: false,
                fill: true,
                fillColor: style.color,
                fillOpacity: 0.9
              }
            })
          }
        ]
      });
      AppState.layers.arrows.addLayer(decorator);
    }
  });
  
  // Render Destination Host Country Markers
  Object.keys(destTotals).forEach(iso => {
    const country = CountryCentroids[iso];
    const arrivals = destTotals[iso];
    
    // Scale marker radius by square root
    const radius = Math.max(6, Math.min(30, 4 + Math.sqrt(arrivals) * 0.03));
    
    // Find pop type breakdown for this country
    const breakdown = {};
    let latestDate = '';
    AppState.filteredRecords.forEach(r => {
      if (r.destIso === iso) {
        breakdown[r.popType] = (breakdown[r.popType] || 0) + r.individuals;
        if (!latestDate || r.dateKey > latestDate) latestDate = r.dateKey;
      }
    });
    
    const breakdownHtml = Object.keys(breakdown).map(t => 
      `<div class="popup-row"><span class="popup-label">${t}:</span> <span class="popup-value">${breakdown[t].toLocaleString()}</span></div>`
    ).join('');
    
    const popupContent = `
      <div class="popup-container">
        <div class="popup-header"><i class="fa-solid fa-location-dot"></i> ${country.name}</div>
        <div class="popup-row"><strong>Total Arrivals:</strong> <strong>${arrivals.toLocaleString()}</strong></div>
        <div class="popup-section-title">Population Breakdown</div>
        ${breakdownHtml}
        <div class="popup-row" style="margin-top:4px; font-size:10px; color:var(--text-muted);">
          <span>Latest Report:</span> <span>${formatMonthYearString(latestDate)}</span>
        </div>
      </div>
    `;
    
    const marker = L.circleMarker(country.coords, {
      radius: radius,
      color: '#ea580c', // Host orange
      fillColor: '#ea580c',
      fillOpacity: 0.35,
      weight: 2,
      className: 'destination-marker'
    }).bindPopup(popupContent);
    
    AppState.layers.markers.addLayer(marker);
  });
  
  // Render Origin Country Markers
  Object.keys(originTotals).forEach(iso => {
    // Only draw origin marker if it doesn't overlap destination marker, or show distinct styling
    const country = CountryCentroids[iso];
    const departures = originTotals[iso];
    
    const radius = Math.max(4, Math.min(20, 3 + Math.sqrt(departures) * 0.03));
    
    const popupContent = `
      <div class="popup-container">
        <div class="popup-header" style="color: var(--accent-blue);"><i class="fa-solid fa-house-chimney-crack"></i> ${country.name}</div>
        <div class="popup-row"><strong>Total Outward Displacement:</strong> <strong>${departures.toLocaleString()}</strong></div>
        <div class="popup-row" style="margin-top:4px; font-size:10px; color:var(--text-muted);">
          <span>Origin Code:</span> <span>${iso}</span>
        </div>
      </div>
    `;
    
    const marker = L.circleMarker(country.coords, {
      radius: radius,
      color: '#3b82f6', // Origin blue
      fillColor: '#3b82f6',
      fillOpacity: 0.35,
      weight: 2,
      className: 'origin-marker'
    }).bindPopup(popupContent);
    
    AppState.layers.markers.addLayer(marker);
  });
}

/**
 * RENDER MODE: Heat Map (Leaflet.heat weighted overlays)
 */
function renderHeatLayer() {
  if (!AppState.map || typeof L === 'undefined') return;
  if (typeof L.heatLayer !== 'function') {
    renderFlowLayer();
    return;
  }

  const heatPoints = [];
  
  // Aggregate arrivals by country centroid coordinates
  const destTotals = {};
  AppState.filteredRecords.forEach(r => {
    if (CountryCentroids[r.destIso]) {
      destTotals[r.destIso] = (destTotals[r.destIso] || 0) + r.individuals;
    }
  });
  
  Object.keys(destTotals).forEach(iso => {
    const coords = CountryCentroids[iso].coords;
    const count = destTotals[iso];
    // Add point: [lat, lng, weight]
    heatPoints.push([coords[0], coords[1], count]);
  });
  
  // Find max value for normalization
  const maxVal = heatPoints.reduce((max, p) => p[2] > max ? p[2] : max, 1);
  
  // Format point weights from 0 to 1
  const normalizedPoints = heatPoints.map(p => [p[0], p[1], Math.max(0.1, p[2] / maxVal)]);
  
  AppState.layers.heat = L.heatLayer(normalizedPoints, {
    radius: 35,
    blur: 25,
    maxZoom: 5,
    gradient: {
      0.2: '#3b82f6', // blue
      0.4: '#10b981', // green
      0.6: '#eab308', // yellow
      0.8: '#f97316', // orange
      1.0: '#ef4444'  // red
    }
  }).addTo(AppState.map);
}

/**
 * RENDER MODE: Cluster view (Leaflet.markercluster)
 */
function renderClusterLayer() {
  if (!AppState.map || typeof L === 'undefined') return;

  AppState.filteredRecords.forEach(r => {
    if (!CountryCentroids[r.destIso]) return;
    
    const dest = CountryCentroids[r.destIso];
    const title = `${r.origName} &rarr; ${r.destName}: ${r.individuals.toLocaleString()} (${r.popType})`;
    
    // Add jitter offset slightly to separate multiple events at same centroids
    const latOffset = (Math.random() - 0.5) * 0.15;
    const lngOffset = (Math.random() - 0.5) * 0.15;
    const jitterCoords = [dest.coords[0] + latOffset, dest.coords[1] + lngOffset];
    
    const popupContent = `
      <div class="popup-container">
        <div class="popup-header"><i class="fa-solid fa-person-military-to-person"></i> Event Log</div>
        <div class="popup-row"><span class="popup-label">Origin:</span> <span class="popup-value">${r.origName}</span></div>
        <div class="popup-row"><span class="popup-label">Host:</span> <span class="popup-value">${r.destName}</span></div>
        <div class="popup-row"><span class="popup-label">Individuals:</span> <span class="popup-value"><strong>${r.individuals.toLocaleString()}</strong></span></div>
        <div class="popup-row"><span class="popup-label">Population Type:</span> <span class="popup-value">${r.popType}</span></div>
        <div class="popup-row"><span class="popup-label">Source:</span> <span class="popup-value">${r.source}</span></div>
        <div class="popup-row"><span class="popup-label">Reporting Date:</span> <span class="popup-value">${formatMonthYearString(r.dateKey)}</span></div>
      </div>
    `;
    
    const marker = L.circleMarker(jitterCoords, {
      radius: 6,
      color: '#ea580c',
      fillColor: '#ea580c',
      fillOpacity: 0.8
    }).bindPopup(popupContent);
    
    AppState.layers.cluster.addLayer(marker);
  });
  
  AppState.map.addLayer(AppState.layers.cluster);
}

/**
 * RENDER MODE: Choropleth (Borders GeoJSON with fallback proportional symbols)
 */
function renderChoroplethLayer() {
  if (!AppState.map || typeof L === 'undefined') return;

  // Aggregate arrivals by ISO3
  const destTotals = {};
  AppState.filteredRecords.forEach(r => {
    destTotals[r.destIso] = (destTotals[r.destIso] || 0) + r.individuals;
  });
  
  const maxVal = Object.values(destTotals).reduce((max, val) => val > max ? val : max, 1);
  
  // Custom choropleth style helper
  function getColor(d) {
    if (!d) return 'rgba(255, 255, 255, 0.04)';
    return d > maxVal * 0.8  ? '#dc2626' : // red
           d > maxVal * 0.6  ? '#ea580c' : // dark orange
           d > maxVal * 0.4  ? '#f97316' : // orange
           d > maxVal * 0.15 ? '#f59e0b' : // gold
           d > 0             ? '#fde047' : // light yellow
                               'rgba(255, 255, 255, 0.04)';
  }
  
  function styleFeature(feature) {
    // GeoJSON country codes are usually in properties.iso_a3 or properties.iso3
    const iso = feature.properties.iso_a3 || feature.properties.iso3 || feature.properties.ISO_A3;
    const value = destTotals[iso] || 0;
    
    return {
      fillColor: getColor(value),
      weight: 1.5,
      opacity: 1,
      color: AppState.theme === 'dark' ? '#1e293b' : '#cbd5e1',
      fillOpacity: value > 0 ? 0.75 : 0.05
    };
  }
  
  function onEachFeature(feature, layer) {
    const iso = feature.properties.iso_a3 || feature.properties.iso3 || feature.properties.ISO_A3;
    const name = feature.properties.name || feature.properties.NAME || 'Country';
    const value = destTotals[iso] || 0;
    
    const popupContent = `
      <div class="popup-container" style="min-width:180px;">
        <div class="popup-header"><i class="fa-solid fa-map"></i> ${name}</div>
        <div class="popup-row"><span>Total Host Population:</span> <span><strong>${value.toLocaleString()}</strong></span></div>
      </div>
    `;
    layer.bindPopup(popupContent);
    
    // Hover events
    layer.on({
      mouseover: function(e) {
        const l = e.target;
        l.setStyle({
          fillOpacity: 0.9,
          weight: 2.5,
          color: '#ffffff'
        });
        l.bringToFront();
      },
      mouseout: function(e) {
        AppState.layers.choropleth.resetStyle(e.target);
      }
    });
  }
  
  // Fetch high-fidelity simplified Africa GeoJSON
  fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/africa.geojson')
    .then(res => res.json())
    .then(geoData => {
      // Create GeoJSON choropleth layer
      AppState.layers.choropleth = L.geoJSON(geoData, {
        style: styleFeature,
        onEachFeature: onEachFeature
      }).addTo(AppState.map);
    })
    .catch(err => {
      console.warn("Could not fetch Africa GeoJSON boundaries. Falling back to centroid proportional bubbles.", err);
      // Fallback: draw bubbles at centroids for choropleth mode
      renderChoroplethCentroidBubbles(destTotals, getColor);
    });
}

/**
 * Fallback bubble choropleth using centroids when external GeoJSON fails
 */
function renderChoroplethCentroidBubbles(destTotals, getColorFn) {
  AppState.layers.choropleth = L.layerGroup();
  
  Object.keys(destTotals).forEach(iso => {
    const country = CountryCentroids[iso];
    if (!country) return;
    const value = destTotals[iso];
    
    const radius = Math.max(8, Math.min(35, 6 + Math.sqrt(value) * 0.035));
    const color = getColorFn(value);
    
    const popupContent = `
      <div class="popup-container" style="min-width:180px;">
        <div class="popup-header"><i class="fa-solid fa-circle-dot"></i> ${country.name}</div>
        <div class="popup-row"><span>Total Host Population:</span> <span><strong>${value.toLocaleString()}</strong></span></div>
      </div>
    `;
    
    const marker = L.circleMarker(country.coords, {
      radius: radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.7,
      weight: 2
    }).bindPopup(popupContent);
    
    AppState.layers.choropleth.addLayer(marker);
  });
  
  AppState.layers.choropleth.addTo(AppState.map);
}

/**
 * Switch between the four visualization modes
 */
function changeVizMode(mode) {
  AppState.currentVizMode = mode;
  document.body.classList.toggle('flow-mode', mode === 'flow');
  
  // Toggle active class on buttons
  const buttons = ['btn-mode-flow', 'btn-mode-incoming', 'btn-mode-outgoing', 'btn-mode-net', 'btn-mode-top'];
  const modeMapping = {
    flow: 'btn-mode-flow',
    incoming: 'btn-mode-incoming',
    outgoing: 'btn-mode-outgoing',
    net: 'btn-mode-net',
    topCorridors: 'btn-mode-top'
  };
  
  buttons.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === modeMapping[mode]) el.classList.add('active');
      else el.classList.remove('active');
    }
  });
  
  // Trigger redraw
  renderMapLayer();
}

function getFastestGrowingCorridor() {
  const corridors = {};

  AppState.filteredRecords.forEach(r => {
    if (!r.dateKey || r.dateKey === 'unknown') return;
    const key = `${r.origIso}_${r.destIso}`;
    if (!corridors[key]) {
      corridors[key] = {
        origName: r.origName,
        destName: r.destName,
        months: {}
      };
    }
    corridors[key].months[r.dateKey] = (corridors[key].months[r.dateKey] || 0) + r.individuals;
  });

  let fastest = null;
  Object.values(corridors).forEach(corridor => {
    const entries = Object.entries(corridor.months).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length < 2) return;
    const first = entries[0];
    const last = entries[entries.length - 1];
    const delta = last[1] - first[1];
    if (!fastest || delta > fastest.delta) {
      fastest = {
        origName: corridor.origName,
        destName: corridor.destName,
        firstDate: first[0],
        lastDate: last[0],
        delta
      };
    }
  });

  return fastest;
}

function getStrongestNetCountry() {
  const stats = getCountryImpactStats();
  return Object.values(stats)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0] || null;
}

function getReportingPeriodText() {
  if (AppState.currentVizMode === 'flow') {
    return AppState.filters.selectedDate === 'all'
      ? 'Reporting Period: All Time (Aggregated)'
      : `Reporting Period: ${formatMonthYearString(AppState.filters.selectedDate)}`;
  }

  const start = AppState.filters.startDate;
  const end = AppState.filters.endDate;
  if (start === 'all' && end === 'all') return 'Reporting Period: All Time (Aggregated)';
  if (start !== 'all' && end !== 'all' && start === end) return `Reporting Period: ${formatMonthYearString(start)}`;
  if (start !== 'all' && end !== 'all') return `Reporting Period: ${formatMonthYearString(start)} to ${formatMonthYearString(end)}`;
  if (start !== 'all') return `Reporting Period: From ${formatMonthYearString(start)}`;
  return `Reporting Period: Through ${formatMonthYearString(end)}`;
}

/**
 * Update stats numbers in left sidebar metrics panel
 */
function updateStatsPanel() {
  const totalEl = document.getElementById('stat-total-displaced');
  const originsEl = document.getElementById('stat-total-origins');
  const destsEl = document.getElementById('stat-total-destinations');
  const dateEl = document.getElementById('stat-latest-date-label');
  const corridorNameEl = document.getElementById('stat-largest-corridor');
  const corridorValEl = document.getElementById('stat-largest-corridor-val');
  const fastestCorridorEl = document.getElementById('stat-fastest-corridor');
  const fastestCorridorValEl = document.getElementById('stat-fastest-corridor-val');
  const netCountryEl = document.getElementById('stat-net-country');
  const netCountryValEl = document.getElementById('stat-net-country-val');
  
  // Calculate stats
  let totalIndividuals = 0;
  const origins = new Set();
  const destinations = new Set();
  
  AppState.filteredRecords.forEach(r => {
    totalIndividuals += r.individuals;
    if (r.origIso) origins.add(r.origIso);
    if (r.destIso) destinations.add(r.destIso);
  });
  
  // Find largest corridor
  let largestCorridor = null;
  let largestVal = 0;
  
  AppState.aggregatedFlows.forEach(flow => {
    if (flow.individuals > largestVal) {
      largestVal = flow.individuals;
      largestCorridor = flow;
    }
  });

  const fastestCorridor = getFastestGrowingCorridor();
  const netCountry = getStrongestNetCountry();
  
  // Update HTML elements (with smooth numeric display)
  animateNumberDisplay(totalEl, totalIndividuals);
  originsEl.textContent = origins.size.toLocaleString();
  destsEl.textContent = destinations.size.toLocaleString();
  
  const periodText = getReportingPeriodText();
  dateEl.textContent = periodText;
  
  if (largestCorridor) {
    corridorNameEl.textContent = `${largestCorridor.origName} → ${largestCorridor.destName}`;
    corridorValEl.textContent = `${largestVal.toLocaleString()} individuals`;
  } else {
    corridorNameEl.textContent = 'None';
    corridorValEl.textContent = '0 individuals';
  }

  if (fastestCorridor && fastestCorridor.delta > 0 && fastestCorridorEl && fastestCorridorValEl) {
    fastestCorridorEl.textContent = `${fastestCorridor.origName} -> ${fastestCorridor.destName}`;
    fastestCorridorValEl.textContent = `+${fastestCorridor.delta.toLocaleString()} from ${formatMonthYearString(fastestCorridor.firstDate)} to ${formatMonthYearString(fastestCorridor.lastDate)}`;
  } else if (fastestCorridorEl && fastestCorridorValEl) {
    fastestCorridorEl.textContent = 'None';
    fastestCorridorValEl.textContent = '0 change';
  }

  if (netCountry && netCountryEl && netCountryValEl) {
    const direction = netCountry.net >= 0 ? 'net inflow' : 'net outflow';
    netCountryEl.textContent = netCountry.name;
    netCountryValEl.textContent = `${Math.abs(netCountry.net).toLocaleString()} ${direction}`;
  } else if (netCountryEl && netCountryValEl) {
    netCountryEl.textContent = 'None';
    netCountryValEl.textContent = '0 net displacement';
  }
  
  // Render Top lists
  renderTopLists();
}

/**
 * Smooth animated numerical counter
 */
function animateNumberDisplay(element, targetValue) {
  let start = 0;
  const duration = 400; // ms
  const startTime = performance.now();
  
  function updateNumber(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing out quad
    const currentVal = Math.floor(start + (targetValue - start) * progress);
    element.textContent = currentVal.toLocaleString();
    
    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    }
  }
  
  requestAnimationFrame(updateNumber);
}

/**
 * Renders Top 10 Hosts and Origins in the Left Sidebar
 */
function renderTopLists() {
  const destListEl = document.getElementById('top-destinations-list');
  const origListEl = document.getElementById('top-origins-list');
  
  // Aggregate
  const destSums = {};
  const origSums = {};
  let maxDest = 0;
  let maxOrig = 0;
  
  AppState.filteredRecords.forEach(r => {
    destSums[r.destName] = (destSums[r.destName] || 0) + r.individuals;
    origSums[r.origName] = (origSums[r.origName] || 0) + r.individuals;
  });
  
  // Convert, sort, and slice top 10
  const topDests = Object.entries(destSums).map(([name, val]) => ({ name, val }))
    .sort((a, b) => b.val - a.val);
  const topOrigins = Object.entries(origSums).map(([name, val]) => ({ name, val }))
    .sort((a, b) => b.val - a.val);
    
  if (topDests.length > 0) maxDest = topDests[0].val;
  if (topOrigins.length > 0) maxOrig = topOrigins[0].val;
  
  // Helper to construct items
  function buildListHtml(items, maxVal) {
    if (items.length === 0) {
      return `<div style="color: var(--text-muted); font-size:12px; padding:10px;">No displacement found.</div>`;
    }
    
    return items.slice(0, 10).map(item => {
      const pct = maxVal > 0 ? (item.val / maxVal) * 100 : 0;
      return `
        <div class="list-item">
          <div class="list-item-meta">
            <span>${item.name}</span>
            <strong>${item.val.toLocaleString()}</strong>
          </div>
          <div class="list-item-bar-container">
            <div class="list-item-bar" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  destListEl.innerHTML = buildListHtml(topDests, maxDest);
  origListEl.innerHTML = buildListHtml(topOrigins, maxOrig);
}

/**
 * Initialize and update Chart.js instances in the Right Sidebar
 */
function updateCharts() {
  if (typeof Chart === 'undefined') {
    renderChartsUnavailable();
    return;
  }

  // Aggregate Chart data
  const destSums = {};
  const origSums = {};
  const popSums = {};
  const trendSums = {}; // monthly chronological trend
  
  AppState.filteredRecords.forEach(r => {
    destSums[r.destName] = (destSums[r.destName] || 0) + r.individuals;
    origSums[r.origName] = (origSums[r.origName] || 0) + r.individuals;
    popSums[r.popType] = (popSums[r.popType] || 0) + r.individuals;
    trendSums[r.dateKey] = (trendSums[r.dateKey] || 0) + r.individuals;
  });
  
  const topDests = Object.entries(destSums).map(([name, val]) => ({ name, val }))
    .sort((a, b) => b.val - a.val).slice(0, 5);
  const topOrigins = Object.entries(origSums).map(([name, val]) => ({ name, val }))
    .sort((a, b) => b.val - a.val).slice(0, 5);
  const popTypesList = Object.entries(popSums).map(([name, val]) => ({ name, val }));
  
  const trendList = Object.entries(trendSums).map(([date, val]) => ({ date, val }))
    .sort((a, b) => a.date.localeCompare(b.date)); // sorted chronologically
    
  const accentColor = AppState.theme === 'dark' ? '#f97316' : '#ea580c';
  const gridColor = AppState.theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = AppState.theme === 'dark' ? '#9ca3af' : '#64748b';
  
  // 1. Destinations Horizontal Bar Chart
  if (!AppState.charts.destinations) {
    const ctx = document.getElementById('chart-destinations').getContext('2d');
    AppState.charts.destinations = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topDests.map(d => d.name),
        datasets: [{
          label: 'Arrivals',
          data: topDests.map(d => d.val),
          backgroundColor: 'rgba(249, 115, 22, 0.75)',
          borderColor: 'rgba(249, 115, 22, 1)',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { 
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
          },
          y: { 
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
          }
        }
      }
    });
  } else {
    AppState.charts.destinations.data.labels = topDests.map(d => d.name);
    AppState.charts.destinations.data.datasets[0].data = topDests.map(d => d.val);
    AppState.charts.destinations.options.scales.x.grid.color = gridColor;
    AppState.charts.destinations.options.scales.x.ticks.color = textColor;
    AppState.charts.destinations.options.scales.y.ticks.color = textColor;
    AppState.charts.destinations.update();
  }

  // 2. Origins Horizontal Bar Chart
  if (!AppState.charts.origins) {
    const ctx = document.getElementById('chart-origins').getContext('2d');
    AppState.charts.origins = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topOrigins.map(o => o.name),
        datasets: [{
          label: 'Departures',
          data: topOrigins.map(o => o.val),
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { 
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
          },
          y: { 
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
          }
        }
      }
    });
  } else {
    AppState.charts.origins.data.labels = topOrigins.map(o => o.name);
    AppState.charts.origins.data.datasets[0].data = topOrigins.map(o => o.val);
    AppState.charts.origins.options.scales.x.grid.color = gridColor;
    AppState.charts.origins.options.scales.x.ticks.color = textColor;
    AppState.charts.origins.options.scales.y.ticks.color = textColor;
    AppState.charts.origins.update();
  }

  // 3. Population Type Doughnut Chart
  if (!AppState.charts.popTypes) {
    const ctx = document.getElementById('chart-pop-types').getContext('2d');
    AppState.charts.popTypes = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: popTypesList.map(p => p.name),
        datasets: [{
          data: popTypesList.map(p => p.val),
          backgroundColor: [
            'rgba(249, 115, 22, 0.8)', // orange
            'rgba(59, 130, 246, 0.8)', // blue
            'rgba(16, 185, 129, 0.8)', // green
            'rgba(245, 158, 11, 0.8)', // gold
            'rgba(239, 68, 68, 0.8)',  // red
            'rgba(139, 92, 246, 0.8)'  // violet
          ],
          borderColor: AppState.theme === 'dark' ? '#111827' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor, font: { family: 'Outfit', size: 10 } }
          }
        }
      }
    });
  } else {
    AppState.charts.popTypes.data.labels = popTypesList.map(p => p.name);
    AppState.charts.popTypes.data.datasets[0].data = popTypesList.map(p => p.val);
    AppState.charts.popTypes.data.datasets[0].borderColor = AppState.theme === 'dark' ? '#111827' : '#ffffff';
    AppState.charts.popTypes.options.plugins.legend.labels.color = textColor;
    AppState.charts.popTypes.update();
  }

  // 4. Trend Line Chart
  if (!AppState.charts.trend) {
    const ctx = document.getElementById('chart-trend').getContext('2d');
    AppState.charts.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendList.map(t => formatMonthYearString(t.date)),
        datasets: [{
          label: 'Total Displaced',
          data: trendList.map(t => t.val),
          borderColor: accentColor,
          backgroundColor: AppState.theme === 'dark' ? 'rgba(249, 115, 22, 0.08)' : 'rgba(234, 88, 12, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointBackgroundColor: accentColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Outfit', size: 9 }, maxRotation: 45 }
          },
          y: { 
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
          }
        }
      }
    });
  } else {
    AppState.charts.trend.data.labels = trendList.map(t => formatMonthYearString(t.date));
    AppState.charts.trend.data.datasets[0].data = trendList.map(t => t.val);
    AppState.charts.trend.data.datasets[0].borderColor = accentColor;
    AppState.charts.trend.data.datasets[0].pointBackgroundColor = accentColor;
    AppState.charts.trend.options.scales.x.ticks.color = textColor;
    AppState.charts.trend.options.scales.y.grid.color = gridColor;
    AppState.charts.trend.options.scales.y.ticks.color = textColor;
    AppState.charts.trend.update();
  }
}

function renderChartsUnavailable() {
  const wrappers = document.querySelectorAll('.chart-wrapper');
  wrappers.forEach(wrapper => {
    if (wrapper.querySelector('.chart-fallback')) return;
    wrapper.innerHTML = '<div class="chart-fallback">Charts unavailable. Summary cards and filters remain active.</div>';
  });
}

/**
 * Handle timeline timeline index updates (media slider input)
 */
function onTimelineSliderChange(value) {
  const index = parseInt(value);
  AppState.timelineIndex = index;
  AppState.filters.selectedDate = AppState.timelineDates[index];
  
  updateTimelineDisplayLabel();
  
  // Re-run pipeline
  applyFilters();
}

/**
 * Play/Pause timeline autoplay loop
 */
function toggleTimelinePlay() {
  const btn = document.getElementById('btn-play-timeline');
  
  if (AppState.isPlayingTimeline) {
    // Pause
    AppState.isPlayingTimeline = false;
    btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    clearInterval(AppState.playTimerId);
    AppState.playTimerId = null;
  } else {
    // Play
    AppState.isPlayingTimeline = true;
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    
    // Auto-advance loop
    AppState.playTimerId = setInterval(() => {
      timelineStepForward();
    }, 1500);
  }
}

/**
 * Advance one step chronologically
 */
function timelineStepForward() {
  if (AppState.timelineDates.length === 0) return;
  
  AppState.timelineIndex = (AppState.timelineIndex + 1) % AppState.timelineDates.length;
  document.getElementById('timeline-slider').value = AppState.timelineIndex;
  AppState.filters.selectedDate = AppState.timelineDates[AppState.timelineIndex];
  
  updateTimelineDisplayLabel();
  applyFilters();
}

/**
 * Go back one step chronologically
 */
function timelineStepBack() {
  if (AppState.timelineDates.length === 0) return;
  
  AppState.timelineIndex = (AppState.timelineIndex - 1 + AppState.timelineDates.length) % AppState.timelineDates.length;
  document.getElementById('timeline-slider').value = AppState.timelineIndex;
  AppState.filters.selectedDate = AppState.timelineDates[AppState.timelineIndex];
  
  updateTimelineDisplayLabel();
  applyFilters();
}

/**
 * Reset all interactive filter selections
 */
function resetFilters() {
  document.getElementById('filter-destination').value = 'all';
  document.getElementById('filter-origin').value = 'all';
  document.getElementById('filter-pop-type').value = 'all';
  document.getElementById('filter-threshold').value = 0;
  const startDateSelect = document.getElementById('filter-start-date');
  const endDateSelect = document.getElementById('filter-end-date');
  if (startDateSelect) startDateSelect.value = 'all';
  if (endDateSelect) endDateSelect.value = 'all';
  
  document.getElementById('threshold-val').textContent = '0';
  
  // Reset timeline control while returning the dashboard to all-time aggregation
  if (AppState.timelineDates.length > 0) {
    AppState.timelineIndex = 0;
    document.getElementById('timeline-slider').value = 0;
  }
  AppState.filters.selectedDate = 'all';
  AppState.filters.startDate = 'all';
  AppState.filters.endDate = 'all';
  
  // Pause playback if running
  if (AppState.isPlayingTimeline) {
    toggleTimelinePlay();
  }
  
  updateTimelineDisplayLabel();
  applyFilters();
}

function updateThresholdLabel(val) {
  document.getElementById('threshold-val').textContent = parseInt(val).toLocaleString();
}

function toggleAnalyticsPanel(forceOpen) {
  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : !document.body.classList.contains('analytics-open');
  const panel = document.getElementById('analytics-panel');
  const button = document.getElementById('analytics-toggle');

  document.body.classList.toggle('analytics-open', shouldOpen);
  if (panel) panel.setAttribute('aria-hidden', String(!shouldOpen));
  if (button) button.setAttribute('aria-expanded', String(shouldOpen));
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') toggleAnalyticsPanel(false);
});

/**
 * Toggle Light/Dark dashboard theme
 */
function toggleTheme() {
  const body = document.body;
  const themeLabel = document.getElementById('theme-label');
  
  if (body.getAttribute('data-theme') === 'dark') {
    // Switch to Light
    body.setAttribute('data-theme', 'light');
    AppState.theme = 'light';
    themeLabel.innerHTML = '<i class="fa-solid fa-sun"></i> Light Theme';
    
    // Swap map tile base layers
    AppState.map.removeLayer(AppState.tileLayers.dark);
    AppState.tileLayers.light.addTo(AppState.map);
  } else {
    // Switch to Dark
    body.setAttribute('data-theme', 'dark');
    AppState.theme = 'dark';
    themeLabel.innerHTML = '<i class="fa-solid fa-moon"></i> Dark Theme';
    
    // Swap map tile base layers
    AppState.map.removeLayer(AppState.tileLayers.light);
    AppState.tileLayers.dark.addTo(AppState.map);
  }
  
  // Re-run styling, redraw line paths and arrows with updated colors, update charts styling
  applyFilters();
}
