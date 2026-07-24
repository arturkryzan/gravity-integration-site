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
      document.body.style.overflow = 'hidden';
    } else {
      document.body.classList.remove('nav-open');
      document.body.style.overflow = '';
      setTimeout(() => document.body.classList.remove('nav-opening'), 500);
    }
  });
  /* close menu when a nav link is clicked (same-page anchors) */
  navMain.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      document.body.classList.remove('nav-open');
      document.body.style.overflow = '';
      hamburger.classList.remove('is-active');
      setTimeout(() => document.body.classList.remove('nav-opening'), 500);
    }),
  );
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

/* ---- announcement bar close ---- */
function initAnnounceBar() {
  const bar = document.getElementById('gi-announce-bar');
  if (!bar) return;
  const hide = () => {
    bar.style.display = 'none';
    document.documentElement.style.setProperty('--gi-bar-h', '0px');
  };
  if (document.cookie.includes('gi_bar_hidden=1')) hide();
  const close = document.getElementById('gi-bar-close');
  if (close)
    close.addEventListener('click', () => {
      hide();
      document.cookie = 'gi_bar_hidden=1;path=/;max-age=86400';
    });
}

document.documentElement.classList.add('js');
document.addEventListener('DOMContentLoaded', () => {
  initAnnounceBar();
  initReveal();
  initHeader();
  initNav();
  initAccordions();
  initAnchors();
  initParallax();
});
