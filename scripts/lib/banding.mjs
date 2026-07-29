/* Detect compression banding: false contour edges introduced into regions that
 * were smooth in the source.
 *
 * WHY THIS EXISTS RATHER THAN SSIM
 * The first pass at the image work encoded everything at WebP q80 and reported
 * an 89% saving. /uploads/contact.png went 444,517 → 4,554 bytes, a 100:1 win,
 * and the crop showed why it was too good: the artwork is a near-flat dark
 * gradient, and q80 had turned it into visible contour rings.
 *
 * SSIM could not see it. Measured on that same file:
 *
 *     webp q80 (rings clearly visible)   SSIM 0.9707
 *     webp q95 (indistinguishable)       SSIM 0.9759
 *
 * A 0.005 spread is inside the noise of any threshold worth setting. SSIM is
 * a local-structure metric, and banding is the destruction of structure so
 * gentle that there was barely any there to begin with — the artifact lives
 * exactly in SSIM's blind spot.
 *
 * WHAT THIS MEASURES INSTEAD
 * Banding has a precise signature: an edge appearing where the source had none.
 * So mask to the pixels the source considers flat (Sobel magnitude below
 * T_FLAT) and look at how much edge the derivative added there — the EXCESS,
 * `max(0, sobel_derivative - sobel_source)`, per pixel.
 *
 * Amplitude is the half that a plain count gets wrong, and it took a wrong
 * answer to find that out. A first version scored the count alone and rejected
 * /theme/content/img.jpg at q95, pushing it to a 373 kB lossless encode instead
 * of an 87 kB lossy one. The amplified difference image showed why that was
 * wrong: uniform speckle, peak delta 7/255, the encoder tidying the JPEG's own
 * grain — nothing anyone can see. /media/manual_mockup.jpg scored the same kind
 * of number for a completely different reason: bright rings tracing every
 * circular UI element, peak delta 35/255. Same count, opposite verdicts.
 *
 * So the score counts only flat pixels whose excess clears T_AMP, reported per
 * MILLION flat pixels. Measured against encodes checked by eye — 1x crops for
 * the obvious cases, 6x amplified difference images for the marginal ones:
 *
 *     contact.png  q95   clean                            0.0
 *     heropricing  q95   clean                            0.0
 *     img.jpg      q95   grain only, peak delta 7          0.0
 *     etl-text     q95   grain only, peak delta 7          0.0
 *     ─────────────────────────────────────────────────────────
 *     contact.png  q90   contours visible at 6x            5.7
 *     contact.png  q80   contours visible at 1x           81.4
 *     mockup.jpg   q95   ringing on every hard edge     1260.2
 *
 * Every encode that looked right reads exactly zero and every one that looked
 * wrong reads 5.7 or more, so PASS = 2.0 is not a tuned threshold sitting in a
 * grey zone — it is a line drawn across an empty gap.
 */
import sharp from 'sharp';

export const PASS = 2.0;

const T_FLAT = 1.5; // source Sobel magnitude below this = "smooth here"
const T_AMP = 3.0; // added edge strength worth counting, in source units

/* Flattened onto a fixed grey before measuring. Transparent pixels carry
   undefined colour — a PNG may store anything under alpha 0, and an encoder is
   free to store something else — so comparing them directly reports differences
   nobody can see. Compositing both sides over the same background makes the
   comparison about what actually renders, and still catches a real artifact:
   ringing along an alpha edge shows up as an edge against the backdrop. */
async function grey(input) {
  const { data, info } = await sharp(input)
    .flatten({ background: '#808080' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height };
}

/* Sobel magnitude, normalised back to the 0-255 input scale so the thresholds
   above read in source units. The 1px border is left at zero; it is never the
   whole story on an image measured in hundreds of thousands of pixels. */
function sobel({ d, w, h }) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -d[i - w - 1] - 2 * d[i - 1] - d[i + w - 1] + d[i - w + 1] + 2 * d[i + 1] + d[i + w + 1];
      const gy = -d[i - w - 1] - 2 * d[i - w] - d[i - w + 1] + d[i + w - 1] + 2 * d[i + w] + d[i + w + 1];
      out[i] = Math.hypot(gx, gy) / 8;
    }
  }
  return out;
}

/**
 * Precompute the reference side once, then score any number of candidate
 * encodes against it. Hoisted out of the per-candidate call deliberately: a
 * quality ladder tests the same reference up to four times, and decoding and
 * Sobel-ing a 1920x1039 source four times over 37 files is the difference
 * between this finishing and this timing out.
 *
 * @param reference the source at the SAME pixel dimensions as the candidates.
 *   When the derivative was resized, pass the losslessly-resized source — else
 *   every resampled edge reads as a new one and the score is meaningless.
 * @returns `score(candidate) => { flatPct, score } | null` (null on size mismatch)
 */
export async function bandingProbe(reference) {
  const a = await grey(reference);
  const s0 = sobel(a);

  /* Only the flat pixels are ever looked at again, so keep their indices and
     drop the rest — it turns the inner loop from "every pixel" into "the ~90%
     that were smooth", and costs one pass to build. */
  const flatIdx = [];
  for (let i = 0; i < s0.length; i++) if (s0[i] < T_FLAT) flatIdx.push(i);
  const flatPct = +((100 * flatIdx.length) / s0.length).toFixed(1);

  return async function score(candidate) {
    const b = await grey(candidate);
    if (a.w !== b.w || a.h !== b.h) return null;
    const s1 = sobel(b);
    let bad = 0;
    for (const i of flatIdx) if (s1[i] - s0[i] >= T_AMP) bad++;
    return { flatPct, score: +((1e6 * bad) / Math.max(flatIdx.length, 1)).toFixed(1) };
  };
}
