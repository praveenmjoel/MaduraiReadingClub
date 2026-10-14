/* Spookfest 2026 teaser — small, dependency-free enhancements */
(function () {
  var body = document.body;
  body.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1 · Progressive reveal as sections enter the viewport */
  var items = document.querySelectorAll('.sf-reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  /* 2 · Ambient light deepens/warms with scroll (--lamp: 0 → 1) */
  if (!reduce) {
    var ticking = false;
    var update = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      body.style.setProperty('--lamp', max > 0 ? Math.min(window.scrollY / max, 1).toFixed(3) : 0);
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* 3 · Pool of light follows the pointer a little (desktop only) */
  var hero = document.querySelector('.sf-hero');
  if (!reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      body.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      body.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
  }

  /* 4 · The door: reveal a whisper and brighten the room. Toggles; never blocks scrolling. */
  var door = document.getElementById('sfDoor');
  var whisper = document.getElementById('sfWhisper');
  var label = door.querySelector('.sf-door-label');
  var openLabel = label.textContent;
  door.addEventListener('click', function () {
    var open = door.getAttribute('aria-expanded') !== 'true';
    door.setAttribute('aria-expanded', String(open));
    whisper.hidden = !open;
    hero.classList.toggle('lit', open);
    label.textContent = open ? 'Close the door' : openLabel;
  });
})();
