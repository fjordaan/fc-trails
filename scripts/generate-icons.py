#!/usr/bin/env python3
"""
Generate favicon and PWA icons from fcf-logo.png
"""

from pathlib import Path
from PIL import Image

def generate_icons():
    script_dir = Path(__file__).parent
    root_dir = script_dir.parent

    logo_path = root_dir / 'images' / 'fcf-logo.png'
    icons_dir = root_dir / 'icons'
    icons_dir.mkdir(exist_ok=True)

    with Image.open(logo_path) as img:
        # Ensure RGBA mode
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        # Generate PWA icons (keep transparency)
        sizes = [192, 512]
        for size in sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            output_path = icons_dir / f'icon-{size}.png'
            resized.save(output_path, 'PNG')
            print(f'Created {output_path.name} ({size}x{size})')

        # Generate Apple Touch Icon (180x180, with background since iOS doesn't handle transparency well)
        apple_size = 180
        # Create white background
        background = Image.new('RGB', (apple_size, apple_size), (255, 255, 255))
        resized = img.resize((apple_size, apple_size), Image.Resampling.LANCZOS)
        # Paste with alpha mask
        background.paste(resized, (0, 0), resized)
        output_path = icons_dir / 'apple-touch-icon.png'
        background.save(output_path, 'PNG')
        print(f'Created {output_path.name} ({apple_size}x{apple_size})')

        # Generate favicon sizes
        favicon_sizes = [16, 32, 48]
        favicon_images = []
        for size in favicon_sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            # Convert to RGB with white background for ICO
            background = Image.new('RGB', (size, size), (255, 255, 255))
            background.paste(resized, (0, 0), resized)
            favicon_images.append(background)

        # Save as ICO with multiple sizes
        output_path = icons_dir / 'favicon.ico'
        favicon_images[0].save(
            output_path,
            format='ICO',
            sizes=[(16, 16), (32, 32), (48, 48)],
            append_images=favicon_images[1:]
        )
        print(f'Created {output_path.name} (16x16, 32x32, 48x48)')

        # Also create a 32x32 PNG favicon for modern browsers
        resized = img.resize((32, 32), Image.Resampling.LANCZOS)
        output_path = icons_dir / 'favicon-32.png'
        resized.save(output_path, 'PNG')
        print(f'Created {output_path.name} (32x32)')

    print('\nDone!')

if __name__ == '__main__':
    generate_icons()
