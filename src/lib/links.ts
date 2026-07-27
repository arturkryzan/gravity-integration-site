/* Outbound-link policy, in one place.
 *
 * The CMS export carries a per-link `target`, but it is unreliable — the same
 * documentation URL ships as `_blank` in one section's JSON and bare in
 * another, and the fullscreen menu's link was hand-written with no target at
 * all. Rather than trusting the data, the rule is stated here and every
 * renderer asks: documentation always opens in a new tab, whatever the export
 * happens to say. Adding a host to NEW_TAB_HOSTS is enough to extend it. */

const NEW_TAB_HOSTS = ['docs.gravity-integration.com'];

function isForcedNewTab(url?: string | null): boolean {
  if (!url) return false;
  return NEW_TAB_HOSTS.some((h) => url.includes(h));
}

/** The `target` to render, honouring the CMS value but overriding it upward
 *  for hosts that must always open in a new tab. Never downgrades. */
export function linkTarget(url?: string | null, declared?: string | null): string {
  if (declared === '_blank' || isForcedNewTab(url)) return '_blank';
  return declared || '_self';
}

/** `rel` to pair with it. Current browsers imply `noopener` for `_blank`, but
 *  the attribute costs one token, covers older engines, and makes the intent
 *  legible at the call site. */
export function linkRel(target?: string | null): string | undefined {
  return target === '_blank' ? 'noopener' : undefined;
}

/** True when the link leaves the site in a new tab, so the caller can append
 *  the visually-hidden "opens in a new tab" note (WCAG 3.2.2). */
export function opensNewTab(url?: string | null, declared?: string | null): boolean {
  return linkTarget(url, declared) === '_blank';
}
