/**
 * Main Admin App Controller
 * Orchestrates all modules and handles navigation
 */

import { GitHubAPI } from './github-api.js';
import { Auth } from './auth.js';
import { TrailEditor } from './trail-editor.js';
import { WaypointEditor } from './waypoint-editor.js';
import { PhotoManager } from './photo-manager.js';

class AdminApp {
  constructor() {
    this.config = null;
    this.api = null;
    this.auth = new Auth();
    this.trailEditor = null;
    this.waypointEditor = null;
    this.photoManager = null;

    this.currentScreen = 'auth';
    this.currentPanel = 'trail-info';
    this.hasUnsavedChanges = false;
    this.currentTrailSlug = null;

    // Map preview state
    this.mapScale = 0.2;
    this.mapX = 0;
    this.mapY = 0;
  }

  /**
   * Initialize the app
   */
  async init() {
    // Load config
    try {
      const response = await fetch('./config.json');
      this.config = await response.json();
    } catch (error) {
      console.error('Failed to load config:', error);
      this.showToast('Failed to load configuration', 'error');
      return;
    }

    // Try to auto-detect owner/repo from GitHub Pages URL
    this.detectRepoFromUrl();

    // Initialize GitHub API (without token initially)
    this.api = new GitHubAPI('', this.config.owner, this.config.repo, this.config.branch);

    // Initialize modules
    this.trailEditor = new TrailEditor(this);
    this.waypointEditor = new WaypointEditor(this);
    this.photoManager = new PhotoManager(this);

    // Setup event listeners
    this.setupEventListeners();

    // Check for stored auth
    const authResult = await this.auth.init(this.api);
    if (authResult.authenticated) {
      this.showScreen('selector');
      this.loadTrailList();
    } else {
      this.showScreen('auth');
      if (authResult.error) {
        this.showAuthError(authResult.error);
      }
    }
  }

  /**
   * Setup global event listeners
   */
  setupEventListeners() {
    // Auth form
    document.getElementById('auth-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAuth();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.logout();
    });

    // New trail button
    document.getElementById('new-trail-btn').addEventListener('click', () => {
      this.showNewTrailDialog();
    });

    // New trail dialog
    document.getElementById('new-trail-cancel').addEventListener('click', () => {
      document.getElementById('new-trail-dialog').classList.add('hidden');
    });

    document.getElementById('new-trail-create').addEventListener('click', () => {
      this.createNewTrail();
    });

    document.getElementById('new-trail-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.createNewTrail();
    });

    // Back to selector
    document.getElementById('back-to-selector').addEventListener('click', () => {
      this.confirmLeaveEditor();
    });

    // Save button
    document.getElementById('save-btn').addEventListener('click', () => {
      this.showSaveDialog();
    });

    // Save dialog
    document.getElementById('save-cancel').addEventListener('click', () => {
      document.getElementById('save-dialog').classList.add('hidden');
    });

    document.getElementById('save-confirm').addEventListener('click', () => {
      this.saveChanges();
    });

    // Panel navigation
    document.querySelectorAll('.sidebar-item[data-panel]').forEach(item => {
      item.addEventListener('click', () => {
        const panel = item.dataset.panel;
        this.showPanel(panel);

        // Clear waypoint selection when switching to non-waypoint panels
        if (panel !== 'waypoint') {
          this.waypointEditor.currentWaypointIndex = null;
          this.waypointEditor.populateWaypointList();
        }
      });
    });

    // Unsaved changes warning
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Map/route upload
    this.setupMapUpload();

    // Map preview interactions
    this.setupMapPreview();
  }

  /**
   * Try to detect owner/repo from GitHub Pages URL
   * Supports both github.io and custom domain deployments
   */
  detectRepoFromUrl() {
    const hostname = window.location.hostname;

    // Check for GitHub Pages URL: {owner}.github.io
    if (hostname.endsWith('.github.io')) {
      const owner = hostname.replace('.github.io', '');
      const pathParts = window.location.pathname.split('/').filter(Boolean);

      // If path has parts, first part might be repo name
      if (pathParts.length > 0 && pathParts[0] !== 'admin') {
        this.config.owner = owner;
        this.config.repo = pathParts[0];
        console.log(`Auto-detected repo: ${owner}/${pathParts[0]}`);
      } else {
        // Might be deployed to root (owner.github.io repo)
        this.config.owner = owner;
        this.config.repo = `${owner}.github.io`;
        console.log(`Auto-detected repo: ${owner}/${owner}.github.io`);
      }
    }
    // For custom domains, use config.json values
  }

  /**
   * Setup map preview pan/zoom
   */
  setupMapPreview() {
    const preview = document.getElementById('map-preview');
    const viewport = preview.querySelector('.map-preview-viewport');
    const content = preview.querySelector('.map-preview-content');
    const base = preview.querySelector('.map-preview-base');
    const route = preview.querySelector('.map-preview-route');

    // Mouse drag for panning
    let isDragging = false;
    let startX, startY, startMapX, startMapY;

    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.waypointEditor.placingMarker) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startMapX = this.mapX;
      startMapY = this.mapY;
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      this.mapX = startMapX + (e.clientX - startX);
      this.mapY = startMapY + (e.clientY - startY);
      this.updateMapTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      viewport.style.cursor = this.waypointEditor.placingMarker ? 'crosshair' : 'grab';
    });

    // Scroll wheel for zooming
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(1, this.mapScale * zoomFactor));

      // Zoom towards mouse position
      const scaleDiff = newScale / this.mapScale;
      this.mapX = mouseX - (mouseX - this.mapX) * scaleDiff;
      this.mapY = mouseY - (mouseY - this.mapY) * scaleDiff;
      this.mapScale = newScale;

      this.updateMapTransform();
    }, { passive: false });

    viewport.style.cursor = 'grab';
  }

  /**
   * Setup map/route file upload handlers
   */
  setupMapUpload() {
    const mapInput = document.getElementById('map-upload-input');
    const routeInput = document.getElementById('route-upload-input');

    document.getElementById('upload-map-btn').addEventListener('click', () => {
      mapInput.click();
    });

    document.getElementById('upload-route-btn').addEventListener('click', () => {
      routeInput.click();
    });

    mapInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.uploadMapFile(e.target.files[0], 'map.png');
        e.target.value = '';
      }
    });

    routeInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.uploadMapFile(e.target.files[0], 'route.svg');
        e.target.value = '';
      }
    });
  }

  /**
   * Upload a map or route file to the trail folder
   */
  async uploadMapFile(file, filename) {
    const slug = this.currentTrailSlug;
    if (!slug) return;

    const trailsPath = this.config.trailsPath;
    const filePath = `${trailsPath}/${slug}/${filename}`;

    this.showToast(`Uploading ${filename}...`, 'info');

    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          // Remove data URL prefix
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Check if file already exists to get SHA
      let sha = null;
      try {
        const existing = await this.api.getContents(filePath);
        sha = existing.sha;
      } catch (e) {
        // File doesn't exist yet, that's fine
      }

      await this.api.putFile(filePath, base64, `Upload ${filename} for ${slug}`, sha);

      this.showToast(`${filename} uploaded successfully`, 'success');
      this.refreshMapPreviews();
    } catch (error) {
      console.error(`Failed to upload ${filename}:`, error);
      this.showToast(`Failed to upload ${filename}: ${error.message}`, 'error');
    }
  }

  /**
   * Refresh map preview thumbnails and the map preview panel
   */
  refreshMapPreviews() {
    const slug = this.currentTrailSlug;
    if (!slug) return;

    // Refresh map upload previews with cache-busting
    const cacheBust = Date.now();
    const mapPreview = document.getElementById('map-upload-preview');
    const routePreview = document.getElementById('route-upload-preview');

    mapPreview.innerHTML = `<img src="../trails/${slug}/map.png?t=${cacheBust}" alt="Map preview" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\'>map</span><span>No map uploaded</span>'">`;
    routePreview.innerHTML = `<img src="../trails/${slug}/route.svg?t=${cacheBust}" alt="Route preview" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\'>route</span><span>No route uploaded</span>'">`;

    // Refresh the main map preview panel
    this.updateMapPreview();
  }

  /**
   * Load map upload preview thumbnails when opening a trail
   */
  loadMapUploadPreviews() {
    const slug = this.currentTrailSlug;
    if (!slug) return;

    const mapPreview = document.getElementById('map-upload-preview');
    const routePreview = document.getElementById('route-upload-preview');

    mapPreview.innerHTML = `<img src="../trails/${slug}/map.png" alt="Map preview" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\'>map</span><span>No map uploaded</span>'">`;
    routePreview.innerHTML = `<img src="../trails/${slug}/route.svg" alt="Route preview" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\'>route</span><span>No route uploaded</span>'">`;
  }

  /**
   * Update map preview transform
   */
  updateMapTransform() {
    const content = document.querySelector('.map-preview-content');
    content.style.transform = `translate(${this.mapX}px, ${this.mapY}px) scale(${this.mapScale})`;
  }

  /**
   * Update map preview with markers
   */
  updateMapPreview() {
    const preview = document.getElementById('map-preview');
    const base = preview.querySelector('.map-preview-base');
    const route = preview.querySelector('.map-preview-route');
    const markersContainer = preview.querySelector('#map-preview-markers');

    const trailSlug = this.currentTrailSlug;
    if (!trailSlug) return;

    // Set map images
    base.src = `../trails/${trailSlug}/map.png`;
    route.src = `../trails/${trailSlug}/route.svg`;
    route.style.left = '0';
    route.style.top = '0';

    // Create markers
    markersContainer.innerHTML = '';
    const trail = this.trailEditor.trail;
    const currentWpIndex = this.waypointEditor.currentWaypointIndex;

    if (trail.waypoints) {
      trail.waypoints.forEach((waypoint, wpIdx) => {
        if (!waypoint.markerPositions) return;

        waypoint.markerPositions.forEach((pos) => {
          const marker = document.createElement('div');
          marker.className = 'map-preview-marker';
          if (wpIdx === currentWpIndex) {
            marker.classList.add('current');
          }
          marker.style.backgroundColor = waypoint.markerColour || '#8BC34A';
          marker.style.color = waypoint.markerTextColour || '#FFFFFF';
          marker.style.left = `${pos.x}px`;
          marker.style.top = `${pos.y}px`;
          marker.textContent = waypoint.markerSymbol || '';

          marker.addEventListener('click', (e) => {
            if (!this.waypointEditor.placingMarker) {
              e.stopPropagation();
              this.waypointEditor.selectWaypoint(wpIdx);
            }
          });

          markersContainer.appendChild(marker);
        });
      });
    }
  }

  /**
   * Handle authentication
   */
  async handleAuth() {
    const token = document.getElementById('pat-input').value.trim();
    if (!token) return;

    const submitBtn = document.getElementById('auth-submit');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    this.hideAuthError();

    try {
      await this.auth.authenticate(token, this.api);
      this.showScreen('selector');
      this.loadTrailList();
    } catch (error) {
      this.showAuthError(error.message);
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  }

  /**
   * Show auth error
   */
  showAuthError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  /**
   * Hide auth error
   */
  hideAuthError() {
    document.getElementById('auth-error').classList.add('hidden');
  }

  /**
   * Logout
   */
  logout() {
    if (this.hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to logout?')) {
        return;
      }
    }
    this.auth.logout();
    this.hasUnsavedChanges = false;
    this.showScreen('auth');
    document.getElementById('pat-input').value = '';
  }

  /**
   * Show screen
   */
  showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screen}`).classList.add('active');
    this.currentScreen = screen;
  }

  /**
   * Show panel
   */
  showPanel(panel) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${panel}`).classList.add('active');

    document.querySelectorAll('.sidebar-item[data-panel]').forEach(item => {
      item.classList.toggle('active', item.dataset.panel === panel);
    });

    this.currentPanel = panel;
  }

  /**
   * Load trail list
   */
  async loadTrailList() {
    const list = document.getElementById('trail-list');
    const loading = document.getElementById('trail-list-loading');

    list.innerHTML = '';
    loading.classList.remove('hidden');

    try {
      const contents = await this.api.listDirectory(this.config.trailsPath);
      const trailDirs = contents.filter(item => item.type === 'dir');

      for (const dir of trailDirs) {
        // Try to load trail.json to get name
        try {
          const { data } = await this.api.getJsonFile(`${dir.path}/trail.json`);

          const item = document.createElement('div');
          item.className = 'trail-list-item';
          item.innerHTML = `
            <div class="trail-list-item-info">
              <h3>${data.name || dir.name}</h3>
              <p>${data.shortTitle || data.identifier || dir.name}</p>
            </div>
            <span class="material-symbols-rounded">chevron_right</span>
          `;

          item.addEventListener('click', () => {
            this.openTrail(dir.name);
          });

          list.appendChild(item);
        } catch (error) {
          // Skip directories without valid trail.json
          console.warn(`Could not load trail.json for ${dir.name}:`, error);
        }
      }

      if (list.children.length === 0) {
        list.innerHTML = '<p style="color: #666; padding: 16px;">No trails found</p>';
      }
    } catch (error) {
      console.error('Failed to load trail list:', error);
      list.innerHTML = `<p style="color: #dc3545; padding: 16px;">Failed to load trails: ${error.message}</p>`;
    } finally {
      loading.classList.add('hidden');
    }
  }

  /**
   * Open a trail for editing
   */
  async openTrail(slug) {
    this.currentTrailSlug = slug;

    try {
      await this.trailEditor.loadTrail(slug);

      document.getElementById('editor-trail-name').textContent = this.trailEditor.trail.name || slug;

      this.waypointEditor.populateWaypointList();
      this.updateMapPreview();
      this.loadMapUploadPreviews();

      // Reset map view
      this.mapScale = 0.2;
      this.mapX = 0;
      this.mapY = -50;
      this.updateMapTransform();

      this.showScreen('editor');
      this.showPanel('trail-info');
      this.clearUnsaved();
    } catch (error) {
      console.error('Failed to open trail:', error);
      this.showToast(`Failed to open trail: ${error.message}`, 'error');
    }
  }

  /**
   * Confirm leaving editor with unsaved changes
   */
  confirmLeaveEditor() {
    if (this.hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return;
      }
    }
    this.hasUnsavedChanges = false;
    this.currentTrailSlug = null;
    this.showScreen('selector');
  }

  /**
   * Mark document as having unsaved changes
   */
  markUnsaved() {
    this.hasUnsavedChanges = true;
    document.getElementById('unsaved-indicator').classList.remove('hidden');
    document.getElementById('save-btn').disabled = false;
  }

  /**
   * Clear unsaved changes marker
   */
  clearUnsaved() {
    this.hasUnsavedChanges = false;
    document.getElementById('unsaved-indicator').classList.add('hidden');
    document.getElementById('save-btn').disabled = true;
  }

  /**
   * Show save dialog
   */
  showSaveDialog() {
    const dialog = document.getElementById('save-dialog');
    document.getElementById('commit-message').value = 'Update trail content';
    dialog.classList.remove('hidden');
  }

  /**
   * Save changes to GitHub
   */
  async saveChanges() {
    const dialog = document.getElementById('save-dialog');
    const message = document.getElementById('commit-message').value.trim() || 'Update trail content';

    const saveBtn = document.getElementById('save-confirm');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const trailData = this.trailEditor.getTrailData();

      const result = await this.api.putJsonFile(
        trailData.path,
        trailData.data,
        message,
        trailData.sha
      );

      // Update SHA for subsequent saves
      this.trailEditor.updateSha(result.content.sha);

      dialog.classList.add('hidden');
      this.clearUnsaved();
      this.showToast('Changes saved successfully', 'success');
    } catch (error) {
      console.error('Save failed:', error);

      if (error.status === 409) {
        this.showToast('Conflict: file was modified. Please reload and try again.', 'error');
      } else {
        this.showToast(`Save failed: ${error.message}`, 'error');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  }

  /**
   * Show new trail dialog
   */
  showNewTrailDialog() {
    document.getElementById('new-trail-slug').value = '';
    document.getElementById('new-trail-dialog').classList.remove('hidden');
    document.getElementById('new-trail-slug').focus();
  }

  /**
   * Create a new trail via GitHub API
   */
  async createNewTrail() {
    const slugInput = document.getElementById('new-trail-slug');
    const slug = slugInput.value.trim().toLowerCase();

    if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      this.showToast('Invalid slug: use lowercase letters, numbers, and hyphens only', 'error');
      return;
    }

    const createBtn = document.getElementById('new-trail-create');
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    try {
      // Check if trail already exists
      const trailsPath = this.config.trailsPath;
      const exists = await this.api.exists(`${trailsPath}/${slug}/trail.json`);
      if (exists) {
        this.showToast('A trail with this slug already exists', 'error');
        return;
      }

      // Create trail.json
      const trailData = {
        slug: slug,
        name: '',
        identifier: '',
        shortTitle: '',
        description: '',
        features: [],
        cemeteryDescription: '',
        waypoints: []
      };

      // Create manifest.json
      const manifestData = {
        name: '',
        short_name: '',
        description: '',
        start_url: `/fc-trails/trails/${slug}/`,
        scope: `/fc-trails/trails/${slug}/`,
        display: 'standalone',
        background_color: '#3B7A5C',
        theme_color: '#1D4556',
        orientation: 'portrait',
        icons: [
          {
            src: '../../icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '../../icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      };

      // Create index.html from template
      const indexHtml = this.generateTrailIndexHtml(slug);

      // Batch commit all files
      const operations = [
        {
          action: 'add',
          path: `${trailsPath}/${slug}/trail.json`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(trailData, null, 2)))),
          encoding: 'base64'
        },
        {
          action: 'add',
          path: `${trailsPath}/${slug}/manifest.json`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(manifestData, null, 2)))),
          encoding: 'base64'
        },
        {
          action: 'add',
          path: `${trailsPath}/${slug}/index.html`,
          content: btoa(unescape(encodeURIComponent(indexHtml))),
          encoding: 'base64'
        }
      ];

      await this.api.batchCommit(operations, `Create new trail: ${slug}`);

      document.getElementById('new-trail-dialog').classList.add('hidden');
      this.showToast(`Trail "${slug}" created successfully`, 'success');

      // Reload trail list and open the new trail
      await this.loadTrailList();
      this.openTrail(slug);
    } catch (error) {
      console.error('Failed to create trail:', error);
      this.showToast(`Failed to create trail: ${error.message}`, 'error');
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
    }
  }

  /**
   * Generate index.html for a new trail
   */
  generateTrailIndexHtml(slug) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#1D4556">
  <title>${slug} - Fulham Cemetery</title>

  <link rel="manifest" href="manifest.json">

  <!-- Favicon -->
  <link rel="icon" type="image/x-icon" href="../../icons/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="../../icons/favicon-32.png">
  <link rel="apple-touch-icon" href="../../icons/apple-touch-icon.png">

  <link rel="stylesheet" href="../../css/reset.css">
  <link rel="stylesheet" href="../../css/styles.css">
</head>
<body>
  <div id="app">
    <!-- Cover Page -->
    <div class="page active" id="page-cover" data-page="cover">
      <header class="cover-header">
        <div class="cover-header-text">
          <div class="cover-header-location">Fulham Cemetery</div>
          <div class="cover-header-identifier"></div>
          <div class="cover-header-name"></div>
        </div>
        <div class="cover-header-logo">
          <img src="../../images/logo-negative.png" alt="Fulham Cemetery Friends">
        </div>
      </header>
      <div class="content">
        <div class="map-container" id="cover-map">
          <div class="map-viewport">
            <div class="map-content">
              <img class="map-base" src="" alt="Cemetery map">
              <img class="map-route" src="" alt="">
              <div class="map-markers"></div>
            </div>
          </div>
          <button class="map-key-btn" aria-label="Show map key">
            <span class="material-symbols-rounded">info</span>
          </button>
          <div class="map-key">
            <ul class="map-key-grid">
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-bench.svg" alt=""></div>
                <div class="map-key-label">Bench</div>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-waterpoint.svg" alt=""></div>
                <div class="map-key-label">Water point</div>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-monument.svg" alt=""></div>
                <div class="map-key-label">Monument</div>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-pavedpath.svg" alt=""></div>
                <div class="map-key-label">Paved path</div>
                <span class="material-symbols-rounded" style="font-size: 18px">accessible</span>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-unpavedpath.svg" alt=""></div>
                <div class="map-key-label">Unpaved path</div>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <footer class="cover-footer">
        <a href="#" class="cover-cta" id="start-trail">
          <span>Start the trail</span>
          <span class="cover-cta-icon">
            <span class="material-symbols-rounded">chevron_right</span>
          </span>
        </a>
      </footer>
    </div>

    <!-- Intro Page -->
    <div class="page" id="page-intro" data-page="intro">
      <header class="header">
        <a href="#" class="header-back" id="intro-back">
          <span class="material-symbols-rounded">chevron_left</span>
        </a>
        <div class="header-title"></div>
        <div class="header-page-number">1/<span class="total-pages"></span></div>
      </header>
      <div class="content intro-content">
        <div class="intro-hero">
          <div class="intro-logo">
            <img src="../../images/logo-positive.png" alt="Fulham Cemetery Friends">
          </div>
          <div class="intro-title">
            <div class="intro-identifier"></div>
            <div class="intro-name"></div>
          </div>
          <p class="intro-description"></p>
        </div>
        <div class="trail-key">
          <h2 class="trail-key-title">Key</h2>
          <ul class="trail-key-grid"></ul>
        </div>
		<button class="first-waypoint-btn">
            <span>First waypoint</span>
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        <div class="cemetery-description"></div>

      </div>
      <footer class="footer">
        <div class="pagination">
          <button class="pagination-btn prev" disabled aria-label="Previous page">
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <div class="pagination-dots"></div>
          <button class="pagination-btn next" aria-label="Next page">
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        </div>
      </footer>
    </div>

    <!-- Waypoint Page (template, will be populated dynamically) -->
    <div class="page" id="page-waypoint" data-page="waypoint">
      <header class="header">
        <a href="#" class="header-back" id="waypoint-back">
          <span class="material-symbols-rounded">chevron_left</span>
        </a>
        <div class="header-title"></div>
        <div class="header-page-number"><span class="current-page"></span>/<span class="total-pages"></span></div>
      </header>
      <div class="content">
        <div class="waypoint-info">
          <div class="waypoint-header">
            <div class="waypoint-thumbnail">
              <img src="" alt="Waypoint photo">
            </div>
            <button class="waypoint-thumbnail-btn" aria-label="Waypoint photos">
                <span class="material-symbols-rounded">photo_camera</span>
                <span class="waypoint-photo-count"></span>
              </button>
            <div class="waypoint-details">
              <h1 class="waypoint-title"></h1>
              <p class="waypoint-description"></p>
            </div>
			<div class="waypoint-features-toggle">
				<button class="waypoint-features-btn" aria-label="Show waypoint features">
				<span class="material-symbols-rounded">keyboard_arrow_down</span>
			  </button>
			</div>
          </div>
          <div class="waypoint-features"></div>
        </div>
        <div class="map-container" id="waypoint-map">
          <div class="map-viewport">
            <div class="map-content">
              <img class="map-base" src="" alt="Cemetery map">
              <img class="map-route" src="" alt="">
              <div class="map-markers"></div>
            </div>
          </div>
          <button class="map-key-btn" aria-label="Show map key">
            <span class="material-symbols-rounded">info</span>
          </button>
          <div class="map-key">
            <ul class="map-key-grid">
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-bench.svg" alt=""></div>
                <div class="map-key-label">Bench</div>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-waterpoint.svg" alt=""></div>
                <div class="map-key-label">Water point</div>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-monument.svg" alt=""></div>
                <div class="map-key-label">Monument</div>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-pavedpath.svg" alt=""></div>
                <div class="map-key-label">Paved path</div>
                <span class="material-symbols-rounded" style="font-size: 18px">accessible</span>
              </li>
              <li class="map-key-item">
                <div class="map-key-icon"><img src="../../images/icon-unpavedpath.svg" alt=""></div>
                <div class="map-key-label">Unpaved path</div>
              </li>
            </ul>
          </div>
          <button class="read-more-btn" id="read-more-link">
            <span class="material-symbols-rounded">open_in_new</span>
            <span>Read more</span>
          </button>
        </div>
      </div>
      <footer class="footer">
        <div class="pagination">
          <button class="pagination-btn prev" aria-label="Previous page">
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <div class="pagination-dots"></div>
          <button class="pagination-btn next" aria-label="Next page">
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        </div>
      </footer>
    </div>

    <!-- Photo Overlay -->
    <div class="photo-overlay" id="photo-overlay">
      <div class="photo-overlay-backdrop"></div>
      <div class="photo-overlay-sheet">
        <div class="photo-overlay-titlebar" id="photo-overlay-titlebar">
          <span class="photo-overlay-photo-count"></span>
        </div>
        <div class="photo-overlay-content">
          <img class="photo-overlay-image" src="" alt="Waypoint photo">
          <button class="photo-overlay-nav prev" aria-label="Previous photo">
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <button class="photo-overlay-nav next" aria-label="Next photo">
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        </div>
        <div class="photo-overlay-indicators"></div>
      </div>
    </div>

    <!-- Web View Overlay -->
    <div class="webview-overlay" id="webview-overlay">
      <header class="webview-header">
        <button class="webview-done" id="webview-done">Done</button>
        <div class="webview-url"></div>
        <button class="webview-refresh" id="webview-refresh" aria-label="Refresh">
          <span class="material-symbols-rounded">refresh</span>
        </button>
      </header>
      <div class="webview-content">
        <iframe src="" title="External content"></iframe>
      </div>
      <footer class="webview-footer">
        <button id="webview-back-nav" aria-label="Go back">
          <span class="material-symbols-rounded">chevron_left</span>
        </button>
        <button id="webview-forward-nav" aria-label="Go forward">
          <span class="material-symbols-rounded">chevron_right</span>
        </button>
        <button id="webview-share" aria-label="Share">
          <span class="material-symbols-rounded">ios_share</span>
        </button>
        <button id="webview-open-external" aria-label="Open in browser">
          <span class="material-symbols-rounded">open_in_new</span>
        </button>
      </footer>
    </div>

    <!-- Loading Indicator -->
    <div class="loading hidden" id="loading">
      <svg class="loading-spinner" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" fill="none" stroke="#3B7A5C" stroke-width="4" stroke-dasharray="80, 200" stroke-linecap="round"/>
      </svg>
    </div>
  </div>

  <script src="https://hammerjs.github.io/dist/hammer.min.js"></script>
  <script type="module" src="../../js/app.js"></script>
</body>
</html>`;
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="material-symbols-rounded">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AdminApp();
  window.app.init();
});
