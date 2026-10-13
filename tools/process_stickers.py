"""Trim, square-pad and resize generated sticker PNGs; build app icons from the anchor sticker.

Usage: python3 tools/process_stickers.py <raw_dir>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
APP_SIZE = 640
PACK_SIZE = 512
MARGIN = 0.04
CREAM = (251, 244, 234, 255)


def trim_to_square(image, margin=MARGIN):
    alpha = image.getchannel("A")
    bbox = alpha.getbbox() or (0, 0, image.width, image.height)
    cropped = image.crop(bbox)
    side = int(max(cropped.size) * (1 + margin * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    offset = ((side - cropped.width) // 2, (side - cropped.height) // 2)
    canvas.alpha_composite(cropped, offset)
    return canvas


def save_resized(image, size, path):
    image.resize((size, size), Image.LANCZOS).save(path, optimize=True)


def rounded_icon(sticker, size, scale, radius_ratio=0.0):
    icon = Image.new("RGBA", (size, size), CREAM)
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        (size * 0.12, size * 0.18, size * 0.88, size * 0.94), fill=(246, 183, 154, 110)
    )
    icon.alpha_composite(glow)
    inner = int(size * scale)
    art = sticker.resize((inner, inner), Image.LANCZOS)
    icon.alpha_composite(art, ((size - inner) // 2, (size - inner) // 2 + int(size * 0.02)))
    if radius_ratio:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), int(size * radius_ratio), fill=255)
        icon.putalpha(mask)
    return icon


def build_icons(anchor):
    icons = ROOT / "icons"
    icons.mkdir(exist_ok=True)
    rounded_icon(anchor, 1024, 0.86).convert("RGB").save(icons / "icon-1024.png", optimize=True)
    rounded_icon(anchor, 512, 0.86).convert("RGB").save(icons / "icon-512.png", optimize=True)
    rounded_icon(anchor, 192, 0.86).convert("RGB").save(icons / "icon-192.png", optimize=True)
    rounded_icon(anchor, 180, 0.86).convert("RGB").save(icons / "apple-touch-icon.png", optimize=True)
    rounded_icon(anchor, 512, 0.66).convert("RGB").save(icons / "maskable-512.png", optimize=True)


def main(raw_dir):
    app_dir = ROOT / "stickers"
    pack_dir = ROOT / "stickerpack"
    app_dir.mkdir(exist_ok=True)
    pack_dir.mkdir(exist_ok=True)
    for src in sorted(Path(raw_dir).glob("*.png")):
        squared = trim_to_square(Image.open(src).convert("RGBA"))
        save_resized(squared, APP_SIZE, app_dir / src.name)
        save_resized(squared, PACK_SIZE, pack_dir / f"persik-{src.stem}.png")
        print(f"{src.stem}: {squared.size[0]}px -> {APP_SIZE}/{PACK_SIZE}")
    build_icons(trim_to_square(Image.open(Path(raw_dir) / "fed.png").convert("RGBA"), margin=0.0))
    print("icons ok")


if __name__ == "__main__":
    main(sys.argv[1])
