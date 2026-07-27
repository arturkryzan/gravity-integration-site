/* MailerLite wiring — single source of truth for account + form IDs.
 *
 * The site is a static Astro build with no adapter, so there is no server to
 * POST to. Every form therefore talks to MailerLite's embedded-form endpoint
 * directly, the same one the official `universal.js` embed uses:
 *
 *   POST https://assets.mailerlite.com/jsonp/{account}/forms/{form}/subscribe
 *
 * (The path says "jsonp" for historical reasons — the response is plain JSON,
 * `{"success":true}` or `{"success":false,"errors":{...}}`, and the endpoint
 * sends a wildcard CORS header. See src/scripts/ml-forms.ts for the client.)
 *
 * All four forms feed the SAME group — GRAVITY (135528944339256750). They stay
 * separate MailerLite forms purely so conversions are attributable per surface:
 * one number for "signed up from the demo section" vs "from the footer".
 */
export const ML_ACCOUNT = '1115638';

export const ML_FORMS = {
  /** gravity.integration — Demo (www) · slug AYDLmi */
  demo: '194146032952542470',
  /** gravity.integration — Kontakt (www) · slug D4zkBE */
  contact: '194146035162940448',
  /** gravity.integration — Newsletter (www) · slug XjjiUa */
  newsletter: '194146037587248808',
  /** gravity download · slug gAV0lr — the /pobieranie/ embed, kept for reference */
  download: '179481837191563185',
} as const;

export type MlFormKey = keyof typeof ML_FORMS;

/** The `action` a <form> posts to. Also the no-JS fallback path. */
export function mlAction(form: MlFormKey): string {
  return `https://assets.mailerlite.com/jsonp/${ML_ACCOUNT}/forms/${ML_FORMS[form]}/subscribe`;
}
