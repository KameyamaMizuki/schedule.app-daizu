// tabs/home.walk.js — おさんぽ日和カード(Open-Meteo・キー不要・Lambda不要)
(function() {
  'use strict';
  var CACHE_KEY = 'walkWeatherCache';
  var DAY_START = 6, DAY_END = 22;          // グラフに表示する日中の時間帯(17時間)
  var TICK_HOURS = [6, 9, 12, 15, 18, 21];  // 目盛りを打つ時刻
  var WM_CW = 1000, WM_CH = 100;            // 気温カーブSVGの仮想座標(preserveAspectRatio=noneで実サイズに引き伸ばす)
  var WM_PAD_TOP = 20, WM_PAD_BOTTOM = 16;

  function buildUrl() {
    var w = AppConfig.WALK;
    // Task32: apparent_temperature(体感)・uv_index(紫外線指数)を追加取得
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + w.LAT + '&longitude=' + w.LON +
      '&hourly=temperature_2m,apparent_temperature,precipitation_probability,uv_index&timezone=Asia%2FTokyo&forecast_days=1';
  }

  function nowJstHour() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getHours();
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** 散歩候補時間帯(6-9時, 16-21時)から気温・降水条件を満たす枠を選ぶ */
  function computeWalkPlan(data) {
    var w = AppConfig.WALK;
    var hasApparent = !!data.hourly.apparent_temperature;
    var hours = data.hourly.time.map(function(t, i) {
      return {
        hour: parseInt(t.slice(11, 13), 10),
        temp: data.hourly.temperature_2m[i],
        apparent: hasApparent ? data.hourly.apparent_temperature[i] : null,
        rain: data.hourly.precipitation_probability[i] || 0,
        uv: data.hourly.uv_index ? (data.hourly.uv_index[i] || 0) : null
      };
    });
    var nowHour = nowJstHour();
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
    // Task32気温ズレ調査: temperature_2m(地上気温)とapparent_temperature(体感)が
    // 実測で5〜6℃前後乖離するケースを確認(湿度による体感差)。両方を表示して実感とのギャップを埋める。
    var nowLabel = 'いま' + Math.round(now.temp) + '°C';
    if (now.apparent != null && Math.abs(now.apparent - now.temp) >= 1) {
      nowLabel += '(体感' + Math.round(now.apparent) + '°C)';
    }
    return { title: best.hour + '時ごろがおすすめ', sub: nowLabel + ' · その頃' + Math.round(best.temp) + '°C · 雨' + best.rain + '%', now: now, best: best };
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

  var _data = null, _plan = null, _expanded = false;

  window.renderWalkCard = async function() {
    var el = document.getElementById('walkCard');
    if (!el) return;
    try {
      _data = await fetchWeather();
      if (!_data || !_data.hourly || !_data.hourly.time || !_data.hourly.time.length) throw new Error('no weather data');
      _plan = computeWalkPlan(_data);
      el.innerHTML =
        '<div class="walk-icon"><i class="ph-bold ph-sun"></i></div>' +
        '<div class="walk-body"><div class="walk-label">おさんぽ日和</div>' +
        '<div class="walk-title">' + escapeHtml(_plan.title) + '</div>' +
        '<div class="walk-sub">' + escapeHtml(_plan.sub) + '</div></div>' +
        '<div class="walk-arrow"><i class="ph-bold ph-caret-down"></i></div>';
      el.style.display = 'flex';
      el.setAttribute('aria-expanded', _expanded ? 'true' : 'false');
      el.onclick = toggleWalkPanel; // データ取得済みの時だけタップ可能にする(Task17→Task32でインライン展開に変更)
    } catch (e) {
      el.style.display = 'none'; // 失敗時は静かに非表示(スペック8章)
      el.onclick = null;
    }
  };

  // ========== Task32: タップでカード直下にインライン展開(Task21のモーダルは廃止) ==========

  window.toggleWalkPanel = function() {
    var card = document.getElementById('walkCard');
    var panel = document.getElementById('walkPanel');
    if (!card || !panel || !_data || !_plan) return;
    if (_expanded) {
      collapseWalkPanel(panel);
      _expanded = false;
    } else {
      panel.innerHTML = buildWalkPanelHtml(_data, _plan);
      expandWalkPanel(panel);
      _expanded = true;
    }
    card.setAttribute('aria-expanded', _expanded ? 'true' : 'false');
  };

  function expandWalkPanel(panel) {
    panel.hidden = false;
    if (prefersReducedMotion()) {
      panel.style.transition = 'none';
      panel.style.maxHeight = 'none';
      panel.style.opacity = '1';
      return;
    }
    panel.style.maxHeight = '0px';
    panel.style.opacity = '0';
    void panel.offsetHeight; // reflow
    var target = panel.scrollHeight;
    // rAFはバックグラウンドタブ/一部のheadless実行環境で発火しないことがあるため、
    // setTimeoutで次ティックに回して確実にトランジションを開始させる(Task32実機検証で確認)。
    setTimeout(function() {
      panel.style.maxHeight = target + 'px';
      panel.style.opacity = '1';
    }, 16);
    var finish = function() {
      panel.style.maxHeight = 'none'; // 以後のリフロー(向き変更等)でも切れないように
      panel.removeEventListener('transitionend', onEnd);
      clearTimeout(fallback);
    };
    var onEnd = function(e) { if (e.target === panel && e.propertyName === 'max-height') finish(); };
    panel.addEventListener('transitionend', onEnd);
    var fallback = setTimeout(finish, 600); // transitionendが発火しない環境向けの保険
  }

  function collapseWalkPanel(panel) {
    if (prefersReducedMotion()) {
      panel.style.transition = 'none';
      panel.style.maxHeight = '0px';
      panel.style.opacity = '0';
      panel.hidden = true;
      return;
    }
    var current = panel.scrollHeight;
    panel.style.maxHeight = current + 'px';
    void panel.offsetHeight; // reflow
    setTimeout(function() {
      panel.style.maxHeight = '0px';
      panel.style.opacity = '0';
    }, 16);
    var finish = function() {
      panel.hidden = true;
      panel.removeEventListener('transitionend', onEnd);
      clearTimeout(fallback);
    };
    var onEnd = function(e) { if (e.target === panel && e.propertyName === 'max-height') finish(); };
    panel.addEventListener('transitionend', onEnd);
    var fallback = setTimeout(finish, 600); // transitionendが発火しない環境向けの保険
  }

  // ========== グラフ・チロル解説パネルの組み立て ==========

  /** Catmull-Rom→3次ベジエ変換で滑らかな折れ線パスを作る(ライブラリ不使用) */
  function svgSmoothPath(points) {
    if (points.length < 2) return '';
    var d = 'M' + points[0].x.toFixed(1) + ',' + points[0].y.toFixed(1);
    for (var i = 0; i < points.length - 1; i++) {
      var p0 = points[i === 0 ? 0 : i - 1];
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = points[i + 2 < points.length ? i + 2 : i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
    }
    return d;
  }

  /** 連続する「おすすめ」区間をマージしてSVG帯(x0〜x1)の配列にする */
  function buildRecRanges(hours, isRec, unit) {
    var ranges = [], start = null;
    for (var i = 0; i <= hours.length; i++) {
      var rec = i < hours.length && isRec(hours[i]);
      if (rec && start === null) start = i;
      if (!rec && start !== null) { ranges.push({ x0: start * unit, x1: i * unit }); start = null; }
    }
    return ranges;
  }

  function uvColorClass(uv) {
    if (uv >= 11) return 'wm2-uv-extreme';
    if (uv >= 8) return 'wm2-uv-veryhigh';
    if (uv >= 6) return 'wm2-uv-high';
    if (uv >= 3) return 'wm2-uv-moderate';
    return 'wm2-uv-low';
  }

  /** チロルの解説文をデータから組み立てる(app生成テキストだがescapeHtmlの規律は維持) */
  function buildChirolMessage(hours, plan, nowHour) {
    var w = AppConfig.WALK;
    if (plan.title.indexOf('終了') !== -1) return 'きょうのおさんぽ時間はもう終わりだぜ。また明日チェックしような。';
    if (plan.title.indexOf('雨もよう') !== -1) return 'きょうは雨だから、お部屋でゆっくり過ごそうぜ。';
    if (plan.title.indexOf('無理せず') !== -1) return 'きょうはずっと暑いから、無理は禁物だぜ。涼しくなるまで待とうな。';

    var morning = hours.filter(function(h) { return h.hour >= 6 && h.hour <= 9; });
    var midday = hours.filter(function(h) { return h.hour >= 11 && h.hour <= 15; });
    var evening = hours.filter(function(h) { return h.hour >= 16 && h.hour <= 21; });
    var middayHot = midday.some(function(h) { return h.temp >= w.HOT_LIMIT; });
    var morningGood = morning.some(function(h) { return h.hour >= nowHour && h.temp < w.HOT_LIMIT && h.rain < w.RAIN_LIMIT; });
    var eveningGood = evening.some(function(h) { return h.hour >= nowHour && h.temp < w.HOT_LIMIT && h.rain < w.RAIN_LIMIT; });

    if (plan.best && plan.best.hour >= 16 && middayHot && eveningGood) {
      return '今日は昼が暑いから、夕方の散歩がおすすめだぜ!';
    }
    if (plan.best && plan.best.hour <= 9 && morningGood) {
      return '朝のうちが涼しいから、早めの散歩がおすすめだぜ!';
    }
    if (plan.best) {
      return plan.best.hour + '時ごろが散歩日和だぜ、行こうぜ!';
    }
    return 'いい散歩日和を探しておくぜ!';
  }

  function skyClass(plan, hours) {
    if (plan.title.indexOf('雨もよう') !== -1) return 'wm2-sky-rain';
    var anyHot = hours.some(function(h) { return h.temp >= AppConfig.WALK.HOT_LIMIT; });
    if (anyHot) return 'wm2-sky-hot';
    return 'wm2-sky-clear';
  }

  /** 当日6-22時の時間帯別データから、気温カーブ(SVG)・降水棒・UV棒・チロル解説パネルを組み立てる */
  function buildWalkPanelHtml(data, plan) {
    var w = AppConfig.WALK;
    var times = data.hourly.time, temps = data.hourly.temperature_2m,
        apps = data.hourly.apparent_temperature || [],
        rains = data.hourly.precipitation_probability,
        uvs = data.hourly.uv_index || [];
    var hours = [];
    for (var i = 0; i < times.length; i++) {
      var hr = parseInt(times[i].slice(11, 13), 10);
      if (hr >= DAY_START && hr <= DAY_END) {
        hours.push({ hour: hr, temp: temps[i], apparent: apps[i], rain: rains[i] || 0, uv: uvs[i] || 0 });
      }
    }
    hours.sort(function(a, b) { return a.hour - b.hour; });
    var n = hours.length;
    var nowHour = plan.now ? plan.now.hour : -1;
    var nowIdx = -1;
    hours.forEach(function(h, idx) { if (h.hour === nowHour) nowIdx = idx; });

    var tempVals = hours.map(function(h) { return h.temp; });
    var minT = Math.min.apply(null, tempVals), maxT = Math.max.apply(null, tempVals);
    var rangeT = (maxT - minT) || 1;
    var unit = WM_CW / n;

    function isRec(h) {
      var inWindow = (h.hour >= 6 && h.hour <= 9) || (h.hour >= 16 && h.hour <= 21);
      return inWindow && h.hour >= nowHour && h.temp < w.HOT_LIMIT && h.rain < w.RAIN_LIMIT;
    }

    // --- 気温カーブ(SVG・折れ線) ---
    var points = hours.map(function(h, idx) {
      var x = (idx + 0.5) * unit;
      var y = WM_PAD_TOP + (1 - (h.temp - minT) / rangeT) * (WM_CH - WM_PAD_TOP - WM_PAD_BOTTOM);
      return { x: x, y: y, h: h };
    });
    var pathD = svgSmoothPath(points);
    var recRanges = buildRecRanges(hours, isRec, unit);
    var recBandsSvg = recRanges.map(function(r) {
      return '<rect class="wm2-rec-band" x="' + r.x0.toFixed(1) + '" y="0" width="' + (r.x1 - r.x0).toFixed(1) + '" height="' + WM_CH + '"></rect>';
    }).join('');
    var nowLineSvg = nowIdx >= 0
      ? '<line class="wm2-now-line" x1="' + points[nowIdx].x.toFixed(1) + '" y1="4" x2="' + points[nowIdx].x.toFixed(1) + '" y2="' + WM_CH + '"></line>'
      : '';
    var markersSvg = points.map(function(p) {
      var isNow = p.h.hour === nowHour;
      var isHot = p.h.temp >= w.HOT_LIMIT;
      var cls = 'wm2-pt' + (isNow ? ' wm2-pt-now' : '') + (isHot ? ' wm2-pt-hot' : '');
      var r = isNow ? 5 : 2.4;
      return '<circle class="' + cls + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" vector-effect="non-scaling-stroke"></circle>';
    }).join('');
    var nowTempLabelSvg = nowIdx >= 0
      ? '<text class="wm2-now-label" x="' + points[nowIdx].x.toFixed(1) + '" y="' + Math.max(points[nowIdx].y - 10, 10).toFixed(1) + '" text-anchor="middle">' + Math.round(hours[nowIdx].temp) + '°</text>'
      : '';

    var tempSvg = '<svg class="wm2-temp-svg" viewBox="0 0 ' + WM_CW + ' ' + WM_CH + '" preserveAspectRatio="none" role="img" aria-label="時間帯別気温グラフ、' + Math.round(minT) + 'から' + Math.round(maxT) + '度">' +
      recBandsSvg + nowLineSvg +
      '<path class="wm2-temp-path" vector-effect="non-scaling-stroke" d="' + pathD + '"></path>' +
      markersSvg + nowTempLabelSvg +
      '</svg>';

    // --- 降水確率(棒) / UV指数(棒) / 時刻目盛り: 気温カーブと同じ等幅カラムで揃える ---
    var rainCols = hours.map(function(h, idx) {
      var barH = h.rain > 0 ? Math.round(4 + (h.rain / 100) * 40) : 2;
      var cls = 'wm2-col' + (idx === nowIdx ? ' wm2-col-now' : '') + (isRec(h) ? ' wm2-col-rec' : '');
      return '<div class="' + cls + '"><div class="wm2-bar-track"><div class="wm2-bar wm2-bar-rain" style="height:' + barH + 'px" title="' + h.hour + '時 降水確率' + Math.round(h.rain) + '%"></div></div></div>';
    }).join('');
    var uvCols = hours.map(function(h, idx) {
      var uvClamped = Math.max(0, Math.min(12, h.uv));
      var barH = Math.round(3 + (uvClamped / 12) * 34);
      var cls = 'wm2-col' + (idx === nowIdx ? ' wm2-col-now' : '');
      return '<div class="' + cls + '"><div class="wm2-bar-track wm2-bar-track-uv"><div class="wm2-bar ' + uvColorClass(h.uv) + '" style="height:' + barH + 'px" title="' + h.hour + '時 UV指数' + h.uv.toFixed(1) + '"></div></div></div>';
    }).join('');
    var tickCols = hours.map(function(h, idx) {
      var show = TICK_HOURS.indexOf(h.hour) !== -1;
      var cls = 'wm2-col' + (idx === nowIdx ? ' wm2-col-now' : '');
      return '<div class="' + cls + '"><div class="wm2-tick">' + (show ? h.hour : '') + '</div></div>';
    }).join('');

    var sky = skyClass(plan, hours);
    var chirolMsg = buildChirolMessage(hours, plan, nowHour);
    var chirolAvatar = AppConfig.DOG_IMAGES.CHIROL_AVATAR; // アプリ内固定パス(ユーザー入力ではないためsafeImageSrc対象外)

    return (
      '<div class="wm2-head ' + sky + '">' +
        '<div class="wm2-place"><i class="ph-bold ph-map-pin"></i>' + escapeHtml(w.PLACE_NAME || '') + '</div>' +
        '<div class="wm2-headline">' + escapeHtml(plan.title) + '</div>' +
        '<div class="wm2-headsub">' + escapeHtml(plan.sub) + '</div>' +
      '</div>' +
      '<div class="wm2-body">' +
        '<div class="wm2-section-label">気温・降水確率</div>' +
        '<div class="wm2-temp-wrap">' +
          '<span class="wm2-axis-max">' + Math.round(maxT) + '°</span>' +
          '<span class="wm2-axis-min">' + Math.round(minT) + '°</span>' +
          tempSvg +
        '</div>' +
        '<div class="wm2-cols wm2-rain-row">' + rainCols + '</div>' +
        '<div class="wm2-row-label"><i class="ph-bold ph-drop"></i>降水確率</div>' +
        '<div class="wm2-cols wm2-uv-row">' + uvCols + '</div>' +
        '<div class="wm2-row-label"><i class="ph-bold ph-sun-dim"></i>UV指数</div>' +
        '<div class="wm2-cols wm2-tick-row">' + tickCols + '</div>' +
        '<div class="wm2-legend">' +
          '<span class="wm2-legend-item"><i class="wm2-swatch wm2-swatch-rec"></i>おすすめ時間帯</span>' +
          '<span class="wm2-legend-item"><i class="wm2-swatch wm2-swatch-hot"></i>暑い(' + w.HOT_LIMIT + '°C〜)</span>' +
          '<span class="wm2-legend-item"><i class="wm2-swatch wm2-swatch-now"></i>いま</span>' +
        '</div>' +
      '</div>' +
      '<div class="wm2-chirol">' +
        '<img class="wm2-chirol-avatar" src="' + chirolAvatar + '" alt="チロル" onerror="this.style.display=\'none\'">' +
        '<div class="wm2-chirol-bubble">' + escapeHtml(chirolMsg) + '</div>' +
      '</div>'
    );
  }
})();
