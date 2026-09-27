"""Lift the bare PromptPay code out of its decorated card.

The supplied artwork wraps the code in a printed banner -- "SCAN TO PAY", an
orange frame, a thank-you line. Only the code itself is needed on screen, and it
scans more reliably with a proper quiet zone, which the original card does not
give it (barely 9px of white on either side against a required four modules).
"""
import base64
import io

from PIL import Image

SRC = ("D:/Users/WoRochard/OneDrive - Central Group/Desktop/MatchaUchi/Photo/"
       "Promptpay.png")

CODE = (92, 117, 301, 327)   # the modules alone, measured off the card
SCALE = 2                     # integer upscale keeps module edges hard
QUIET = 0.13                  # quiet zone as a share of the code's width

code = Image.open(SRC).convert("RGB").crop(CODE)

# Nearest-neighbour at a whole multiple: no resampling softness on the modules.
side = code.width * SCALE
code = code.resize((side, side), Image.NEAREST)

pad = round(side * QUIET)
canvas = Image.new("RGB", (side + pad * 2, side + pad * 2), (255, 255, 255))
canvas.paste(code, (pad, pad))

buf = io.BytesIO()
canvas.save(buf, format="WEBP", lossless=True, method=6)
b64 = base64.b64encode(buf.getvalue()).decode("ascii")
open("qr_b64.txt", "w").write(b64)
canvas.save("verify_qr.png")

print(f"code {code.width}x{code.height} -> canvas {canvas.width}x{canvas.height}"
      f"  {buf.tell()/1024:.1f} KB")

try:
    import cv2
    import numpy as np

    data, *_ = cv2.QRCodeDetector().detectAndDecode(
        cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)
    )
    print("decodes:", repr(data[:80]) if data else "NO READ")
except ImportError:
    print("decodes: (opencv unavailable - not verified)")
