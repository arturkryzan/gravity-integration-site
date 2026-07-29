/* Where are the changed pixels? A near-constant diff count across pages of
   very different heights says "fixed element", but that is an inference.
   Read the diff PNGs and print the bounding box of the changed region, so the
   claim is a measurement. pixelmatch paints diffs red/yellow on a faded copy
   of A, so "changed" = a strongly red pixel. */
import fs from 'node:fs';
import { PNG } from 'pngjs';

for (const f of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(f));
  let minY = Infinity, maxY = -1, minX = Infinity, maxX = -1, n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) << 2;
      const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
      if (r > 200 && g < 120 && b < 120) {
        n++;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  const name = f.split('/').pop();
  if (!n) { console.log(`${name}: no diff pixels`); continue; }
  console.log(
    `${name}  page=${png.width}x${png.height}  changed rows ${minY}–${maxY} ` +
    `(${maxY - minY + 1}px tall), cols ${minX}–${maxX}, ${n} px  ` +
    `| bottom edge is ${png.height - maxY}px from page end`
  );
}
