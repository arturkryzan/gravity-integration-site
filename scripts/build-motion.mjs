/* Turn animated GIFs in media-src/ into a video derivative plus a poster frame,
 * and record the result in src/data/motion.json.
 *
 * WHY media-src/ AND NOT public/
 * Everything in public/ is copied into dist/ verbatim, so a GIF left there
 * would keep shipping to the server even though no page references it any more
 * — 2.35 MB of upload per deploy for a file nobody fetches. media-src/ mirrors
 * public/'s layout (media-src/media/x.gif is the source of what the content
 * calls /media/x.gif) and is never copied. The original stays in git as the
 * master the derivatives are re-encoded from.
 *
 * WHY THIS EXISTS
 * An animated GIF is an uncompressed-between-frames, 256-colour, dithered
 * flipbook. The one this was written for — a 52-second screen recording of
 * Graffiti.ERP — costs 2,403,172 bytes, which was 84% of the weight of
 * /case-studies/ and more than the entire next-heaviest route. It also
 * autoplays forever with no way to pause it, which fails WCAG 2.2.2.
 *
 * WHY IT IS A SCRIPT AND NOT A BUILD HOOK
 * These are static assets outside Astro's image pipeline, and ffmpeg is not a
 * dependency this project should acquire just to run `npm run build`. So: run
 * this by hand when a GIF is added or replaced, and commit the output. The
 * manifest is what the build reads, and src/components/CaseFigure.astro throws
 * if a GIF reaches it without one — a GIF whose master sits in media-src/ but
 * whose derivative was never generated would otherwise render a 404.
 *
 * THE ENCODE, AND WHY IT LANDS WHERE IT DOES
 * `scale=…:flags=area` box-averages on the way down, which is what kills GIF
 * dither; `hqdn3d=0:0:10:10` is temporal-only denoise, which removes the
 * frame-to-frame palette shimmer that would otherwise defeat interframe
 * prediction. Spatial denoise is left at zero deliberately: this is screen
 * content, and softening sharp UI text to save bytes is the wrong trade.
 *
 * Measured on the tiptopol GIF, encodes past crf 30 stop paying: crf 30 gives
 * 1.31 MB, crf 32 gives 1.16 MB for visibly softer text, and VP9 at matched
 * quality landed within 2% of h264 — so this ships one h264 MP4 rather than a
 * second encode every browser already has a codec for.
 *
 * MAX_W comes from scripts/measure-image-sizes.mjs: the widest this is ever
 * painted is 740 CSS px, so 1480 is the 2x-DPR target. Never upscales.
 *
 * Run: node scripts/build-motion.mjs [--force]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SRC = join(ROOT, 'media-src');
const OUTDIR = join(ROOT, 'public', 'media', 'video');
const MANIFEST = join(ROOT, 'src', 'data', 'motion.json');
const MAX_W = 1480;
const CRF = 30;
const FORCE = process.argv.includes('--force');

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (extname(e.name).toLowerCase() === '.gif') out.push(p);
  }
  return out;
}

const probe = (file) =>
  JSON.parse(
    sh('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,nb_frames',
      '-show_entries', 'format=duration',
      '-of', 'json', file,
    ])
  );

mkdirSync(OUTDIR, { recursive: true });
const manifest = {};

for (const gif of walk(SRC)) {
  const info = probe(gif);
  const st = info.streams[0];
  const frames = Number(st.nb_frames) || 1;
  const webPath = '/' + relative(SRC, gif);
  // A single-frame GIF is a still image wearing the wrong extension; leave it
  // to the <img> path rather than wrapping a one-frame video around it.
  if (frames <= 1) {
    console.log(`  skip  ${webPath} (${frames} frame)`);
    continue;
  }

  const name = basename(gif, extname(gif));
  const mp4 = join(OUTDIR, `${name}.mp4`);
  const poster = join(OUTDIR, `${name}-poster.jpg`);
  const width = Math.min(st.width, MAX_W);
  // -2 keeps the aspect ratio and rounds to an even number, which yuv420p requires
  const height = Math.round((st.height * width) / st.width / 2) * 2;
  const vf = `scale=${width}:-2:flags=area,hqdn3d=0:0:10:10`;

  const stale =
    FORCE || !existsSync(mp4) || !existsSync(poster) ||
    statSync(gif).mtimeMs > statSync(mp4).mtimeMs;

  if (stale) {
    console.log(`  encode ${webPath} → ${width}x${height}, ${frames} frames`);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-i', gif, '-vf', vf,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF),
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4,
    ]);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-i', gif, '-vf', vf,
      '-frames:v', '1', '-q:v', '82', poster,
    ]);
  } else {
    console.log(`  fresh  ${webPath}`);
  }

  manifest[webPath] = {
    mp4: '/' + relative(join(ROOT, 'public'), mp4),
    poster: '/' + relative(join(ROOT, 'public'), poster),
    width,
    height,
    seconds: +Number(info.format.duration).toFixed(1),
    /* Recorded so the saving is auditable from the manifest alone, and so a
       future re-encode that makes things worse is visible in the diff. */
    gifBytes: statSync(gif).size,
    mp4Bytes: statSync(mp4).size,
    posterBytes: statSync(poster).size,
  };
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
const saved = Object.values(manifest).reduce((a, m) => a + m.gifBytes - m.posterBytes, 0);
console.log(
  `\n  ${Object.keys(manifest).length} animated GIF(s) in the manifest\n` +
    `  ${(saved / 1024 / 1024).toFixed(2)} MB removed from first paint ` +
    `(poster ships, video only on play)\n  written to ${relative(ROOT, MANIFEST)}`
);
