/**
 * Waypoint Editor module for waypoint CRUD with marker position picker
 */

export class WaypointEditor {
  constructor(app) {
    this.app = app;
    this.currentWaypointIndex = null;
    this.placingMarker = false;
    this.placingMarkerIndex = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Add waypoint button
    document.getElementById('add-waypoint-btn').addEventListener('click', () => {
      this.addWaypoint();
    });

    // Delete waypoint button
    document.getElementById('delete-waypoint-btn').addEventListener('click', () => {
      this.showDeleteDialog();
    });

    // Delete dialog
    document.getElementById('delete-cancel').addEventListener('click', () => {
      document.getElementById('delete-dialog').classList.add('hidden');
    });

    document.getElementById('delete-confirm').addEventListener('click', () => {
      this.deleteWaypoint();
    });

    // Waypoint form changes
    const form = document.getElementById('waypoint-form');
    form.addEventListener('input', () => this.onWaypointChange());

    // Color picker sync
    document.getElementById('waypoint-colour-picker').addEventListener('input', (e) => {
      document.getElementById('waypoint-colour').value = e.target.value.toUpperCase();
      this.onWaypointChange();
    });

    document.getElementById('waypoint-colour').addEventListener('input', (e) => {
      const value = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        document.getElementById('waypoint-colour-picker').value = value;
      }
    });

    // Add marker position button
    document.getElementById('add-marker-position-btn').addEventListener('click', () => {
      this.startPlacingMarker();
    });

    // Map click handler for placing markers
    document.getElementById('map-preview').addEventListener('click', (e) => {
      if (this.placingMarker) {
        this.placeMarker(e);
      }
    });
  }

  /**
   * Initialize waypoint list with sortable
   */
  initWaypointList() {
    const list = document.getElementById('waypoint-list');

    // Initialize SortableJS for drag-to-reorder
    if (this.sortable) {
      this.sortable.destroy();
    }

    this.sortable = new Sortable(list, {
      animation: 150,
      handle: '.waypoint-drag-handle',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: (evt) => {
        this.onReorder(evt.oldIndex, evt.newIndex);
      }
    });
  }

  /**
   * Populate waypoint list
   */
  populateWaypointList() {
    const container = document.getElementById('waypoint-list');
    container.innerHTML = '';

    const trail = this.app.trailEditor.trail;
    if (!trail.waypoints || trail.waypoints.length === 0) {
      container.innerHTML = '<p class="empty-message" style="padding: 8px; color: #666; font-size: 13px;">No waypoints</p>';
      return;
    }

    trail.waypoints.forEach((waypoint, index) => {
      const item = document.createElement('div');
      item.className = 'waypoint-list-item';
      if (this.currentWaypointIndex === index) {
        item.classList.add('active');
      }
      item.dataset.index = index;
      item.innerHTML = `
        <div class="waypoint-marker" style="background-color: ${waypoint.markerColour}">
          ${waypoint.markerSymbol}
        </div>
        <span class="waypoint-list-item-title">${waypoint.title || 'Untitled'}</span>
        <span class="waypoint-drag-handle material-symbols-rounded">drag_indicator</span>
      `;

      item.addEventListener('click', (e) => {
        if (!e.target.closest('.waypoint-drag-handle')) {
          this.selectWaypoint(index);
        }
      });

      container.appendChild(item);
    });

    this.initWaypointList();
  }

  /**
   * Select a waypoint for editing
   */
  selectWaypoint(index) {
    this.currentWaypointIndex = index;

    // Update sidebar selection
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.waypoint-list-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.index) === index);
    });

    // Show waypoint panel
    this.app.showPanel('waypoint');

    // Populate form
    this.populateWaypointForm();

    // Update map
    this.app.updateMapPreview();
  }

  /**
   * Populate waypoint form with data
   */
  populateWaypointForm() {
    const waypoint = this.getCurrentWaypoint();
    if (!waypoint) return;

    document.getElementById('waypoint-panel-title').textContent = `Edit Waypoint ${waypoint.index}`;
    document.getElementById('waypoint-index').value = waypoint.index;
    document.getElementById('waypoint-symbol').value = waypoint.markerSymbol || '';
    document.getElementById('waypoint-colour').value = waypoint.markerColour || '#8BC34A';
    document.getElementById('waypoint-colour-picker').value = waypoint.markerColour || '#8BC34A';
    document.getElementById('waypoint-title').value = waypoint.title || '';
    document.getElementById('waypoint-description').value = waypoint.description || '';
    document.getElementById('waypoint-url').value = waypoint.externalUrl || '';

    this.updateFeaturesCheckboxes();
    this.updateMarkerPositionsList();

    // Load photos
    this.app.photoManager.loadPhotos(waypoint);
  }

  /**
   * Update features checkboxes
   */
  updateFeaturesCheckboxes() {
    const container = document.getElementById('waypoint-features-select');
    const trail = this.app.trailEditor.trail;
    const waypoint = this.getCurrentWaypoint();

    container.innerHTML = '';

    if (!trail.features) return;

    trail.features.forEach(feature => {
      const isSelected = waypoint && waypoint.features && waypoint.features.includes(feature.id);

      const label = document.createElement('label');
      label.className = `feature-checkbox ${isSelected ? 'selected' : ''}`;
      label.innerHTML = `
        <input type="checkbox" value="${feature.id}" ${isSelected ? 'checked' : ''}>
        <div class="feature-checkbox-icon">
          <img src="../images/${feature.icon}" alt="">
        </div>
        <span>${feature.title}</span>
      `;

      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', () => {
        label.classList.toggle('selected', checkbox.checked);
        this.onWaypointChange();
      });

      container.appendChild(label);
    });
  }

  /**
   * Update marker positions list
   */
  updateMarkerPositionsList() {
    const container = document.getElementById('marker-positions-list');
    const waypoint = this.getCurrentWaypoint();

    container.innerHTML = '';

    if (!waypoint || !waypoint.markerPositions) return;

    waypoint.markerPositions.forEach((pos, index) => {
      const item = document.createElement('div');
      item.className = 'marker-position-item';
      item.innerHTML = `
        <span>x: ${pos.x}, y: ${pos.y}</span>
        <button type="button" class="btn btn-icon btn-small" title="Remove position">
          <span class="material-symbols-rounded">close</span>
        </button>
      `;

      item.querySelector('button').addEventListener('click', () => {
        this.removeMarkerPosition(index);
      });

      container.appendChild(item);
    });
  }

  /**
   * Handle waypoint form changes
   */
  onWaypointChange() {
    const waypoint = this.getCurrentWaypoint();
    if (!waypoint) return;

    waypoint.markerSymbol = document.getElementById('waypoint-symbol').value.toUpperCase();
    waypoint.markerColour = document.getElementById('waypoint-colour').value.toUpperCase();
    waypoint.title = document.getElementById('waypoint-title').value;
    waypoint.description = document.getElementById('waypoint-description').value;
    waypoint.externalUrl = document.getElementById('waypoint-url').value;

    // Update features
    const featureCheckboxes = document.querySelectorAll('#waypoint-features-select input:checked');
    waypoint.features = Array.from(featureCheckboxes).map(cb => cb.value);

    this.populateWaypointList();
    this.app.updateMapPreview();
    this.app.markUnsaved();
  }

  /**
   * Get current waypoint
   */
  getCurrentWaypoint() {
    const trail = this.app.trailEditor.trail;
    if (this.currentWaypointIndex === null || !trail.waypoints) return null;
    return trail.waypoints[this.currentWaypointIndex];
  }

  /**
   * Add new waypoint
   */
  addWaypoint() {
    const trail = this.app.trailEditor.trail;
    if (!trail.waypoints) {
      trail.waypoints = [];
    }

    const newIndex = trail.waypoints.length + 1;
    const newWaypoint = {
      index: newIndex,
      markerSymbol: '',
      markerColour: '#8BC34A',
      markerPositions: [],
      features: [],
      title: '',
      description: '',
      photos: [],
      externalUrl: ''
    };

    trail.waypoints.push(newWaypoint);
    this.populateWaypointList();
    this.selectWaypoint(trail.waypoints.length - 1);
    this.app.markUnsaved();
  }

  /**
   * Show delete confirmation dialog
   */
  showDeleteDialog() {
    if (this.currentWaypointIndex === null) return;
    document.getElementById('delete-dialog').classList.remove('hidden');
  }

  /**
   * Delete current waypoint
   */
  async deleteWaypoint() {
    const trail = this.app.trailEditor.trail;
    if (this.currentWaypointIndex === null) return;

    const waypoint = trail.waypoints[this.currentWaypointIndex];

    // Delete photos from GitHub
    if (waypoint.photos && waypoint.photos.length > 0) {
      await this.app.photoManager.deleteAllPhotos(waypoint);
    }

    // Remove waypoint
    trail.waypoints.splice(this.currentWaypointIndex, 1);

    // Reindex remaining waypoints
    trail.waypoints.forEach((wp, idx) => {
      wp.index = idx + 1;
    });

    document.getElementById('delete-dialog').classList.add('hidden');

    // Select another waypoint or show metadata panel
    if (trail.waypoints.length > 0) {
      const newIndex = Math.min(this.currentWaypointIndex, trail.waypoints.length - 1);
      this.currentWaypointIndex = null;
      this.populateWaypointList();
      this.selectWaypoint(newIndex);
    } else {
      this.currentWaypointIndex = null;
      this.populateWaypointList();
      this.app.showPanel('trail-info');
    }

    this.app.markUnsaved();
  }

  /**
   * Handle waypoint reorder
   */
  onReorder(oldIndex, newIndex) {
    if (oldIndex === newIndex) return;

    const trail = this.app.trailEditor.trail;
    const [moved] = trail.waypoints.splice(oldIndex, 1);
    trail.waypoints.splice(newIndex, 0, moved);

    // Reindex
    trail.waypoints.forEach((wp, idx) => {
      wp.index = idx + 1;
    });

    // Update current selection
    if (this.currentWaypointIndex === oldIndex) {
      this.currentWaypointIndex = newIndex;
    } else if (this.currentWaypointIndex > oldIndex && this.currentWaypointIndex <= newIndex) {
      this.currentWaypointIndex--;
    } else if (this.currentWaypointIndex < oldIndex && this.currentWaypointIndex >= newIndex) {
      this.currentWaypointIndex++;
    }

    this.populateWaypointList();
    this.populateWaypointForm();
    this.app.updateMapPreview();
    this.app.markUnsaved();
  }

  /**
   * Start placing a marker on the map
   */
  startPlacingMarker() {
    const waypoint = this.getCurrentWaypoint();
    if (!waypoint) return;

    this.placingMarker = true;
    this.placingMarkerIndex = waypoint.markerPositions ? waypoint.markerPositions.length : 0;

    document.getElementById('map-instructions').classList.add('visible');
    document.getElementById('map-preview').style.cursor = 'crosshair';
  }

  /**
   * Place marker at clicked position
   */
  placeMarker(e) {
    const waypoint = this.getCurrentWaypoint();
    if (!waypoint || !this.placingMarker) return;

    const preview = document.getElementById('map-preview');
    const content = preview.querySelector('.map-preview-content');
    const rect = preview.getBoundingClientRect();

    // Get click position relative to viewport
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Get current transform
    const transform = content.style.transform || '';
    const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)\s*scale\(([^)]+)\)/);

    let offsetX = 0, offsetY = 0, scale = 1;
    if (match) {
      offsetX = parseFloat(match[1]);
      offsetY = parseFloat(match[2]);
      scale = parseFloat(match[3]);
    }

    // Convert to map coordinates (relative to route origin at 61, 322)
    const mapX = (clickX - offsetX) / scale - 61;
    const mapY = (clickY - offsetY) / scale - 322;

    // Round to integers
    const x = Math.round(mapX);
    const y = Math.round(mapY);

    // Add position
    if (!waypoint.markerPositions) {
      waypoint.markerPositions = [];
    }
    waypoint.markerPositions.push({ x, y });

    // Stop placing
    this.placingMarker = false;
    document.getElementById('map-instructions').classList.remove('visible');
    document.getElementById('map-preview').style.cursor = '';

    this.updateMarkerPositionsList();
    this.app.updateMapPreview();
    this.app.markUnsaved();
  }

  /**
   * Remove a marker position
   */
  removeMarkerPosition(index) {
    const waypoint = this.getCurrentWaypoint();
    if (!waypoint || !waypoint.markerPositions) return;

    waypoint.markerPositions.splice(index, 1);
    this.updateMarkerPositionsList();
    this.app.updateMapPreview();
    this.app.markUnsaved();
  }
}
