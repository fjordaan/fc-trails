// Trail App - Main JavaScript

// State
const state = {
  trail: null,
  currentPage: 'cover', // 'cover', 'intro', or waypoint index (1, 2, 3...)
  currentPhotoIndex: 0,
  mapInstances: {},
  readMoreDismissed: false
};

// DOM Elements
const elements = {
  app: document.getElementById('app'),
  pages: {
    cover: document.getElementById('page-cover'),
    intro: document.getElementById('page-intro'),
    waypoint: document.getElementById('page-waypoint')
  },
  photoOverlay: document.getElementById('photo-overlay'),
  webviewOverlay: document.getElementById('webview-overlay'),
  loading: document.getElementById('loading')
};

// Initialize the app
async function init() {
  showLoading(true);

  try {
    // Load trail data
    const response = await fetch('./trail.json');
    state.trail = await response.json();

    // Populate static content
    populateCoverPage();
    populateIntroPage();

    // Set up event listeners
    setupNavigation();
    setupMapInteractions();
    setupOverlays();

    // Handle initial route
    handleRoute();

    // Listen for browser navigation
    window.addEventListener('popstate', handleRoute);

  } catch (error) {
    console.error('Failed to load trail data:', error);
  } finally {
    showLoading(false);
  }
}

// Show/hide loading indicator
function showLoading(show) {
  elements.loading.classList.toggle('hidden', !show);
}

// Populate Cover page with trail data
function populateCoverPage() {
  const page = elements.pages.cover;
  const trail = state.trail;

  page.querySelector('.cover-header-identifier').textContent = trail.identifier;
  page.querySelector('.cover-header-name').textContent = trail.name;

  // Set up map
  const mapContainer = page.querySelector('#cover-map');
  setupMap(mapContainer, 'cover');
}

// Populate Intro page with trail data
function populateIntroPage() {
  const page = elements.pages.intro;
  const trail = state.trail;
  const totalPages = trail.waypoints.length + 1; // +1 for intro

  page.querySelector('.header-title').textContent = trail.shortTitle;
  page.querySelector('.total-pages').textContent = totalPages;
  page.querySelector('.intro-identifier').textContent = trail.identifier;
  page.querySelector('.intro-name').textContent = trail.name;
  page.querySelector('.intro-description').textContent = trail.description;

  // Populate trail key/features
  const keyGrid = page.querySelector('.trail-key-grid');
  keyGrid.innerHTML = trail.features.map(feature => `
    <div class="trail-key-item">
      <div class="trail-key-icon">
        <img src="../../images/${feature.icon}" alt="">
      </div>
      <div class="trail-key-text">
        <div class="trail-key-item-title">${feature.title}</div>
        ${feature.description ? `<div class="trail-key-item-description">${feature.description}</div>` : ''}
      </div>
    </div>
  `).join('');

  // Populate cemetery description (parse markdown bold)
  const descriptionHtml = parseMarkdown(trail.cemeteryDescription);
  page.querySelector('.cemetery-description').innerHTML = descriptionHtml;

  // Populate pagination dots
  const dotsContainer = page.querySelector('.pagination-dots');
  dotsContainer.innerHTML = Array(totalPages).fill(0).map((_, i) =>
    `<div class="pagination-dot ${i === 0 ? 'active' : ''}"></div>`
  ).join('');
}

// Populate Waypoint page with waypoint data
function populateWaypointPage(waypointIndex) {
  const page = elements.pages.waypoint;
  const trail = state.trail;
  const waypoint = trail.waypoints[waypointIndex - 1];
  const totalPages = trail.waypoints.length + 1;
  const pageNumber = waypointIndex + 1; // +1 because intro is page 1

  page.querySelector('.header-title').textContent = trail.shortTitle;
  page.querySelector('.current-page').textContent = pageNumber;
  page.querySelector('.total-pages').textContent = totalPages;
  page.querySelector('.waypoint-title').textContent = waypoint.title;
  page.querySelector('.waypoint-description').textContent = waypoint.description;

  // Set thumbnail image
  const thumbnailImg = page.querySelector('.waypoint-thumbnail img');
  thumbnailImg.src = `./photos/${waypoint.index}/${waypoint.photos[0]}`;

  // Populate features
  const featuresContainer = page.querySelector('.waypoint-features');
  const waypointFeatures = waypoint.features.map(featureId =>
    trail.features.find(f => f.id === featureId)
  ).filter(Boolean);

  featuresContainer.innerHTML = waypointFeatures.map(feature => `
    <div class="waypoint-feature">
      <div class="waypoint-feature-icon">
        <img src="../../images/${feature.icon}" alt="">
      </div>
      <div class="waypoint-feature-text">
        <span class="waypoint-feature-title">${feature.title}</span>
        ${feature.description ? `<span class="waypoint-feature-description">${feature.description}</span>` : ''}
      </div>
    </div>
  `).join('');

  // Set up read more link
  const readMoreCta = page.querySelector('#read-more-cta');
  const readMoreLink = page.querySelector('#read-more-link');
  readMoreCta.classList.remove('hidden');
  state.readMoreDismissed = false;
  readMoreLink.href = waypoint.externalUrl;
  readMoreLink.dataset.url = waypoint.externalUrl;

  // Update pagination dots
  const dotsContainer = page.querySelector('.pagination-dots');
  dotsContainer.innerHTML = Array(totalPages).fill(0).map((_, i) =>
    `<div class="pagination-dot ${i === pageNumber - 1 ? 'active' : ''}"></div>`
  ).join('');

  // Update pagination buttons
  const prevBtn = page.querySelector('.pagination-btn.prev');
  const nextBtn = page.querySelector('.pagination-btn.next');
  prevBtn.disabled = false; // Can always go back to intro or previous waypoint
  nextBtn.disabled = waypointIndex >= trail.waypoints.length;

  // Set up map with current waypoint highlighted
  const mapContainer = page.querySelector('#waypoint-map');
  setupMap(mapContainer, 'waypoint', waypointIndex);
}

// Parse simple markdown (bold)
function parseMarkdown(text) {
  // Convert **text** to <strong>text</strong>
  let html = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Convert newlines to paragraphs
  html = html.split('\n\n').map(p => `<p>${p}</p>`).join('');
  return html;
}

// Set up map in a container
function setupMap(container, mapId, currentWaypointIndex = null) {
  const trail = state.trail;
  const mapContent = container.querySelector('.map-content');
  const mapBase = container.querySelector('.map-base');
  const mapRoute = container.querySelector('.map-route');
  const markersContainer = container.querySelector('.map-markers');

  // Set map images
  mapBase.src = './map.png';
  mapRoute.src = '../../images/route.svg';

  // Position route overlay (62, 322 from map origin at 2x scale)
  mapRoute.style.left = '62px';
  mapRoute.style.top = '322px';

  // Create markers
  markersContainer.innerHTML = '';
  trail.waypoints.forEach(waypoint => {
    waypoint.markerPositions.forEach((pos, posIndex) => {
      const marker = document.createElement('div');
      marker.className = 'map-marker';
      if (currentWaypointIndex === waypoint.index) {
        marker.classList.add('current');
      }
      marker.dataset.waypointIndex = waypoint.index;

      // Position marker (positions are relative to route.svg origin, which starts at 62,322 on the map)
      // The positions in JSON are at 2x scale (for the full resolution map)
      marker.style.left = `${62 + pos.x}px`;
      marker.style.top = `${322 + pos.y}px`;

      marker.innerHTML = `
        <div class="map-marker-circle" style="background-color: ${waypoint.markerColour}">
          ${waypoint.markerSymbol}
        </div>
      `;

      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateTo(waypoint.index);
      });

      markersContainer.appendChild(marker);
    });
  });

  // Initialize map pan/zoom
  initMapPanZoom(container, mapId);
}

// Initialize map pan and zoom
function initMapPanZoom(container, mapId) {
  const viewport = container.querySelector('.map-viewport');
  const content = container.querySelector('.map-content');
  const mapBase = container.querySelector('.map-base');

  // Wait for map image to load to get dimensions
  if (!mapBase.complete) {
    mapBase.onload = () => initMapPanZoomWithDimensions(container, mapId, viewport, content);
  } else {
    initMapPanZoomWithDimensions(container, mapId, viewport, content);
  }
}

function initMapPanZoomWithDimensions(container, mapId, viewport, content) {
  const mapBase = container.querySelector('.map-base');

  // Map dimensions from CLAUDE.md:
  // map.png is 1521x2020 (double size for zoom)
  // route.svg is 804x1346, starts at 62,322 from map origin
  // Default zoom should fit route.svg width in content area

  const mapWidth = 1521;
  const mapHeight = 2020;
  const routeWidth = 804;
  const routeX = 62;
  const routeY = 322;

  const viewportRect = viewport.getBoundingClientRect();
  const viewportWidth = viewportRect.width;
  const viewportHeight = viewportRect.height;

  // Calculate scale to fit route width
  const defaultScale = viewportWidth / routeWidth;
  const minScale = defaultScale;
  const maxScale = 1; // Full resolution

  // Calculate initial position to center the route
  const routeCenterX = routeX + routeWidth / 2;
  const routeCenterY = routeY + 673; // Approximate vertical center of route

  let currentScale = defaultScale;
  let currentX = viewportWidth / 2 - routeCenterX * currentScale;
  let currentY = viewportHeight / 2 - routeCenterY * currentScale;

  // Store map state
  state.mapInstances[mapId] = {
    scale: currentScale,
    x: currentX,
    y: currentY,
    minScale,
    maxScale
  };

  // Apply initial transform
  updateMapTransform(content, currentX, currentY, currentScale);

  // Set up Hammer.js for gestures
  const hammer = new Hammer.Manager(viewport, {
    recognizers: [
      [Hammer.Pan, { direction: Hammer.DIRECTION_ALL }],
      [Hammer.Pinch, { enable: true }]
    ]
  });

  let startScale, startX, startY;

  hammer.on('panstart pinchstart', (e) => {
    const mapState = state.mapInstances[mapId];
    startScale = mapState.scale;
    startX = mapState.x;
    startY = mapState.y;
  });

  hammer.on('panmove', (e) => {
    const mapState = state.mapInstances[mapId];
    mapState.x = startX + e.deltaX;
    mapState.y = startY + e.deltaY;
    constrainMapPosition(mapState, viewportWidth, viewportHeight, mapWidth, mapHeight);
    updateMapTransform(content, mapState.x, mapState.y, mapState.scale);
  });

  hammer.on('pinchmove', (e) => {
    const mapState = state.mapInstances[mapId];
    let newScale = startScale * e.scale;
    newScale = Math.max(mapState.minScale, Math.min(mapState.maxScale, newScale));

    // Zoom towards pinch center
    const rect = viewport.getBoundingClientRect();
    const centerX = e.center.x - rect.left;
    const centerY = e.center.y - rect.top;

    const scaleDiff = newScale / mapState.scale;
    mapState.x = centerX - (centerX - mapState.x) * scaleDiff;
    mapState.y = centerY - (centerY - mapState.y) * scaleDiff;
    mapState.scale = newScale;

    constrainMapPosition(mapState, viewportWidth, viewportHeight, mapWidth, mapHeight);
    updateMapTransform(content, mapState.x, mapState.y, mapState.scale);
  });
}

function updateMapTransform(content, x, y, scale) {
  content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function constrainMapPosition(mapState, viewportWidth, viewportHeight, mapWidth, mapHeight) {
  const scaledWidth = mapWidth * mapState.scale;
  const scaledHeight = mapHeight * mapState.scale;

  // Allow some padding beyond edges
  const padding = 50;

  const minX = viewportWidth - scaledWidth - padding;
  const maxX = padding;
  const minY = viewportHeight - scaledHeight - padding;
  const maxY = padding;

  mapState.x = Math.max(minX, Math.min(maxX, mapState.x));
  mapState.y = Math.max(minY, Math.min(maxY, mapState.y));
}

// Navigation
function setupNavigation() {
  // Cover page - Start trail button
  document.getElementById('start-trail').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('intro');
  });

  // Back buttons
  document.getElementById('intro-back').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('cover');
  });

  document.getElementById('waypoint-back').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('cover');
  });

  // Pagination buttons
  elements.pages.intro.querySelector('.pagination-btn.next').addEventListener('click', () => {
    navigateTo(1); // First waypoint
  });

  elements.pages.waypoint.querySelector('.pagination-btn.prev').addEventListener('click', () => {
    const currentIndex = typeof state.currentPage === 'number' ? state.currentPage : 1;
    if (currentIndex === 1) {
      navigateTo('intro');
    } else {
      navigateTo(currentIndex - 1);
    }
  });

  elements.pages.waypoint.querySelector('.pagination-btn.next').addEventListener('click', () => {
    const currentIndex = typeof state.currentPage === 'number' ? state.currentPage : 1;
    if (currentIndex < state.trail.waypoints.length) {
      navigateTo(currentIndex + 1);
    }
  });

  // Read more dismiss
  document.getElementById('read-more-close').addEventListener('click', () => {
    document.getElementById('read-more-cta').classList.add('hidden');
    state.readMoreDismissed = true;
  });

  // Set up swipe navigation on non-map areas
  setupSwipeNavigation();
}

function setupSwipeNavigation() {
  // Swipe on intro content
  const introContent = elements.pages.intro.querySelector('.intro-content');
  const introHammer = new Hammer(introContent);
  introHammer.on('swipeleft', () => navigateTo(1));
  introHammer.on('swiperight', () => navigateTo('cover'));

  // Swipe on waypoint info area
  const waypointInfo = elements.pages.waypoint.querySelector('.waypoint-info');
  const waypointHammer = new Hammer(waypointInfo);
  waypointHammer.on('swipeleft', () => {
    const currentIndex = typeof state.currentPage === 'number' ? state.currentPage : 1;
    if (currentIndex < state.trail.waypoints.length) {
      navigateTo(currentIndex + 1);
    }
  });
  waypointHammer.on('swiperight', () => {
    const currentIndex = typeof state.currentPage === 'number' ? state.currentPage : 1;
    if (currentIndex === 1) {
      navigateTo('intro');
    } else {
      navigateTo(currentIndex - 1);
    }
  });
}

function navigateTo(page, updateHistory = true) {
  const previousPage = state.currentPage;
  state.currentPage = page;

  // Determine animation direction
  const direction = getNavigationDirection(previousPage, page);

  // Hide all pages
  Object.values(elements.pages).forEach(p => {
    p.classList.remove('active', 'slide-left', 'slide-right');
  });

  // Show the target page
  let targetPage;
  if (page === 'cover') {
    targetPage = elements.pages.cover;
  } else if (page === 'intro') {
    targetPage = elements.pages.intro;
  } else {
    targetPage = elements.pages.waypoint;
    populateWaypointPage(page);
  }

  targetPage.classList.add('active');

  // Update URL
  if (updateHistory) {
    const url = getUrlForPage(page);
    history.pushState({ page }, '', url);
  }
}

function getNavigationDirection(from, to) {
  const fromIndex = from === 'cover' ? -1 : from === 'intro' ? 0 : from;
  const toIndex = to === 'cover' ? -1 : to === 'intro' ? 0 : to;
  return toIndex > fromIndex ? 'left' : 'right';
}

function getUrlForPage(page) {
  const base = window.location.pathname.replace(/\/$/, '');
  if (page === 'cover') {
    return base + '/';
  } else if (page === 'intro') {
    return base + '/intro';
  } else {
    return base + '/' + page;
  }
}

function handleRoute() {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];

  let page = 'cover';
  if (lastPart === 'intro') {
    page = 'intro';
  } else if (/^\d+$/.test(lastPart)) {
    page = parseInt(lastPart, 10);
  }

  navigateTo(page, false);
}

// Map interactions (map key toggle)
function setupMapInteractions() {
  document.querySelectorAll('.map-key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mapKey = btn.parentElement.querySelector('.map-key');
      mapKey.classList.toggle('visible');
    });
  });
}

// Overlays
function setupOverlays() {
  setupPhotoOverlay();
  setupWebviewOverlay();
}

function setupPhotoOverlay() {
  const overlay = elements.photoOverlay;
  const backdrop = overlay.querySelector('.photo-overlay-backdrop');
  const image = overlay.querySelector('.photo-overlay-image');
  const prevBtn = overlay.querySelector('.photo-overlay-nav.prev');
  const nextBtn = overlay.querySelector('.photo-overlay-nav.next');

  // Open photo overlay when thumbnail is clicked
  elements.pages.waypoint.querySelector('.waypoint-thumbnail').addEventListener('click', () => {
    openPhotoOverlay();
  });

  // Close on backdrop click
  backdrop.addEventListener('click', closePhotoOverlay);

  // Navigation
  prevBtn.addEventListener('click', () => navigatePhoto(-1));
  nextBtn.addEventListener('click', () => navigatePhoto(1));
}

function openPhotoOverlay() {
  const waypoint = state.trail.waypoints[state.currentPage - 1];
  state.currentPhotoIndex = 0;
  updatePhotoOverlay(waypoint);
  elements.photoOverlay.classList.add('visible');
}

function closePhotoOverlay() {
  elements.photoOverlay.classList.remove('visible');
}

function navigatePhoto(direction) {
  const waypoint = state.trail.waypoints[state.currentPage - 1];
  const newIndex = state.currentPhotoIndex + direction;

  if (newIndex >= 0 && newIndex < waypoint.photos.length) {
    state.currentPhotoIndex = newIndex;
    updatePhotoOverlay(waypoint);
  }
}

function updatePhotoOverlay(waypoint) {
  const overlay = elements.photoOverlay;
  const image = overlay.querySelector('.photo-overlay-image');
  const prevBtn = overlay.querySelector('.photo-overlay-nav.prev');
  const nextBtn = overlay.querySelector('.photo-overlay-nav.next');
  const indicators = overlay.querySelector('.photo-overlay-indicators');

  image.src = `./photos/${waypoint.index}/${waypoint.photos[state.currentPhotoIndex]}`;

  prevBtn.disabled = state.currentPhotoIndex === 0;
  nextBtn.disabled = state.currentPhotoIndex === waypoint.photos.length - 1;

  indicators.innerHTML = waypoint.photos.map((_, i) =>
    `<div class="photo-overlay-indicator ${i === state.currentPhotoIndex ? 'active' : ''}"></div>`
  ).join('');
}

function setupWebviewOverlay() {
  const overlay = elements.webviewOverlay;
  const iframe = overlay.querySelector('iframe');
  const urlDisplay = overlay.querySelector('.webview-url');

  // Open webview when read more is clicked
  document.getElementById('read-more-link').addEventListener('click', (e) => {
    e.preventDefault();
    const url = e.currentTarget.dataset.url;
    openWebview(url);
  });

  // Close button
  document.getElementById('webview-done').addEventListener('click', closeWebview);

  // Refresh button
  document.getElementById('webview-refresh').addEventListener('click', () => {
    iframe.src = iframe.src;
  });

  // Open in external browser
  document.getElementById('webview-open-external').addEventListener('click', () => {
    window.open(iframe.src, '_blank');
  });
}

function openWebview(url) {
  const overlay = elements.webviewOverlay;
  const iframe = overlay.querySelector('iframe');
  const urlDisplay = overlay.querySelector('.webview-url');

  // Extract domain for display
  try {
    const urlObj = new URL(url);
    urlDisplay.textContent = urlObj.hostname;
  } catch {
    urlDisplay.textContent = url;
  }

  iframe.src = url;
  overlay.classList.add('visible');
}

function closeWebview() {
  const overlay = elements.webviewOverlay;
  const iframe = overlay.querySelector('iframe');

  overlay.classList.remove('visible');
  iframe.src = '';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
