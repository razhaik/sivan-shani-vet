export type ImageResizeMode = "contain" | "cover";

export interface OptimizedImageOptions {
  width?: number;
  quality?: number;
  resize?: ImageResizeMode;
  fallbackWidth?: number;
}

export interface OptimizedImageSource {
  src: string;
  fallbackSrc: string;
}

const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";
const DEFAULT_SAFE_FALLBACK_WIDTH = 320;

function positiveWidth(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function isStorageObjectUrl(source: string): boolean {
  try {
    return new URL(source).pathname.includes(STORAGE_OBJECT_PATH);
  } catch {
    return false;
  }
}

/**
 * Builds a resized Supabase image URL while leaving other URLs untouched.
 */
export function optimizedImageUrl(
  source: string,
  options: OptimizedImageOptions = {},
): string {
  if (!source) return source;

  try {
    const url = new URL(source);
    if (!url.pathname.includes(STORAGE_OBJECT_PATH)) return source;

    url.pathname = url.pathname.replace(
      STORAGE_OBJECT_PATH,
      STORAGE_RENDER_PATH,
    );

    const width = positiveWidth(options.width);
    if (width) {
      url.searchParams.set("width", String(width));
    }

    const quality = typeof options.quality === "number" && Number.isFinite(options.quality)
      ? Math.min(100, Math.max(1, Math.round(options.quality)))
      : 75;

    url.searchParams.set("resize", options.resize ?? "contain");
    url.searchParams.set("quality", String(quality));

    return url.toString();
  } catch {
    return source;
  }
}

/**
 * Creates responsive width candidates for a storage image.
 * Non-storage URLs return an empty set so they are never rewritten.
 */
export function optimizedImageSrcSet(
  source: string,
  widths: ReadonlyArray<number>,
  options: OptimizedImageOptions = {},
): string {
  if (!source || !isStorageObjectUrl(source)) return "";

  const uniqueWidths = Array.from(
    new Set(widths.map(positiveWidth).filter((width): width is number => width !== undefined)),
  ).sort((a, b) => a - b);

  return uniqueWidths
    .map((width) => `${optimizedImageUrl(source, { ...options, width })} ${width}w`)
    .join(", ");
}

/**
 * Returns an optimized request and a smaller optimized fallback.
 * Storage images never fall back to their full-size original file.
 */
export function optimizedImageSource(
  source: string,
  options: OptimizedImageOptions = {},
): OptimizedImageSource {
  const src = optimizedImageUrl(source, options);

  if (!isStorageObjectUrl(source)) {
    return { src, fallbackSrc: source };
  }

  const requestedWidth = positiveWidth(options.width);
  const fallbackWidth = positiveWidth(options.fallbackWidth)
    ?? Math.min(requestedWidth ?? DEFAULT_SAFE_FALLBACK_WIDTH, DEFAULT_SAFE_FALLBACK_WIDTH);

  return {
    src,
    fallbackSrc: optimizedImageUrl(source, { ...options, width: fallbackWidth }),
  };
}

/**
 * Switches an image to its smaller optimized fallback once.
 * If that request also fails, hiding the image lets its styled wrapper show through.
 */
export function restoreOriginalImage(
  event: { currentTarget: HTMLImageElement },
  fallbackSrc: string,
): void {
  const image = event.currentTarget;

  if (image.dataset.optimizedFallbackApplied === "true") {
    image.style.display = "none";
    return;
  }

  image.dataset.optimizedFallbackApplied = "true";
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");

  if (!fallbackSrc || fallbackSrc === image.src || fallbackSrc === image.currentSrc) {
    image.style.display = "none";
    return;
  }

  image.src = fallbackSrc;
}
