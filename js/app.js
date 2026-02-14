// Trail App - Main JavaScript

// State
const state = {
  trail: null,
  currentPage: 'cover', // 'cover', 'intro', or waypoint index (1, 2, 3...)
  currentPhotoIndex: 0,
  mapInstances: {},
  photoZoom: null // Photo overlay zoom/pan state
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

// Preload an image and return a promise
function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Get thumbnail path for a photo (thumbnails are in thumbs/ subfolder, always .jpg)
function getThumbnailPath(waypointId, photoFilename) {
  const thumbName = photoFilename.replace(/\.[^.]+$/, '.jpg');
  return `./photos/${waypointId}/thumbs/${thumbName}`;
}

// Preload all waypoint thumbnails (first photo of each waypoint)
function preloadThumbnails() {
  if (!state.trail) return;

  state.trail.waypoints.forEach(waypoint => {
    if (waypoint.photos && waypoint.photos.length > 0) {
      preloadImage(getThumbnailPath(waypoint.id, waypoint.photos[0]));
    }
  });
}

// Preload all photos for a specific waypoint
function preloadWaypointPhotos(waypointIndex) {
  if (!state.trail) return;

  const waypoint = state.trail.waypoints[waypointIndex - 1];
  if (!waypoint || !waypoint.photos) return;

  waypoint.photos.forEach(photo => {
    preloadImage(`./photos/${waypoint.id}/${photo}`);
  });
}

// Initialize the app
async function init() {
  showLoading(true);

  try {
    // Load trail data
    const response = await fetch('./trail.json');
    state.trail = await response.json();

    // Preload thumbnail images for all waypoints
    preloadThumbnails();

    // Populate static content
    populateCoverPage();
    populateIntroPage();

    // Set up event listeners
    setupNavigation();
    setupMapInteractions();
    setupOverlays();
    setupWaypointFeaturesToggle();

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
  keyGrid.innerHTML = trail.features.map(feature => {
    let extraClass = '';
    if (feature.id === 'time') extraClass = ' trail-key-time';
    if (feature.id === 'accessibility') extraClass = ' trail-key-accessibility';
    return `
    <li class="trail-key-item${extraClass}">
      <div class="trail-key-icon">
        <img src="../../images/${feature.icon}" alt="">
      </div>
      <div class="trail-key-text">
        <div class="trail-key-item-title">${feature.title}</div>
        ${feature.description ? `<div class="trail-key-item-description">${feature.description}</div>` : ''}
      </div>
    </li>
  `;
  }).join('');

  // Populate cemetery description (parse markdown bold)
  const descriptionHtml = parseMarkdown(trail.cemeteryDescription);
  page.querySelector('.cemetery-description').innerHTML = '<h2>Fulham Cemetery</h2>' + descriptionHtml;

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

  // Set thumbnail image and border colour
  const thumbnail = page.querySelector('.waypoint-thumbnail');
  thumbnail.style.borderColor = waypoint.markerColour;
  const thumbnailImg = page.querySelector('.waypoint-thumbnail img');
  thumbnailImg.src = getThumbnailPath(waypoint.id, waypoint.photos[0]);

  // Set photo count and aria-label
  const thumbnailBtn = page.querySelector('.waypoint-thumbnail-btn');
  thumbnailBtn.querySelector('.waypoint-photo-count').textContent = waypoint.photos.length;
  thumbnailBtn.setAttribute('aria-label', `Waypoint photos: ${waypoint.photos.length}`);

  // Preload all photos for this waypoint
  preloadWaypointPhotos(waypointIndex);

  // Populate features
  const featuresContainer = page.querySelector('.waypoint-features');
  const waypointFeatures = waypoint.features.map(entry => {
    const featureId = typeof entry === 'string' ? entry : entry.id;
    const trailFeature = trail.features.find(f => f.id === featureId);
    if (!trailFeature) return null;
    // For object entries, override title/description
    if (typeof entry === 'object') {
      return { ...trailFeature, title: entry.title || trailFeature.title, description: entry.description || trailFeature.description };
    }
    return trailFeature;
  }).filter(Boolean);

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

  // Set up read more button
  const readMoreBtn = page.querySelector('#read-more-link');
  readMoreBtn.dataset.url = waypoint.externalUrl;

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

  // Set initial expanded state based on viewport height
  const waypointInfo = page.querySelector('.waypoint-info');
  if (window.innerHeight >= 700) {
    waypointInfo.classList.add('expanded');
  } else {
    waypointInfo.classList.remove('expanded');
  }
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

  // If waypoint map is already initialized, just update highlights and animate pan
  const existingState = state.mapInstances[mapId];
  if (mapId === 'waypoint' && existingState && existingState.scale && currentWaypointIndex !== null) {
    updateMarkerHighlights(markersContainer, currentWaypointIndex);
    animateMapToWaypoint(container, mapId, currentWaypointIndex);
    return;
  }

  // Set map images
  mapBase.src = './map.png';
  mapRoute.src = './route.svg';

  // Position route overlay at 61px, 322px from map origin
  mapRoute.style.left = '61px';
  mapRoute.style.top = '322px';

  // Create markers
  createMapMarkers(markersContainer, trail, mapId, currentWaypointIndex);

  // Store markers container reference for scale updates
  state.mapInstances[mapId] = state.mapInstances[mapId] || {};
  state.mapInstances[mapId].markersContainer = markersContainer;

  // Initialize map pan/zoom
  initMapPanZoom(container, mapId, currentWaypointIndex);
}

function createMapMarkers(markersContainer, trail, mapId, currentWaypointIndex) {
  markersContainer.innerHTML = '';
  trail.waypoints.forEach(waypoint => {
    waypoint.markerPositions.forEach((pos, posIndex) => {
      const marker = document.createElement('div');
      marker.className = 'map-marker';
      if (currentWaypointIndex === waypoint.index) {
        marker.classList.add('current');
      }
      marker.dataset.waypointIndex = waypoint.index;
      marker.dataset.mapId = mapId;

      // Position marker - coordinates in trail.json are relative to route origin (61, 322)
      marker.style.left = `${61 + pos.x}px`;
      marker.style.top = `${322 + pos.y}px`;

      marker.innerHTML = `
        <div class="map-marker-circle" style="background-color: ${waypoint.markerColour}; color: ${waypoint.markerTextColour || '#FFFFFF'}">
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
}

function updateMarkerHighlights(markersContainer, currentWaypointIndex) {
  markersContainer.querySelectorAll('.map-marker').forEach(marker => {
    marker.classList.toggle('current', parseInt(marker.dataset.waypointIndex) === currentWaypointIndex);
  });
}

function animateMapToWaypoint(container, mapId, waypointIndex) {
  const mapState = state.mapInstances[mapId];
  const waypoint = state.trail.waypoints.find(w => w.index === waypointIndex);
  if (!waypoint || !waypoint.markerPositions || !waypoint.markerPositions.length) return;

  const viewport = container.querySelector('.map-viewport');
  const content = container.querySelector('.map-content');
  const viewportRect = viewport.getBoundingClientRect();

  const pos = waypoint.markerPositions[0];
  const markerMapX = 61 + pos.x;
  const markerMapY = 322 + pos.y;

  // Check if marker is already visible in viewport
  const markerScreenX = markerMapX * mapState.scale + mapState.x;
  const markerScreenY = markerMapY * mapState.scale + mapState.y;
  const margin = 40;
  const isVisible = markerScreenX >= margin && markerScreenX <= viewportRect.width - margin
                 && markerScreenY >= margin && markerScreenY <= viewportRect.height - margin;

  if (isVisible) return;

  // Calculate target position to center marker
  let targetX = (viewportRect.width / 2) - (markerMapX * mapState.scale);
  let targetY = (viewportRect.height / 2) - (markerMapY * mapState.scale);

  // Constrain
  const tempState = { scale: mapState.scale, x: targetX, y: targetY };
  constrainMapPosition(tempState, viewportRect.width, viewportRect.height, 1521, 2021);
  targetX = tempState.x;
  targetY = tempState.y;

  // Clear any existing transition, then force a reflow before applying new one
  content.style.transition = '';
  content.offsetHeight; // Force reflow

  // Animate with CSS transition
  content.style.transition = 'transform 0.4s ease-out';
  mapState.x = targetX;
  mapState.y = targetY;
  updateMapTransform(content, targetX, targetY, mapState.scale, mapId);

  // Remove transition after animation completes (setTimeout is more
  // reliable than transitionend which can fire early from bubbling)
  setTimeout(() => {
    content.style.transition = '';
  }, 420);
}

// Initialize map pan and zoom
function initMapPanZoom(container, mapId, currentWaypointIndex = null) {
  const viewport = container.querySelector('.map-viewport');
  const content = container.querySelector('.map-content');
  const mapBase = container.querySelector('.map-base');

  // Wait for map image to load to get dimensions
  if (!mapBase.complete) {
    mapBase.onload = () => initMapPanZoomWithDimensions(container, mapId, viewport, content, currentWaypointIndex);
  } else {
    initMapPanZoomWithDimensions(container, mapId, viewport, content, currentWaypointIndex);
  }
}

function initMapPanZoomWithDimensions(container, mapId, viewport, content, currentWaypointIndex = null) {
  const mapBase = container.querySelector('.map-base');

  // Map dimensions:
  // map.png is 1521x2021 pixels
  const mapWidth = 1521;
  const mapHeight = 2021;

  const viewportRect = viewport.getBoundingClientRect();
  const viewportWidth = viewportRect.width;
  const viewportHeight = viewportRect.height;


  // Calculate minimum scale - map should fit within viewport at min zoom (with small margin for centering)
  const scaleToFitWidth = viewportWidth / mapWidth;
  const scaleToFitHeight = viewportHeight / mapHeight;
  // Use 0.98 factor so the map is slightly smaller than viewport at min zoom, triggering centering
  const minScale = Math.max(scaleToFitWidth, scaleToFitHeight) * 0.98;

  // Waypoint map is more zoomed in to show detail around the current marker
  const zoomFactor = (mapId === 'waypoint') ? 1.6 : 1.25;
  const defaultScale = minScale * zoomFactor;
  const maxScale = 1; // Full resolution

  let currentScale = defaultScale;
  let currentX = 0;
  let currentY = -viewportHeight * 0.25; // Pan up by 25%

  // Center on current waypoint marker if available
  if (currentWaypointIndex !== null && state.trail) {
    const waypoint = state.trail.waypoints.find(w => w.index === currentWaypointIndex);
    if (waypoint && waypoint.markerPositions && waypoint.markerPositions.length > 0) {
      const pos = waypoint.markerPositions[0];
      const markerMapX = 61 + pos.x;
      const markerMapY = 322 + pos.y;
      currentX = (viewportWidth / 2) - (markerMapX * currentScale);
      currentY = (viewportHeight / 2) - (markerMapY * currentScale);
    }
  }

  // Ensure initial position is within valid constraints
  const initState = { scale: currentScale, x: currentX, y: currentY };
  constrainMapPosition(initState, viewportWidth, viewportHeight, mapWidth, mapHeight);
  currentX = initState.x;
  currentY = initState.y;


  // Store map state (preserve existing properties like markersContainer)
  state.mapInstances[mapId] = {
    ...state.mapInstances[mapId],
    scale: currentScale,
    x: currentX,
    y: currentY,
    minScale,
    maxScale
  };

  // Apply initial transform
  updateMapTransform(content, currentX, currentY, currentScale, mapId);

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
    // Use current viewport dimensions
    const currentRect = viewport.getBoundingClientRect();
    constrainMapPosition(mapState, currentRect.width, currentRect.height, mapWidth, mapHeight);
    updateMapTransform(content, mapState.x, mapState.y, mapState.scale, mapId);
  });

  hammer.on('pinchmove', (e) => {
    const mapState = state.mapInstances[mapId];

    // Recalculate min scale based on current viewport (with margin for centering)
    const rect = viewport.getBoundingClientRect();
    const currentMinScale = Math.max(rect.width / mapWidth, rect.height / mapHeight) * 0.98;

    let newScale = startScale * e.scale;
    newScale = Math.max(currentMinScale, Math.min(mapState.maxScale, newScale));

    // Zoom towards pinch center
    const centerX = e.center.x - rect.left;
    const centerY = e.center.y - rect.top;

    const scaleDiff = newScale / mapState.scale;
    mapState.x = centerX - (centerX - mapState.x) * scaleDiff;
    mapState.y = centerY - (centerY - mapState.y) * scaleDiff;
    mapState.scale = newScale;

    // Use current viewport dimensions
    constrainMapPosition(mapState, rect.width, rect.height, mapWidth, mapHeight);
    updateMapTransform(content, mapState.x, mapState.y, mapState.scale, mapId);
  });

  // Mouse drag for desktop panning
  let isDragging = false;
  let dragStartX, dragStartY, dragStartMapX, dragStartMapY;

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left mouse button
    isDragging = true;
    const mapState = state.mapInstances[mapId];
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartMapX = mapState.x;
    dragStartMapY = mapState.y;
    viewport.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const mapState = state.mapInstances[mapId];
    mapState.x = dragStartMapX + (e.clientX - dragStartX);
    mapState.y = dragStartMapY + (e.clientY - dragStartY);
    // Use current viewport dimensions instead of cached values
    const currentRect = viewport.getBoundingClientRect();
    constrainMapPosition(mapState, currentRect.width, currentRect.height, mapWidth, mapHeight);
    updateMapTransform(content, mapState.x, mapState.y, mapState.scale, mapId);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    viewport.style.cursor = 'grab';
  });

  // Set default cursor
  viewport.style.cursor = 'grab';

  // Scroll wheel for desktop zooming
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const mapState = state.mapInstances[mapId];

    // Recalculate min scale based on current viewport (with margin for centering)
    const rect = viewport.getBoundingClientRect();
    const currentMinScale = Math.max(rect.width / mapWidth, rect.height / mapHeight) * 0.98;

    // Calculate zoom factor based on wheel delta
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    let newScale = mapState.scale * zoomFactor;
    newScale = Math.max(currentMinScale, Math.min(mapState.maxScale, newScale));

    // Zoom towards mouse position
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleDiff = newScale / mapState.scale;
    mapState.x = mouseX - (mouseX - mapState.x) * scaleDiff;
    mapState.y = mouseY - (mouseY - mapState.y) * scaleDiff;
    mapState.scale = newScale;

    // Use current viewport dimensions
    constrainMapPosition(mapState, rect.width, rect.height, mapWidth, mapHeight);
    updateMapTransform(content, mapState.x, mapState.y, mapState.scale, mapId);
  }, { passive: false });
}

function updateMapTransform(content, x, y, scale, mapId) {
  content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

  // Counter-scale markers so they stay at fixed screen size
  if (mapId && state.mapInstances[mapId] && state.mapInstances[mapId].markersContainer) {
    const markers = state.mapInstances[mapId].markersContainer.querySelectorAll('.map-marker');
    const counterScale = 1 / scale;
    markers.forEach(marker => {
      marker.style.transform = `translate(-50%, -50%) scale(${counterScale})`;
    });
  }
}

function constrainMapPosition(mapState, viewportWidth, viewportHeight, mapWidth, mapHeight) {
  const scaledWidth = mapWidth * mapState.scale;
  const scaledHeight = mapHeight * mapState.scale;

  let minX, maxX, minY, maxY;

  // If map is smaller than viewport, center it; otherwise constrain to edges
  if (scaledWidth <= viewportWidth) {
    // Center horizontally
    const centerX = (viewportWidth - scaledWidth) / 2;
    minX = maxX = centerX;
  } else {
    minX = viewportWidth - scaledWidth;
    maxX = 0;
  }

  if (scaledHeight <= viewportHeight) {
    // Center vertically
    const centerY = (viewportHeight - scaledHeight) / 2;
    minY = maxY = centerY;
  } else {
    minY = viewportHeight - scaledHeight;
    maxY = 0;
  }


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

  // Intro page - First waypoint button
  document.querySelector('.first-waypoint-btn').addEventListener('click', () => {
    navigateTo(1);
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

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    // Ignore if an overlay is open
    if (elements.photoOverlay.classList.contains('visible') ||
        elements.webviewOverlay.classList.contains('visible')) {
      return;
    }

    if (e.key === 'ArrowRight') {
      navigateNext();
    } else if (e.key === 'ArrowLeft') {
      navigatePrevious();
    }
  });
}

function navigateNext() {
  if (state.currentPage === 'cover') {
    navigateTo('intro');
  } else if (state.currentPage === 'intro') {
    navigateTo(1);
  } else if (typeof state.currentPage === 'number' && state.currentPage < state.trail.waypoints.length) {
    navigateTo(state.currentPage + 1);
  }
}

function navigatePrevious() {
  if (state.currentPage === 'intro') {
    navigateTo('cover');
  } else if (typeof state.currentPage === 'number') {
    if (state.currentPage === 1) {
      navigateTo('intro');
    } else {
      navigateTo(state.currentPage - 1);
    }
  }
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

function getTrailBasePath() {
  // Extract the base trail path (e.g., /fc-trails/trails/tree-trail) from the current URL
  // Handles both root deployment and subdirectory deployment (like GitHub Pages)
  const path = window.location.pathname;
  const match = path.match(/^(.*\/trails\/[^/]+)/);
  return match ? match[1] : '/trails/tree-trail';
}

function getUrlForPage(page) {
  const base = getTrailBasePath();
  if (page === 'cover') {
    return base + '/';
  } else if (page === 'intro') {
    return base + '/intro';
  } else {
    return base + '/' + page;
  }
}

function handleRoute() {
  // Check for SPA redirect from 404.html (GitHub Pages)
  let path = sessionStorage.getItem('spa-redirect-path');
  if (path) {
    sessionStorage.removeItem('spa-redirect-path');
    // Update browser URL to the intended path without adding history entry
    history.replaceState(null, '', path);
  } else {
    path = window.location.pathname;
  }

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

// Waypoint features toggle
function setupWaypointFeaturesToggle() {
  const waypointInfo = document.querySelector('.waypoint-info');
  const thumbnail = document.querySelector('.waypoint-thumbnail');

  waypointInfo.addEventListener('click', (e) => {
    // Don't toggle if clicking on the thumbnail (which opens the photo overlay)
    if (thumbnail.contains(e.target)) {
      return;
    }
    waypointInfo.classList.toggle('expanded');
  });
}

// Map interactions (map key toggle)
function setupMapInteractions() {
  document.querySelectorAll('.map-key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mapKey = btn.parentElement.querySelector('.map-key');
      const isVisible = mapKey.classList.toggle('visible');
      btn.classList.toggle('key-visible', isVisible);
      btn.querySelector('.material-symbols-rounded').textContent = isVisible ? 'close' : 'info';

      if (isVisible) {
        // Position button on top of the map key border
        const mapKeyHeight = mapKey.offsetHeight;
        btn.style.bottom = (mapKeyHeight - 16) + 'px';
      } else {
        btn.style.bottom = '';
      }
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

  // Open photo overlay when thumbnail or thumbnail icon is clicked
  elements.pages.waypoint.querySelector('.waypoint-thumbnail').addEventListener('click', () => {
    openPhotoOverlay();
  });
  elements.pages.waypoint.querySelector('.waypoint-thumbnail-btn').addEventListener('click', () => {
    openPhotoOverlay();
  });

  // Close on backdrop or titlebar click
  backdrop.addEventListener('click', closePhotoOverlay);
  overlay.querySelector('.photo-overlay-titlebar').addEventListener('click', closePhotoOverlay);

  // Navigation
  prevBtn.addEventListener('click', () => navigatePhoto(-1));
  nextBtn.addEventListener('click', () => navigatePhoto(1));
}

function openPhotoOverlay() {
  const waypoint = state.trail.waypoints[state.currentPage - 1];
  state.currentPhotoIndex = 0;
  const photoCount = waypoint.photos.length;
  elements.photoOverlay.querySelector('.photo-overlay-photo-count').textContent = `${photoCount} photo${photoCount !== 1 ? 's' : ''}`;
  updatePhotoOverlay(waypoint);
  elements.photoOverlay.classList.add('visible');
}

function closePhotoOverlay() {
  elements.photoOverlay.classList.remove('visible');
  // Clean up photo zoom state
  if (state.photoZoom && state.photoZoom.hammer) {
    state.photoZoom.hammer.destroy();
  }
  state.photoZoom = null;
}

function initPhotoPanZoom() {
  const overlay = elements.photoOverlay;
  const content = overlay.querySelector('.photo-overlay-content');
  const image = overlay.querySelector('.photo-overlay-image');

  // Wait for image to load to get natural dimensions
  const setupZoom = () => {
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;

    if (!imageWidth || !imageHeight) return;

    // Wait for overlay to be visible and have dimensions
    const attemptSetup = () => {
      const contentRect = content.getBoundingClientRect();

      // If overlay isn't visible yet or has no dimensions, try again next frame
      if (!overlay.classList.contains('visible') || contentRect.width === 0 || contentRect.height === 0) {
        requestAnimationFrame(attemptSetup);
        return;
      }

      const viewportWidth = contentRect.width;
      const viewportHeight = contentRect.height;

      // Calculate scales
    // Min scale = contain mode (full image visible, may have background)
    const minScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
    // Default scale = cover mode (fills viewport, no background visible)
    const coverScale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight);
    const defaultScale = coverScale;
    // Max scale = full resolution or 3x cover, whichever is larger
    const maxScale = Math.max(1, coverScale * 3);

    // Center the image initially
    const scaledWidth = imageWidth * defaultScale;
    const scaledHeight = imageHeight * defaultScale;
    const initialX = (viewportWidth - scaledWidth) / 2;
    const initialY = (viewportHeight - scaledHeight) / 2;

    // Clean up previous hammer instance if exists
    if (state.photoZoom && state.photoZoom.hammer) {
      state.photoZoom.hammer.destroy();
    }

    state.photoZoom = {
      scale: defaultScale,
      x: initialX,
      y: initialY,
      minScale,
      maxScale,
      imageWidth,
      imageHeight,
      hammer: null
    };

    // Apply initial transform
    updatePhotoTransform();

    // Set up Hammer.js for gestures
    const hammer = new Hammer.Manager(content, {
      recognizers: [
        [Hammer.Pan, { direction: Hammer.DIRECTION_ALL }],
        [Hammer.Pinch, { enable: true }]
      ]
    });
    state.photoZoom.hammer = hammer;

    let startScale, startX, startY;

    hammer.on('panstart pinchstart', () => {
      startScale = state.photoZoom.scale;
      startX = state.photoZoom.x;
      startY = state.photoZoom.y;
    });

    hammer.on('panmove', (e) => {
      state.photoZoom.x = startX + e.deltaX;
      state.photoZoom.y = startY + e.deltaY;
      constrainPhotoPosition();
      updatePhotoTransform();
    });

    hammer.on('pinchmove', (e) => {
      const rect = content.getBoundingClientRect();

      let newScale = startScale * e.scale;
      newScale = Math.max(state.photoZoom.minScale, Math.min(state.photoZoom.maxScale, newScale));

      // Zoom towards pinch center
      const centerX = e.center.x - rect.left;
      const centerY = e.center.y - rect.top;

      const scaleDiff = newScale / state.photoZoom.scale;
      state.photoZoom.x = centerX - (centerX - state.photoZoom.x) * scaleDiff;
      state.photoZoom.y = centerY - (centerY - state.photoZoom.y) * scaleDiff;
      state.photoZoom.scale = newScale;

      constrainPhotoPosition();
      updatePhotoTransform();
    });

    // Mouse drag for desktop panning
    let isDragging = false;
    let dragStartX, dragStartY, dragStartPhotoX, dragStartPhotoY;

    content.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartPhotoX = state.photoZoom.x;
      dragStartPhotoY = state.photoZoom.y;
      content.style.cursor = 'grabbing';
      e.preventDefault();
    });

    const onMouseMove = (e) => {
      if (!isDragging || !state.photoZoom) return;
      state.photoZoom.x = dragStartPhotoX + (e.clientX - dragStartX);
      state.photoZoom.y = dragStartPhotoY + (e.clientY - dragStartY);
      constrainPhotoPosition();
      updatePhotoTransform();
    };

    const onMouseUp = () => {
      isDragging = false;
      content.style.cursor = 'grab';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    content.style.cursor = 'grab';

    // Scroll wheel for desktop zooming
    content.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!state.photoZoom) return;

      const rect = content.getBoundingClientRect();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      let newScale = state.photoZoom.scale * zoomFactor;
      newScale = Math.max(state.photoZoom.minScale, Math.min(state.photoZoom.maxScale, newScale));

      // Zoom towards mouse position
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const scaleDiff = newScale / state.photoZoom.scale;
      state.photoZoom.x = mouseX - (mouseX - state.photoZoom.x) * scaleDiff;
      state.photoZoom.y = mouseY - (mouseY - state.photoZoom.y) * scaleDiff;
      state.photoZoom.scale = newScale;

      constrainPhotoPosition();
      updatePhotoTransform();
    }, { passive: false });
    }; // end attemptSetup

    requestAnimationFrame(attemptSetup);
  };

  if (image.complete && image.naturalWidth) {
    setupZoom();
  } else {
    image.onload = setupZoom;
  }
}

function updatePhotoTransform() {
  const image = elements.photoOverlay.querySelector('.photo-overlay-image');
  if (!state.photoZoom) return;

  const { x, y, scale } = state.photoZoom;
  image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  image.style.transformOrigin = '0 0';
}

function constrainPhotoPosition() {
  if (!state.photoZoom) return;

  const content = elements.photoOverlay.querySelector('.photo-overlay-content');
  const contentRect = content.getBoundingClientRect();
  const viewportWidth = contentRect.width;
  const viewportHeight = contentRect.height;

  const { scale, imageWidth, imageHeight } = state.photoZoom;
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;

  let minX, maxX, minY, maxY;

  // Center image if smaller than viewport, otherwise constrain to edges
  if (scaledWidth <= viewportWidth) {
    const centerX = (viewportWidth - scaledWidth) / 2;
    minX = maxX = centerX;
  } else {
    minX = viewportWidth - scaledWidth;
    maxX = 0;
  }

  if (scaledHeight <= viewportHeight) {
    const centerY = (viewportHeight - scaledHeight) / 2;
    minY = maxY = centerY;
  } else {
    minY = viewportHeight - scaledHeight;
    maxY = 0;
  }

  state.photoZoom.x = Math.max(minX, Math.min(maxX, state.photoZoom.x));
  state.photoZoom.y = Math.max(minY, Math.min(maxY, state.photoZoom.y));
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

  // Reset transform before loading new image
  image.style.transform = '';

  image.src = `./photos/${waypoint.id}/${waypoint.photos[state.currentPhotoIndex]}`;

  // Initialize zoom/pan after image loads
  initPhotoPanZoom();

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

  // Open external URL in new tab when read more is clicked
  document.getElementById('read-more-link').addEventListener('click', (e) => {
    e.preventDefault();
    const url = e.currentTarget.dataset.url;
    window.open(url, '_blank');
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
