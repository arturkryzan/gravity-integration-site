/* The icon set: Lucide, 1.75 stroke, rounded caps — functional icons only.
 *
 * Each icon is imported by name as a raw SVG string at build time, so the
 * site ships exactly the glyphs it uses and nothing else. `Icon.astro` strips
 * the fixed size and the licence comment, and sets the stroke to 1.75.
 *
 * LinkedIn is the one brand mark on the site and Lucide no longer ships
 * brand icons, so it is drawn here in the same 24-unit grid. */
import arrowRight from 'lucide-static/icons/arrow-right.svg?raw';
import arrowUpRight from 'lucide-static/icons/arrow-up-right.svg?raw';
import arrowDown from 'lucide-static/icons/arrow-down.svg?raw';
import download from 'lucide-static/icons/download.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import plus from 'lucide-static/icons/plus.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import infinity from 'lucide-static/icons/infinity.svg?raw';
import bellRing from 'lucide-static/icons/bell-ring.svg?raw';
import workflow from 'lucide-static/icons/workflow.svg?raw';
import brainCircuit from 'lucide-static/icons/brain-circuit.svg?raw';
import bookOpen from 'lucide-static/icons/book-open.svg?raw';
import fileText from 'lucide-static/icons/file-text.svg?raw';
import mail from 'lucide-static/icons/mail.svg?raw';
import send from 'lucide-static/icons/send.svg?raw';
import play from 'lucide-static/icons/play.svg?raw';
import pause from 'lucide-static/icons/pause.svg?raw';

const linkedin = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>`;

export const ICONS = {
  'arrow-right': arrowRight,
  'arrow-up-right': arrowUpRight,
  'arrow-down': arrowDown,
  download,
  check,
  plus,
  x,
  infinity,
  'bell-ring': bellRing,
  workflow,
  'brain-circuit': brainCircuit,
  'book-open': bookOpen,
  'file-text': fileText,
  mail,
  send,
  play,
  pause,
  linkedin,
} as const;

export type IconName = keyof typeof ICONS;

/** Normalise a Lucide file into an inline, stylable <svg>. */
export function iconSvg(name: IconName): string {
  const svg = ICONS[name].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  /* Only the root <svg> loses its size and class — a <rect>'s width and
     height are geometry. */
  return svg.replace(/<svg\b[^>]*>/, (open) =>
    open
      .replace(/\s(class|width|height|stroke-width)="[^"]*"/g, '')
      .replace('<svg', '<svg aria-hidden="true" focusable="false" stroke-width="1.75"'),
  );
}
