/**
 * Photo Manager module for photo upload, reorder, and delete
 */

import { processImages, extractBase64, getThumbnailFilename } from './thumbnail-generator.js';

export class PhotoManager {
  constructor(app) {
    this.app = app;
    this.currentWaypoint = null;
    this.photoShas = {}; // Cache photo SHAs for deletion

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Upload button
    document.getElementById('upload-photos-btn').addEventListener('click', () => {
      document.getElementById('photo-upload-input').click();
    });

    // File input change
    document.getElementById('photo-upload-input').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadPhotos(e.target.files);
        e.target.value = ''; // Reset input
      }
    });
  }

  /**
   * Initialize photo grid with sortable
   */
  initPhotoGrid() {
    const grid = document.getElementById('photo-grid');

    if (this.sortable) {
      this.sortable.destroy();
    }

    this.sortable = new Sortable(grid, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: (evt) => {
        this.onReorder(evt.oldIndex, evt.newIndex);
      }
    });
  }

  /**
   * Load photos for a waypoint
   */
  async loadPhotos(waypoint) {
    this.currentWaypoint = waypoint;
    this.photoShas = {};

    const grid = document.getElementById('photo-grid');
    grid.innerHTML = '';

    if (!waypoint.photos || waypoint.photos.length === 0) {
      grid.innerHTML = '<p class="empty-message" style="color: #666; font-size: 13px;">No photos</p>';
      return;
    }

    // Create placeholder elements for all photos
    waypoint.photos.forEach((photo, index) => {
      const item = this.createPhotoItem(photo, index, true);
      grid.appendChild(item);
    });

    this.initPhotoGrid();

    // Load thumbnails asynchronously
    const trailSlug = this.app.trailEditor.trail.slug;
    const basePath = `${this.app.config.trailsPath}/${trailSlug}/photos/${waypoint.index}`;

    for (let i = 0; i < waypoint.photos.length; i++) {
      const photo = waypoint.photos[i];
      const thumbName = getThumbnailFilename(photo);

      try {
        // Get thumbnail from GitHub
        const thumbPath = `${basePath}/thumbs/${thumbName}`;
        const thumbFile = await this.app.api.getContents(thumbPath);
        const thumbUrl = `data:image/jpeg;base64,${thumbFile.content}`;

        // Update the image
        const img = grid.querySelector(`[data-index="${i}"] img`);
        if (img) {
          img.src = thumbUrl;
        }

        // Cache SHA for potential deletion
        this.photoShas[photo] = {
          full: null, // Will fetch if needed
          thumb: thumbFile.sha
        };

        // Also get full image SHA
        const fullPath = `${basePath}/${photo}`;
        const fullFile = await this.app.api.getContents(fullPath);
        this.photoShas[photo].full = fullFile.sha;
      } catch (error) {
        console.warn(`Could not load thumbnail for ${photo}:`, error);
      }
    }
  }

  /**
   * Create a photo item element
   */
  createPhotoItem(photo, index, loading = false) {
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.dataset.index = index;
    item.dataset.filename = photo;

    const img = document.createElement('img');
    img.alt = 'Waypoint photo';

    if (loading) {
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23e1e5e9" width="100" height="100"/%3E%3C/svg%3E';
    }

    const overlay = document.createElement('div');
    overlay.className = 'photo-item-overlay';
    overlay.innerHTML = `
      <button class="photo-delete-btn" title="Delete photo">
        <span class="material-symbols-rounded">delete</span>
      </button>
    `;

    overlay.querySelector('.photo-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deletePhoto(index);
    });

    item.appendChild(img);
    item.appendChild(overlay);

    return item;
  }

  /**
   * Upload photos
   */
  async uploadPhotos(files) {
    if (!this.currentWaypoint) return;

    const progressContainer = document.getElementById('photo-upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Processing images...';

    try {
      // Process images (generate thumbnails)
      const processed = await processImages(files, (current, total) => {
        const percent = Math.round((current / total) * 50);
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `Processing ${current}/${total}...`;
      });

      if (processed.length === 0) {
        this.app.showToast('No valid images selected', 'error');
        progressContainer.classList.add('hidden');
        return;
      }

      // Upload to GitHub
      const trailSlug = this.app.trailEditor.trail.slug;
      const basePath = `${this.app.config.trailsPath}/${trailSlug}/photos/${this.currentWaypoint.index}`;

      for (let i = 0; i < processed.length; i++) {
        const { file, thumbnail, full } = processed[i];
        const filename = this.sanitizeFilename(file.name);
        const thumbFilename = getThumbnailFilename(filename);

        progressText.textContent = `Uploading ${filename}...`;
        const percent = 50 + Math.round((i / processed.length) * 50);
        progressFill.style.width = `${percent}%`;

        // Upload full image
        const fullResult = await this.app.api.uploadImage(
          `${basePath}/${filename}`,
          extractBase64(full),
          `Add photo: ${filename}`
        );

        // Upload thumbnail
        const thumbResult = await this.app.api.uploadImage(
          `${basePath}/thumbs/${thumbFilename}`,
          extractBase64(thumbnail),
          `Add thumbnail: ${thumbFilename}`
        );

        // Add to waypoint photos array
        if (!this.currentWaypoint.photos) {
          this.currentWaypoint.photos = [];
        }
        this.currentWaypoint.photos.push(filename);

        // Cache SHAs
        this.photoShas[filename] = {
          full: fullResult.content.sha,
          thumb: thumbResult.content.sha
        };
      }

      progressFill.style.width = '100%';
      progressText.textContent = 'Upload complete!';

      // Reload photos
      await this.loadPhotos(this.currentWaypoint);
      this.app.markUnsaved();

      this.app.showToast(`Uploaded ${processed.length} photo(s)`, 'success');

      // Hide progress after a moment
      setTimeout(() => {
        progressContainer.classList.add('hidden');
      }, 1500);
    } catch (error) {
      console.error('Upload failed:', error);
      this.app.showToast(`Upload failed: ${error.message}`, 'error');
      progressContainer.classList.add('hidden');
    }
  }

  /**
   * Sanitize filename for safe storage
   */
  sanitizeFilename(filename) {
    // Convert to lowercase, replace spaces with hyphens, remove special chars
    return filename
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9.-]/g, '');
  }

  /**
   * Delete a photo
   */
  async deletePhoto(index) {
    if (!this.currentWaypoint || !this.currentWaypoint.photos) return;

    const photo = this.currentWaypoint.photos[index];
    const shas = this.photoShas[photo];

    if (!shas || !shas.full || !shas.thumb) {
      this.app.showToast('Cannot delete: photo data not loaded', 'error');
      return;
    }

    try {
      const trailSlug = this.app.trailEditor.trail.slug;
      const basePath = `${this.app.config.trailsPath}/${trailSlug}/photos/${this.currentWaypoint.index}`;
      const thumbFilename = getThumbnailFilename(photo);

      // Delete full image
      await this.app.api.deleteFile(
        `${basePath}/${photo}`,
        `Delete photo: ${photo}`,
        shas.full
      );

      // Delete thumbnail
      await this.app.api.deleteFile(
        `${basePath}/thumbs/${thumbFilename}`,
        `Delete thumbnail: ${thumbFilename}`,
        shas.thumb
      );

      // Remove from waypoint
      this.currentWaypoint.photos.splice(index, 1);
      delete this.photoShas[photo];

      // Reload
      await this.loadPhotos(this.currentWaypoint);
      this.app.markUnsaved();

      this.app.showToast('Photo deleted', 'success');
    } catch (error) {
      console.error('Delete failed:', error);
      this.app.showToast(`Delete failed: ${error.message}`, 'error');
    }
  }

  /**
   * Delete all photos for a waypoint
   */
  async deleteAllPhotos(waypoint) {
    if (!waypoint.photos || waypoint.photos.length === 0) return;

    const trailSlug = this.app.trailEditor.trail.slug;
    const basePath = `${this.app.config.trailsPath}/${trailSlug}/photos/${waypoint.index}`;

    for (const photo of waypoint.photos) {
      const shas = this.photoShas[photo];
      if (!shas) continue;

      const thumbFilename = getThumbnailFilename(photo);

      try {
        if (shas.full) {
          await this.app.api.deleteFile(
            `${basePath}/${photo}`,
            `Delete photo: ${photo}`,
            shas.full
          );
        }
        if (shas.thumb) {
          await this.app.api.deleteFile(
            `${basePath}/thumbs/${thumbFilename}`,
            `Delete thumbnail: ${thumbFilename}`,
            shas.thumb
          );
        }
      } catch (error) {
        console.warn(`Could not delete ${photo}:`, error);
      }
    }
  }

  /**
   * Handle photo reorder
   */
  onReorder(oldIndex, newIndex) {
    if (oldIndex === newIndex) return;
    if (!this.currentWaypoint || !this.currentWaypoint.photos) return;

    const [moved] = this.currentWaypoint.photos.splice(oldIndex, 1);
    this.currentWaypoint.photos.splice(newIndex, 0, moved);

    // Update grid indices
    const grid = document.getElementById('photo-grid');
    const items = grid.querySelectorAll('.photo-item');
    items.forEach((item, i) => {
      item.dataset.index = i;
    });

    this.app.markUnsaved();
  }
}
