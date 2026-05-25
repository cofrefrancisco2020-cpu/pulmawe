/* ============================================================
   PULMAWE - main.js
   - Nav scroll behavior
   - Mobile menu toggle
   - Progressive scroll-driven frame animation
   ============================================================ */

'use strict';

/* 1. NAV SCROLL */
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* 2. MOBILE MENU */
(function () {
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('mobile-menu');
  if (!toggle || !menu) return;

  const links = menu.querySelectorAll('.mm-link, .btn-primary');

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  links.forEach(link => link.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.classList.remove('open');
    document.body.style.overflow = '';
  }));
})();

/* 3. FOOD CARD HOVER LAYERS */
(function () {
  const cards = document.querySelectorAll('.food-card');
  const mobileQuery = window.matchMedia('(max-width: 700px)');
  let ticking = false;

  const clearScrollActive = () => {
    cards.forEach(card => {
      card.classList.remove('is-scroll-active');
      card.style.removeProperty('--scroll-scale');
    });
  };

  const updateScrollActive = () => {
    ticking = false;

    if (!mobileQuery.matches) {
      clearScrollActive();
      return;
    }

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportCenter = viewportHeight * 0.5;
    const activationRadius = Math.min(viewportHeight * 0.42, 340);
    let activeCard = null;
    let activeProgress = 0;

    cards.forEach(card => {
      card.classList.remove('is-hovered');

      const rect = card.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < viewportHeight;
      if (!visible) return;

      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      const progress = Math.max(0, 1 - distance / activationRadius);

      if (progress > activeProgress) {
        activeProgress = progress;
        activeCard = card;
      }
    });

    cards.forEach(card => {
      const easedProgress = card === activeCard ? activeProgress * activeProgress * (3 - 2 * activeProgress) : 0;
      const scale = 1 + easedProgress * 0.08;
      card.style.setProperty('--scroll-scale', scale.toFixed(4));
      card.classList.toggle('is-scroll-active', card === activeCard && activeProgress > 0.04);
    });
  };

  const requestScrollActive = () => {
    if (ticking) return;
    ticking = true;
    const nextFrame = window.requestAnimationFrame || (callback => window.setTimeout(callback, 16));
    nextFrame(updateScrollActive);
  };

  cards.forEach(card => {
    card.addEventListener('pointerenter', event => {
      if (mobileQuery.matches || event.pointerType === 'touch') return;
      card.classList.add('is-hovered');
    });
    card.addEventListener('pointerleave', () => card.classList.remove('is-hovered'));
  });

  window.addEventListener('scroll', requestScrollActive, { passive: true });
  window.addEventListener('touchmove', requestScrollActive, { passive: true });
  window.addEventListener('resize', requestScrollActive);
  window.addEventListener('load', requestScrollActive);
  window.addEventListener('pageshow', requestScrollActive);
  window.visualViewport?.addEventListener('scroll', requestScrollActive, { passive: true });
  window.visualViewport?.addEventListener('resize', requestScrollActive);

  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', requestScrollActive);
  }

  requestScrollActive();
})();

/* 4. SCROLL FRAME ANIMATION */
(function () {
  const TOTAL_FRAMES = 192;
  const PRIMARY_FRAMES_DIR = 'frames/';
  const FALLBACK_FRAMES_DIR = '../frames/';
  const CRITICAL_FRAME_STEP = 8;
  const CRITICAL_PARALLEL_LOADS = 8;
  const BACKGROUND_PARALLEL_LOADS = 3;
  const pad = n => String(n).padStart(4, '0');

  const canvas = document.getElementById('frame-canvas');
  const loader = document.getElementById('canvas-loader');
  const fill = document.getElementById('loader-fill');
  const pctEl = document.getElementById('loader-pct');
  const pageLoader = document.getElementById('page-loader');
  const pageLoaderFill = document.getElementById('page-loader-fill');
  const pageLoaderPct = document.getElementById('page-loader-pct');
  const wrap = document.getElementById('scroll-canvas-wrap');
  const outer = document.getElementById('scroll-section-outer');
  const badge = document.querySelector('.scroll-badge');

  if (!canvas || !wrap || !outer) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  const frames = new Array(TOTAL_FRAMES).fill(null);
  const failed = new Set();

  let vpW = 0;
  let vpH = 0;
  let dpr = 1;
  let loadedCount = 0;
  let criticalLoadedCount = 0;
  let currentIdx = -1;
  let nextIdx = 0;
  let rafPending = false;
  let criticalFrameSet = new Set();

  function framePath(index, fallback = false) {
    const dir = fallback ? FALLBACK_FRAMES_DIR : PRIMARY_FRAMES_DIR;
    return dir + 'frames_' + pad(index + 1) + '.png';
  }

  function updateProgress() {
    const criticalTotal = Math.max(1, criticalFrameSet.size);
    const p = Math.round((criticalLoadedCount / criticalTotal) * 100);
    if (fill) fill.style.width = p + '%';
    if (pctEl) pctEl.textContent = p + '%';
    if (pageLoaderFill) pageLoaderFill.style.width = p + '%';
    if (pageLoaderPct) pageLoaderPct.textContent = p + '%';
  }

  function releaseLoaders() {
    if (loader) loader.classList.add('hidden');
    if (pageLoader) pageLoader.classList.add('hidden');
    document.body.classList.remove('is-preloading');
  }

  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vpW = Math.max(1, wrap.clientWidth);
    vpH = Math.max(1, wrap.clientHeight || Math.round(vpW * 9 / 16));

    canvas.style.width = vpW + 'px';
    canvas.style.height = vpH + 'px';
    canvas.width = Math.round(vpW * dpr);
    canvas.height = Math.round(vpH * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, vpW, vpH);
  }

  function drawCover(img) {
    if (!img || !img.naturalWidth || !vpW || !vpH) return false;

    const imgA = img.naturalWidth / img.naturalHeight;
    const canA = vpW / vpH;
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;

    if (canA > imgA) {
      sh = sw / canA;
      sy = (img.naturalHeight - sh) / 2;
    } else {
      sw = sh * canA;
      sx = (img.naturalWidth - sw) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, vpW, vpH);
    return true;
  }

  function nearestLoadedFrame(idx) {
    for (let offset = 0; offset < TOTAL_FRAMES; offset++) {
      const prev = frames[idx - offset];
      if (prev && prev.naturalWidth) return prev;

      const next = frames[idx + offset];
      if (next && next.naturalWidth) return next;
    }
    return null;
  }

  function draw(idx) {
    const clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, idx));
    const img = frames[clamped] || nearestLoadedFrame(clamped);

    if (!img || !img.naturalWidth) return;
    if (clamped === currentIdx && frames[clamped]) return;

    currentIdx = clamped;
    drawCover(img);
  }

  function loadFrame(index, isCritical = false) {
    if (frames[index] || failed.has(index)) return Promise.resolve(frames[index]);

    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';

      const done = ok => {
        if (ok) {
          frames[index] = img;
        } else {
          failed.add(index);
        }

        loadedCount++;
        if (isCritical) criticalLoadedCount++;
        updateProgress();

        if (frames[0] && currentIdx < 0) {
          draw(0);
        }

        resolve(frames[index]);
      };

      img.onload = () => done(true);
      img.onerror = () => {
        img.onerror = () => done(false);
        img.src = framePath(index, true);
      };

      img.src = framePath(index, false);
    });
  }

  async function loadQueue(indices, parallelLoads, critical = false) {
    let cursor = 0;

    async function worker() {
      while (cursor < indices.length) {
        const index = indices[cursor++];
        await loadFrame(index, critical);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(parallelLoads, indices.length) }, worker)
    );
  }

  function getProgress() {
    const top = outer.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(1, outer.offsetHeight - window.innerHeight);
    return Math.max(0, Math.min(1, (window.scrollY - top) / range));
  }

  function onScroll() {
    const progress = getProgress();
    nextIdx = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * (TOTAL_FRAMES - 1)));

    if (badge) badge.classList.toggle('gone', progress > 0.04);

    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        draw(nextIdx);
        rafPending = false;
      });
    }
  }

  window.addEventListener('resize', () => {
    sizeCanvas();
    const saved = currentIdx < 0 ? nextIdx : currentIdx;
    currentIdx = -1;
    draw(saved);
  }, { passive: true });

  sizeCanvas();

  const allFrameIndexes = Array.from({ length: TOTAL_FRAMES }, (_, i) => i);
  const criticalFrameIndexes = allFrameIndexes.filter(i => (
    i === 0 || i === TOTAL_FRAMES - 1 || i % CRITICAL_FRAME_STEP === 0
  ));
  criticalFrameSet = new Set(criticalFrameIndexes);
  updateProgress();

  loadQueue(criticalFrameIndexes, CRITICAL_PARALLEL_LOADS, true).finally(() => {
    currentIdx = -1;
    draw(0);
    releaseLoaders();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const remainingFrameIndexes = allFrameIndexes.filter(i => !criticalFrameSet.has(i));
    window.setTimeout(() => {
      loadQueue(remainingFrameIndexes, BACKGROUND_PARALLEL_LOADS, false).then(() => {
        const saved = currentIdx < 0 ? nextIdx : currentIdx;
        currentIdx = -1;
        draw(saved);
      });
    }, 200);
  });
})();
