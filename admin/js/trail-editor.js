/**
 * Trail Editor module for metadata and features editing
 */

export class TrailEditor {
  constructor(app) {
    this.app = app;
    this.trail = null;
    this.trailSha = null;
    this.trailPath = null;
    this.originalTrail = null;

    // Available icons for features
    this.availableIcons = [
      'icon-big.svg',
      'icon-old.svg',
      'icon-blossom.svg',
      'icon-unique.svg',
      'icon-birdbox.svg',
      'icon-batbox.svg',
      'icon-time.svg',
      'icon-wheelchair.svg',
      'icon-bench.svg',
      'icon-waterpoint.svg',
      'icon-monument.svg',
      'icon-pavedpath.svg',
      'icon-unpavedpath.svg'
    ];

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Trail metadata form changes
    const metadataForm = document.getElementById('trail-metadata-form');
    metadataForm.addEventListener('input', () => this.onMetadataChange());

    // Add feature button
    document.getElementById('add-feature-btn').addEventListener('click', () => {
      this.openFeatureDialog();
    });

    // Feature dialog
    document.getElementById('feature-cancel').addEventListener('click', () => {
      this.closeFeatureDialog();
    });

    document.getElementById('feature-save').addEventListener('click', () => {
      this.saveFeature();
    });

    document.getElementById('feature-delete').addEventListener('click', () => {
      this.deleteFeature();
    });

    // Sync color picker with text input
    document.getElementById('feature-colour-picker').addEventListener('input', (e) => {
      document.getElementById('feature-colour').value = e.target.value.toUpperCase();
    });

    document.getElementById('feature-colour').addEventListener('input', (e) => {
      const value = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        document.getElementById('feature-colour-picker').value = value;
      }
    });
  }

  /**
   * Load trail data
   */
  async loadTrail(trailSlug) {
    const trailsPath = this.app.config.trailsPath;
    this.trailPath = `${trailsPath}/${trailSlug}/trail.json`;

    const { data, sha } = await this.app.api.getJsonFile(this.trailPath);

    this.trail = data;
    this.trailSha = sha;
    this.originalTrail = JSON.stringify(data);

    this.populateMetadataForm();
    this.populateFeaturesList();

    return this.trail;
  }

  /**
   * Populate metadata form with trail data
   */
  populateMetadataForm() {
    document.getElementById('trail-slug').value = this.trail.slug || '';
    document.getElementById('trail-identifier').value = this.trail.identifier || '';
    document.getElementById('trail-name').value = this.trail.name || '';
    document.getElementById('trail-short-title').value = this.trail.shortTitle || '';
    document.getElementById('trail-description').value = this.trail.description || '';
    document.getElementById('trail-cemetery-description').value = this.trail.cemeteryDescription || '';
  }

  /**
   * Handle metadata form changes
   */
  onMetadataChange() {
    this.trail.identifier = document.getElementById('trail-identifier').value;
    this.trail.name = document.getElementById('trail-name').value;
    this.trail.shortTitle = document.getElementById('trail-short-title').value;
    this.trail.description = document.getElementById('trail-description').value;
    this.trail.cemeteryDescription = document.getElementById('trail-cemetery-description').value;

    this.app.markUnsaved();
  }

  /**
   * Populate features list
   */
  populateFeaturesList() {
    const container = document.getElementById('features-list');
    container.innerHTML = '';

    if (!this.trail.features || this.trail.features.length === 0) {
      container.innerHTML = '<p class="empty-message">No features defined</p>';
      return;
    }

    this.trail.features.forEach((feature, index) => {
      const item = document.createElement('div');
      item.className = 'feature-item';
      item.dataset.index = index;
      item.innerHTML = `
        <div class="feature-item-icon">
          <img src="../images/${feature.icon}" alt="" style="filter: none;">
        </div>
        <div class="feature-item-info">
          <h4>${feature.title}</h4>
          <p>${feature.description || 'No description'}</p>
        </div>
        <span class="feature-item-id">${feature.id}</span>
      `;

      item.addEventListener('click', () => this.openFeatureDialog(index));
      container.appendChild(item);
    });
  }

  /**
   * Open feature dialog for adding/editing
   */
  openFeatureDialog(index = null) {
    const dialog = document.getElementById('feature-dialog');
    const title = document.getElementById('feature-dialog-title');
    const deleteBtn = document.getElementById('feature-delete');
    const iconSelect = document.getElementById('feature-icon');

    // Populate icon select
    iconSelect.innerHTML = '<option value="">Select icon...</option>' +
      this.availableIcons.map(icon =>
        `<option value="${icon}">${icon.replace('icon-', '').replace('.svg', '')}</option>`
      ).join('');

    if (index !== null) {
      // Editing existing feature
      title.textContent = 'Edit Feature';
      deleteBtn.classList.remove('hidden');
      dialog.dataset.editIndex = index;

      const feature = this.trail.features[index];
      document.getElementById('feature-id').value = feature.id;
      document.getElementById('feature-id').readOnly = true;
      document.getElementById('feature-title').value = feature.title;
      document.getElementById('feature-icon').value = feature.icon;
      document.getElementById('feature-colour').value = feature.iconColour || '#3B7A5C';
      document.getElementById('feature-colour-picker').value = feature.iconColour || '#3B7A5C';
      document.getElementById('feature-description').value = feature.description || '';
    } else {
      // Adding new feature
      title.textContent = 'Add Feature';
      deleteBtn.classList.add('hidden');
      delete dialog.dataset.editIndex;

      document.getElementById('feature-id').value = '';
      document.getElementById('feature-id').readOnly = false;
      document.getElementById('feature-title').value = '';
      document.getElementById('feature-icon').value = '';
      document.getElementById('feature-colour').value = '#3B7A5C';
      document.getElementById('feature-colour-picker').value = '#3B7A5C';
      document.getElementById('feature-description').value = '';
    }

    dialog.classList.remove('hidden');
  }

  /**
   * Close feature dialog
   */
  closeFeatureDialog() {
    document.getElementById('feature-dialog').classList.add('hidden');
  }

  /**
   * Save feature from dialog
   */
  saveFeature() {
    const dialog = document.getElementById('feature-dialog');
    const editIndex = dialog.dataset.editIndex;

    const feature = {
      id: document.getElementById('feature-id').value.toLowerCase().trim(),
      icon: document.getElementById('feature-icon').value,
      iconColour: document.getElementById('feature-colour').value.toUpperCase(),
      title: document.getElementById('feature-title').value.trim(),
      description: document.getElementById('feature-description').value.trim()
    };

    // Validation
    if (!feature.id || !feature.title) {
      this.app.showToast('ID and title are required', 'error');
      return;
    }

    if (!feature.icon) {
      this.app.showToast('Please select an icon', 'error');
      return;
    }

    if (editIndex !== undefined) {
      // Update existing
      this.trail.features[parseInt(editIndex)] = feature;
    } else {
      // Check for duplicate ID
      if (this.trail.features.some(f => f.id === feature.id)) {
        this.app.showToast('A feature with this ID already exists', 'error');
        return;
      }
      // Add new
      this.trail.features.push(feature);
    }

    this.populateFeaturesList();
    this.closeFeatureDialog();
    this.app.markUnsaved();
    this.app.waypointEditor.updateFeaturesCheckboxes();
  }

  /**
   * Delete feature
   */
  deleteFeature() {
    const dialog = document.getElementById('feature-dialog');
    const editIndex = parseInt(dialog.dataset.editIndex);

    if (editIndex === undefined || isNaN(editIndex)) return;

    const feature = this.trail.features[editIndex];

    // Check if feature is used by any waypoints
    const usedBy = this.trail.waypoints.filter(w =>
      w.features && w.features.includes(feature.id)
    );

    if (usedBy.length > 0) {
      const names = usedBy.map(w => w.title).join(', ');
      this.app.showToast(`Cannot delete: feature is used by ${usedBy.length} waypoint(s): ${names}`, 'error');
      return;
    }

    this.trail.features.splice(editIndex, 1);
    this.populateFeaturesList();
    this.closeFeatureDialog();
    this.app.markUnsaved();
    this.app.waypointEditor.updateFeaturesCheckboxes();
  }

  /**
   * Check if there are unsaved changes
   */
  hasChanges() {
    return JSON.stringify(this.trail) !== this.originalTrail;
  }

  /**
   * Get trail data for saving
   */
  getTrailData() {
    return {
      path: this.trailPath,
      data: this.trail,
      sha: this.trailSha
    };
  }

  /**
   * Update SHA after successful save
   */
  updateSha(newSha) {
    this.trailSha = newSha;
    this.originalTrail = JSON.stringify(this.trail);
  }
}
