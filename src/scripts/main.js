/* gravity.integration — site JS (replaces 150KB bundle.js + Locomotive Scroll)
   Native scroll everywhere. ~2KB of vanilla JS. */

/* ---- reveal on view (Locomotive .is-inview replacement) ---- */
function initReveal() {
  const els = document.querySelectorAll('[data-scroll], [data-scroll-opacity]');
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
    { rootMargin: '0px 0px -10% 0px' },
  );
  els.forEach((el) => io.observe(el));
}

/* ---- sticky header: hide on scroll down, show on scroll up ---- */
function initHeader() {
  let lastY = window.scrollY;
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > 120 && y > lastY + 4) document.body.classList.add('header-hidden');
        else if (y < lastY - 4 || y < 120) document.body.classList.remove('header-hidden');
        /* solid background once scrolled off the (dark) hero, so the header
           doesn't reappear transparent over light content on scroll-up */
        document.body.classList.toggle('header-solid', y > 80);
        lastY = y;
        ticking = false;
      });
    },
    { passive: true },
  );
}

/* ---- hamburger / full-screen nav ---- */
function initNav() {
  const hamburger = document.querySelector('.hamburger');
  const navMain = document.querySelector('.nav-main');
  if (!hamburger || !navMain) return;
  hamburger.addEventListener('click', (e) => {
    e.preventDefault();
    const open = !document.body.classList.contains('nav-open');
    hamburger.classList.toggle('is-active', open);
    hamburger.setAttribute('aria-expanded', String(open));
    if (open) {
      document.body.classList.add('nav-opening');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.body.classList.add('nav-open')),
      );
      document.documentElement.classList.add('nav-lock');
    } else {
      closeNav();
    }
  });

  function closeNav() {
    document.body.classList.remove('nav-open');
    document.documentElement.classList.remove('nav-lock');
    hamburger.classList.remove('is-active');
    hamburger.setAttribute('aria-expanded', 'false');
    setTimeout(() => document.body.classList.remove('nav-opening'), 500);
  }

  /* close menu when a nav link is clicked (same-page anchors) */
  navMain.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeNav));
  /* close on Escape */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeNav();
  });
}

/* ---- accordions (Bootstrap-collapse markup, vanilla behavior) ---- */
function initAccordions() {
  document.querySelectorAll('[data-bs-toggle="collapse"]').forEach((btn) => {
    const target = document.querySelector(btn.getAttribute('data-bs-target'));
    if (!target) return;
    btn.addEventListener('click', () => {
      const isOpen = target.classList.contains('show');
      /* accordion behavior: close others in the same parent scope */
      document.querySelectorAll('.collapse.show').forEach((el) => {
        if (el !== target) {
          el.classList.remove('show');
          const b = document.querySelector(`[data-bs-target="#${el.id}"]`);
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
      target.classList.toggle('show', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

/* ---- smooth scroll for data-scroll-to anchors ---- */
function initAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const el = id && document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', `#${id}`);
      }
    });
  });
}

/* ---- gentle parallax for decorative images (data-scroll-speed) ---- */
function initParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const els = [...document.querySelectorAll('[data-scroll-speed]')].map((el) => ({
    el,
    speed: parseFloat(el.getAttribute('data-scroll-speed')) || 0,
  }));
  if (!els.length) return;
  let ticking = false;
  const update = () => {
    const vh = window.innerHeight;
    for (const { el, speed } of els) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const progress = (r.top + r.height / 2 - vh / 2) / vh; // -0.5..0.5-ish
      el.style.transform = `translateY(${(-progress * speed * 60).toFixed(1)}px)`;
    }
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

/* ---- announcement bar: close + measured height ---- */
function initAnnounceBar() {
  const bar = document.getElementById('gi-announce-bar');
  if (!bar) return;
  let hidden = false;

  // The bar's content wraps to two lines on phones, so its height isn't the
  // 44px the CSS assumes; body margin and the fixed header both offset from
  // --gi-bar-h, so measure the real height and keep it in sync on resize.
  // The variable this writes must never be read back by the bar's own
  // min-height (see AnnouncementBar.astro) — that closed the loop and let the
  // height ratchet up on any transient, permanently. Writing only on a real
  // change also keeps the ResizeObserver from re-entering on its own effect.
  let last = -1;
  const sync = () => {
    if (hidden) return;
    const h = Math.round(bar.getBoundingClientRect().height);
    if (h > 0 && h !== last) {
      last = h;
      document.documentElement.style.setProperty('--gi-bar-h', h + 'px');
    }
  };
  const hide = () => {
    hidden = true;
    bar.style.display = 'none';
    document.documentElement.style.setProperty('--gi-bar-h', '0px');
  };

  // Scoped to the announcement (see AnnouncementBar.astro): dismissing v4 must
  // not silence v5. A missing data-campaign falls back to a shared key rather
  // than to "never dismissible".
  const key = `gi_bar_hidden_${bar.dataset.campaign || 'x'}`;

  if (document.cookie.includes(`${key}=1`)) hide();
  else {
    sync();
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(bar);
    else window.addEventListener('resize', sync, { passive: true });
  }

  const close = document.getElementById('gi-bar-close');
  if (close)
    close.addEventListener('click', () => {
      hide();
      // A year, not a day. The key is per-campaign now, so the next
      // announcement shows regardless of what was dismissed for this one.
      document.cookie = `${key}=1;path=/;max-age=31536000;samesite=lax`;
    });
}

/* Safety net for the new-tab rule.
 *
 * Every link the section renderers emit already goes through lib/links.ts, but
 * a chunk of the site's copy is raw HTML inside the content JSON, where an <a>
 * is hand-written and nothing enforces the policy. This catches those. It is a
 * net, not the mechanism — the markup is correct on its own, so with JS off a
 * missed docs link merely opens in the same tab rather than breaking. */
const NEW_TAB_HOSTS = ['docs.gravity-integration.com'];
/* Language picked at runtime off <html lang> — this bundle is shared by both
   trees. Must match ui.ts's a11y.newTab, which is what the section renderers
   emit; the duplicate-detection below compares against this exact string. */
const NEW_TAB_NOTE = document.documentElement.lang.toLowerCase().startsWith('en')
  ? ' (opens in a new tab)'
  : ' (otwiera się w nowej karcie)';
function initOutboundLinks() {
  const sel = NEW_TAB_HOSTS.map((h) => `a[href*="${h}"]`).join(',');
  document.querySelectorAll(sel).forEach((a) => {
    a.target = '_blank';
    if (!/noopener/.test(a.rel)) a.rel = a.rel ? `${a.rel} noopener` : 'noopener';
    /* The note is checked separately from the target: a hand-written link in the
       content JSON may carry `target="_blank"` and still say nothing to a screen
       reader, and an aria-label carries its own announcement already. */
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
  initNav();
  initAccordions();
  initAnchors();
  initParallax();
});
