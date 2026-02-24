// home.page.js — home.html ページ初期化
(function() {
  'use strict';

  // タブバーのdata-routeクリックでdashboard.htmlへ遷移
  document.querySelectorAll('[data-route]').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var route = this.getAttribute('data-route');
      window.location.href = AppRoutes.resolve(route);
    });
  });

  // サイドバーのnavigateToをページ遷移に対応
  window.navigateTo = function(tab) {
    toggleSidebar();
    if (tab === 'home') {
      homeBackToMenu();
    } else {
      window.location.href = AppRoutes.resolve(tab);
    }
  };

  // 一言入力の文字数カウント (元 tabs/home.js)
  var textarea = document.getElementById('chirolHitokotoText');
  if (textarea) {
    textarea.addEventListener('input', function() {
      document.getElementById('chirolHitokotoCount').textContent = this.value.length;
    });
  }

  // ユーザー初期化 + ホームタブ初期化
  initCurrentUser();
  initHomeTab();
})();
