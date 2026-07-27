import dims from '../data/media_dims.json';

export interface MediaRef {
  file: string | null;
  url?: string;
  alt: string;
  wpId?: number;
}

export function mediaSrc(ref?: MediaRef | string | null): string | null {
  if (!ref || typeof ref === 'string') return null;
  if (ref.file) return '/' + ref.file;
  return ref.url ?? null;
}

export function mediaAlt(ref?: MediaRef | string | null): string {
  if (!ref || typeof ref === 'string') return '';
  return ref.alt || '';
}

/** Intrinsic width/height for the `width`/`height` attributes (CLS guard).
    Prefers the ref's own dimensions (the WP export carries them for raster
    assets), falls back to the measured registry in media_dims.json. Returns
    null when neither knows — callers then simply omit the attributes. */
export function mediaDims(
  ref?: MediaRef | string | null,
): { width: number; height: number } | null {
  if (!ref || typeof ref === 'string') return null;
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
  const table = dims as Record<string, [number, number]>;
  const key = path.replace(/^\//, '').replace(/^media\//, '');
  const d = table[key] ?? table[key.split('/').pop() ?? ''];
  return d ? { width: d[0], height: d[1] } : null;
}

/** aspect-ratio for Bootstrap `.ratio` (height/width*100), WITH the % unit —
   Bootstrap's `padding-top: var(--bs-aspect-ratio)` is invalid (0 height)
   without it. Always includes '%' so callers must not append their own. */
export function mediaRatio(ref?: MediaRef | string | null, fallback = 56.25): string {
  if (!ref || typeof ref === 'string') return fallback.toFixed(2) + '%';
  const r = ref as any;
  if (r.width > 0 && r.height > 0) return ((r.height / r.width) * 100).toFixed(2) + '%';
  const name = ref.file?.replace(/^media\//, '');
  const d = name ? (dims as Record<string, [number, number]>)[name] : undefined;
  if (!d) return fallback.toFixed(2) + '%';
  return ((d[1] / d[0]) * 100).toFixed(2) + '%';
}
