"""Print-ready QR poster for the shop counter.

Scan reliability comes first: the code itself is plain dark modules on a plain
light card, at high error-correction so the centre emblem doesn't break it.
Everything else -- kraft texture, wordmark, caption -- sits outside that card,
where it can be as branded as it likes without risking a failed scan.
"""
import base64
import io

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

URL = "https://matchauchibkk.netlify.app"

INK = (42, 33, 24)          # near-black brown -- the app's --ink
PAPER = (241, 235, 223)     # the app's --paper
CARD = (251, 249, 244)      # near-white, where the QR itself lives
MATCHA = (71, 108, 68)

W = 1600


def load(name):
    return Image.open(io.BytesIO(base64.b64decode(open(name).read().strip())))


def paper_background(size):
    tile = load("paper_b64.txt").convert("RGB")
    bg = Image.new("RGB", size)
    for y in range(0, size[1], tile.height):
        for x in range(0, size[0], tile.width):
            bg.paste(tile, (x, y))
    return bg


def font(size, bold=False):
    # Segoe UI has no Thai glyphs at all -- silently drawing tofu boxes for
    # every Thai caption -- so Leelawadee UI (Windows' actual Thai UI face)
    # goes first; it also covers Latin fine, so one face does both scripts.
    names = ["LeelaUIb.ttf", "tahomabd.ttf"] if bold else ["LeelawUI.ttf", "tahoma.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except OSError:
            continue
    return ImageFont.load_default()


def centred_text(draw, cx, y, text, fnt, fill):
    w = draw.textlength(text, font=fnt)
    draw.text((cx - w / 2, y), text, font=fnt, fill=fill)
    return w


# ---- the QR itself: plain, high-contrast, high error correction ----
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=20, border=3)
qr.add_data(URL)
qr.make(fit=True)
code = qr.make_image(fill_color=INK, back_color=CARD).convert("RGB")

# Emblem in the centre, backed by a plain card so it reads as a clean cutout
# rather than modules half-covered by a transparent edge.
emblem = load("emblem_b64.txt").convert("RGBA")
patch = round(code.width * 0.24)
emblem.thumbnail((round(patch * 0.72), round(patch * 0.72)), Image.LANCZOS)

plate = Image.new("RGBA", (patch, patch), CARD + (255,))
ImageDraw.Draw(plate).rounded_rectangle(
    (0, 0, patch - 1, patch - 1), radius=round(patch * 0.16),
    outline=INK, width=3
)
plate.alpha_composite(emblem, ((patch - emblem.width) // 2, (patch - emblem.height) // 2))
code.paste(plate, ((code.width - patch) // 2, (code.height - patch) // 2), plate)

# ---- the poster: kraft paper, wordmark, the QR card, a caption ----
pad = round(W * 0.07)
card_w = W - pad * 2
qr_w = round(card_w * 0.86)
code = code.resize((qr_w, qr_w), Image.LANCZOS)

wordmark = load("wordmark_b64.txt").convert("RGBA")
wm_w = round(card_w * 0.62)
wordmark = wordmark.resize((wm_w, round(wordmark.height * wm_w / wordmark.width)), Image.LANCZOS)

emblem_top = load("emblem_b64.txt").convert("RGBA")
em_w = round(card_w * 0.26)
emblem_top = emblem_top.resize((em_w, round(emblem_top.height * em_w / emblem_top.width)), Image.LANCZOS)

# English leads and Thai follows, the same order the printed menu uses.
f_caption_en = font(round(W * 0.031), bold=True)
f_caption_th = font(round(W * 0.028))
f_branch = font(round(W * 0.024), bold=True)

gap = round(W * 0.035)
h = (pad + emblem_top.height + gap + wordmark.height + gap * 1.4 + qr_w + gap * 1.3
     + f_caption_en.size + 18 + f_caption_th.size + gap + f_branch.size + pad)

poster = paper_background((W, round(h)))
draw = ImageDraw.Draw(poster)
cx = W // 2
y = pad

poster.paste(emblem_top, (cx - emblem_top.width // 2, y), emblem_top)
y += emblem_top.height + gap
poster.paste(wordmark, (cx - wordmark.width // 2, y), wordmark)
y += wordmark.height + round(gap * 1.4)

card_top = y
ImageDraw.Draw(poster).rounded_rectangle(
    (cx - qr_w // 2 - 24, card_top - 24, cx + qr_w // 2 + 24, card_top + qr_w + 24),
    radius=28, fill=CARD, outline=INK, width=2
)
poster.paste(code, (cx - qr_w // 2, card_top))
y = card_top + qr_w + round(gap * 1.3)

centred_text(draw, cx, y, "Scan to view the menu and order", f_caption_en, INK)
y += f_caption_en.size + 18
centred_text(draw, cx, y, "สแกนเพื่อดูเมนูและสั่งเครื่องดื่ม", f_caption_th, MATCHA)
y += f_caption_th.size + gap
centred_text(draw, cx, y, "MatchaUchi · สาขากรุงเทพฯ ปิ่นเกล้า", f_branch, INK)

poster = poster.convert("RGB")
poster.save("qr_poster.png", dpi=(300, 300))
print("poster:", poster.size, "-> qr_poster.png")

# Decode the finished poster to prove the emblem did not break the scan.
try:
    import numpy as np
    import cv2

    ok, data, *_ = cv2.QRCodeDetector().detectAndDecodeMulti(
        cv2.cvtColor(np.array(poster), cv2.COLOR_RGB2BGR)
    )[0:2]
    print("decoded URL:", data[0] if data else "NO READ")
except Exception as e:
    print("decode check skipped:", e)
