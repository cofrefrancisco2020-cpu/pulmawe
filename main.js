/* ============================================================
   PULMAWE — main.js
   - Nav scroll behavior
   - Mobile menu toggle
   - Scroll-driven frame animation (192 frames in /frames/)
   ============================================================ */

'use strict';

/* ── 1. NAV SCROLL ── */
(function () {
  const nav = document.getElementById('nav');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ── 2. MOBILE MENU ── */
(function () {
  const toggle = document.getElementById('nav-toggle');
  const menu   = document.getElementById('mobile-menu');
  const links  = menu.querySelectorAll('.mm-link, .btn-primary');

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  links.forEach(l => l.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.classList.remove('open');
    document.body.style.overflow = '';
  }));
})();

/* ── 3. SCROLL FRAME ANIMATION ── */
(function () {
  /* ── CONFIG ── */
  const TOTAL_FRAMES = 192;
  const NATIVE_W     = 1080;
  const NATIVE_H     = 1920;
  const FRAMES_DIR   = 'frames/';
  const pad = n => String(n).padStart(4, '0');

  /* ── ELEMENTS ── */
  const canvas  = document.getElementById('frame-canvas');
  const loader  = document.getElementById('canvas-loader');
  const fill    = document.getElementById('loader-fill');
  const pctEl   = document.getElementById('loader-pct');
  const wrap    = document.getElementById('scroll-canvas-wrap');

  if (!canvas || !wrap) return; // guard

  const ctx = canvas.getContext('2d', { alpha: false });

  /* ── SIZING ── */
  let vpW, vpH, dpr;
  function sizeCanvas() {
    dpr  = Math.min(window.devicePixelRatio || 1, 2);
    vpW  = wrap.clientWidth;
    vpH  = wrap.clientHeight;
    canvas.style.width  = vpW + 'px';
    canvas.style.height = vpH + 'px';
    canvas.width  = Math.round(vpW * dpr);
    canvas.height = Math.round(vpH * dpr);
    ctx.scale(dpr, dpr);
  }

  /* ── DRAW COVER ── */
  function drawCover(img) {
    if (!img || !img.naturalWidth) return;
    const imgA = NATIVE_W / NATIVE_H;
    const canA = vpW / vpH;
    let sx, sy, sw, sh;
    if (canA > imgA) {
      sw = NATIVE_W; sh = NATIVE_W / canA;
      sx = 0;        sy = (NATIVE_H - sh) / 2;
    } else {
      sh = NATIVE_H; sw = NATIVE_H * canA;
      sy = 0;        sx = (NATIVE_W - sw) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, vpW, vpH);
  }

  /* ── FRAME STORE ── */
  const frames = new Array(TOTAL_FRAMES).fill(null);
  let loadedCount = 0;

  /* ── PROGRESSIVE PRELOAD ──
     Load first 8 frames immediately for fast first-frame display,
     then load the rest in the background. */
  function preload() {
    return new Promise(resolve => {
      let resolved = false;
      const EAGER = Math.min(8, TOTAL_FRAMES);

      function onLoad() {
        loadedCount++;
        const p = Math.round((loadedCount / TOTAL_FRAMES) * 100);
        fill.style.width = p + '%';
        pctEl.textContent = p + '%';

        // Resolve after first batch so UI can show something quickly
        if (!resolved && loadedCount >= EAGER) {
          resolved = true;
          resolve();
        }
        // Also resolve when everything is done (in case EAGER never triggers)
        if (loadedCount === TOTAL_FRAMES && !resolved) {
          resolved = true;
          resolve();
        }
      }

      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const img = new Image();
        img.onload  = onLoad;
        img.onerror = onLoad; // count errors too so we never hang
        img.src = FRAMES_DIR + 'frames_' + pad(i + 1) + '.png';
        frames[i] = img;
      }
    });
  }

  /* ── SCROLL → FRAME ── */
  let currentIdx = -1;
  function draw(idx) {
    if (idx === currentIdx) return;
    currentIdx = idx;
    const img = frames[idx];
    if (img && img.naturalWidth) {
      drawCover(img);
    } else {
      // If frame not loaded yet, find nearest loaded frame
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const prev = frames[Math.max(0, idx - offset)];
        if (prev && prev.naturalWidth) { drawCover(prev); break; }
      }
    }
  }

  /* ── SCROLL HANDLER ── */
  let rafPending = false;
  let nextIdx    = 0;

  function getProgress() {
    const rect = wrap.getBoundingClientRect();
    // Pin animation while wrap is roughly in viewport
    // We want animation to span a longer scroll range: use section height
    const section    = document.getElementById('scroll-module');
    const secTop     = section.getBoundingClientRect().top + window.scrollY;
    const secHeight  = section.offsetHeight;
    const scrollY    = window.scrollY;
    const range      = secHeight - window.innerHeight;
    const scrolled   = scrollY - secTop;
    return Math.max(0, Math.min(1, scrolled / Math.max(1, range)));
  }

  function onScroll() {
    const progress = getProgress();
    nextIdx = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * TOTAL_FRAMES));
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        draw(nextIdx);
        rafPending = false;
      });
    }
  }

  /* ── RESIZE ── */
  window.addEventListener('resize', () => {
    sizeCanvas();
    const saved = currentIdx < 0 ? 0 : currentIdx;
    currentIdx = -1;
    draw(saved);
  }, { passive: true });

  /* ── INIT ── */
  sizeCanvas();
  preload().then(() => {
    sizeCanvas();
    currentIdx = -1;
    draw(0);
    loader.classList.add('hidden');
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  });
})();
