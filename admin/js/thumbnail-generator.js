/**
 * Client-side thumbnail generator using Canvas API
 * Creates 160x160 center-cropped square thumbnails
 */

const THUMBNAIL_SIZE = 160;

/**
 * Generate a thumbnail from an image file
 * @param {File} file - Image file to process
 * @returns {Promise<{thumbnail: string, full: string}>} Base64 data URLs
 */
export async function generateThumbnail(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          const thumbnail = createThumbnail(img);
          resolve({
            thumbnail,
            full: e.target.result, // Original image as data URL
            width: img.width,
            height: img.height
          });
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Create a 160x160 center-cropped thumbnail from an image
 * @param {HTMLImageElement} img - Loaded image element
 * @returns {string} Base64 data URL of the thumbnail
 */
function createThumbnail(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;

  // Calculate center crop dimensions
  const { sx, sy, sWidth, sHeight } = getCenterCropDimensions(img.width, img.height);

  // Draw center-cropped and scaled image
  ctx.drawImage(
    img,
    sx, sy, sWidth, sHeight, // Source rectangle
    0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE // Destination rectangle
  );

  // Return as JPEG data URL for smaller file size
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Calculate dimensions for center-cropping to a square
 * @param {number} width - Original image width
 * @param {number} height - Original image height
 * @returns {{sx: number, sy: number, sWidth: number, sHeight: number}}
 */
function getCenterCropDimensions(width, height) {
  let sx, sy, sWidth, sHeight;

  if (width > height) {
    // Landscape - crop sides
    sWidth = height;
    sHeight = height;
    sx = (width - height) / 2;
    sy = 0;
  } else {
    // Portrait or square - crop top/bottom
    sWidth = width;
    sHeight = width;
    sx = 0;
    sy = (height - width) / 2;
  }

  return { sx, sy, sWidth, sHeight };
}

/**
 * Extract base64 content from a data URL
 * @param {string} dataUrl - Data URL (e.g., "data:image/jpeg;base64,...")
 * @returns {string} Base64 content without prefix
 */
export function extractBase64(dataUrl) {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}

/**
 * Get filename with .jpg extension for thumbnail
 * @param {string} originalFilename - Original filename
 * @returns {string} Filename with .jpg extension
 */
export function getThumbnailFilename(originalFilename) {
  return originalFilename.replace(/\.[^.]+$/, '.jpg');
}

/**
 * Process multiple files and generate thumbnails
 * @param {FileList|File[]} files - Files to process
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Array<{file: File, thumbnail: string, full: string}>>}
 */
export async function processImages(files, onProgress) {
  const results = [];
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];

    if (!file.type.startsWith('image/')) {
      continue;
    }

    try {
      const processed = await generateThumbnail(file);
      results.push({
        file,
        ...processed
      });
    } catch (error) {
      console.error(`Failed to process ${file.name}:`, error);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return results;
}
