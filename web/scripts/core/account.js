// core/account.js — アカウント設定の一元管理
// 依存: core/state.js (familyMembers)
//
// このファイルが担う責務:
//   - カスタム表示名の取得 (getDisplayName / getDisplayNameByUserId)
//   - 全タブで統一してカスタム名を参照するためのAPI提供

/**
 * メンバーのカスタム表示名を取得する。
 * アカウント設定で変更した名前があればそちらを優先し、
 * なければ state.js の displayName (デフォルト名) を返す。
 * @param {Object} member - familyMembers の各エントリ { userId, displayName, ... }
 * @returns {string}
 */
function getDisplayName(member) {
  const customNames = JSON.parse(localStorage.getItem('customNames') || '{}');
  return customNames[member.userId] || member.displayName;
}

/**
 * userId からカスタム表示名を取得する。
 * API レスポンス等で userId のみ分かっている場合に使用する。
 * familyMembers に存在しない userId の場合は null を返す。
 * @param {string} userId
 * @returns {string|null}
 */
function getDisplayNameByUserId(userId) {
  const member = familyMembers.find(m => m.userId === userId);
  if (!member) return null;
  return getDisplayName(member);
}
