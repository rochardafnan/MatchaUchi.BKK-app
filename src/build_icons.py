"""Home-screen icons for the installed app.

A phone icon is small and sits among other icons, so the wordmark is dropped
and only the emblem is used, on the menu's own paper. Android may crop an icon
to a circle, a squircle or a rounded square depending on the launcher, so the
maskable sizes keep the emblem well inside the safe circle rather than letting
a corner be shaved off.
"""
import base64
import io
import os

from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'icons')
PAPER = (241, 235, 223)      # --paper

os.makedirs(OUT, exist_ok=True)


def load(name):
    return Image.open(io.BytesIO(base64.b64decode(open(name).read().strip())))


emblem = load("emblem_b64.txt").convert("RGBA")
tile = load("paper_b64.txt").convert("RGB")


def backdrop(size):
    """The kraft tile, repeated, so the icon carries the menu's texture."""
    bg = Image.new("RGB", (size, size), PAPER)
    for y in range(0, size, tile.height):
        for x in range(0, size, tile.width):
            bg.paste(tile, (x, y))
    return bg


def icon(size, inset):
    """`inset` is the share of the width left clear around the emblem."""
    bg = backdrop(size).convert("RGBA")
    room = round(size * (1 - inset * 2))
    art = emblem.copy()
    art.thumbnail((room, room), Image.LANCZOS)
    bg.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return bg.convert("RGB")


# Plain icons: the emblem can sit fairly large, nothing is cropped.
for size in (192, 512):
    p = os.path.join(OUT, "icon-%d.png" % size)
    icon(size, 0.14).save(p, optimize=True)
    print("wrote", p)

# Maskable: a launcher may crop to a circle, which on a square icon cuts in to
# about 10% a side. Holding the emblem inside 80% keeps it whole either way.
for size in (192, 512):
    p = os.path.join(OUT, "icon-%d-maskable.png" % size)
    icon(size, 0.24).save(p, optimize=True)
    print("wrote", p)

# iOS uses its own fixed size and applies its own rounding, so no bleed needed.
p = os.path.join(OUT, "apple-touch-icon.png")
icon(180, 0.14).save(p, optimize=True)
print("wrote", p)

for f in sorted(os.listdir(OUT)):
    full = os.path.join(OUT, f)
    print("  %-28s %6.1f KB  %s" % (f, os.path.getsize(full) / 1024,
                                    Image.open(full).size))
