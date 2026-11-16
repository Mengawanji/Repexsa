// Badge geometry and rendering. All coordinates are in template pixels
// (the original artwork is 863 x 1280). Preview and download both go through
// drawBadge(), so the exported PNG is exactly what the user sees.

export const BADGE_WIDTH = 863;
export const BADGE_HEIGHT = 1280;
export const TEMPLATE_SRC = "/badge-template.png";

/** Ellipse behind the transparent photo hole in the template (see design/build-template.py). */
export const PHOTO_FRAME = { cx: 428.06, cy: 664.86, rx: 264.02, ry: 257.01 } as const;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export interface TextSpec {
  font: string; // CSS font-family list
  weight: number;
  size: number;
  letterSpacingEm: number;
  /** Horizontal squeeze applied to the glyphs (the artwork condenses some lines). */
  scaleX?: number;
  color: string;
  /** Horizontal centre of the ink, measured on the original artwork. */
  centerX: number;
  baseline: number;
  maxWidth: number;
  placeholder: string;
}

export interface PhotoState {
  image: HTMLImageElement;
  zoom: number;
  /** Offset of the photo centre from the frame centre, in template pixels. */
  offsetX: number;
  offsetY: number;
}

export interface BadgeContent {
  template: HTMLImageElement;
  photo: PhotoState | null;
  name: string;
  classText: string;
  chapterText: string;
  nameSpec: TextSpec;
  classSpec: TextSpec;
  chapterSpec: TextSpec;
}

export function makeTextSpecs(nameFamily: string, classFamily: string) {
  const nameSpec: TextSpec = {
    font: nameFamily,
    weight: 800,
    size: 64.6,
    letterSpacingEm: -0.0238,
    color: "#0143cf",
    centerX: 431.5,
    baseline: 1047.5,
    maxWidth: 680,
    placeholder: "Name Of Person",
  };
  const classSpec: TextSpec = {
    font: classFamily,
    weight: 400,
    size: 43.3,
    letterSpacingEm: 0.0212,
    color: "#0d3db2",
    centerX: 423.5,
    baseline: 1095.5,
    maxWidth: 620,
    placeholder: "Batch of 2004",
  };
  // White text inside the blue pill under the class line.
  const chapterSpec: TextSpec = {
    font: classFamily,
    weight: 400,
    size: 37.7,
    letterSpacingEm: 0.0212,
    scaleX: 0.895,
    color: "#ffffff",
    centerX: 431,
    baseline: 1160.5,
    maxWidth: 350,
    placeholder: "Yaounde Chapter",
  };
  return { nameSpec, classSpec, chapterSpec };
}

export function fontString(spec: TextSpec, size = spec.size) {
  return `italic ${spec.weight} ${size}px ${spec.font}`;
}

/** Scaled size of the photo so it exactly covers the frame at zoom 1. */
function photoSize(image: HTMLImageElement, zoom: number) {
  const fw = PHOTO_FRAME.rx * 2;
  const fh = PHOTO_FRAME.ry * 2;
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const scale = Math.max(fw / iw, fh / ih) * zoom;
  return { w: iw * scale, h: ih * scale };
}

/** Keep the photo covering the whole frame so no gaps ever appear. */
export function clampPhoto(photo: PhotoState): PhotoState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, photo.zoom));
  const { w, h } = photoSize(photo.image, zoom);
  const maxX = Math.max(0, (w - PHOTO_FRAME.rx * 2) / 2);
  const maxY = Math.max(0, (h - PHOTO_FRAME.ry * 2) / 2);
  return {
    ...photo,
    zoom,
    offsetX: Math.min(maxX, Math.max(-maxX, photo.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, photo.offsetY)),
  };
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function drawText(ctx: Ctx, text: string, spec: TextSpec) {
  ctx.save();
  ctx.fillStyle = spec.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const measure = (size: number) => {
    ctx.font = fontString(spec, size);
    ctx.letterSpacing = `${spec.letterSpacingEm * size}px`;
    return ctx.measureText(text);
  };

  // Shrink long text to fit, keeping it vertically centred on the original line.
  const sx = spec.scaleX ?? 1;
  let size = spec.size;
  let m = measure(size);
  let inkWidth = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * sx;
  if (inkWidth > spec.maxWidth) {
    size = (spec.size * spec.maxWidth) / inkWidth;
    m = measure(size);
    inkWidth = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * sx;
  }
  const capShift = ((spec.size - size) * 0.72) / 2;
  const x = spec.centerX - inkWidth / 2 + m.actualBoundingBoxLeft * sx;
  ctx.translate(x, spec.baseline - capShift);
  ctx.scale(sx, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Renders the full badge at `scale` x the template resolution. */
export function drawBadge(ctx: CanvasRenderingContext2D, content: BadgeContent, scale: number) {
  const { template, photo } = content;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Backdrop of the photo hole (white, as in the original).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT);

  if (photo) {
    const { w, h } = photoSize(photo.image, photo.zoom);
    const x = PHOTO_FRAME.cx - w / 2 + photo.offsetX;
    const y = PHOTO_FRAME.cy - h / 2 + photo.offsetY;
    // Generous clip; the template's photo hole defines the exact visible shape.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(PHOTO_FRAME.cx, PHOTO_FRAME.cy, PHOTO_FRAME.rx + 8, PHOTO_FRAME.ry + 8, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo.image, x, y, w, h);
    ctx.restore();
  }

  // Locked template on top: everything outside the photo hole is the original artwork.
  ctx.drawImage(template, 0, 0, BADGE_WIDTH, BADGE_HEIGHT);

  drawText(ctx, content.name.trim() || content.nameSpec.placeholder, content.nameSpec);
  drawText(ctx, content.classText.trim() || content.classSpec.placeholder, content.classSpec);
  drawText(ctx, content.chapterText.trim() || content.chapterSpec.placeholder, content.chapterSpec);
  ctx.restore();
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Validates and decodes an uploaded photo. Throws an Error with a user-facing message. */
export async function loadPhotoFile(file: File): Promise<HTMLImageElement> {
  const typeOk = file.type ? ACCEPTED_TYPES.includes(file.type) : ACCEPTED_EXT.test(file.name);
  if (!typeOk) throw new Error("Please choose a JPG, PNG or WebP image.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That image is too large. Please choose one under 25 MB.");

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("We couldn't read that image. Please try a different photo.");
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error("We couldn't read that image. Please try a different photo.");
  }
  return img;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
