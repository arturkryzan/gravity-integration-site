import dims from '../data/media_dims.json';
import derivatives from '../data/images.json';

export interface MediaRef {
  file: string | null;
  url?: string;
  alt: string;
  wpId?: number;
}

export interface Derivative {
  /** the derivative's own web path, e.g. `/media/nac-logo.webp` */
  src: string;
  /** the derivative's dimensions, which are NOT always the master's */
  width: number;
  height: number;
}

/* Written by scripts/build-images.mjs. Keyed by the path the content still
   names — the JSON, clients.json and the hard-coded call sites all keep saying
   `/media/nac-logo.png`, and this is the single place that turns that into what
   actually ships. The master itself is no longer in public/: it moved to
   media-src/, so a path that reaches an <img> without passing through here is a
   404, not a heavier image.

   Dimensions come from the derivative rather than the master because 9 of the
   36 were resampled down to their measured 2x-DPR paint width. media_dims.json
   still records the master's size and is now wrong for exactly those files, so
   the lookup order below is derivative first, everywhere. Getting that backwards
   costs a layout shift on the images that were resized most. */
const DERIVATIVES = derivatives as Record<string, Derivative>;

function lookup(path?: string | null): Derivative | null {
  if (!path) return null;
  return DERIVATIVES[path.startsWith('/') ? path : '/' + path] ?? null;
}

export function mediaSrc(ref?: MediaRef | string | null): string | null {
  if (!ref || typeof ref === 'string') return null;
  if (ref.file) {
    const path = '/' + ref.file;
    return lookup(path)?.src ?? path;
  }
  return ref.url ?? null;
}

export function mediaAlt(ref?: MediaRef | string | null): string {
  if (!ref || typeof ref === 'string') return '';
  return ref.alt || '';
}

/** Intrinsic width/height for the `width`/`height` attributes (CLS guard).
    Prefers the derivative that actually ships, then the ref's own dimensions
    (the WP export carries them for raster assets), then the measured registry
    in media_dims.json. Returns null when none knows — callers then simply omit
    the attributes. */
export function mediaDims(
  ref?: MediaRef | string | null,
): { width: number; height: number } | null {
  if (!ref || typeof ref === 'string') return null;
  const d0 = ref.file ? lookup('/' + ref.file) : null;
  if (d0) return { width: d0.width, height: d0.height };
  const r = ref as any;
  if (r.width > 0 && r.height > 0) return { width: r.width, height: r.height };
  const name = ref.file?.replace(/^media\//, '');
  const d = name ? (dims as Record<string, [number, number]>)[name] : undefined;
  return d ? { width: d[0], height: d[1] } : null;
}

/** Same lookup for plain path strings (page heroes, static assets): tries the
    path with its leading slash and `media/` prefix stripped, then the bare
    basename. */
export function fileDims(path?: string | null): { width: number; height: number } | null {
  if (!path) return null;
  const d0 = lookup(path);
  if (d0) return { width: d0.width, height: d0.height };
  const table = dims as Record<string, [number, number]>;
  const key = path.replace(/^\//, '').replace(/^media\//, '');
  const d = table[key] ?? table[key.split('/').pop() ?? ''];
  return d ? { width: d[0], height: d[1] } : null;
}

/** For the call sites that name a file directly in markup rather than reading
    it out of content — the page heroes, the download page's logo strip, the
    /technologia/ illustration. Spread it: `<img {...asset(p)} alt="" />`, and
    the src swap and the correct post-resample dimensions arrive together.
    Kept as one helper precisely so no call site can take the src without the
    dimensions that go with it. */
export function asset(path: string): { src: string; width?: number; height?: number } {
  const d = lookup(path);
  const dim = d ?? fileDims(path);
  if (!dim) return { src: path };
  return { src: d?.src ?? path, width: dim.width, height: dim.height };
}

/** aspect-ratio for Bootstrap `.ratio` (height/width*100), WITH the % unit —
   Bootstrap's `padding-top: var(--bs-aspect-ratio)` is invalid (0 height)
   without it. Always includes '%' so callers must not append their own. */
export function mediaRatio(ref?: MediaRef | string | null, fallback = 56.25): string {
  if (!ref || typeof ref === 'string') return fallback.toFixed(2) + '%';
  const d0 = ref.file ? lookup('/' + ref.file) : null;
  if (d0) return ((d0.height / d0.width) * 100).toFixed(2) + '%';
  const r = ref as any;
  if (r.width > 0 && r.height > 0) return ((r.height / r.width) * 100).toFixed(2) + '%';
  const name = ref.file?.replace(/^media\//, '');
  const d = name ? (dims as Record<string, [number, number]>)[name] : undefined;
  if (!d) return fallback.toFixed(2) + '%';
  return ((d[1] / d[0]) * 100).toFixed(2) + '%';
}
