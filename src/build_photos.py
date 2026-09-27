"""Build unified product imagery for the MatchaUchi ordering app.

Two sources feed one visual family:
  * cutouts  - tin renders lifted from the menu PDF (transparent, ragged sizes)
  * studio   - real photographs shot on a light seamless backdrop

Both are normalised onto the same warm paper backdrop at the same framing so the
menu never shows a mismatched tile.
"""
import io
import os
import json
import base64

import fitz
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

OUT = 448                     # exported square edge
CUT_DIR = "cut"
STUDIO_DIR = "D:/Users/WoRochard/OneDrive - Central Group/Desktop/MatchaUchi/Photo"
MENU = "D:/Users/WoRochard/OneDrive - Central Group/Desktop/MatchaUchi/MatchaUchi Menu.pdf"

# The printed menu's kraft stock, sampled from the PDF itself.
PAPER = (241, 235, 223)
BG_TOP = PAPER
BG_BOTTOM = (233, 226, 212)
SHADOW = (120, 103, 80)


def paper_tile(edge=240):
    """A seamless swatch of the menu's kraft stock, lifted from the PDF.

    The page background image is mirrored into a tile so it repeats without a
    visible seam, and its mean is pinned to PAPER so the tone matches the
    surface colour underneath exactly.
    """
    page = fitz.open(MENU)[0]
    xref = max(page.get_images(full=True), key=lambda i: i[2] * i[3])[0]
    sheet = Image.open(io.BytesIO(fitz.Pixmap(fitz.open(MENU), xref).tobytes("png")))
    sheet = sheet.convert("RGB")

    half = edge // 2
    x, y = sheet.width // 2, int(sheet.height * 0.62)   # plain stock, clear of art
    patch = sheet.crop((x, y, x + half, y + half))

    tile = Image.new("RGB", (edge, edge))
    tile.paste(patch, (0, 0))
    tile.paste(patch.transpose(Image.FLIP_LEFT_RIGHT), (half, 0))
    tile.paste(patch.transpose(Image.FLIP_TOP_BOTTOM), (0, half))
    tile.paste(patch.transpose(Image.ROTATE_180), (half, half))

    mean = [sum(c) / len(c) for c in (tile.getchannel(i).getdata() for i in range(3))]
    r, g, b = tile.split()
    tile = Image.merge("RGB", (
        r.point(lambda v: max(0, min(255, round(v + PAPER[0] - mean[0])))),
        g.point(lambda v: max(0, min(255, round(v + PAPER[1] - mean[1])))),
        b.point(lambda v: max(0, min(255, round(v + PAPER[2] - mean[2])))),
    ))
    return ImageEnhance.Contrast(tile).enhance(0.85)


def shadow_mask(size, box, strength=58):
    """Ellipse under the product so it sits on the page instead of floating."""
    left, top, right, bottom = box
    w = right - left
    layer = Image.new("L", size, 0)
    ImageDraw.Draw(layer).ellipse(
        (left + w * 0.10, bottom - w * 0.13, right - w * 0.10, bottom + w * 0.10),
        fill=strength,
    )
    return layer.filter(ImageFilter.GaussianBlur(size[0] * 0.032))


def from_cutout(path, fill=0.78):
    """Trim, centre and ground the product on a fully transparent canvas.

    The printed menu sets these tins straight onto the kraft stock, so the tile
    carries no background of its own -- the page's paper shows through, and only
    the product and its contact shadow are opaque.
    """
    im = Image.open(path).convert("RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)

    scale = (OUT * fill) / max(im.size)
    im = im.resize(
        (max(1, round(im.width * scale)), max(1, round(im.height * scale))),
        Image.LANCZOS,
    )

    left = (OUT - im.width) // 2
    top = int((OUT - im.height) * 0.46)

    canvas = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    mask = shadow_mask((OUT, OUT), (left, top, left + im.width, top + im.height))
    canvas.paste(Image.new("RGBA", (OUT, OUT), SHADOW + (255,)), (0, 0), mask)
    canvas.alpha_composite(im, (left, top))
    return canvas


def from_studio(path, focus=0.5, zoom=1.0):
    """Square-crop a photograph and warm its neutral studio backdrop."""
    im = Image.open(path).convert("RGB")

    edge = min(im.size) / zoom
    if im.width >= im.height:
        left = (im.width - edge) * focus
        top = (im.height - edge) / 2
    else:
        left = (im.width - edge) / 2
        top = (im.height - edge) * focus
    im = im.crop(
        (round(left), round(top), round(left + edge), round(top + edge))
    ).resize((OUT, OUT), Image.LANCZOS)

    # Warm the cool seamless slightly, weighted by v^2 so only bright areas move.
    r, g, b = im.split()
    r = r.point(lambda v: min(255, round(v + 9 * (v / 255) ** 2)))
    b = b.point(lambda v: max(0, round(v - 11 * (v / 255) ** 2)))
    im = Image.merge("RGB", (r, g, b))

    im = flatten_backdrop(im)
    return ImageEnhance.Color(im).enhance(1.03)


def flatten_backdrop(im, strength=0.92):
    """Lift a shot's seamless paper to the page tone without touching the product.

    The studio backdrop carries its own vignette, so untreated corners land far
    darker than the page and the tile reads as a grey box. Background pixels are
    identified as desaturated *and* bright, then further limited to the frame
    edges so a pale product in the centre is never flattened into the paper.
    """
    hsv = im.convert("HSV")
    desaturated = hsv.getchannel("S").point(
        lambda v: 255 if v <= 26 else max(0, 255 - (v - 26) * 10)
    )
    bright = hsv.getchannel("V").point(
        lambda v: 0 if v <= 120 else min(255, round((v - 120) * 2.6))
    )
    mask = ImageChops.multiply(desaturated, bright)

    w, h = im.size
    centre = Image.new("L", (w, h), 0)
    ImageDraw.Draw(centre).ellipse((w * 0.20, h * 0.17, w * 0.80, h * 0.86), fill=255)
    centre = centre.filter(ImageFilter.GaussianBlur(w * 0.15))
    mask = ImageChops.multiply(mask, ImageChops.invert(centre))

    mask = mask.filter(ImageFilter.GaussianBlur(w * 0.012))
    mask = mask.point(lambda v: round(v * strength))
    return Image.composite(paper_field(im.size), im, mask)


_TILE = None


def paper_field(size):
    """The kraft stock, tiled to fill `size`, so a photograph's flattened
    backdrop carries the same grain as the page behind it."""
    global _TILE
    if _TILE is None:
        _TILE = paper_tile()
    field = Image.new("RGB", size)
    for y in range(0, size[1], _TILE.height):
        for x in range(0, size[0], _TILE.width):
            field.paste(_TILE, (x, y))
    return field


def encode(im, quality=76):
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=quality, method=6)
    return base64.b64encode(buf.getvalue()).decode("ascii"), buf.tell()


S = lambda name: os.path.join(STUDIO_DIR, name)

# Confirmed by the shop (drink shots) or by the kanji on the tin.
STUDIO = {
    "hojicha":            (S("7E4337A1-2523-463B-9A96-54AA50B1E2E9.jpg"), 0.5, 1.18),
    "ochamura":           (S("F9ED3BFA-610C-4F23-BFDD-0BC31F71CA80.jpg"), 0.62, 1.0),
    "yame01":             (S("F9ED3BFA-610C-4F23-BFDD-0BC31F71CA80.jpg"), 0.62, 1.0),
    "yame02":             (S("F9ED3BFA-610C-4F23-BFDD-0BC31F71CA80.jpg"), 0.62, 1.0),
    "yame03":             (S("F9ED3BFA-610C-4F23-BFDD-0BC31F71CA80.jpg"), 0.62, 1.0),
    "yame04":             (S("F9ED3BFA-610C-4F23-BFDD-0BC31F71CA80.jpg"), 0.62, 1.0),
    # 若竹 on the tin
    "wakatake-marukyu":   (S("0563DF79-BBD1-4CA0-877D-296EC94C76C7.jpg"), 0.5, 1.12),
    "wakatake-coconut":   (S("2C1E7AE5-EDF9-46A6-A3ED-D79AAECF2A0E.jpg"), 0.5, 1.08),
    # 五十鈴 on the tin
    "isuzu":              (S("86EA048E-E304-4256-B544-02A4904F6FD7.jpg"), 0.5, 1.15),
    "mokuyame":           (S("4E8781FE-EADC-4B18-AE64-EE1550EAC05E.jpg"), 0.5, 1.06),
}

photos, report, total = {}, [], 0

for item, (path, focus, zoom) in STUDIO.items():
    b64, size = encode(from_studio(path, focus, zoom), quality=74)
    photos[item] = b64
    total += size
    report.append((item, "studio", size))

for fn in sorted(os.listdir(CUT_DIR)):
    item = fn.rsplit(".", 1)[0]
    if item in photos:
        continue
    # Alpha costs bytes, so cutouts ride a little lower on quality; they are
    # flat studio renders and hold up well.
    b64, size = encode(from_cutout(os.path.join(CUT_DIR, fn)), quality=64)
    photos[item] = b64
    total += size
    report.append((item, "cutout", size))

with open("photos_b64.json", "w") as fh:
    json.dump(photos, fh)

# Brand assets: the 1280px logo and the real PromptPay QR.
logo = Image.open(S("6D404D46-8B9F-432D-938C-6315448B311B.jpg")).convert("RGB")
logo.thumbnail((360, 360), Image.LANCZOS)
white = logo.convert("L").point(lambda v: 255 if v > 232 else 0)
logo.putalpha(white.point(lambda v: 255 - v))
buf = io.BytesIO()
logo.save(buf, format="WEBP", quality=90, method=6)
logo_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
open("logo_b64.txt", "w").write(logo_b64)

qr = Image.open(S("Promptpay.png")).convert("RGB")
qr.thumbnail((520, 520), Image.LANCZOS)
buf = io.BytesIO()
qr.save(buf, format="WEBP", quality=88, method=6)
qr_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
open("qr_b64.txt", "w").write(qr_b64)

buf = io.BytesIO()
paper_tile().save(buf, format="WEBP", quality=82, method=6)
paper_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
open("paper_b64.txt", "w").write(paper_b64)
print(f"paper tile={len(paper_b64)/1024:.0f} KB")

for item, kind, size in sorted(report, key=lambda r: -r[2])[:6]:
    print(f"  largest {item:26s} {kind:7s} {size/1024:6.1f} KB")
print(f"items={len(photos)}  photos={total/1024:.0f} KB  "
      f"logo={len(logo_b64)/1024:.0f} KB  qr={len(qr_b64)/1024:.0f} KB")
