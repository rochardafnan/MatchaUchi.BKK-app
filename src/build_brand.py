"""Split the MatchaUchi logo into its emblem and its wordmark.

The supplied logo is one flat JPEG holding the hexagon, the brush lettering and
a tagline stacked together. Rendered small it turns to mush, and the masthead
was drawing its own "MATCHAUCHI" text underneath, so the name appeared twice.
Cutting the artwork into parts lets the emblem and the real brush lettering each
be placed and sized properly, on transparent ground so the kraft paper shows
through.
"""
import base64
import io

from PIL import Image

SRC = ("D:/Users/WoRochard/OneDrive - Central Group/Desktop/MatchaUchi/Photo/"
       "6D404D46-8B9F-432D-938C-6315448B311B.jpg")

# Bands measured from the source by ink-row profiling.
EMBLEM = (188, 115, 1095, 907)
WORDMARK = (189, 938, 1102, 1086)

# The brand green, a shade deeper so the lettering clears AA on kraft paper.
INK = (71, 108, 68)


def lift(box, pad=6):
    """Crop a band and key the white ground out to transparency.

    The art is a single colour on white, so coverage can be read straight off
    the greyscale: white is empty, the ink colour is solid, and the values
    between carry the anti-aliased edges.
    """
    im = Image.open(SRC).convert("RGB").crop(box)
    grey = im.convert("L")

    ink_level = min(grey.getextrema()[0] + 8, 150)
    span = 255 - ink_level
    alpha = grey.point(
        lambda v: 0 if v >= 252 else min(255, round((255 - v) * 255 / span))
    )

    out = Image.new("RGBA", im.size, INK + (0,))
    out.putalpha(alpha)

    padded = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    padded.alpha_composite(out, (pad, pad))
    return padded


def encode(im, width, quality=92):
    im = im.resize(
        (width, max(1, round(im.height * width / im.width))), Image.LANCZOS
    )
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=quality, method=6, lossless=False)
    return base64.b64encode(buf.getvalue()).decode("ascii"), buf.tell(), im.size


for name, box, width in (("emblem", EMBLEM, 320), ("wordmark", WORDMARK, 560)):
    b64, size, dims = encode(lift(box), width)
    open(f"{name}_b64.txt", "w").write(b64)
    print(f"{name:9s} {dims[0]}x{dims[1]}  {size/1024:5.1f} KB")
