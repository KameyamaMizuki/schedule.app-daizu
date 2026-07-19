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
        '<div class="walk-sub">' + escapeHtml(plan.sub) + '</div></div>' +
        '<div class="walk-arrow"><i class="ph-bold ph-caret-right"></i></div>';
      el.style.display = 'flex';
      el.onclick = openWalkDetailModal; // データ取得済みの時だけタップ可能にする(Task21)
    } catch (e) {
      el.style.display = 'none'; // 失敗時は静かに非表示(スペック8章)
      el.onclick = null;
    }
  };

  // ========== Task21: タップで時間帯別(6〜23時)気温・降水グラフのモーダル表示 ==========
  var TICK_HOURS = [6, 9, 12, 15, 18, 21];
  var BAR_FLOOR = 24, BAR_MAX = 140;

  /** 当日6-23時の時間帯別データから、気温バーの色クラス・高さを計算してグラフHTMLを組み立てる */
  function buildWalkChartHtml(data, plan) {
    var w = AppConfig.WALK;
    var times = data.hourly.time, temps = data.hourly.temperature_2m, rains = data.hourly.precipitation_probability;
    var hours = [];
    for (var i = 0; i < times.length; i++) {
      var hr = parseInt(times[i].slice(11, 13), 10);
      if (hr >= 6 && hr <= 23) hours.push({ hour: hr, temp: temps[i], rain: rains[i] || 0 });
    }
    hours.sort(function(a, b) { return a.hour - b.hour; });
    var nowHour = plan.now ? plan.now.hour : -1;
    var tempVals = hours.map(function(h) { return h.temp; });
    var minT = Math.min.apply(null, tempVals), maxT = Math.max.apply(null, tempVals);
    var range = maxT - minT;

    var cols = hours.map(function(h) {
      var isWindow = (h.hour >= 6 && h.hour <= 9) || (h.hour >= 16 && h.hour <= 21);
      var cls = 'wm-off';
      if (h.temp >= w.HOT_LIMIT) cls = 'wm-hot';
      else if (isWindow && h.rain < w.RAIN_LIMIT) cls = 'wm-good';
      var barH = range > 0
        ? Math.round(BAR_FLOOR + (h.temp - minT) / range * (BAR_MAX - BAR_FLOOR))
        : Math.round((BAR_FLOOR + BAR_MAX) / 2);
      var isNow = h.hour === nowHour;
      var isTick = TICK_HOURS.indexOf(h.hour) !== -1;
      return '<div class="wm-col' + (isNow ? ' wm-now' : '') + '">'
        + '<div class="wm-now-tag">' + (isNow ? 'いま' : '') + '</div>'
        + '<div class="wm-bar-track"><div class="wm-bar ' + cls + '" style="height:' + barH + 'px" title="' + h.hour + '時 ' + Math.round(h.temp) + '°C・降水' + Math.round(h.rain) + '%"></div></div>'
        + '<div class="wm-rain">' + (h.rain > 0 ? Math.round(h.rain) : '') + '</div>'
        + '<div class="wm-hour">' + (isTick ? h.hour : '') + '</div>'
        + '</div>';
    }).join('');

    return '<div class="wm-axis-caption">気温目安(°C): ' + Math.round(minT) + '〜' + Math.round(maxT) + '</div>'
      + '<div class="wm-cols">' + cols + '</div>'
      + '<div class="wm-legend">'
      + '<span class="wm-legend-item"><i class="wm-swatch wm-swatch-good"></i>おすすめ</span>'
      + '<span class="wm-legend-item"><i class="wm-swatch wm-swatch-hot"></i>暑い(' + w.HOT_LIMIT + '°C〜)</span>'
      + '<span class="wm-legend-item"><i class="wm-swatch wm-swatch-off"></i>対象外</span>'
      + '<span class="wm-legend-item"><i class="wm-swatch wm-swatch-rain"></i>降水確率(%)</span>'
      + '</div>';
  }

  window.openWalkDetailModal = async function() {
    var modal = document.getElementById('walkDetailModal');
    if (!modal) return;
    try {
      var data = await fetchWeather();
      if (!data || !data.hourly || !data.hourly.time || !data.hourly.time.length) throw new Error('no weather data');
      var plan = computeWalkPlan(data);
      var content = modal.querySelector('.walk-detail-content');
      content.innerHTML =
        '<button type="button" class="wm-close" onclick="closeWalkDetailModal()" aria-label="閉じる"><i class="ph-bold ph-x"></i></button>' +
        '<h3 class="wm-title">きょうのおさんぽ予報</h3>' +
        buildWalkChartHtml(data, plan);
      modal.classList.add('active');
    } catch (e) {
      showToast('天気データを取得できませんでした');
    }
  };

  window.closeWalkDetailModal = function() {
    var modal = document.getElementById('walkDetailModal');
    if (modal) modal.classList.remove('active');
  };
})();
