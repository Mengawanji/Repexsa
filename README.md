# REPEXSA 2026 Badge Editor

Mobile-friendly editor for the REPEXSA 2026 AGM badge. Users upload a photo, position/zoom it inside the frame, enter their name and class, and download a PNG (1726 × 2560).

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## How it works

- `design/badge-original.jpg` is the original artwork (863 × 1280).
- `design/build-template.py` turns it into `public/badge-template.png`, a locked RGBA template that is identical to the original except that the sample photo is a transparent hole and the placeholder name/class text has been removed.
- `src/lib/badge.ts` renders the badge on a canvas in this order: white backdrop, user photo, template, name and class text. The preview and the download both use the same `drawBadge()` call, so the exported PNG matches the preview.
- Fonts matched to the artwork: Hanken Grotesk 800 italic (name) and Montserrat 400 italic (class), loaded through `next/font`.
- Long names shrink automatically to fit between the side bars.

To regenerate the template (requires numpy, pillow, opencv-python-headless): `python design/build-template.py`.
