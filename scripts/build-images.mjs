/* Re-encode the raster images the site actually paints, and record the result
 * in src/data/images.json.
 *
 * WHAT THE AUDIT SAID, AND WHAT MEASUREMENT SAID
 * The audit reported "21 images served far larger than displayed". Measured
 * across four breakpoints against a 2x-DPR target (scripts/measure-image-sizes.mjs
 * → src/data/paint_widths.json), only 9 of 55 ship more than 1.3x the pixels a
 * retina screen paints, and the worst is 1.92x. Most of the set is correctly
 * sized or already UNDER-sized for retina — /uploads/contact.png is 1440 wide
 * and painted 1425, so resampling it would make it blurrier, not lighter.
 *
 * So dimensions are the smaller half of the story. The larger half is format:
 * that same contact.png is 444 kB of PNG for 1440x400 of photographic artwork,
 * and /theme/content/img.jpg is 413 kB. Those are format costs, not pixel
 * costs, and no amount of resampling fixes them.
 *
 * WHY ONLY WHAT THE BROWSER PAINTED
 * public/ holds 76 raster files; the browser paints 37 of them. The other 39
 * are not oversights, and converting them would be actively wrong:
 *
 *   • favicons/ — the sizes a <link rel="icon"> declares. A .webp under a
 *     .png filename is a broken icon, not a lighter one.
 *   • og-homehero.png (x2) — Open Graph. Social scrapers are not browsers and
 *     several still refuse WebP; a lighter card nobody can render is a loss.
 *   • video/*-poster.jpg — already derivatives, and `poster` takes a single
 *     URL with no <picture> fallback to degrade to.
 *   • use1-scaled.png, erp_wms_crm.png, pobieranie-1.png, home0/1.png,
 *     download0/1.png, img.png, Gravitti_FILM_0{2,3,5}.jpg — dead content.
 *     Their page components override the JSON that names them, so they ship on
 *     every deploy and are never fetched. Converting them would produce a
 *     smaller copy of a file nobody requests. They want deleting, not encoding,
 *     and that is a content decision rather than this script's call.
 *
 * A file absent from paint_widths.json also has no measured target width, so
 * there would be nothing to resample it to even if it were worth doing. One
 * rule — "encode what the browser painted" — covers all of it.
 *
 * WHY A QUALITY LADDER AND NOT ONE SETTING
 * The first version of this script used q80 everywhere and reported the raster
 * set going 8218 kB → 874 kB. Two of those wins were 100:1, which is not what
 * a format change pays; it is what throwing away image data pays. Cropping
 * contact.png confirmed it: the flat dark gradient had banded into contour
 * rings. SSIM rated the banded encode 0.9707 against 0.9759 for a clean one,
 * so the obvious gate could not have caught it (scripts/lib/banding.mjs has
 * the numbers).
 *
 * So each file climbs the ladder until its banding score passes, and stops.
 * Photographic and screenshot content passes at the bottom rung; flat gradient
 * artwork pays for the top one. contact.png ends at q95 and 26 kB instead of
 * q80 and 4.5 kB — still 94% off the PNG, and still the same picture.
 *
 * WHY .webp DIRECTLY AND NOT <picture>
 * Every engine has shipped WebP since Safari 14 (2020), so a <picture> element
 * would be adding a fallback for browsers that cannot render the rest of this
 * site either — it uses CSS custom properties, aspect-ratio and :focus-visible.
 * Swapping the src in one helper (src/lib/media.ts) instead of rewriting every
 * <img> call site keeps the change to one place.
 *
 * That argument does NOT extend to AVIF, which is why this ships WebP despite
 * AVIF measuring better here (contact.png: 4.5 kB at a passing banding score,
 * versus 26 kB for WebP). AVIF's floor is Safari 16.4, March 2023 — and Safari
 * 15 renders custom properties, aspect-ratio and :focus-visible perfectly well.
 * Bare AVIF would break images for browsers that handle the rest of the site,
 * and earning those bytes back means shipping two derivative sets and a
 * <picture> at every call site. 22 kB on one image does not buy that.
 *
 * Masters move to media-src/ (mirroring public/'s layout) so the originals stay
 * in git without being copied into dist/ on every deploy.
 *
 * Run: node scripts/build-images.mjs [--dry]
 */
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { bandingProbe, PASS } from './lib/banding.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PUBLIC = join(ROOT, 'public');
const SRC = join(ROOT, 'media-src');
const MANIFEST = join(ROOT, 'src', 'data', 'images.json');
const PAINT = JSON.parse(readFileSync(join(ROOT, 'src/data/paint_widths.json'), 'utf8'));

const DRY = process.argv.includes('--dry');
const MIN_WIN = 0.9; // adopt only if the WebP is ≤90% of the original
const LADDER = [72, 80, 88, 95];

const targets = PAINT.filter((r) => r.maxCss > 0 && /\.(png|jpe?g)$/i.test(r.path));

const manifest = {};
const rows = [];
let before = 0;
let after = 0;

for (const row of targets) {
  const file = join(PUBLIC, row.path.replace(/^\//, ''));
  if (!existsSync(file)) {
    console.log(`  MISSING  ${row.path} — in paint_widths.json but not on disk`);
    continue;
  }

  const origBytes = statSync(file).size;
  const meta = await sharp(file).metadata();
  const width = Math.min(meta.width, row.target); // never upscale

  /* The banding score compares like with like, so when this resamples, the
     reference is the losslessly-resized source rather than the original —
     otherwise every resampled edge counts as one the encoder invented. */
  const resize = width < meta.width;
  const base = sharp(file).resize(resize ? { width, withoutEnlargement: true } : undefined);
  const reference = await base.clone().png({ compressionLevel: 0 }).toBuffer();
  const score = await bandingProbe(reference);

  /* Lossless is a real candidate, not a fallback. Flat-colour artwork — every
     client logo on this site — compresses better losslessly than it does at
     q95, because what costs a lossy encoder bytes is the hard edge it keeps
     ringing around: nac-logo.png is 19,987 as PNG, 23,254 at q95 (worse than
     the source, and visibly haloed) and 7,208 lossless. Photographs go the
     other way by an order of magnitude. Rather than hand-sorting the set into
     "logo" and "photo", encode both ways and let the bytes decide. */
  const candidates = [{ quality: 'lossless', buf: await base.clone().webp({ lossless: true, effort: 6 }).toBuffer(), band: { score: 0 } }];

  for (const quality of LADDER) {
    const buf = await base.clone().webp({ quality, effort: 6 }).toBuffer();
    const band = await score(buf);
    if (band && band.score <= PASS) {
      candidates.push({ quality, buf, band });
      break;
    }
    if (quality === LADDER[LADDER.length - 1]) candidates.push({ quality, buf, band, failed: true });
  }

  const passing = candidates.filter((c) => !c.failed);
  const chosen = passing.sort((a, b) => a.buf.length - b.buf.length)[0];
  const { quality, buf, band } = chosen;
  const out = await sharp(buf).metadata();
  const ratio = buf.length / origBytes;
  const adopt = ratio <= MIN_WIN;

  rows.push({
    path: row.path, origBytes, webpBytes: buf.length, ratio, quality,
    score: band?.score ?? null, width, natural: meta.width, adopt,
    /* What the lossy ladder cost when lossless won anyway — kept so the
       "encode both ways" claim above is checkable from the script's output. */
    lossyBytes: candidates.find((c) => c.quality !== 'lossless')?.buf.length ?? null,
  });
  before += origBytes;
  after += adopt ? buf.length : origBytes;
  if (!adopt) continue;

  const webWebp = row.path.replace(/\.(png|jpe?g)$/i, '.webp');
  manifest[row.path] = { src: webWebp, width: out.width, height: out.height };
  if (DRY) continue;

  // master out of public/ (kept in git, never deployed), derivative into it
  const master = join(SRC, relative(PUBLIC, file));
  mkdirSync(dirname(master), { recursive: true });
  if (!existsSync(master)) renameSync(file, master);
  writeFileSync(join(PUBLIC, webWebp.replace(/^\//, '')), buf);
}

rows.sort((a, b) => b.origBytes - b.webpBytes - (a.origBytes - a.webpBytes));
console.log(`    saved  encode  band  path                              original →    webp`);
for (const r of rows) {
  console.log(
    `  ${String(r.adopt ? ((r.origBytes - r.webpBytes) / 1024).toFixed(0) + ' kB' : 'kept').padStart(7)} ` +
      ` ${String(r.quality === 'lossless' ? 'lossless' : 'q' + r.quality).padStart(8)} ` +
      `${String(r.score ?? '—').padStart(5)}  ${r.path.slice(-32).padEnd(32)} ` +
      `${String(r.origBytes).padStart(8)} → ${String(r.webpBytes).padStart(7)}` +
      `${r.width < r.natural ? `  (resized ${r.natural}→${r.width})` : ''}`
  );
}

if (!DRY) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `\n  ${Object.keys(manifest).length} of ${rows.length} painted raster images adopted a WebP derivative\n` +
    `  ${(before / 1024).toFixed(0)} kB → ${(after / 1024).toFixed(0)} kB ` +
    `(${(100 - (after / before) * 100).toFixed(0)}% lighter across the painted raster set)` +
    (DRY ? '\n  --dry: nothing written' : `\n  written to ${relative(ROOT, MANIFEST)}`)
);
