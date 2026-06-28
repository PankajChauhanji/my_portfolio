"""
compress_gallery.py
Compress 4K images to WebP with binary-search quality tuning to hit a target file-size range.
Dependencies: pip install Pillow piexif
"""

import io
from pathlib import Path
from PIL import Image, UnidentifiedImageError

try:
    import piexif
    PIEXIF_AVAILABLE = True
except ImportError:
    PIEXIF_AVAILABLE = False

SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"}
ORIENTATION_ROTATIONS = {3: 180, 6: 270, 8: 90}


def fix_orientation(img):
    try:
        if PIEXIF_AVAILABLE and "exif" in img.info:
            orientation = piexif.load(img.info["exif"]).get("0th", {}).get(piexif.ImageIFD.Orientation, 1)
        elif hasattr(img, "_getexif") and callable(img._getexif):
            orientation = (img._getexif() or {}).get(0x0112, 1)
        else:
            return img
        rotation = ORIENTATION_ROTATIONS.get(orientation)
        if rotation:
            img = img.rotate(rotation, expand=True)
    except Exception:
        pass
    return img


def downscale(img, max_width, max_height):
    scale = min(max_width / img.size[0], max_height / img.size[1], 1.0)
    if scale < 1.0:
        img = img.resize((int(img.size[0] * scale), int(img.size[1] * scale)), Image.Resampling.LANCZOS)
    return img


def tune_quality(img, min_bytes, max_bytes, q_min=40, q_max=95):
    lo, hi = q_min, q_max
    best_data, best_q = encode_webp(img, lo), lo
    while lo <= hi:
        mid = (lo + hi) // 2
        data = encode_webp(img, mid)
        best_data, best_q = data, mid
        lo, hi = (mid + 1, hi) if len(data) <= max_bytes else (lo, mid - 1)
    return best_data, best_q


def encode_webp(img, quality):
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


def compress_gallery(
    directory,
    max_width=2000,
    max_height=2000,
    min_size_kb=100,
    max_size_kb=500,
    quality_floor=40,
    quality_ceiling=95,
    keep_originals=True,
):
    source_dir = Path(directory)
    min_bytes, max_bytes = int(min_size_kb * 1024), int(max_size_kb * 1024)
    processed = errors = total_saved = 0

    for filepath in sorted(p for p in source_dir.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_EXT):
        output_path = filepath.with_suffix(".webp")
        if output_path.exists() and filepath.suffix.lower() != ".webp":
            print(f"  SKIP  {filepath.name}")
            continue
        try:
            with Image.open(filepath) as img:
                img.load()
                original_size = filepath.stat().st_size
                img = fix_orientation(img)
                if img.mode == "P":    img = img.convert("RGBA")
                if img.mode == "CMYK": img = img.convert("RGB")
                img = downscale(img, max_width, max_height)
                output_data, quality_used = tune_quality(img, min_bytes, max_bytes, quality_floor, quality_ceiling)

            output_path.write_bytes(output_data)
            if not keep_originals and filepath.suffix.lower() != ".webp":
                filepath.unlink()

            saved = original_size - len(output_data)
            total_saved += max(saved, 0)
            in_range = min_bytes <= len(output_data) <= max_bytes
            print(f"  {'OK  ' if in_range else 'WARN'} {filepath.name} → q{quality_used} {len(output_data)//1024}KB (saved {saved//1024}KB)")
            processed += 1

        except UnidentifiedImageError:
            print(f"  ERR  {filepath.name} — not a valid image")
            errors += 1
        except Exception as e:
            print(f"  ERR  {filepath.name} — {e}")
            errors += 1

    print(f"\nDone: {processed} converted, {errors} error(s), {total_saved//1024}KB saved total.")


# ── Run ───────────────────────────────────────────────────────────────────────
compress_gallery(
    directory="/home/pankaj/Documents/git_hub/portfolio/static/img/valley_of_flowers",
    max_width=2000,
    max_height=2000,
    min_size_kb=100,
    max_size_kb=500,
    quality_floor=40,
    quality_ceiling=95,
    keep_originals=True,
)