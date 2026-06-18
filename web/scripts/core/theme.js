(function () {
  var KEY = 'kame-theme';
  var ORDER = ['auto', 'light', 'dark'];
  var ICON = { auto: '🌓', light: '☀️', dark: '🌙' };
  var LABEL = { auto: 'テーマ（自動：端末に合わせる）', light: 'テーマ：ライト', dark: 'テーマ：ダーク' };

  function read() {
    try { var v = localStorage.getItem(KEY); return (v === 'light' || v === 'dark') ? v : 'auto'; }
    catch (e) { return 'auto'; }
  }

  function apply(mode) {
    var root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    var btn = document.getElementById('themeToggleBtn');
    if (btn) { btn.textContent = ICON[mode]; btn.setAttribute('aria-label', LABEL[mode]); btn.title = LABEL[mode]; }
  }

  window.cycleTheme = function () {
    var next = ORDER[(ORDER.indexOf(read()) + 1) % ORDER.length];
    apply(next);
  };

  apply(read());
  document.addEventListener('DOMContentLoaded', function () { apply(read()); });
})();
