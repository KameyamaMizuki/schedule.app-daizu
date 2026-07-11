// ui/pin-login.js — PINログイン画面
// 依存: core/auth.js (savePcSession, _onLoginSuccess), core/state.js

var _pinBuffer = '';
var _pinLoading = false;

function initPinLogin() {
  _renderPinScreen();
}

function _renderPinScreen() {
  var overlay = document.getElementById('pinLoginOverlay');
  if (!overlay) return;
  overlay.innerHTML =
    '<div class="pin-login-title">スケジュールアプリ</div>'
    + '<div id="pinInputArea">'
    + '<div class="pin-login-label">PINを入力してください</div>'
    + '<div class="pin-dots" id="pinDots">'
    + '<div class="pin-dot" id="pd0"></div>'
    + '<div class="pin-dot" id="pd1"></div>'
    + '<div class="pin-dot" id="pd2"></div>'
    + '<div class="pin-dot" id="pd3"></div>'
    + '</div>'
    + '<div class="pin-error" id="pinError"></div>'
    + '<div class="pin-numpad">'
    + [1,2,3,4,5,6,7,8,9,'','0','⌫'].map(function(k) {
        if (k === '') return '<div></div>';
        return '<div class="pin-key' + (k === '⌫' ? ' delete' : '') + '" onclick="pinKeyPress(\'' + k + '\')">' + k + '</div>';
      }).join('')
    + '</div>'
    + '<div class="pin-loading" id="pinLoading" style="display:none">確認中...</div>'
    + '</div>'
    + '<div class="pin-welcome" id="pinWelcome">'
    + '<div>🐕</div>'
    + '<div class="pin-welcome-name" id="pinWelcomeName"></div>'
    + '<div class="pin-welcome-msg">お帰りなさい！</div>'
    + '<button class="pin-welcome-btn pin-welcome-go" onclick="pinGoHome()">ホームへ進む</button>'
    + '<button class="pin-welcome-btn pin-welcome-retry" onclick="pinRetry()">入力し直す</button>'
    + '</div>';
  _pinBuffer = '';
}

function pinKeyPress(key) {
  if (_pinLoading) return;
  if (key === '⌫') {
    _pinBuffer = _pinBuffer.slice(0, -1);
    _updateDots();
    return;
  }
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += key;
  _updateDots();
  if (_pinBuffer.length === 4) {
    _submitPin();
  }
}

function _updateDots() {
  for (var i = 0; i < 4; i++) {
    var dot = document.getElementById('pd' + i);
    if (dot) dot.classList.toggle('filled', i < _pinBuffer.length);
  }
}

async function _submitPin() {
  _pinLoading = true;
  var loadingEl = document.getElementById('pinLoading');
  var errorEl = document.getElementById('pinError');
  if (loadingEl) loadingEl.style.display = 'block';
  if (errorEl) errorEl.textContent = '';

  try {
    var data = await Api.authPin(_pinBuffer);

    if (data.success && data.account) {
      if (data.sessionToken && window.Api) Api.setToken(data.sessionToken);
      var member = familyMembers.find(function(m) { return m.userId === data.account.userId; });
      if (member) {
        currentUser = member;
        savePcSession(member.userId);
        _showWelcome(data.account.displayName);
        return;
      }
    }
    if (errorEl) errorEl.textContent = 'PINが違います。もう一度お試しください。';
    _pinBuffer = '';
    _updateDots();
  } catch (e) {
    if (errorEl) errorEl.textContent = '通信エラーが発生しました。';
    _pinBuffer = '';
    _updateDots();
  } finally {
    _pinLoading = false;
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function _showWelcome(name) {
  var inputArea = document.getElementById('pinInputArea');
  var welcome = document.getElementById('pinWelcome');
  var namEl = document.getElementById('pinWelcomeName');
  if (inputArea) inputArea.style.display = 'none';
  if (welcome) welcome.style.display = 'flex';
  if (namEl) namEl.textContent = name + 'さん、';
}

async function pinGoHome() {
  var overlay = document.getElementById('pinLoginOverlay');
  if (overlay) overlay.style.display = 'none';
  await _onLoginSuccess();
}

function pinRetry() {
  var inputArea = document.getElementById('pinInputArea');
  var welcome = document.getElementById('pinWelcome');
  if (inputArea) inputArea.style.display = 'block';
  if (welcome) welcome.style.display = 'none';
  _pinBuffer = '';
  _updateDots();
}

// Api.js からの401（セッション切れ）を受けてPINログイン画面を再表示する
if (window.AppBus) {
  AppBus.on('auth:required', function() {
    if (typeof initPinLogin === 'function' && typeof _showPinLogin === 'function') {
      initPinLogin();
      _showPinLogin();
    } else {
      location.reload();
    }
  });
}
