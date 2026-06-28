"""
compress_gallery.py
-------------------
Compress 4K images to WebP for optimal web/UI delivery.

Features:
  - EXIF-aware auto-rotation (uses piexif for reliability)
  - Aspect-ratio-preserving downscale (never upscales)
  - Binary-search quality tuning to hit a target file-size range
  - Skips already-optimised files (avoids redundant re-compression)
  - Dry-run mode to preview changes without writing files
  - Summary report at the end

Usage:
  python compress_gallery.py                      # runs with defaults
  python compress_gallery.py --help               # full CLI help

Dependencies:
  pip install Pillow piexif
"""

import argparse
import io
import os
import sys
from pathlib import Path

from PIL import Image, UnidentifiedImageError

# piexif is optional but strongly preferred for reliable EXIF orientation handling
try:
    import piexif
    PIEXIF_AVAILABLE = True
except ImportError:
    PIEXIF_AVAILABLE = False

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"}
EXIF_ORIENTATION_TAG = 0x0112

ORIENTATION_ROTATIONS = {
    3: 180,
    6: 270,
    8: 90,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fix_orientation(img: Image.Image) -> Image.Image:
    """
    Rotate image according to its EXIF orientation tag so it displays
    correctly regardless of camera model.

    Prefers piexif (more reliable across formats); falls back to the
    legacy _getexif() approach if piexif is not installed.
    """
    try:
        if PIEXIF_AVAILABLE and "exif" in img.info:
            exif_dict = piexif.load(img.info["exif"])
            orientation = exif_dict.get("0th", {}).get(piexif.ImageIFD.Orientation, 1)
        elif hasattr(img, "_getexif") and callable(img._getexif):
            raw = img._getexif()
            orientation = (raw or {}).get(EXIF_ORIENTATION_TAG, 1)
        else:
            return img

        rotation = ORIENTATION_ROTATIONS.get(orientation)
        if rotation:
            img = img.rotate(rotation, expand=True)
    except Exception:
        # Never crash on metadata issues; just return the image as-is
        pass

    return img


def downscale_if_needed(img: Image.Image, max_width: int, max_height: int) -> Image.Image:
    """
    Shrink the image so that neither dimension exceeds its maximum.
    Never upscales. Preserves aspect ratio.
    """
    orig_w, orig_h = img.size
    scale = min(max_width / orig_w, max_height / orig_h, 1.0)  # 1.0 = never upscale
    if scale == 1.0:
        return img
    new_w = int(orig_w * scale)
    new_h = int(orig_h * scale)
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)


def encode_webp(img: Image.Image, quality: int) -> bytes:
    """Encode image to WebP bytes at the given quality (1-100)."""
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


def tune_quality(
    img: Image.Image,
    min_size_bytes: int,
    max_size_bytes: int,
    quality_min: int = 40,
    quality_max: int = 95,
) -> tuple[bytes, int]:
    """
    Binary-search over WebP quality levels to find the highest quality
    whose output file size falls within [min_size_bytes, max_size_bytes].

    Returns (encoded_bytes, quality_used).

    Edge cases:
    - If even quality_min exceeds max_size_bytes → use quality_min anyway
      (best we can do without destroying the image).
    - If quality_max is still under min_size_bytes → use quality_max
      (image is already small; don't inflate it artificially).
    """
    lo, hi = quality_min, quality_max
    best_data = encode_webp(img, lo)
    best_quality = lo

    while lo <= hi:
        mid = (lo + hi) // 2
        data = encode_webp(img, mid)
        size = len(data)

        if min_size_bytes <= size <= max_size_bytes:
            # Valid range — keep going up to maximise quality
            best_data, best_quality = data, mid
            lo = mid + 1
        elif size < min_size_bytes:
            # Too small → increase quality
            best_data, best_quality = data, mid
            lo = mid + 1
        else:
            # Too large → reduce quality
            hi = mid - 1

    return best_data, best_quality


def format_kb(n_bytes: int) -> str:
    return f"{n_bytes / 1024:.1f} KB"


# ---------------------------------------------------------------------------
# Core processor
# ---------------------------------------------------------------------------

def compress_gallery(
    directory: str,
    max_width: int = 2000,
    max_height: int = 2000,
    min_size_kb: float = 100,
    max_size_kb: float = 500,
    quality_floor: int = 40,
    quality_ceiling: int = 95,
    dry_run: bool = False,
    keep_originals: bool = True,
) -> None:
    """
    Compress all supported images in *directory* to WebP format, tuning
    quality so each output lands within [min_size_kb, max_size_kb].

    Parameters
    ----------
    directory       : Folder to process (non-recursive).
    max_width       : Maximum output width in pixels.
    max_height      : Maximum output height in pixels.
    min_size_kb     : Lower bound for output file size (default 100 KB).
    max_size_kb     : Upper bound for output file size (default 500 KB).
    quality_floor   : Lowest WebP quality the binary search may use.
    quality_ceiling : Highest WebP quality the binary search may use.
    dry_run         : Preview what would happen without writing any files.
    keep_originals  : If False, deletes the source file after conversion.
    """
    if quality_floor >= quality_ceiling:
        sys.exit("Error: quality_floor must be less than quality_ceiling.")
    if min_size_kb >= max_size_kb:
        sys.exit("Error: min_size_kb must be less than max_size_kb.")

    source_dir = Path(directory)
    if not source_dir.is_dir():
        sys.exit(f"Error: '{directory}' is not a valid directory.")

    min_bytes = int(min_size_kb * 1024)
    max_bytes = int(max_size_kb * 1024)

    candidates = sorted(
        p for p in source_dir.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not candidates:
        print("No supported images found in the directory.")
        return

    # ---- Summary counters ----
    total = len(candidates)
    processed = skipped = errors = 0
    total_saved_bytes = 0

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Processing {total} image(s) in: {source_dir}\n")
    print(f"  Target size : {min_size_kb:.0f} KB – {max_size_kb:.0f} KB")
    print(f"  Max dims    : {max_width} × {max_height} px")
    print(f"  Quality     : {quality_floor} – {quality_ceiling}")
    print("-" * 60)

    for filepath in candidates:
        output_path = filepath.with_suffix(".webp")

        # Skip if a WebP counterpart already exists (and we're not re-processing WebP itself)
        if output_path.exists() and filepath.suffix.lower() != ".webp":
            print(f"  SKIP  {filepath.name} (output already exists)")
            skipped += 1
            continue

        try:
            with Image.open(filepath) as img:
                img.load()  # Force full decode before closing the file handle

                original_size = filepath.stat().st_size
                original_mode = img.mode

                # --- Orientation ---
                img = fix_orientation(img)

                # --- Colour space normalisation ---
                # WebP does not support palette or CMYK natively
                if img.mode == "P":
                    img = img.convert("RGBA")
                elif img.mode == "CMYK":
                    img = img.convert("RGB")

                # --- Downscale ---
                img = downscale_if_needed(img, max_width, max_height)
                new_dims = img.size

                # --- Quality tuning ---
                output_data, quality_used = tune_quality(
                    img, min_bytes, max_bytes, quality_floor, quality_ceiling
                )

            output_size = len(output_data)
            saved = original_size - output_size
            in_range = min_bytes <= output_size <= max_bytes

            size_flag = "" if in_range else " ⚠ outside target range"

            print(
                f"  OK    {filepath.name}"
                f"\n        {original_mode} {filepath.stat().st_size // 1024} KB"
                f" → WebP q{quality_used} {output_size // 1024} KB"
                f" | dims {new_dims[0]}×{new_dims[1]}"
                f"{size_flag}"
            )

            if not dry_run:
                output_path.write_bytes(output_data)
                if not keep_originals and filepath.suffix.lower() != ".webp":
                    filepath.unlink()

            processed += 1
            total_saved_bytes += max(saved, 0)

        except UnidentifiedImageError:
            print(f"  ERR   {filepath.name} — not a valid image file")
            errors += 1
        except Exception as exc:
            print(f"  ERR   {filepath.name} — {exc}")
            errors += 1

    # ---- Final report ----
    print("-" * 60)
    print(
        f"\nDone. {processed} converted, {skipped} skipped, {errors} error(s)."
        f"\nTotal space saved: {format_kb(total_saved_bytes)}"
        + (" (dry run — no files written)" if dry_run else "")
        + "\n"
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compress 4K images to WebP for web/UI delivery.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("directory", nargs="?",
                        default="/home/pankaj/Documents/git_hub/portfolio/static/img/valley_of_flowers",
                        help="Path to image folder")
    parser.add_argument("--max-width",  type=int,   default=2000,  help="Max output width in pixels")
    parser.add_argument("--max-height", type=int,   default=2000,  help="Max output height in pixels")
    parser.add_argument("--min-size",   type=float, default=100.0, help="Minimum output size in KB")
    parser.add_argument("--max-size",   type=float, default=500.0, help="Maximum output size in KB")
    parser.add_argument("--quality-floor",   type=int, default=40, help="Lowest WebP quality allowed")
    parser.add_argument("--quality-ceiling", type=int, default=95, help="Highest WebP quality allowed")
    parser.add_argument("--dry-run",         action="store_true",  help="Preview without writing files")
    parser.add_argument("--delete-originals",action="store_true",  help="Remove source files after conversion")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    compress_gallery(
        directory=args.directory,
        max_width=args.max_width,
        max_height=args.max_height,
        min_size_kb=args.min_size,
        max_size_kb=args.max_size,
        quality_floor=args.quality_floor,
        quality_ceiling=args.quality_ceiling,
        dry_run=args.dry_run,
        keep_originals=not args.delete_originals,
    )