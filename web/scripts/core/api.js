// core/api.js — 全API呼び出しの一元化（認証ヘッダー・SWR・401リトライ・エラー整形）
window.Api = (function() {
  'use strict';
  var TOKEN_KEY = 'apiSessionToken';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function authHeaders() {
    var t = getToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }

  async function refreshToken() {
    try {
      if (window.liff && liff.isLoggedIn && liff.isLoggedIn()) {
        var idToken = liff.getIDToken();
        if (idToken) {
          var res = await fetch(API_BASE_URL + AppConfig.API.ACCOUNT + '/auth/liff', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: idToken })
          });
          if (res.ok) {
            var d = await res.json();
            if (d.success && d.sessionToken) { setToken(d.sessionToken); return true; }
          }
        }
      }
    } catch (e) { /* 失敗はfalse */ }
    return false;
  }

  async function request(path, opts, retried) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, authHeaders());
    var res = await fetch(API_BASE_URL + path, opts);
    if (res.status === 401 && !retried) {
      if (await refreshToken()) {
        return request(path, Object.assign({}, opts, { headers: opts.headers }), true);
      }
      AppBus.emit('auth:required');
      throw new Error('認証が必要です');
    }
    if (!res.ok) {
      var text = await res.text().catch(function() { return ''; });
      var msg = text; try { msg = JSON.parse(text).error || text; } catch (e) {}
      throw new Error(msg || ('HTTP ' + res.status));
    }
    return res.json();
  }

  function get(path, onFresh, opts) {
    return swrJson(API_BASE_URL + path, onFresh, Object.assign({ headers: authHeaders() }, opts || {}));
  }
  function post(path, body) { return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  function put(path, body) { return request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  function del(path, body) { return request(path, body ? { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'DELETE' }); }
  /** S3 Presigned PUT（認証ヘッダー不要） */
  async function upload(url, blob, contentType) {
    var res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
    if (!res.ok) throw new Error('S3アップロード失敗');
  }

  var A = AppConfig.API;
  return {
    setToken: setToken, getToken: getToken, refreshToken: refreshToken,
    get: get, post: post, put: put, del: del, upload: upload,
    // スケジュール
    getWeek: function(weekId, onFresh, opts) { return get(A.SCHEDULE_WEEK + '/' + weekId, onFresh, opts); },
    submitSchedule: function(body) { return post(A.SCHEDULE_SUBMIT, body); },
    // 投稿（query例: '?type=DIARY&limit=50'）
    getPosts: function(query, onFresh, opts) { return get(A.POSTS + (query || ''), onFresh, opts); },
    createPost: function(body) { return post(A.POSTS, body); },
    updatePost: function(postId, body) { return put(A.POSTS + '/' + postId, body); },
    deletePost: function(postId, type, sk) { return del(A.POSTS + '/' + postId + '?type=' + type + '&sk=' + encodeURIComponent(sk)); },
    toggleReaction: function(postId, body) { return post(A.POSTS + '/' + postId + '/reaction', body); },
    addComment: function(postId, body) { return post(A.POSTS + '/' + postId + '/comment', body); },
    // チロル画像・一言
    getChirolImages: function(onFresh, opts) { return get(A.CHIROL_IMAGES, onFresh, opts); },
    getUploadUrl: function(tag, contentType) { return request(A.CHIROL_UPLOAD_URL + '?tag=' + tag + '&contentType=' + encodeURIComponent(contentType), {}); },
    saveImageMeta: function(body) { return post(A.CHIROL_IMAGES, body); },
    imageAction: function(body) { return post(A.CHIROL_IMAGES, body); },
    deleteImage: function(body) { return del(A.CHIROL_IMAGES, body); },
    getHitokoto: function(dog, onFresh, opts) { return get(A.CHIROL_HITOKOTO + (dog ? '?dog=' + dog : ''), onFresh, opts); },
    postHitokoto: function(body) { return post(A.CHIROL_HITOKOTO, body); },
    deleteHitokoto: function(body) { return del(A.CHIROL_HITOKOTO, body); },
    // アカウント
    getAccounts: function(onFresh, opts) { return get(A.ACCOUNT, onFresh, opts); },
    updateAccount: function(body) { return put(A.ACCOUNT, body); },
    setPin: function(body) { return put(A.ACCOUNT + '/pin', body); },
    authPin: function(pin) { return post(A.ACCOUNT + '/auth', { pin: pin }); },
    authLineToken: function(token) { return post(A.ACCOUNT + '/auth/line-token', { token: token }); }
  };
})();
