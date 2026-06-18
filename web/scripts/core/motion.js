(function () {
  var io = null;

  function getObserver() {
    if (io) return io;
    if (!('IntersectionObserver' in window)) return null;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });
    return io;
  }

  function scanReveal() {
    var observer = getObserver();
    var els = document.querySelectorAll('.reveal:not(.visible), .reveal-stagger:not(.visible)');
    if (!observer) {
      els.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    els.forEach(function (el) { observer.observe(el); });
  }

  function setupHeaderShrink() {
    var header = document.getElementById('mainHeader');
    if (!header) return;
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        header.classList.toggle('condensed', window.scrollY > 24);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function init() {
    scanReveal();
    setupHeaderShrink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.rescanReveal = scanReveal;
})();
