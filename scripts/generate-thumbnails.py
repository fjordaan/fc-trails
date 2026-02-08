#!/usr/bin/env python3
"""
Generate 160x160 square thumbnail images for all waypoint photos.
Thumbnails are center-cropped from the original image's shortest side.
"""

import os
from pathlib import Path
from PIL import Image

THUMBNAIL_SIZE = 160
JPEG_QUALITY = 85

def create_square_thumbnail(input_path, output_path, size=THUMBNAIL_SIZE):
    """Create a center-cropped square thumbnail."""
    with Image.open(input_path) as img:
        # Convert to RGB if necessary (handles RGBA, P mode, etc.)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        width, height = img.size

        # Determine crop box for center square based on shortest side
        if width > height:
            # Landscape: crop from center horizontally
            left = (width - height) // 2
            top = 0
            right = left + height
            bottom = height
        else:
            # Portrait or square: crop from center vertically
            left = 0
            top = (height - width) // 2
            right = width
            bottom = top + width

        # Crop to square
        img_cropped = img.crop((left, top, right, bottom))

        # Resize to target size
        img_thumbnail = img_cropped.resize((size, size), Image.Resampling.LANCZOS)

        # Save as JPEG
        img_thumbnail.save(output_path, 'JPEG', quality=JPEG_QUALITY)


def process_trail(trail_path):
    """Process all photos in a trail's photos directory."""
    photos_dir = trail_path / 'photos'

    if not photos_dir.exists():
        print(f"No photos directory found at {photos_dir}")
        return

    # Process each waypoint folder
    for waypoint_dir in sorted(photos_dir.iterdir()):
        if not waypoint_dir.is_dir():
            continue

        # Create thumbs subdirectory
        thumbs_dir = waypoint_dir / 'thumbs'
        thumbs_dir.mkdir(exist_ok=True)

        # Process each image
        for img_file in sorted(waypoint_dir.iterdir()):
            if img_file.is_dir():
                continue

            # Only process image files
            if img_file.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
                continue

            # Output path (always .jpg)
            thumb_name = img_file.stem + '.jpg'
            thumb_path = thumbs_dir / thumb_name

            print(f"  {img_file.name} -> thumbs/{thumb_name}")
            create_square_thumbnail(img_file, thumb_path)

        print(f"Processed waypoint {waypoint_dir.name}: {len(list(thumbs_dir.glob('*.jpg')))} thumbnails")


def main():
    # Find trails directory relative to script location
    script_dir = Path(__file__).parent
    trails_dir = script_dir.parent / 'trails'

    if not trails_dir.exists():
        print(f"Trails directory not found at {trails_dir}")
        return

    # Process each trail
    for trail_dir in sorted(trails_dir.iterdir()):
        if not trail_dir.is_dir():
            continue

        print(f"\nProcessing trail: {trail_dir.name}")
        process_trail(trail_dir)

    print("\nDone!")


if __name__ == '__main__':
    main()
