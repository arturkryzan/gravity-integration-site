/* gravity.integration v2 — site JS. Native everything; a couple of KB. */

/* ---- reveal on view -------------------------------------------------------
   Content is visible by default (base.css only hides [data-reveal] once
   `html.js` is set), so this can only ever add polish, never gate content. */
function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-inview'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-inview');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  els.forEach((el) => io.observe(el));
}

/* ---- header: solid once the page moves, hidden on the way down -------------
   The header is sticky and sits on the hero's colour at the top of the page.
   Past the first few pixels it turns white; scrolling down tucks it away and
   any scroll up brings it back. */
function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;
  let lastY = window.scrollY;
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    const body = document.body;
    body.classList.toggle('header-solid', y > 8);
    if (y > 240 && y > lastY + 4) body.classList.add('header-hidden');
    else if (y < lastY - 4 || y < 240) body.classList.remove('header-hidden');
    lastY = y;
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  /* Keyboard users tabbing into the header while it is tucked away must be
     able to see where focus went. */
  header.addEventListener('focusin', () => document.body.classList.remove('header-hidden'));
  update();
}

/* ---- announcement bar: close ---------------------------------------------- */
function initAnnounceBar() {
  const bar = document.getElementById('gi-announce-bar');
  const close = document.getElementById('gi-bar-close');
  if (!bar || !close) return;
  /* Scoped to the announcement (see AnnouncementBar.astro): dismissing v4
     must not silence v5. */
  const key = `gi_bar_hidden_${bar.dataset.campaign || 'x'}`;
  close.addEventListener('click', () => {
    bar.hidden = true;
    document.cookie = `${key}=1;path=/;max-age=31536000;samesite=lax`;
    /* Focus was on the control that just disappeared; hand it to the page. */
    document.querySelector('.site-logo')?.focus();
  });
}

/* ---- the new-tab rule, as a safety net -------------------------------------
   Every link the renderers emit already goes through lib/links.ts, but part
   of the copy is raw HTML inside the content JSON, where an <a> is
   hand-written and nothing enforces the policy. This catches those. With JS
   off a missed docs link merely opens in the same tab. */
const NEW_TAB_HOSTS = ['docs.gravity-integration.com'];
/* Must match ui.ts's a11y.newTab, which the renderers emit. */
const NEW_TAB_NOTE = document.documentElement.lang.toLowerCase().startsWith('en')
  ? ' (opens in a new tab)'
  : ' (otwiera się w nowej karcie)';
function initOutboundLinks() {
  const sel = NEW_TAB_HOSTS.map((h) => `a[href*="${h}"]`).join(',');
  document.querySelectorAll(sel).forEach((a) => {
    a.target = '_blank';
    if (!/noopener/.test(a.rel)) a.rel = a.rel ? `${a.rel} noopener` : 'noopener';
    const announced = a.hasAttribute('aria-label') || a.textContent.includes(NEW_TAB_NOTE);
    if (!announced) {
      const note = document.createElement('span');
      note.className = 'visually-hidden';
      note.textContent = NEW_TAB_NOTE;
      a.appendChild(note);
    }
  });
}

document.documentElement.classList.add('js');
document.addEventListener('DOMContentLoaded', () => {
  initOutboundLinks();
  initAnnounceBar();
  initReveal();
  initHeader();
});
