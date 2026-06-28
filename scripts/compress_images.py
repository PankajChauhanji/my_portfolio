import os
from PIL import Image

def compress_gallery(directory, max_width=2000, quality=86):
    for filename in os.listdir(directory):
        if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
            filepath = os.path.join(directory, filename)
            
            with Image.open(filepath) as img:
                # Fix orientation issues from camera metadata if any exist
                try:
                    if hasattr(img, '_getexif'):
                        exif = img._getexif()
                        if exif:
                            orientation = exif.get(0x0112)
                            if orientation == 3: img = img.rotate(180, expand=True)
                            elif orientation == 6: img = img.rotate(270, expand=True)
                            elif orientation == 8: img = img.rotate(90, expand=True)
                except Exception:
                    pass

                # Calculate new dimensions keeping the aspect ratio
                w_percent = (max_width / float(img.size[0]))
                if w_percent < 1.0:  # Only downscale if larger than max_width
                    h_size = int((float(img.size[1]) * float(w_percent)))
                    img = img.resize((max_width, h_size), Image.Resampling.LANCZOS)
                
                # Generate new webp path
                base_name = os.path.splitext(filename)[0]
                output_path = os.path.join(directory, f"{base_name}.webp")
                
                # Save as WebP
                img.save(output_path, "WEBP", quality=quality, optimize=True)
                print(f"Optimized: {filename} -> {base_name}.webp ({os.path.getsize(output_path)//1024} KB)")

# Run the compression on your specific folder
compress_gallery("/home/pankaj/Documents/git_hub/portfolio/static/img/valley_of_flowers")