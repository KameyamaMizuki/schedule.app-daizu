// core/utils.js — Pure utility functions (副作用なし)

// ========== 日付ユーティリティ ==========

function isAfterDeadline() {
  return false;
}

function getCalendarWeekId() {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const day = jstNow.getDay();
  const daysFromMonday = (day === 0) ? 6 : (day - 1);
  const thisMonday = new Date(jstNow);
  thisMonday.setDate(jstNow.getDate() - daysFromMonday);
  return formatDateToWeekId(thisMonday);
}

function getNextWeekId() {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const day = jstNow.getDay();
  const daysUntilNextMonday = (day === 0) ? 1 : (8 - day);
  const nextMonday = new Date(jstNow);
  nextMonday.setDate(jstNow.getDate() + daysUntilNextMonday);
  return formatDateToWeekId(nextMonday);
}

function formatDateToWeekId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekId(date) {
  const d = new Date(date);
  const day = d.getDay();
  const daysFromMonday = (day === 0) ? 6 : (day - 1);
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  return formatDateToWeekId(monday);
}

function formatDateForApi(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDateRange(weekId) {
  const monday = new Date(weekId + 'T00:00:00+09:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function generate7DaysFromMonday(weekId) {
  const dates = [];
  const [year, month, day] = weekId.split('-').map(Number);
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(year, month - 1, day + i));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
  }
  return dates;
}

function getDatesArray(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ========== HTML/表示ユーティリティ ==========

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(containerId, message) {
  document.getElementById(containerId).innerHTML = `<div class="error">${message}</div>`;
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return '今';
  if (diff < 3600) return Math.floor(diff / 60) + '分前';
  if (diff < 86400) return Math.floor(diff / 3600) + '時間前';
  if (diff < 604800) return Math.floor(diff / 86400) + '日前';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ========== ハッシュ/ランダム ==========

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// ========== 画像圧縮 ==========

function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 最大サイズを超える場合はリサイズ
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG形式で圧縮
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
