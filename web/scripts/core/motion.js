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

  // 要素が現時点でビューポート内にレイアウトされているか
  // （display:none や 0 サイズの要素は false を返す）
  function inViewportNow(el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    return r.top < vh && r.bottom > 0;
  }

  function scanReveal() {
    var observer = getObserver();
    var els = document.querySelectorAll('.reveal:not(.visible), .reveal-stagger:not(.visible)');
    els.forEach(function (el) {
      // IntersectionObserver 非対応環境では即表示
      if (!observer) { el.classList.add('visible'); return; }
      // すでに画面内にある要素（初期表示・タブ切り替え直後など）は、
      // IO の発火を待たず次フレームで確実に表示する。
      // display:none → block 直後は IO の通知が遅延・欠落することがあり、
      // その間コンテンツ（投稿ボタン=FAB 等）が opacity:0 のまま見えなくなるのを防ぐ。
      if (inViewportNow(el)) {
        observer.unobserve(el);
        requestAnimationFrame(function () { el.classList.add('visible'); });
      } else {
        // 画面外の要素は従来どおりスクロールで表示
        observer.observe(el);
      }
    });
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
