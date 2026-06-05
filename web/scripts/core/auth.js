// core/auth.js — 認証フロー管理
// 依存: core/config.js, core/state.js, core/account.js, ui/user-select.js

/**
 * アプリ起動時の認証エントリポイント
 * dashboard.page.js / home.page.js の init() から呼ぶ
 */
async function initAuth() {
  // LIFF IDが未設定の場合はPINフローへ（LIFFアプリ未設定時のフォールバック）
  if (!LIFF_ID || LIFF_ID === 'LIFF_ID_PLACEHOLDER') {
    return _tryPcSession();
  }

  // 1. LIFF初期化
  try {
    await liff.init({ liffId: LIFF_ID });
  } catch (e) {
    console.warn('LIFF初期化失敗:', e);
    return _tryPcSession();
  }

  // 2. LIFF環境内かつログイン済みの場合
  if (liff.isInClient() && liff.isLoggedIn()) {
    return _authByLiff();
  }

  // 3. ブラウザでLIFF SDKが使えるがLIFF Client外（PCブラウザ等）
  return _tryPcSession();
}

/** LIFF経由で自動ログイン */
async function _authByLiff() {
  try {
    var profile = await liff.getProfile();
    var member = familyMembers.find(function(m) { return m.userId === profile.userId; });
    if (!member) {
      _showAccessDenied();
      return;
    }
    currentUser = member;
    await _onLoginSuccess();
  } catch (e) {
    console.error('LIFFプロフィール取得失敗:', e);
    _tryPcSession();
  }
}

/** localStorageのPCセッションを確認 */
async function _tryPcSession() {
  try {
    var session = JSON.parse(localStorage.getItem(AppConfig.STORAGE.AUTH_SESSION) || 'null');
    if (session && session.userId && session.authenticated) {
      var member = familyMembers.find(function(m) { return m.userId === session.userId; });
      if (member) {
        currentUser = member;
        await _onLoginSuccess();
        return;
      }
    }
  } catch (e) { /* 無視 */ }
  // セッションなし → PINログイン画面を表示
  _showPinLogin();
}

/** ログイン成功後の共通処理 */
async function _onLoginSuccess() {
  await loadAccountSettings();
  if (typeof onAuthComplete === 'function') onAuthComplete();
}

/** アクセス拒否画面 */
function _showAccessDenied() {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:18px;color:#666;padding:20px;text-align:center">このアプリは家族専用です🐕</div>';
}

/** PINログイン画面を表示 */
function _showPinLogin() {
  var overlay = document.getElementById('pinLoginOverlay');
  if (overlay) overlay.style.display = 'flex';
}

/** PC PIN認証成功後にセッションを保存 */
function savePcSession(userId) {
  localStorage.setItem(AppConfig.STORAGE.AUTH_SESSION, JSON.stringify({ userId: userId, authenticated: true }));
}
