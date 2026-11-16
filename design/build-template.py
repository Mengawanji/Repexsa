"""
Builds public/badge-template.png from design/badge-original.jpg.

The original badge is a flat image with a sample photo and placeholder text
baked in. This script produces a locked RGBA template that is pixel-identical
to the original everywhere except the three editable elements:

  * the sample photo is replaced by a transparent hole shaped like the inner
    edge of the blue ring (the blue ring itself is kept, un-mixed from its
    white backdrop so its anti-aliased edge composites cleanly over any photo);
  * the "Name Of Person" and "Class of 1997" placeholder text is inpainted out,
    and the white "Yaounde Chapter" text is removed from its blue pill
    (the app redraws all three lines with matching fonts and colours).

Run from the project root (requires numpy, pillow, opencv-python-headless):
    python design/build-template.py
"""
import numpy as np
import cv2
from PIL import Image

SRC = "design/badge-original.jpg"
OUT = "public/badge-template.png"

src = np.array(Image.open(SRC).convert("RGB"))
H, W, _ = src.shape
im = src.astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]

# --- 1. inpaint the placeholder name + class text -------------------------
mask = np.zeros((H, W), np.uint8)
for x0, y0, x1, y1 in [(196, 994, 668, 1054), (274, 1057, 572, 1102)]:
    mask[y0:y1, x0:x1] = ((b - r) > 40)[y0:y1, x0:x1] * 255
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
bgr = cv2.inpaint(cv2.cvtColor(src, cv2.COLOR_RGB2BGR), mask, 9, cv2.INPAINT_TELEA)
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(float)

# --- 1b. remove the white chapter text from the blue pill -----------------
# The pill is a flat fill, so paint its colour over the text area.
x0, y0, x1, y1 = 266, 1127, 597, 1171
pill = (b < 150) | (r > 40)  # anything that is not the pill's blue
pill_fill = np.median(src[y0:y1, x0:x1][~pill[y0:y1, x0:x1]], axis=0)
rgb[y0:y1, x0:x1] = pill_fill

# --- 2. photo hole: ellipse fitted to the blue ring's inner edge (+3px) ----
# Keep in sync with PHOTO_FRAME in src/lib/badge.ts.
X0, Y0, A, B = 428.06, 664.86, 261.02 + 3, 254.01 + 3
yy, xx = np.mgrid[0:H, 0:W].astype(float)
e = np.sqrt(((xx - X0) / A) ** 2 + ((yy - Y0) / B) ** 2)
outside = np.clip((e - 1) * min(A, B) + 0.5, 0, 1)  # 1px anti-aliased edge

# --- 3. keep the blue ring inside the hole ---------------------------------
strict = (src[..., 2] > 160) & (src[..., 0] < 50) & (src[..., 1] < 100)
ring = src[(e < 1) & strict].mean(0)
CX, CY = 427.7, 659.0
dd = np.hypot(xx - CX, yy - CY)
aa = np.degrees(np.arctan2(CY - yy, xx - CX)) % 360
inner = np.full(720, np.inf)  # ring inner radius per half-degree
for i in range(720):
    t = np.radians(i / 2)
    for rr in np.arange(235, 284, 0.25):
        x = int(round(CX + rr * np.cos(t)))
        y = int(round(CY - rr * np.sin(t)))
        if strict[y, x]:
            inner[i] = rr
            break
zone = dd >= inner[(aa * 2).astype(int) % 720] - 1.5
blueness = np.clip((b - r) / (ring[2] - ring[0]), 0, 1)
alpha_ring = np.where(zone, blueness, 0)
alpha_ring[alpha_ring < 0.04] = 0

# Where the ring's inner edge lies outside the ellipse, open the hole up to the
# ring too, so no leftover sample-photo pixels remain between photo and ring.
inner_map = inner[(aa * 2).astype(int) % 720]
inside_ring = np.isfinite(inner_map) & (dd < inner_map - 1.5)
outside = outside * ~inside_ring

alpha = np.maximum(outside, alpha_ring * (1 - outside))
col = rgb * outside[..., None] + np.broadcast_to(ring, (H, W, 3)) * (1 - outside[..., None])
out = np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)
Image.fromarray(out, "RGBA").save(OUT, optimize=True)
print("wrote", OUT)
