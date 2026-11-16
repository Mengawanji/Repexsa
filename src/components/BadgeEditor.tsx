"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACCEPTED_TYPES,
  BADGE_HEIGHT,
  BADGE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  PHOTO_FRAME,
  PhotoState,
  TEMPLATE_SRC,
  clampPhoto,
  drawBadge,
  fontString,
  loadImage,
  loadPhotoFile,
  makeTextSpecs,
} from "@/lib/badge";
import { classFont, nameFont } from "@/lib/fonts";

const PREVIEW_SCALE = 1.25;
const EXPORT_SCALE = 2; // 1726 x 2560 PNG
const NAME_MAX = 40;
const CLASS_MAX = 30;
const CHAPTER_MAX = 30;

// Position of the photo frame as a percentage of the badge, for the gesture layer.
const frameStyle = {
  left: `${((PHOTO_FRAME.cx - PHOTO_FRAME.rx) / BADGE_WIDTH) * 100}%`,
  top: `${((PHOTO_FRAME.cy - PHOTO_FRAME.ry) / BADGE_HEIGHT) * 100}%`,
  width: `${((PHOTO_FRAME.rx * 2) / BADGE_WIDTH) * 100}%`,
  height: `${((PHOTO_FRAME.ry * 2) / BADGE_HEIGHT) * 100}%`,
};

type Pointer = { x: number; y: number };

/** Template pixels per screen pixel. */
function pxRatio(canvas: HTMLCanvasElement | null) {
  const width = canvas?.getBoundingClientRect().width;
  return width ? BADGE_WIDTH / width : 1;
}

/** Screen point -> template pixels relative to the photo frame centre. */
function toFrameCoords(canvas: HTMLCanvasElement | null, clientX: number, clientY: number) {
  const rect = canvas?.getBoundingClientRect();
  if (!rect || !rect.width) return { x: 0, y: 0 };
  const r = BADGE_WIDTH / rect.width;
  return { x: (clientX - rect.left) * r - PHOTO_FRAME.cx, y: (clientY - rect.top) * r - PHOTO_FRAME.cy };
}

export default function BadgeEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pointer>());

  const [template, setTemplate] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [name, setName] = useState("");
  const [classText, setClassText] = useState("");
  const [chapterText, setChapterText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const specs = useMemo(
    () => makeTextSpecs(nameFont.style.fontFamily, classFont.style.fontFamily),
    [],
  );

  // Load the locked template and the badge fonts before the first draw.
  useEffect(() => {
    let cancelled = false;
    loadImage(TEMPLATE_SRC)
      .then((img) => !cancelled && setTemplate(img))
      .catch(() => !cancelled && setLoadError("The badge design failed to load. Please refresh the page."));
    Promise.all([
      document.fonts.load(fontString(specs.nameSpec)),
      document.fonts.load(fontString(specs.classSpec)),
      document.fonts.load(fontString(specs.chapterSpec)),
    ])
      .catch(() => undefined) // fall back to system fonts rather than blocking the editor
      .finally(() => !cancelled && setFontsReady(true));
    return () => {
      cancelled = true;
    };
  }, [specs]);

  const ready = template !== null && fontsReady;

  // Redraw the preview whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !template || !fontsReady) return;
    const frame = requestAnimationFrame(() =>
      drawBadge(ctx, { template, photo, name, classText, chapterText, ...specs }, PREVIEW_SCALE),
    );
    return () => cancelAnimationFrame(frame);
  }, [template, fontsReady, photo, name, classText, chapterText, specs]);

  // Free the previous photo's object URL when it is replaced or removed.
  useEffect(() => {
    const src = photo?.image.src;
    return () => {
      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [photo?.image]);

  const updatePhoto = useCallback((fn: (p: PhotoState) => Partial<PhotoState>) => {
    setPhoto((p) => (p ? clampPhoto({ ...p, ...fn(p) }) : p));
  }, []);

  /** Zoom around a point given in template pixels relative to the frame centre. */
  const zoomBy = useCallback(
    (factor: number, focusX = 0, focusY = 0) =>
      updatePhoto((p) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.zoom * factor));
        const k = zoom / p.zoom;
        return {
          zoom,
          offsetX: focusX - (focusX - p.offsetX) * k,
          offsetY: focusY - (focusY - p.offsetY) * k,
        };
      }),
    [updatePhoto],
  );

  const hasPhoto = photo !== null;

  // Mouse-wheel / trackpad zoom (needs a non-passive listener to prevent page scroll).
  useEffect(() => {
    const el = gestureRef.current;
    if (!el || !hasPhoto) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = toFrameCoords(canvasRef.current, e.clientX, e.clientY);
      zoomBy(Math.exp(-e.deltaY * 0.0015), x, y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasPhoto, zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev || !photo) return;
    const next = { x: e.clientX, y: e.clientY };
    const ratio = pxRatio(canvasRef.current);

    if (map.size === 1) {
      const dx = (next.x - prev.x) * ratio;
      const dy = (next.y - prev.y) * ratio;
      updatePhoto((p) => ({ offsetX: p.offsetX + dx, offsetY: p.offsetY + dy }));
    } else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      // Pan by the midpoint's movement, then zoom around the new midpoint.
      const dx = ((next.x - prev.x) / 2) * ratio;
      const dy = ((next.y - prev.y) / 2) * ratio;
      updatePhoto((p) => ({ offsetX: p.offsetX + dx, offsetY: p.offsetY + dy }));
      if (before > 0) {
        const mid = toFrameCoords(canvasRef.current, (next.x + other.x) / 2, (next.y + other.y) / 2);
        zoomBy(after / before, mid.x, mid.y);
      }
    }
    map.set(e.pointerId, next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!photo) return;
    const step = e.shiftKey ? 20 : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      updatePhoto((p) => ({ offsetX: p.offsetX + dx, offsetY: p.offsetY + dy }));
    } else if (e.key === "+" || e.key === "=") {
      zoomBy(1.1);
    } else if (e.key === "-") {
      zoomBy(1 / 1.1);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      const image = await loadPhotoFile(file);
      pointers.current.clear();
      setPhoto({ image, zoom: 1, offsetX: 0, offsetY: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image could not be loaded.");
    }
  };

  const resetPosition = () => updatePhoto(() => ({ zoom: 1, offsetX: 0, offsetY: 0 }));

  const resetAll = () => {
    if ((photo || name || classText || chapterText) && !window.confirm("Remove your photo and text and start over?")) return;
    pointers.current.clear();
    setPhoto(null);
    setName("");
    setClassText("");
    setChapterText("");
    setError(null);
  };

  const download = async () => {
    if (!template) return;
    const missing = [!photo && "a photo", !name.trim() && "your name", !classText.trim() && "your class"].filter(
      Boolean,
    );
    if (missing.length) {
      setError(`Please add ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} before downloading.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = BADGE_WIDTH * EXPORT_SCALE;
      canvas.height = BADGE_HEIGHT * EXPORT_SCALE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      drawBadge(ctx, { template, photo, name, classText, chapterText, ...specs }, EXPORT_SCALE);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("export failed");

      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `repexsa-2026-badge${slug ? `-${slug}` : ""}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Sorry, the badge couldn't be created on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-28 pt-4 md:flex-row md:items-start md:gap-10 md:pb-10 md:pt-8">
      {/* Preview */}
      <section aria-label="Badge preview" className="w-full md:sticky md:top-8 md:w-[min(480px,55%)] md:shrink-0">
        <div
          className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/5 md:max-w-none"
          style={{ aspectRatio: `${BADGE_WIDTH} / ${BADGE_HEIGHT}` }}
        >
          <canvas
            ref={canvasRef}
            width={BADGE_WIDTH * PREVIEW_SCALE}
            height={BADGE_HEIGHT * PREVIEW_SCALE}
            className="block h-full w-full"
            aria-hidden="true"
          />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center bg-white text-sm text-slate-500">
              {loadError ?? "Loading badge…"}
            </div>
          )}
          {/* Gesture layer over the photo frame (not part of the exported image). */}
          {ready && (
            <div
              ref={gestureRef}
              role={photo ? "application" : "button"}
              tabIndex={0}
              aria-label={
                photo
                  ? "Photo. Drag to move, pinch or scroll to zoom. Arrow keys move, plus and minus zoom."
                  : "Add your photo"
              }
              onClick={photo ? undefined : openFilePicker}
              onKeyDown={(e) => {
                if (!photo && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  openFilePicker();
                } else onKeyDown(e);
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`absolute rounded-[50%] outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60 ${
                photo ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"
              }`}
              style={frameStyle}
            >
              {!photo && (
                <span className="absolute inset-0 grid place-items-center">
                  <span className="flex flex-col items-center gap-2 rounded-xl bg-white/90 px-4 py-3 text-center text-sm font-medium text-blue-800 shadow">
                    <CameraIcon />
                    Tap to add your photo
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
        {photo && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Drag the photo to move it. Pinch or scroll to zoom.
          </p>
        )}
      </section>

      {/* Controls */}
      <section aria-label="Edit badge" className="flex w-full flex-col gap-6">
        <header className="hidden md:block">
          <h1 className="text-2xl font-bold text-slate-900">Create your REPEXSA 2026 badge</h1>
          <p className="mt-1 text-sm text-slate-600">
            Add your photo, name, class and chapter, then download your badge.
          </p>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept={`${ACCEPTED_TYPES.join(",")},.jpg,.jpeg,.png,.webp`}
          className="hidden"
          onChange={onFileChange}
        />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-slate-800">1. Photo</legend>
          <button type="button" onClick={openFilePicker} disabled={!ready} className="btn btn-secondary">
            <CameraIcon />
            {photo ? "Change photo" : "Upload photo"}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.15)}
              disabled={!photo || photo.zoom <= MIN_ZOOM}
              className="btn-icon"
              aria-label="Zoom out"
            >
              −
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={photo?.zoom ?? MIN_ZOOM}
              disabled={!photo}
              onChange={(e) => {
                const z = Number(e.target.value);
                zoomBy(z / (photo?.zoom ?? 1));
              }}
              aria-label="Zoom"
              className="h-2 flex-1 cursor-pointer accent-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => zoomBy(1.15)}
              disabled={!photo || photo.zoom >= MAX_ZOOM}
              className="btn-icon"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <button type="button" onClick={resetPosition} disabled={!photo} className="btn btn-ghost">
            Reset photo position
          </button>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-semibold text-slate-800">2. Details</legend>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-slate-700">Full name</span>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder={specs.nameSpec.placeholder}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-slate-700">Batch</span>
            <input
              type="text"
              value={classText}
              maxLength={CLASS_MAX}
              onChange={(e) => setClassText(e.target.value)}
              placeholder={specs.classSpec.placeholder}
              autoComplete="off"
              enterKeyHint="next"
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-slate-700">Chapter</span>
            <input
              type="text"
              value={chapterText}
              maxLength={CHAPTER_MAX}
              onChange={(e) => setChapterText(e.target.value)}
              placeholder={specs.chapterSpec.placeholder}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              className="field"
            />
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button type="button" onClick={resetAll} disabled={!ready} className="btn btn-ghost">
            Start over
          </button>
          {/* Sticky on mobile so it's always within reach. */}
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <button
              type="button"
              onClick={download}
              disabled={!ready || busy}
              className="btn btn-primary mx-auto w-full max-w-[420px] md:max-w-none"
            >
              <DownloadIcon />
              {busy ? "Preparing…" : "Download Badge"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
