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
    base.src = `../images/map.png`;
    route.src = `../images/route.svg`;
    route.style.left = '61px';
    route.style.top = '322px';

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
          marker.style.left = `${61 + pos.x}px`;
          marker.style.top = `${322 + pos.y}px`;
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
