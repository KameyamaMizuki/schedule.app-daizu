(function() {
  'use strict';
  window.AppRoutes = {
    // ページ定義（全タブが dashboard.html に統合済み。home.html は互換用のリダイレクトスタブ）
    pages: {
      dashboard: 'dashboard.html'
    },
    // タブ定義
    tabs: {
      home:      { title: 'ホーム',       color: 'green',  page: 'dashboard' },
      schedule:  { title: 'スケジュール', color: 'pink',   page: 'dashboard', hasSubTabs: true },
      yousu:     { title: '様子',         color: 'orange', page: 'dashboard' },
      diary:     { title: 'ダイ日記',     color: 'brown',  page: 'dashboard' },
      wansta:    { title: 'WANsta',        color: 'purple', page: 'dashboard' }
    },
    scheduleSubTabs: ['calendar', 'thisWeek', 'nextWeek'],
    getTabNames: function() {
      return ['home', 'schedule', 'yousu', 'diary', 'wansta'];
    },
    // hash を { tab, subTab } にパース
    parseHash: function(hash) {
      var params = {};
      (hash || '').replace(/^#/, '').split('&').forEach(function(p) {
        var kv = p.split('=');
        if (kv.length === 2) params[kv[0]] = decodeURIComponent(kv[1]);
      });
      return { tab: params.tab || null, subTab: params.sub || null };
    },
    // { tab, subTab } から hash を生成
    buildHash: function(tab, subTab) {
      var h = '#tab=' + encodeURIComponent(tab);
      if (subTab) h += '&sub=' + encodeURIComponent(subTab);
      return h;
    },
    // タブ名からナビゲーション先URLを返す
    resolve: function(tab, subTab) {
      var def = this.tabs[tab];
      if (!def) return null;
      var page = this.pages[def.page];
      return page + this.buildHash(tab, subTab);
    }
  };
})();
