/* MailerLite form runtime.
 *
 * Why this exists: the site is a static build with no server, so there is no
 * `/api/*` to POST to. Forms talk to MailerLite's embedded-form endpoint
 * directly. That endpoint was verified against this account rather than
 * assumed, and three things about it shape the code below:
 *
 *  1. It answers with `application/json` — `{"success":true}` or
 *     `{"success":false,"errors":{"fields":{"email":["…"]}}}`. Despite the
 *     "jsonp" in the path it is NOT callback-wrapped, so a <script> tag can't
 *     read it. Plain fetch, not JSONP.
 *  2. It sends a wildcard CORS header, so fetch can read the body from any
 *     origin — including a localhost preview and a file:// open.
 *  3. The body must be form-encoded. Building it with URLSearchParams and
 *     setting NO custom headers keeps it a CORS-simple request, so the browser
 *     never fires a preflight OPTIONS the endpoint wouldn't answer.
 *
 * Every form also carries a working no-JS path: its `action` is this same
 * endpoint and its inputs are already named `fields[…]`, so with scripting off
 * the browser posts natively and MailerLite handles it. Nothing here is
 * load-bearing for correctness; it is the layer that keeps the user on the
 * page and gives them a real answer.
 */

import { pick } from '../i18n/client';

export type MlOutcome =
  | { ok: true }
  /** MailerLite rejected the address itself — worth showing inline. */
  | { ok: false; kind: 'email'; message: string }
  /** Anything else: offline, timeout, 5xx, an error shape we don't know. */
  | { ok: false; kind: 'network' };

const TIMEOUT_MS = 15000;

/* This module is bundled once and shared by every page in both languages, so
   its copy picks a language at runtime off `<html lang>` — Site.astro stamps
   'pl' or 'en' per page, and src/i18n/client.ts reads it. No build coupling,
   one code path for both trees. */

/** Copy for the one field-level error the endpoint actually returns. */
const EMAIL_REJECTED = pick({
  pl: 'Ten adres e-mail wygląda na nieprawidłowy. Sprawdź go i spróbuj ponownie.',
  en: 'That e-mail address looks invalid. Check it and try again.',
});

/**
 * POST one subscription to MailerLite.
 *
 * `fields` keys are MailerLite field keys (`email`, `name`, `company`,
 * `phone`, `typ_zapytania`) — the `fields[…]` wrapper is added here so callers
 * don't have to think about the wire format.
 */
export async function mlSubmit(
  action: string,
  fields: Record<string, string | undefined>,
): Promise<MlOutcome> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    const v = (value ?? '').trim();
    if (v) body.set(`fields[${key}]`, v);
  }
  body.set('ml-submit', '1');
  body.set('anticsrf', 'true');

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    // No `headers` on purpose: URLSearchParams as a body already sets
    // application/x-www-form-urlencoded, and adding anything else (even
    // Accept) would turn this into a preflighted request.
    const res = await fetch(action, { method: 'POST', body, signal: ctrl.signal });
    if (!res.ok) return { ok: false, kind: 'network' };

    const data = (await res.json()) as {
      success?: boolean;
      errors?: { fields?: Record<string, string[]> };
    };
    if (data?.success) return { ok: true };

    if (data?.errors?.fields?.email?.length) {
      return { ok: false, kind: 'email', message: EMAIL_REJECTED };
    }
    return { ok: false, kind: 'network' };
  } catch {
    return { ok: false, kind: 'network' };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Record a completed submission as a lead.
 *
 * Two channels, because they answer to different consumers:
 *
 *  - `dataLayer.push({event})` is the surface-specific name, kept for whatever
 *    tag manager may be introduced later. Today nothing consumes it — there is
 *    no GTM container on this site — so on its own it is a no-op.
 *  - `gtag('event','generate_lead')` is the one that actually reaches GA4, and
 *    it is what the WordPress build fired on `wpcf7mailsent`. Dropping it in
 *    the rebuild would have silently zeroed the lead metric and, with it, any
 *    Ads conversion imported from that GA4 event.
 *
 * `send_to` pins the event to the GA4 property. Both GA4 and Ads are configured
 * against the same gtag.js instance, so an unaddressed event would fan out to
 * the Ads tag too — which is how a stray, unlabelled conversion appears in an
 * Ads account. WordPress sent this to GA4 only; so do we, and Ads keeps
 * importing it the way it already does.
 *
 * If consent was refused, `gtag` exists (the shim is always defined) but no tag
 * was ever loaded, so the call queues into `dataLayer` and goes nowhere. That is
 * the intended outcome, not a gap: the event is recorded only for people who
 * agreed to be measured.
 */
/**
 * Record the gated software download as a native Google Ads conversion.
 *
 * This is the one event on the site addressed at the Ads tag rather than GA4.
 * `send_to` carries the conversion action's own id — "AW-11029031415/<label>",
 * created in the Ads UI and pasted into site.json as `adsDownloadConversion` —
 * so it lands on exactly that action: GA4 ignores it, and no other Ads
 * conversion can claim it. The conversion's value/currency live on the action
 * in the Ads UI, not here, so pricing it differently never needs a deploy.
 *
 * Until the label exists the config is an empty string and this is a no-op —
 * deliberately, because an unaddressed `conversion` event would fan out to the
 * Ads tag as an *unlabelled* conversion, which is how phantom conversions
 * appear in an account nobody configured (see trackLead above).
 *
 * Consent behaves exactly as it does for `generate_lead`: the gtag shim always
 * exists, so with consent refused the event queues into dataLayer and reaches
 * nothing, because no tag was ever loaded.
 */
export function trackDownloadConversion() {
  const w = window as any;
  const sendTo = w.giAdsDownloadTo;
  if (!sendTo || typeof w.gtag !== 'function') return;
  w.gtag('event', 'conversion', { send_to: sendTo });
}

export function trackLead(event?: string) {
  const w = window as any;
  if (event) w.dataLayer?.push({ event });
  if (typeof w.gtag !== 'function') return;
  w.gtag('event', 'generate_lead', {
    send_to: w.giGa4Id,
    event_category: 'Contact Form',
    value: 1,
    currency: 'PLN',
  });
}

/* ---------------------------------------------------------------------------
   The two CF7-shaped forms (/kontakt/ and the footer newsletter).

   These inherit the WordPress theme's form styling, so the runtime speaks that
   markup's own vocabulary — `.wpcf7-response-output` for the form-level
   message, `.wpcf7-not-valid-tip` for the field-level one — rather than
   inventing classes the stylesheet has never heard of.

   One deviation: the theme hides `.wpcf7-not-valid-tip` inside a checkbox row
   (`opacity: 0`), which would make a missing consent silently unreportable.
   The consent error therefore goes to the response output, which is visible.
--------------------------------------------------------------------------- */

const MSG = pick({
  pl: {
    emailEmpty: 'Podaj adres e-mail.',
    emailInvalid: 'Ten adres wygląda na niepełny. Sprawdź go jeszcze raz.',
    consent: 'Zaznacz zgodę, żebyśmy mogli się odezwać.',
    sending: 'Wysyłam…',
    failed:
      'Nie udało się wysłać formularza. Napisz do nas na contact@caffeine-minds.com — odpowiemy tak samo szybko.',
  },
  en: {
    emailEmpty: 'Enter your e-mail address.',
    emailInvalid: 'That address looks incomplete. Give it another check.',
    consent: 'Tick the consent box so we can get back to you.',
    sending: 'Sending…',
    failed:
      "The form didn't go through. Write to us at contact@caffeine-minds.com — we'll reply just as fast.",
  },
});

/* Set inline because legacy.css already colours `.wpcf7-response-output`, and
   an inline declaration avoids a specificity fight with a minified vendor blob
   we don't otherwise touch. Inline styles still resolve custom properties, so
   the success tone can point at the design system rather than restate it:
   --gi-bg-slate (#464861) is the slate value, and every light-surface component
   in the system already aliases it as `--body` and uses it as body-text colour,
   so this is the same role, not a background token pressed into text duty.
   --gi-red-deep is not the right partner here — it's tuned for the dark
   surfaces. #8c1d18 stays a documented one-off: it is the only value that
   clears 4.5:1 on *both* surfaces these forms render on (5.76:1 on the green
   contact band, 8.31:1 on the light newsletter band), which no existing token
   does. */
const INK = 'var(--gi-bg-slate)';
const ERR = '#8c1d18';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export interface MlSimpleFormOptions {
  /** Endpoint from `mlAction()`. */
  action: string;
  /** Shown in the response output on success. */
  success: string;
  /** Surface-specific dataLayer event name; `generate_lead` fires regardless. */
  event?: string;
}

export function initMlSimpleForm(form: HTMLFormElement, opts: MlSimpleFormOptions) {
  const out = form.querySelector<HTMLElement>('.wpcf7-response-output');
  const submit = form.querySelector<HTMLInputElement>('.wpcf7-submit');
  const email = form.querySelector<HTMLInputElement>('input[type="email"]');
  const consent = form.querySelector<HTMLInputElement>('input[data-ml-consent]');
  if (!email || !submit) return;

  // Native validation stays on with JS off (the markup carries `required` and
  // no `novalidate`); with JS on we take over so the messages are ours and in
  // the page's language regardless of browser locale.
  form.noValidate = true;

  const emailWrap = email.closest<HTMLElement>('.wpcf7-form-control-wrap');
  let tip: HTMLElement | null = null;

  function say(msg: string, tone: 'ok' | 'err') {
    if (!out) return;
    out.textContent = msg;
    out.style.color = tone === 'ok' ? INK : ERR;
    out.style.fontWeight = tone === 'err' ? '600' : '';
    out.hidden = false;
  }

  function clearSay() {
    if (!out) return;
    out.textContent = '';
    out.hidden = true;
  }

  function setTip(msg: string | null) {
    if (!emailWrap) return;
    if (msg) {
      if (!tip) {
        tip = document.createElement('span');
        tip.className = 'wpcf7-not-valid-tip';
        tip.setAttribute('role', 'alert');
        emailWrap.appendChild(tip);
      }
      tip.textContent = msg;
      email!.setAttribute('aria-invalid', 'true');
    } else {
      tip?.remove();
      tip = null;
      email!.setAttribute('aria-invalid', 'false');
    }
  }

  function checkEmail(silent = false): boolean {
    const v = email!.value.trim();
    if (!v) {
      if (!silent) setTip(MSG.emailEmpty);
      return false;
    }
    const ok = EMAIL_RE.test(v);
    setTip(ok || silent ? null : MSG.emailInvalid);
    return ok;
  }

  // Resolve the error as soon as the address becomes valid, but never start
  // complaining at someone still typing their first attempt.
  email.addEventListener('input', () => {
    if (tip && EMAIL_RE.test(email.value.trim())) setTip(null);
  });
  email.addEventListener('blur', () => {
    if (email.value.trim()) checkEmail();
  });
  consent?.addEventListener('change', () => {
    if (consent.checked && out && out.textContent === MSG.consent) clearSay();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;

    clearSay();
    const emailOk = checkEmail();
    if (!emailOk) {
      email.focus();
      return;
    }
    if (consent && !consent.checked) {
      say(MSG.consent, 'err');
      consent.focus();
      return;
    }

    const payload: Record<string, string | undefined> = { email: email.value.trim() };
    // Any other `fields[…]` input in the markup rides along automatically —
    // that is how /kontakt/ contributes `typ_zapytania` without this function
    // knowing the page exists.
    form.querySelectorAll<HTMLInputElement>('input[name^="fields["]').forEach((el) => {
      if (el === email) return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      const key = el.name.slice(7, -1);
      if (key && el.value) payload[key] = el.value;
    });

    submit.disabled = true;
    form.dataset.status = 'submitting';
    const original = submit.value;
    submit.value = MSG.sending;

    const result = await mlSubmit(opts.action, payload);

    submit.disabled = false;
    submit.value = original;

    if (result.ok) {
      form.dataset.status = 'sent';
      say(opts.success, 'ok');
      form.reset();
      setTip(null);
      trackLead(opts.event);
    } else if (result.kind === 'email') {
      form.dataset.status = 'invalid';
      setTip(result.message);
      email.focus();
    } else {
      form.dataset.status = 'failed';
      say(MSG.failed, 'err');
    }
  });
}
