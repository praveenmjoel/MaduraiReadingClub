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
  title  : 'A Field Guide to Lies and Statistics',
  author : 'Daniel Levitin',
  date   : '17 May 2026',
  cover  : 'images/Voting/A%20Field%20Guide%20to%20Lies%20and%20Statistics.jpg',
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
   5.  MOBILE HAMBURGER + DROPDOWN GROUPS
   ──────────────────────────────────────────────────────────── */
const navGroups = document.querySelectorAll('.nav-group');

function closeAllMenus() {
  navMenu.classList.remove('open');
  navToggle.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  navGroups.forEach(g => {
    g.classList.remove('open');
    g.querySelector('.nav-group-btn')?.setAttribute('aria-expanded', 'false');
  });
}

/* Hamburger toggle */
navToggle.addEventListener('click', () => {
  const open = navMenu.classList.toggle('open');
  navToggle.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});

/* Group buttons — desktop hover is CSS; this handles click/tap for mobile */
navGroups.forEach(group => {
  const btn = group.querySelector('.nav-group-btn');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = group.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen);
    /* Close other groups */
    navGroups.forEach(other => {
      if (other !== group) {
        other.classList.remove('open');
        other.querySelector('.nav-group-btn')?.setAttribute('aria-expanded', 'false');
      }
    });
  });
});

/* Any nav link click → close everything */
navLinks.forEach(link => {
  link.addEventListener('click', closeAllMenus);
});

/* Click outside → close */
document.addEventListener('click', e => {
  if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
    closeAllMenus();
  }
});

/* Escape key → close */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllMenus();
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
   9.  CUSTOM JOIN FORM
       • Real-time phone validation with country code selector
       • Posts to Google Forms (backup) + MRC database (primary)
   ──────────────────────────────────────────────────────────── */
(function initJoinForm() {
  const form         = document.getElementById('joinForm');
  const successEl    = document.getElementById('cjfSuccess');
  const submitBtn    = form ? form.querySelector('.cjf-submit') : null;

  if (!form) return;

  const GF_ACTION    = 'https://docs.google.com/forms/d/e/1FAIpQLScyUgBQy52o3MQgrGxnrYWcRIqSyt2wqT_HOLYq5UevzsN01Q/formResponse';
  const MRC_API      = 'https://pages.maduraireadingclub.com/api/members';

  const phoneLocal   = document.getElementById('cjf-mobile-local');
  const countryCode  = document.getElementById('cjf-country-code');
  const phoneHidden  = document.getElementById('cjf-mobile');
  const phoneError   = document.getElementById('cjf-phone-error');

  // ── Phone validation ─────────────────────────────────────
  function validatePhone(local, code) {
    const stripped = local.replace(/[\s\-\(\)\.]/g, '');
    if (!stripped) return { ok: false, msg: 'Phone number is required.' };

    const codeDigits = code.replace('+', '');

    // Detect if user entered the country code themselves
    if (stripped.startsWith('+') || stripped.startsWith('00')) {
      return { ok: false, msg: 'Enter only your local number — the country code (' + code + ') is already selected.' };
    }
    if (codeDigits.length >= 2 && stripped.startsWith(codeDigits)) {
      return { ok: false, msg: 'Remove the country code (' + code + ') — enter just your local number.' };
    }

    // Digits only after stripping
    if (!/^\d+$/.test(stripped)) {
      return { ok: false, msg: 'Use digits only, no letters or symbols.' };
    }

    // India: exactly 10 digits, starting with 6-9
    if (code === '+91') {
      if (stripped.length !== 10) return { ok: false, msg: 'Indian mobile numbers are exactly 10 digits.' };
      if (!/^[6-9]/.test(stripped)) return { ok: false, msg: 'Enter a valid Indian mobile number (starts with 6–9).' };
    } else {
      if (stripped.length < 7 || stripped.length > 15) {
        return { ok: false, msg: 'Enter a valid phone number (7–15 digits).' };
      }
    }

    return { ok: true, stripped };
  }

  function showPhoneError(msg) {
    phoneError.textContent = msg;
    phoneLocal.style.borderBottomColor = msg ? '#c0533a' : '';
  }

  // Real-time validation as the user types
  phoneLocal.addEventListener('input', function () {
    const result = validatePhone(this.value, countryCode.value);
    showPhoneError(result.ok ? '' : result.msg);
  });
  countryCode.addEventListener('change', function () {
    if (phoneLocal.value) {
      const result = validatePhone(phoneLocal.value, this.value);
      showPhoneError(result.ok ? '' : result.msg);
    }
  });

  // ── Submit ───────────────────────────────────────────────
  form.addEventListener('submit', async e => {
    e.preventDefault();

    // Validate phone first
    const code   = countryCode.value;
    const result = validatePhone(phoneLocal.value, code);
    if (!result.ok) {
      showPhoneError(result.msg);
      phoneLocal.focus();
      return;
    }

    // Build full phone number and set hidden input for Google Forms
    const fullPhone = code + result.stripped;
    phoneHidden.value = fullPhone;

    // HTML5 validation for other fields
    if (!form.checkValidity()) {
      form.querySelectorAll(':invalid')[0]?.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.querySelector('.cjf-submit-text').textContent = 'Submitting…';

    // ── 1. Post to Google Forms (silent backup) ──────────
    try {
      await fetch(GF_ACTION, { method: 'POST', mode: 'no-cors', body: new FormData(form) });
    } catch (_) { /* opaque response is expected */ }

    // ── 2. Post to MRC native database ──────────────────
    const isStudentEl = form.querySelector('[name="entry.2050319011"]:checked');
    const studyEl     = form.querySelector('[name="entry.2071127740"]:checked');
    const howHeardEl  = form.querySelector('[name="entry.1615453040"]:checked');

    try {
      const res = await fetch(MRC_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:       fullPhone,
          name:        document.getElementById('cjf-name').value.trim(),
          email:       document.getElementById('cjf-email').value.trim(),
          city:        (document.getElementById('cjf-city')?.value || '').trim() || null,
          dob:         document.getElementById('cjf-dob').value || null,
          is_student:  isStudentEl ? isStudentEl.value === 'Yes' : null,
          study_level: studyEl    ? studyEl.value    : null,
          institution: document.getElementById('cjf-institution').value.trim() || null,
          how_heard:   howHeardEl ? howHeardEl.value : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Already registered — show a friendly message
        if (res.status === 409) {
          submitBtn.disabled = false;
          submitBtn.querySelector('.cjf-submit-text').textContent = 'Join the Club';
          const errEl = form.querySelector('.cjf-phone-error') || phoneError;
          errEl.textContent = data.message || "You're already registered!";
          return;
        }
        // Other errors: still show success (Google Forms captured the data)
        console.warn('MRC API error:', data.error);
      }
    } catch (err) {
      // Network error: Google Forms still captured it, so continue
      console.warn('MRC database unreachable:', err);
    }

    // Show success
    form.querySelectorAll('.cjf-grid, .cjf-field, .cjf-submit')
        .forEach(el => (el.style.display = 'none'));
    successEl.hidden = false;
  });
}());


/* ─────────────────────────────────────────────────────────────
   9b. SUGGEST A BOOK FORM  (Google Form silent POST)
   ──────────────────────────────────────────────────────────── */
(function initSuggestForm() {
  const form      = document.getElementById('suggestForm');
  const successEl = document.getElementById('suggestSuccess');
  const submitBtn = form ? form.querySelector('.cjf-submit') : null;
  if (!form) return;

  const GF_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSdYGB0z-lc9IHRJsQ2A8u-ZRapG_QrXyj9ZcmQe3xfNglc-sg/formResponse';

  form.addEventListener('submit', async e => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.querySelectorAll(':invalid')[0]?.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.querySelector('.cjf-submit-text').textContent = 'Submitting…';

    try {
      await fetch(GF_ACTION, {
        method : 'POST',
        mode   : 'no-cors',
        body   : new FormData(form),
      });
    } catch (_) {
      // no-cors fetch may throw on network error; opaque response is expected
    }

    // Show success regardless — Google Forms silently records the submission
    form.querySelectorAll('.cjf-grid, .cjf-field, .cjf-submit')
        .forEach(el => (el.style.display = 'none'));
    successEl.hidden = false;
  });
}());


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
    // Update the address bar so the link is shareable
    history.pushState(null, '', id);
  });
});

// Handle direct URL hash navigation (e.g. site.com/#suggest)
// Wait for full page load so layout is stable, then scroll with nav offset
window.addEventListener('load', () => {
  if (!window.location.hash) return;
  const target = document.querySelector(window.location.hash);
  if (!target) return;
  // Small delay lets any dynamic content finish rendering
  setTimeout(() => {
    const top = target.getBoundingClientRect().top + window.scrollY - nav.offsetHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  }, 100);
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
   11. NOW-READING RIBBON  (config fetched live from admin)
   ──────────────────────────────────────────────────────────── */
(function buildNowReading() {
  const CONFIG_URL = 'https://pages.maduraireadingclub.com/api/config/now-reading';

  function renderRibbon(book) {
    if (!book || !book.show) return;

    const ribbon = document.createElement('aside');
    ribbon.className = 'now-reading';
    ribbon.setAttribute('aria-label', 'Currently reading');
    ribbon.innerHTML = `
      <button class="nr-dismiss" aria-label="Dismiss">&#x2715;</button>
      <p class="nr-eyebrow">Now Reading</p>
      <div class="nr-body">
        ${book.cover ? `<img class="nr-cover" src="${book.cover}" alt="${book.title} cover" loading="lazy" />` : ''}
        <div class="nr-text">
          <p class="nr-title">${book.title}</p>
          <p class="nr-author">by ${book.author}</p>
          <div class="nr-divider"></div>
          <p class="nr-date">
            <span class="nr-date-label">Discussion</span>
            <span>${book.date} &nbsp;·&nbsp; ${book.time || '4 PM'}</span>
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(ribbon);
    setTimeout(() => ribbon.classList.add('nr-visible'), 900);
    ribbon.querySelector('.nr-dismiss').addEventListener('click', () => {
      ribbon.classList.remove('nr-visible');
      setTimeout(() => ribbon.remove(), 400);
    });
  }

  // Fetch live config, fall back to hardcoded CURRENT_BOOK if network fails
  fetch(CONFIG_URL)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(config => renderRibbon(config))
    .catch(() => renderRibbon(CURRENT_BOOK));
}());


/* ╔═══════════════════════════════════════════════════════════╗
   ║  FIREBASE CONFIG  —  ★ PASTE YOUR CONFIG HERE ★         ║
   ╚═══════════════════════════════════════════════════════════╝
   1. Go to https://console.firebase.google.com
   2. Create a project → Add web app → copy the firebaseConfig object
   3. Replace the placeholder values below
   4. In Firestore → Rules, paste the security rules from the
      comment at the bottom of the buildVoting() function        */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB1_gn1WARrjSw9Sk68dP97sjw2Cif6Ct4",
  authDomain: "madurai-reading-club.firebaseapp.com",
  projectId: "madurai-reading-club",
  storageBucket: "madurai-reading-club.firebasestorage.app",
  messagingSenderId: "790658694650",
  appId: "1:790658694650:web:0b8cfaf8283f93cf89f843",
  measurementId: "G-WDDC2GQGBB"
};

/* Set false to hide the voting section entirely */
const VOTING_ENABLED = true;

/* ★ INCREMENT THIS each time you start a new voting round ★
   Each round gets its own Firestore collections, so all votes reset
   to 0 and everyone can vote fresh regardless of previous rounds.
   round-1 = first ever vote, round-2 = second, and so on.        */
const VOTING_ROUND = 'round-3';


/* ─────────────────────────────────────────────────────────────
   12. VOTING
   ──────────────────────────────────────────────────────────── */
(function buildVoting() {
  const grid      = document.getElementById('voteGrid');
  const confirmed = document.getElementById('voteConfirmed');
  const section   = document.getElementById('vote');

  if (!grid || !VOTING_ENABLED) {
    if (section) section.style.display = 'none';
    return;
  }

  /* ── Firebase not configured yet — show placeholder ── */
  const configured = FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
  if (!configured) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 0;">
        <p style="font-family:var(--ff-display);font-size:1.1rem;font-style:italic;color:var(--clr-text-soft);">
          Voting opens soon. Stay tuned.
        </p>
      </div>`;
    return;
  }

  /* ── Init Firebase ── */
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  const db = firebase.firestore();

  /* ── Voter identity — UUID stored in localStorage ── */
  const VOTER_KEY  = 'mrc_voter_id';
  const VOTED_KEY  = `mrc_voted_book_${VOTING_ROUND}`;
  function getVoterId() {
    let id = localStorage.getItem(VOTER_KEY);
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem(VOTER_KEY, id);
    }
    return id;
  }

  /* ── Slug from book title ── */
  function slug(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* ── Render skeleton cards while loading ── */
  function renderSkeletons(n) {
    grid.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'vote-card';
      card.innerHTML = '<div class="vote-skeleton"></div>';
      grid.appendChild(card);
    }
  }

  /* ── Build a single book card ── */
  function buildCard(book, votedSlug) {
    const bookSlug  = slug(book.title);
    const isVoted   = votedSlug === bookSlug;
    const hasVoted  = votedSlug !== null;

    const card = document.createElement('div');
    card.className = 'vote-card fade-up' +
      (isVoted ? ' voted-this' : hasVoted ? ' voted-other' : '');
    card.dataset.slug = bookSlug;

    card.innerHTML = `
      <div class="vote-card-cover">
        <img src="images/Voting/${encodeURIComponent(book.file)}" alt="${book.title}" loading="lazy" />
        <span class="vote-your-badge">Your Vote</span>
      </div>
      <div class="vote-card-body">
        <span class="vote-card-genre">${book.genre}</span>
        <h3 class="vote-card-title">${book.title}</h3>
        <p class="vote-card-author">by ${book.author}</p>
        <p class="vote-card-desc">${book.description}</p>
        <button class="vote-read-more" aria-label="Read full description">Read more</button>

        ${!hasVoted ? `
          <button class="vote-btn" data-slug="${bookSlug}" aria-label="Vote for ${book.title}">
            Vote for this book
          </button>` : ''}

        <div class="vote-result${hasVoted ? ' visible' : ''}" id="result-${bookSlug}">
          <div class="vote-bar-track">
            <div class="vote-bar-fill" id="bar-${bookSlug}" style="width:0%"></div>
          </div>
          <div class="vote-result-meta">
            <span id="count-${bookSlug}">0 votes</span>
            <span class="vote-result-pct" id="pct-${bookSlug}">0%</span>
          </div>
        </div>
      </div>
    `;

    /* Read more toggle (used on mobile / touch devices) */
    card.querySelector('.vote-read-more').addEventListener('click', () => {
      const open = card.classList.toggle('desc-open');
      card.querySelector('.vote-read-more').textContent = open ? 'Read less' : 'Read more';
    });

    return card;
  }

  /* ── Update vote bar UI ── */
  function updateBars(counts) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    Object.entries(counts).forEach(([s, count]) => {
      const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
      const bar    = document.getElementById(`bar-${s}`);
      const countEl= document.getElementById(`count-${s}`);
      const pctEl  = document.getElementById(`pct-${s}`);
      if (bar)    { requestAnimationFrame(() => bar.style.width = pct + '%'); }
      if (countEl) countEl.textContent = count === 1 ? '1 vote' : `${count} votes`;
      if (pctEl)   pctEl.textContent   = pct + '%';
    });
  }

  /* ── Handle vote submission ── */
  async function castVote(bookSlug, buttons) {
    const voterId = getVoterId();
    buttons.forEach(b => (b.disabled = true));

    try {
      const batch    = db.batch();
      const roundRef = db.collection('mrc_voting').doc(VOTING_ROUND);
      const voterRef = roundRef.collection('voters').doc(voterId);
      const voteRef  = roundRef.collection('votes').doc(bookSlug);

      batch.set(voterRef, {
        book      : bookSlug,
        timestamp : firebase.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(voteRef,
        { count: firebase.firestore.FieldValue.increment(1) },
        { merge: true }
      );

      await batch.commit();

      /* Show results state */
      localStorage.setItem(VOTED_KEY, bookSlug);
      applyVotedState(bookSlug);
      confirmed.hidden = false;
      confirmed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      console.error('Vote failed:', err);
      buttons.forEach(b => (b.disabled = false));
    }
  }

  /* ── Switch UI from pre-vote → post-vote ── */
  function applyVotedState(votedSlug) {
    grid.querySelectorAll('.vote-card').forEach(card => {
      const s = card.dataset.slug;
      card.classList.toggle('voted-this',  s === votedSlug);
      card.classList.toggle('voted-other', s !== votedSlug);

      /* Hide buttons, show bars */
      const btn = card.querySelector('.vote-btn');
      if (btn) btn.style.display = 'none';
      const result = card.querySelector('.vote-result');
      if (result) result.classList.add('visible');
    });
  }

  /* ── Main init ── */
  async function init() {
    const voterId   = getVoterId();
    renderSkeletons(5);

    /* Load books manifest */
    let books = [];
    try {
      const res = await fetch('images/Voting/manifest.json', { cache: 'no-store' });
      books = await res.json();
    } catch { return; }

    /* Check if already voted */
    let votedSlug = localStorage.getItem(VOTED_KEY);

    /* Also verify against Firestore (handles cleared localStorage) */
    try {
      const voterDoc = await db.collection('mrc_voting').doc(VOTING_ROUND).collection('voters').doc(voterId).get();
      if (voterDoc.exists) {
        votedSlug = voterDoc.data().book;
        localStorage.setItem(VOTED_KEY, votedSlug);
      }
    } catch { /* offline — trust localStorage */ }

    /* Render cards */
    grid.innerHTML = '';
    books.forEach(book => grid.appendChild(buildCard(book, votedSlug)));

    /* Attach vote button listeners */
    const allBtns = [...grid.querySelectorAll('.vote-btn')];
    allBtns.forEach(btn => {
      btn.addEventListener('click', () => castVote(btn.dataset.slug, allBtns));
    });

    /* Show confirmation if already voted */
    if (votedSlug) {
      confirmed.hidden = false;
    }

    /* ── Real-time vote counts listener ── */
    db.collection('mrc_voting').doc(VOTING_ROUND).collection('votes').onSnapshot(snapshot => {
      const counts = {};
      books.forEach(b => (counts[slug(b.title)] = 0));
      snapshot.forEach(doc => {
        if (counts.hasOwnProperty(doc.id)) {
          counts[doc.id] = doc.data().count || 0;
        }
      });
      updateBars(counts);
    });

    /* Trigger fade-up on new cards */
    grid.querySelectorAll('.fade-up').forEach(el => fadeObserver.observe(el));
  }

  init();

  /*
  ════════════════════════════════════════════════════════════
  FIRESTORE SECURITY RULES  —  paste into Firebase Console
  (Firestore → Rules tab)
  Works for ALL voting rounds automatically — no changes
  needed when VOTING_ROUND is incremented.
  ════════════════════════════════════════════════════════════
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {

      // Vote counts — anyone reads, only allowed to increment by 1
      match /mrc_voting/{round}/votes/{bookId} {
        allow read: if true;
        // First vote for this book (document doesn't exist yet)
        allow create: if request.resource.data.count == 1
                      && request.resource.data.keys().hasOnly(['count']);
        // Subsequent votes — only increment by 1
        allow update: if request.resource.data.count == resource.data.count + 1
                      && request.resource.data.keys().hasOnly(['count']);
      }

      // Voter records — create once per round, never update or delete
      match /mrc_voting/{round}/voters/{voterId} {
        allow read:   if false;
        allow create: if !exists(
                          /databases/$(database)/documents/mrc_voting/$(round)/voters/$(voterId)
                        );
        allow update, delete: if false;
      }
    }
  }
  ════════════════════════════════════════════════════════════ */
}());


/* ─────────────────────────────────────────────────────────────
   12. EVENTS GALLERY
   ─────────────────────────────────────────────────────────────
   Folder structure:
     images/events/manifest.json          → ["Event Name 1", "Event Name 2"]
     images/events/Event Name 1/manifest.json → ["photo1.jpg", "photo2.jpg"]

   Mosaic span pattern cycles through these data-span values,
   giving a varied editorial grid regardless of photo count.
   ──────────────────────────────────────────────────────────── */
(function buildEventsGallery() {

  const container = document.getElementById('eventsGallery');
  if (!container) return;

  /* Span pattern — repeats to fill any number of photos */
  const SPAN_PATTERN = [
    'hero','tall',        /* row 1: large feature + tall side  */
    'wide','sq',          /* row 2: wide + square              */
    'strip','sm','sm',    /* row 3: strip + two smalls         */
    'sq','sq','sq',       /* row 4: three squares              */
    'wide','thumb','thumb',/* row 5: wide + two thumbs        */
  ];

  async function fetchJSON(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function buildAlbum(name, images) {
    const album = document.createElement('div');
    album.className = 'event-album';

    /* Header */
    album.innerHTML = `
      <div class="event-album-header">
        <h3 class="event-album-title">${name}</h3>
        <div class="event-album-line"></div>
        <span class="event-album-count">${images.length} photo${images.length !== 1 ? 's' : ''}</span>
      </div>
    `;

    /* Photo grid */
    const grid = document.createElement('div');
    grid.className = 'event-photo-grid';

    images.forEach((src, i) => {
      const span = SPAN_PATTERN[i % SPAN_PATTERN.length];
      const fig  = document.createElement('figure');
      fig.className = 'event-photo';
      fig.setAttribute('data-span', span);
      fig.setAttribute('role', 'button');
      fig.setAttribute('tabindex', '0');
      fig.setAttribute('aria-label', `View photo ${i + 1} from ${name}`);

      const img = document.createElement('img');
      img.src     = src;
      img.alt     = `${name}, photo ${i + 1}`;
      img.loading = 'lazy';

      fig.appendChild(img);
      fig.addEventListener('click', () => openLightbox(src, img.alt));
      fig.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') openLightbox(src, img.alt);
      });

      grid.appendChild(fig);
    });

    album.appendChild(grid);

    /* Scroll-triggered entrance */
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      album.classList.add('ev-visible');
      obs.disconnect();
    }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
    obs.observe(album);

    return album;
  }

  async function init() {
    const eventNames = await fetchJSON('images/events/manifest.json');

    if (!eventNames || eventNames.length === 0) {
      container.innerHTML = `
        <div class="events-empty">
          <div class="events-empty-glyph">✦</div>
          <p>Photos from our events will appear here.</p>
        </div>`;
      return;
    }

    const albums = await Promise.all(eventNames.map(async name => {
      const encodedName = name.split('/').map(encodeURIComponent).join('/');
      const files = await fetchJSON(`images/events/${encodedName}/manifest.json`);
      if (!files || files.length === 0) return null;
      const images = files.map(f => `images/events/${encodedName}/${encodeURIComponent(f)}`);
      return { name, images };
    }));

    albums
      .filter(Boolean)
      .forEach(({ name, images }) => container.appendChild(buildAlbum(name, images)));

    if (container.children.length === 0) {
      container.innerHTML = `
        <div class="events-empty">
          <div class="events-empty-glyph">✦</div>
          <p>Photos from our events will appear here.</p>
        </div>`;
    }
  }

  init();
}());


/* ─────────────────────────────────────────────────────────────
   13. SPREAD THE WORD — Share button
   ──────────────────────────────────────────────────────────── */
(function initShare() {
  const btn = document.getElementById('shareBtn');
  if (!btn) return;

  const SHARE_TITLE = 'Madurai Reading Club';
  const SHARE_TEXT  =
    'For those who believe books are meant to be discussed, not just read.\n\n' +
    'Join the Madurai Reading Club.\n' +
    'https://www.maduraireadingclub.com/#join';
  const SHARE_URL   = 'https://www.maduraireadingclub.com/#join';

  function showFeedback() {
    btn.classList.add('shared');
    btn.setAttribute('aria-label', 'Thanks for sharing!');
    setTimeout(() => {
      btn.classList.remove('shared');
      btn.setAttribute('aria-label', 'Share Madurai Reading Club');
    }, 3000);
  }

  btn.addEventListener('click', async () => {
    // Mobile — native share sheet
    if (navigator.share) {
      try {
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
        showFeedback();
      } catch (err) {
        // User dismissed — no feedback needed
      }
      return;
    }

    // Desktop fallback — WhatsApp
    const encoded = encodeURIComponent(SHARE_TEXT);
    window.open('https://wa.me/?text=' + encoded, '_blank', 'noopener');
    showFeedback();
  });
}());


/* ─────────────────────────────────────────────────────────────
   13. AUTHOR MEET CARD
   ──────────────────────────────────────────────────────────── */
/* ── Set to true to re-enable for a future Author Meet event ── */
const SHOW_AUTHOR_MEET = false;

(function buildAuthorMeet() {
  if (!SHOW_AUTHOR_MEET) return;

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
