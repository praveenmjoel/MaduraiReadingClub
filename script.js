/* =============================================================
   MADURAI READING CLUB — script.js
   =============================================================

   CONTENTS
   ────────
   0.  CURRENT BOOK  ← ★ UPDATE THIS EVERY TWO WEEKS ★
   1.  GALLERY CONFIGURATION
   2.  Manifest loader
   3.  GalleryCycler class
   4.  Navigation
   5.  Mobile hamburger menu
   6.  Scroll-triggered fade-in (IntersectionObserver)
   7.  Hero parallax
   8.  Lightbox
   9.  Google Form iframe activation
   10. Smooth anchor scroll
   11. Now-Reading ribbon
   ============================================================= */

'use strict';

// Mark body so CSS fade-up animations only activate when JS is running
document.body.classList.add('js-ready');


/* ╔═══════════════════════════════════════════════════════════╗
   ║  0.  CURRENT BOOK  —  ★ UPDATE THIS EVERY TWO WEEKS ★   ║
   ╚═══════════════════════════════════════════════════════════╝
   Change title, author, and date below.
   Date format: "12 Apr 2025"  or  "April 12, 2025"  — your choice.
   Set  show: false  to hide the ribbon without deleting anything.  */

const CURRENT_BOOK = {
  show   : true,
  title  : 'Homo Deus',
  author : 'Yuval Noah Harari',
  date   : '12 Apr 2026',
};


/* ─────────────────────────────────────────────────────────────
   1.  GALLERY CONFIGURATION
   ─────────────────────────────────────────────────────────────

   ╔══════════════════════════════════════════════════════╗
   ║  HOW TO ADD YOUR IMAGES (two options)               ║
   ╠══════════════════════════════════════════════════════╣
   ║  OPTION A — manifest.json (recommended, automatic)  ║
   ║   1. Create  images/bookmarks/  folder              ║
   ║   2. Put your bookmark images inside                ║
   ║   3. Create  images/bookmarks/manifest.json :       ║
   ║      ["session-01.jpg","session-02.jpg", ...]       ║
   ║   The gallery will pick and cycle them on its own.  ║
   ╠══════════════════════════════════════════════════════╣
   ║  OPTION B — add filenames to the arrays below       ║
   ║   books.files    → for book cover images            ║
   ║   bookmarks.files → for bookmark images             ║
   ╚══════════════════════════════════════════════════════╝
   ──────────────────────────────────────────────────────── */

const GALLERY_CONFIG = {

  /* ── Past book covers (masonry, portrait-ish) ── */
  books: {
    folder : 'images/books/',
    files  : [
      // Add filenames here, e.g.:
      // 'sapiens.jpg',
      // 'atomic-habits.jpg',
      // 'thinking-fast-and-slow.jpg',
    ],
    slots      : 9,
    // Height in px for each of the 9 masonry slots
    heights    : [360, 248, 310, 428, 234, 346, 268, 388, 218],
    cycleMs    : 6000,
    varianceMs : 2800,
    fadeMs     : 1500,
    staggerMs  : 900,
  },

  /* ── Session bookmarks (collage, wide panoramic) ── */
  bookmarks: {
    folder : 'images/bookmarks/',
    files  : [
      // Add filenames here, e.g.:
      // 'session-01.jpg',
      // 'session-02.jpg',
      // 'session-03.jpg',
    ],
    slots      : 8,   // 4 rows × (wide + narrow) = 8 items
    /*
      sizePattern drives the interlocking brick layout.
      'wide'   → grid-column: span 2  (panoramic ~4.3:1)
      'narrow' → grid-column: span 1  (landscape  ~2.15:1)

      CSS Grid auto-placement turns this pattern into:
        Row 1  [  WIDE  ×2  ] [ narrow ]
        Row 2  [ narrow ] [  WIDE  ×2  ]
        Row 3  [  WIDE  ×2  ] [ narrow ]
        Row 4  [ narrow ] [  WIDE  ×2  ]
    */
    sizePattern : ['wide','narrow','narrow','wide','wide','narrow','narrow','wide'],
    cycleMs    : 5500,
    varianceMs : 2200,
    fadeMs     : 1500,
    staggerMs  : 110,  // tight stagger for the wave-entrance effect
  },

};


/* ─────────────────────────────────────────────────────────────
   2.  MANIFEST LOADER
   ─────────────────────────────────────────────────────────────
   Tries to fetch  {folder}/manifest.json.
   Format expected (simple array of filenames):
     ["session-01.jpg", "session-02.jpg"]
   Falls back to the files[] array in GALLERY_CONFIG on any error.
   ──────────────────────────────────────────────────────────── */

async function loadManifest(folder, fallback) {
  try {
    const res  = await fetch(folder + 'manifest.json', { cache: 'no-store' });
    if (!res.ok) return fallback;
    const data = await res.json();
    const list = Array.isArray(data) ? data
                 : Array.isArray(data.files) ? data.files
                 : null;
    return (list && list.length > 0) ? list : fallback;
  } catch {
    return fallback;
  }
}


/* ─────────────────────────────────────────────────────────────
   3.  GalleryCycler
   ─────────────────────────────────────────────────────────────
   • Builds gallery DOM (slots with two image layers + placeholder)
   • Uses a SHARED POOL to guarantee no image appears in more than
     one slot at the same time:
       - Images are shuffled and dealt out to slots like cards
       - The "pool" holds images not currently on screen
       - On each crossfade: outgoing image returns to pool,
         incoming image is drawn from pool
       - If pool is empty (images ≤ slots), that slot stays put
   • Supports sizePattern for the interlocking collage layout
   • Assigns CSS --item-delay for the staggered entrance animation
   ──────────────────────────────────────────────────────────── */

/** Fisher-Yates in-place shuffle. Returns the array. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Brand placeholder colours (deep purples from the logo palette) */
const PH_COLORS = [
  '#1a0826','#2a0d36','#3b1040',
  '#4d1a58','#5c2272','#3b1040',
  '#2a0d36','#1a0826','#4d1a58',
];

class GalleryCycler {
  /**
   * @param {Object}      opts
   * @param {HTMLElement} opts.container    Gallery wrapper element
   * @param {Object}      opts.config       Entry from GALLERY_CONFIG (with resolved files)
   * @param {boolean}     opts.collage      true for the bookmark collage layout
   * @param {Function}    opts.onItemClick  (src, alt) → open lightbox
   */
  constructor({ container, config, collage = false, onItemClick }) {
    this.el          = container;
    this.cfg         = config;
    this.collage     = collage;
    this.onItemClick = onItemClick || null;

    // Full URL list, shuffled once at start
    this.images = shuffle((config.files || []).map(f => config.folder + f));

    /*
      Pool state — guarantees no duplicate visible across tiles:
        assignedImages[i]  = URL currently displayed in slot i  (null = placeholder)
        availablePool      = URLs not currently on screen
    */
    this.assignedImages = [];
    this.availablePool  = [];

    this.slots = [];
    this._initPool();   // deal images to slots, rest into pool
    this._build();
    if (this.availablePool.length > 0) this._startCycling();
  }

  /* ── Pool initialisation ───────────────────────────────────── */

  _initPool() {
    const slotCount = this.cfg.slots;
    const shuffled  = shuffle([...this.images]);

    this.assignedImages = new Array(slotCount).fill(null);
    this.availablePool  = [];

    // Deal one image per slot; extras go to the pool for cycling
    shuffled.forEach((src, i) => {
      if (i < slotCount) {
        this.assignedImages[i] = src;
      } else {
        this.availablePool.push(src);
      }
    });
    /*
      Examples:
        12 images, 9 slots → slots 0-8 assigned, pool has 3 → cycling active
        9 images,  9 slots → slots 0-8 assigned, pool empty → no cycling (all shown, no repeats)
        5 images,  9 slots → slots 0-4 assigned, pool empty → 4 slots show placeholder, no cycling
    */
  }

  /* ── Build DOM ─────────────────────────────────────────────── */

  _build() {
    this.el.innerHTML = '';

    const { slots, heights, sizePattern, staggerMs } = this.cfg;
    const colors = shuffle([...PH_COLORS]);

    for (let i = 0; i < slots; i++) {
      const color    = colors[i % colors.length];
      const isWide   = this.collage && sizePattern && sizePattern[i] === 'wide';
      const height   = !this.collage && heights ? heights[i] : null;
      const assigned = this.assignedImages[i]; // may be null

      const { figure, layerA, layerB, phLayer } = this._createSlot(color, height, isWide, i);
      this.el.appendChild(figure);

      // Store slot index so _crossfade can address the pool correctly
      const slot = { figure, layerA, layerB, phLayer, active: 'a', idx: i };
      this.slots.push(slot);

      if (!assigned) {
        // No image was dealt to this slot — show placeholder
        phLayer.classList.add('active');
      } else {
        layerA.src = assigned;
        layerA.classList.add('active');
      }

      if (this.onItemClick) {
        figure.addEventListener('click', () => {
          const vis = slot.active === 'a' ? slot.layerA : slot.layerB;
          if (vis.src && !vis.src.endsWith('blank')) {
            this.onItemClick(vis.src, vis.alt || '');
          }
        });
      }
    }
  }

  _createSlot(bgColor, heightPx, isWide, index) {
    const figure = document.createElement('figure');
    figure.className = 'gallery-item';

    if (isWide)   figure.setAttribute('data-wide', '');
    if (heightPx) figure.style.height = heightPx + 'px';

    const delayMs = index * (this.cfg.staggerMs || 90);
    figure.style.setProperty('--item-delay', delayMs + 'ms');

    const layerA = document.createElement('img');
    layerA.className = 'img-layer layer-a';
    layerA.alt       = '';
    layerA.loading   = 'lazy';

    const layerB = document.createElement('img');
    layerB.className = 'img-layer layer-b';
    layerB.alt       = '';
    layerB.loading   = 'lazy';

    const phLayer = document.createElement('div');
    phLayer.className        = 'ph-layer';
    phLayer.style.background = bgColor;
    phLayer.innerHTML = `
      <span class="ph-glyph">✦</span>
      <span class="ph-text">Add image</span>
    `;

    figure.appendChild(layerA);
    figure.appendChild(layerB);
    figure.appendChild(phLayer);

    return { figure, layerA, layerB, phLayer };
  }

  /* ── Pool-based image selection ────────────────────────────── */

  /**
   * Atomically swaps one image out of the pool into slot `slotIdx`.
   * Returns the new image URL, or null if the pool is empty.
   *
   * The operation is:
   *   1. Pick a random image from availablePool
   *   2. Remove it from the pool
   *   3. Return the slot's current image to the pool
   *   4. Record the new assignment
   */
  _drawFromPool(slotIdx) {
    if (this.availablePool.length === 0) return null; // nothing to swap in

    const currentSrc = this.assignedImages[slotIdx];
    const poolIdx    = Math.floor(Math.random() * this.availablePool.length);
    const nextSrc    = this.availablePool.splice(poolIdx, 1)[0]; // remove from pool

    if (currentSrc) this.availablePool.push(currentSrc); // return current to pool
    this.assignedImages[slotIdx] = nextSrc;

    return nextSrc;
  }

  /* ── Cycling orchestration ─────────────────────────────────── */

  _startCycling() {
    const { cycleMs, varianceMs, staggerMs } = this.cfg;
    this.slots.forEach((slot, i) => {
      if (!this.assignedImages[i]) return; // placeholder slot — skip
      const startDelay = i * staggerMs + Math.random() * 1200;
      setTimeout(() => this._scheduleNext(slot, cycleMs, varianceMs), startDelay);
    });
  }

  _scheduleNext(slot, baseMs, varianceMs) {
    const interval = baseMs + Math.random() * varianceMs;
    setTimeout(() => {
      this._crossfade(slot);
      this._scheduleNext(slot, baseMs, varianceMs);
    }, interval);
  }

  _crossfade(slot) {
    const nextSrc = this._drawFromPool(slot.idx);
    if (!nextSrc) return; // pool exhausted — skip this cycle, try again next time

    const incoming = slot.active === 'a' ? slot.layerB : slot.layerA;
    const outgoing = slot.active === 'a' ? slot.layerA : slot.layerB;

    incoming.src = nextSrc;

    const doSwap = () => {
      incoming.classList.add('active');
      outgoing.classList.remove('active');
      slot.active = slot.active === 'a' ? 'b' : 'a';
    };

    if (incoming.complete && incoming.naturalWidth > 0) {
      requestAnimationFrame(doSwap);
    } else {
      incoming.onload  = doSwap;
      incoming.onerror = doSwap;
    }
  }
}


/* ─────────────────────────────────────────────────────────────
   4.  NAVIGATION
   ──────────────────────────────────────────────────────────── */
const nav       = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navMenu   = document.getElementById('navMenu');
const navLinks  = document.querySelectorAll('.nav-link');

function handleNavScroll() {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}
function updateActiveNavLink() {
  let current = '';
  document.querySelectorAll('section[id]').forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 150) current = sec.id;
  });
  navLinks.forEach(link =>
    link.classList.toggle('active', link.getAttribute('href') === '#' + current)
  );
}

window.addEventListener('scroll', () => { handleNavScroll(); updateActiveNavLink(); }, { passive: true });
handleNavScroll();
updateActiveNavLink();


/* ─────────────────────────────────────────────────────────────
   5.  MOBILE HAMBURGER MENU
   ──────────────────────────────────────────────────────────── */
navToggle.addEventListener('click', () => {
  const open = navMenu.classList.toggle('open');
  navToggle.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });
});

document.addEventListener('click', e => {
  if (navMenu.classList.contains('open') &&
      !navMenu.contains(e.target) && !navToggle.contains(e.target)) {
    navMenu.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
});


/* ─────────────────────────────────────────────────────────────
   6.  SCROLL-TRIGGERED FADE-IN
   ──────────────────────────────────────────────────────────────
   For regular .fade-up elements: adds .visible to trigger CSS transition.
   Special handling for .collage-gallery: also adds .items-ready which
   unpauses the staggered entrance animation on each gallery-item.
   ──────────────────────────────────────────────────────────── */
const fadeObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('visible');

      // Trigger collage item entrance animations
      if (el.classList.contains('collage-gallery')) {
        // Small rAF delay ensures CSS animation-play-state is applied
        // after the gallery items have been rendered by GalleryCycler
        requestAnimationFrame(() =>
          requestAnimationFrame(() => el.classList.add('items-ready'))
        );
      }
      fadeObserver.unobserve(el);
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.fade-up').forEach(el => fadeObserver.observe(el));


/* ─────────────────────────────────────────────────────────────
   7.  HERO PARALLAX
   ──────────────────────────────────────────────────────────── */
const heroContent = document.querySelector('.hero-content');
const motionOK    = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

if (motionOK && heroContent) {
  const heroEl = document.querySelector('.hero');
  window.addEventListener('scroll', () => {
    const s = window.scrollY;
    if (s < heroEl.offsetHeight) {
      heroContent.style.transform = `translateY(${s * 0.28}px)`;
      heroContent.style.opacity   = Math.max(0, 1 - (s / heroEl.offsetHeight) * 1.65).toFixed(3);
    }
  }, { passive: true });
}


/* ─────────────────────────────────────────────────────────────
   8.  LIGHTBOX
   ──────────────────────────────────────────────────────────── */
const lightbox      = document.getElementById('lightbox');
const lightboxImg   = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxBdrop = document.getElementById('lightboxBackdrop');

function openLightbox(src, alt) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
  lightboxClose.focus();
}
function closeLightbox() {
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
  lightboxImg.src = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxBdrop.addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
});


/* ─────────────────────────────────────────────────────────────
   9.  GOOGLE FORM IFRAME ACTIVATION
   ──────────────────────────────────────────────────────────── */
const formIframe      = document.querySelector('.join-form');
const formPlaceholder = document.getElementById('formPlaceholder');

if (formIframe) {
  const realSrc = formIframe.getAttribute('data-src') || '';
  if (realSrc && !realSrc.includes('YOUR_FORM_ID_HERE')) {
    const formObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        formIframe.src = realSrc;
        if (formPlaceholder) formPlaceholder.style.display = 'none';
        formObserver.disconnect();
      }
    }, { threshold: 0.1 });
    formObserver.observe(formIframe);
  }
}


/* ─────────────────────────────────────────────────────────────
   10. SMOOTH ANCHOR SCROLL  (accounts for fixed nav height)
   ──────────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const id = anchor.getAttribute('href');
    if (id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - nav.offsetHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});


/* ─────────────────────────────────────────────────────────────
   INITIALISE GALLERIES
   ─────────────────────────────────────────────────────────────
   1. Try to load manifest.json from each image folder.
   2. Fall back to the files[] arrays in GALLERY_CONFIG.
   3. Dedicated IntersectionObserver triggers collage entrance
      animation (items-ready) when the gallery scrolls into view.
   ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {

  const booksEl     = document.getElementById('pastBooksGallery');
  const bookmarksEl = document.getElementById('bookmarksGallery');

  const [bookFiles, bmFiles] = await Promise.all([
    loadManifest(GALLERY_CONFIG.books.folder,     GALLERY_CONFIG.books.files),
    loadManifest(GALLERY_CONFIG.bookmarks.folder, GALLERY_CONFIG.bookmarks.files),
  ]);

  if (booksEl) {
    new GalleryCycler({
      container   : booksEl,
      config      : { ...GALLERY_CONFIG.books,     files: bookFiles },
      collage     : false,
      onItemClick : openLightbox,
    });
  }

  if (bookmarksEl) {
    new GalleryCycler({
      container   : bookmarksEl,
      config      : { ...GALLERY_CONFIG.bookmarks, files: bmFiles },
      collage     : true,
      onItemClick : openLightbox,
    });

    // Dedicated observer: triggers the staggered item entrance animation
    // when the collage scrolls into view (separate from the fade-up system)
    const collageObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => bookmarksEl.classList.add('items-ready'))
      );
      collageObserver.disconnect();
    }, { threshold: 0.05 });
    collageObserver.observe(bookmarksEl);
  }

});


/* ─────────────────────────────────────────────────────────────
   11. NOW-READING RIBBON
   ──────────────────────────────────────────────────────────── */
(function buildNowReading() {
  if (!CURRENT_BOOK.show) return;

  const ribbon = document.createElement('aside');
  ribbon.className = 'now-reading';
  ribbon.setAttribute('aria-label', 'Currently reading');
  ribbon.innerHTML = `
    <button class="nr-dismiss" aria-label="Dismiss">&#x2715;</button>
    <p class="nr-eyebrow">Now Reading</p>
    <p class="nr-title">${CURRENT_BOOK.title}</p>
    <p class="nr-author">by ${CURRENT_BOOK.author}</p>
    <div class="nr-divider"></div>
    <p class="nr-date">
      <span class="nr-date-label">Discussion</span>
      <span>${CURRENT_BOOK.date} &nbsp;·&nbsp; 4 PM</span>
    </p>
  `;

  document.body.appendChild(ribbon);

  // Slide in after a short delay so it doesn't compete with page load
  setTimeout(() => ribbon.classList.add('nr-visible'), 900);

  ribbon.querySelector('.nr-dismiss').addEventListener('click', () => {
    ribbon.classList.remove('nr-visible');
    setTimeout(() => ribbon.remove(), 400);
  });
}());


/* ─────────────────────────────────────────────────────────────
   12. AUTHOR MEET CARD
   ──────────────────────────────────────────────────────────── */
(function buildAuthorMeet() {
  const card = document.createElement('aside');
  card.className = 'author-meet-card';
  card.setAttribute('aria-label', 'Upcoming Author Meet');
  card.innerHTML = `
    <button class="amc-dismiss" aria-label="Dismiss">&#x2715;</button>
    <p class="amc-eyebrow">Author Meet &amp; Conversation</p>
    <p class="amc-title">Latshmihar</p>
    <p class="amc-sub">Celebrating <em>Koothondru Kooditru</em></p>
    <p class="amc-award">Sahitya Akademi Yuva Puraskar Award Winner</p>
    <div class="amc-divider"></div>
    <p class="amc-date">
      <span class="amc-date-label">Date &amp; Time</span>
      <span>Sunday, 05 Apr 2026 &nbsp;·&nbsp; 4–5 PM</span>
    </p>
    <p class="amc-date">
      <span class="amc-date-label">Venue</span>
      <span>Knowledge Hive, Anna Nagar, Madurai</span>
    </p>
  `;

  document.body.appendChild(card);

  setTimeout(() => card.classList.add('amc-visible'), 1400);

  card.querySelector('.amc-dismiss').addEventListener('click', () => {
    card.classList.remove('amc-visible');
    setTimeout(() => card.remove(), 400);
  });
}());


/* ─── Branding ───────────────────────────────────────────────── */
console.log(
  '%cMadurai Reading Club',
  'font-size:18px;font-weight:bold;color:#C4A44A;font-family:Georgia,serif;'
);
console.log(
  '%cTo make Madurai read like never before.',
  'font-size:12px;color:#5C2272;font-style:italic;'
);
