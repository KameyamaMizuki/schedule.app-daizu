// tabs/home.walk.js — おさんぽ日和カード(Open-Meteo・キー不要・Lambda不要)
(function() {
  'use strict';
  var CACHE_KEY = 'walkWeatherCache';

  function buildUrl() {
    var w = AppConfig.WALK;
    // daily=sunset はロジック未使用のためペイロード軽量化のため取得しない(Task17実装時の自己レビューで削除)
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + w.LAT + '&longitude=' + w.LON +
      '&hourly=temperature_2m,precipitation_probability&timezone=Asia%2FTokyo&forecast_days=1';
  }

  /** 散歩候補時間帯(6-9時, 16-21時)から気温・降水条件を満たす枠を選ぶ */
  function computeWalkPlan(data) {
    var w = AppConfig.WALK;
    var hours = data.hourly.time.map(function(t, i) {
      return { hour: parseInt(t.slice(11, 13), 10), temp: data.hourly.temperature_2m[i], rain: data.hourly.precipitation_probability[i] || 0 };
    });
    var nowHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getHours();
    var candidates = hours.filter(function(h) {
      return h.hour >= nowHour && ((h.hour >= 6 && h.hour <= 9) || (h.hour >= 16 && h.hour <= 21));
    });
    var now = hours.find(function(h) { return h.hour === nowHour; }) || hours[0];
    // 今日の候補枠(朝6-9時・夕方16-21時)をすべて過ぎている場合(例: 23時)は
    // 「涼しい時間が見つかりません」という気温起因の文言を出すと実態と食い違うため、
    // 専用の「また明日」フォールバックで返す(ブリーフのcandidates.length===0ケースを検証して追加)。
    if (candidates.length === 0) {
      return { title: 'きょうのおさんぽ時間は終了', sub: 'また明日チェックしてね', now: now };
    }
    var ok = candidates.filter(function(h) { return h.temp < w.HOT_LIMIT && h.rain < w.RAIN_LIMIT; });
    var allRainy = candidates.every(function(h) { return h.rain >= w.RAIN_LIMIT; });
    if (allRainy) return { title: 'きょうは雨もよう', sub: '室内あそび日和です', now: now };
    if (ok.length === 0) return { title: 'きょうは無理せず', sub: '涼しい時間が見つかりません。' + Math.round(now.temp) + '°C', now: now };
    var best = ok.reduce(function(a, b) { return b.temp < a.temp ? b : a; });
    return { title: best.hour + '時ごろがおすすめ', sub: 'いま' + Math.round(now.temp) + '°C · その頃' + Math.round(best.temp) + '°C · 雨' + best.rain + '%', now: now };
  }

  async function fetchWeather() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < AppConfig.WALK.CACHE_MIN * 60000) return c.data;
    } catch (e) {}
    var res = await fetch(buildUrl());
    if (!res.ok) throw new Error('weather fetch failed');
    var data = await res.json();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
    return data;
  }

  window.renderWalkCard = async function() {
    var el = document.getElementById('walkCard');
    if (!el) return;
    try {
      var plan = computeWalkPlan(await fetchWeather());
      el.innerHTML =
        '<div class="walk-icon"><i class="ph-bold ph-sun"></i></div>' +
        '<div class="walk-body"><div class="walk-label">おさんぽ日和</div>' +
        '<div class="walk-title">' + escapeHtml(plan.title) + '</div>' +
        '<div class="walk-sub">' + escapeHtml(plan.sub) + '</div></div>';
      el.style.display = 'flex';
    } catch (e) {
      el.style.display = 'none'; // 失敗時は静かに非表示(スペック8章)
    }
  };
})();
