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
