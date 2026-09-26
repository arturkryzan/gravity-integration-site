/* Presentation cleanup for rich text that came out of WordPress.
 *
 * The content JSON is the copy, and the copy is not being touched. But the
 * HTML it arrives in carries the old theme's presentation along with it:
 * inline `style` attributes (`text-align: center`, `font-weight: 400`,
 * `text-decoration: underline` on the words the old hero drew a circle
 * around), an embed's <style>/<script>, lightbox classes, and empty
 * `<p>&nbsp;</p>` spacers. None of that is words, and all of it fights the
 * new system, so it is removed on the way in. Text, links, emphasis and
 * structure pass through unchanged. */

const EMPTY_P = /<p>(?:\s|&nbsp;| )*<\/p>/gi;

/* Classes that mean something to v2 and survive; every other class in the
   content (Bootstrap spacing like `pb-12`, the old lightbox hooks) is the
   old theme's and goes. */
const KEEP_CLASSES = new Set(['visually-hidden', 'hero-lede', 'disclaimer']);

/** Where a display line may break. Typography, not copy — no character of
 *  the text changes, only the places a line is allowed to end:
 *   - a spaced dash never starts a line: the space before it becomes a
 *     no-break space ("ESB — integrate" was breaking to "— integrate");
 *     Polish copy that already binds the dash to the next word (–&nbsp;) is
 *     left exactly as it is;
 *   - a short hyphenated compound ("next-generation", "e-commerce") stays
 *     whole instead of breaking at its hyphen ("next- / generation").
 *  Applied to text between tags only, never inside a tag. */
export function typeset(html: string): string {
  return html.replace(/(^|>)([^<]+)/g, (_m, lead: string, text: string) =>
    lead +
      text
        .replace(/(\S) ([\u2013\u2014]) (?=\S)/g, '$1\u00A0$2 ')
        .replace(/[\p{L}\d]+(?:-[\p{L}\d]+)+/gu, (w) => (w.length <= 16 ? `<span class="nb">${w}</span>` : w)),
  );
}

/** Text from ui.ts, escaped for set:html. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function clean(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+style="[^"]*"/gi, '')
    .replace(/\s+style='[^']*'/gi, '')
    .replace(/\s+data-(?:scroll|scroll-to|ytid)(?:="[^"]*")?/gi, '')
    .replace(/\s+class="([^"]*)"/gi, (_m, list: string) => {
      const kept = list.split(/\s+/).filter((c) => KEEP_CLASSES.has(c));
      return kept.length ? ` class="${kept.join(' ')}"` : '';
    })
    .replace(EMPTY_P, '')
    .replace(/<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/gi, (_m, tag: string, attrs: string, inner: string) => `<${tag}${attrs}>${typeset(inner)}</${tag}>`)
    .trim();
}

/** The same cleanup, then the tags themselves: for places that need the
 *  words of a heading without its markup (aria-labels, JSON-LD). */
export function textOf(html: string | null | undefined): string {
  return clean(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
