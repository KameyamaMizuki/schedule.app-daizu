// core/account.js — アカウント設定の取得（サーバーキャッシュ版）
// Phase 1完了後にAPI呼び出しが有効になる。それまではfamilyMembersのdisplayNameをフォールバックとして使用。

// 全家族メンバーのアカウント設定をキャッシュするマップ: userId → AccountSettings
var accountSettingsCache = {};

/**
 * サーバーから全家族メンバーのアカウント設定を一括取得してキャッシュ
 */
async function loadAccountSettings() {
  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.ACCOUNT);
    if (!res.ok) return;
    var data = await res.json();
    (data.accounts || []).forEach(function(a) {
      accountSettingsCache[a.userId] = a;
    });
  } catch (e) {
    console.warn('アカウント設定の取得に失敗（フォールバック使用）:', e);
  }
}

/**
 * メンバーの表示名を返す（サーバー設定 > state.jsのデフォルト）
 */
function getDisplayName(member) {
  var settings = accountSettingsCache[member.userId];
  return (settings && settings.displayName) || member.displayName;
}

/**
 * userId から表示名を返す
 */
function getDisplayNameByUserId(userId) {
  var member = familyMembers.find(function(m) { return m.userId === userId; });
  if (!member) return null;
  return getDisplayName(member);
}

/**
 * メンバーのアバター写真URL（S3）を返す
 */
function getAvatarPhoto(userId) {
  var settings = accountSettingsCache[userId];
  return (settings && settings.avatarType === 'photo' && settings.avatarUrl) ? settings.avatarUrl : null;
}

/**
 * メンバーのアバター絵文字を返す
 */
function getAvatarEmoji(userId) {
  var settings = accountSettingsCache[userId];
  if (settings && settings.avatarType === 'emoji' && settings.avatarEmoji) {
    return settings.avatarEmoji;
  }
  // フォールバック
  var fallbacks = { '瑞季': '👧', '才子': '👩', '桃寧': '👨' };
  var member = familyMembers.find(function(m) { return m.userId === userId; });
  return member ? (fallbacks[member.displayName] || '👤') : '👤';
}
