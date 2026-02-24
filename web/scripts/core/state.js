// core/state.js — AppBus + AppState + 互換alias

(function() {
  'use strict';
  // イベントバス
  var _bus = new EventTarget();
  window.AppBus = {
    emit: function(name, detail) {
      _bus.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    },
    on: function(name, handler) {
      _bus.addEventListener(name, function(e) { handler(e.detail); });
    }
  };
})();

// ========== 共有状態 (AppState) ==========
window.AppState = {
  // 定数
  API_BASE_URL: 'https://aqmin18fa2.execute-api.ap-northeast-1.amazonaws.com/prod',
  familyMembers: [
    {userId: 'U687f86855c46490c030499f5393c8a7e', displayName: '瑞季'},
    {userId: 'U4b13048aa2906b929c3139c4f3dfdd7c', displayName: '才子', hasDefaultSchedule: true},
    {userId: 'Ua8420309a164fffdbdd7f300f4c1cc94', displayName: '桃寧'}
  ],
  // 可変状態
  currentUser: null,
  // 犬画像リスト（home + wansta 共有）
  homeDogImages: {
    normal: [
      'images/dog/chirol/normal/IMG_3707.webp','images/dog/chirol/normal/IMG_3708.webp','images/dog/chirol/normal/IMG_3709.webp',
      'images/dog/chirol/normal/IMG_3710.webp','images/dog/chirol/normal/IMG_3711.webp','images/dog/chirol/normal/IMG_3714.webp',
      'images/dog/chirol/normal/IMG_3715.webp','images/dog/chirol/normal/IMG_3717.webp','images/dog/chirol/normal/IMG_3719.webp',
      'images/dog/chirol/normal/IMG_3725.webp','images/dog/chirol/normal/IMG_3726.webp','images/dog/chirol/normal/IMG_3733.webp'
    ],
    happy: [
      'images/dog/chirol/happy/IMG_3713.webp','images/dog/chirol/happy/IMG_3716.webp','images/dog/chirol/happy/IMG_3723.webp',
      'images/dog/chirol/happy/IMG_3724.webp','images/dog/chirol/happy/IMG_3732.webp'
    ],
    thinking: [
      'images/dog/chirol/thinking/IMG_3727.webp','images/dog/chirol/thinking/IMG_3729.webp',
      'images/dog/chirol/thinking/IMG_3730.webp','images/dog/chirol/thinking/IMG_3731.webp'
    ],
    sad: ['images/dog/chirol/sad/IMG_3720.webp','images/dog/chirol/sad/IMG_3721.webp']
  },
  homeDaizuImages: {
    normal: [
      'images/dog/daizu/normal/IMG_0734.jpg','images/dog/daizu/normal/IMG_1383.jpg','images/dog/daizu/normal/IMG_1497.jpg',
      'images/dog/daizu/normal/IMG_5180.jpg','images/dog/daizu/normal/IMG_5307.jpg','images/dog/daizu/normal/IMG_5575.jpg',
      'images/dog/daizu/normal/IMG_5736.jpg','images/dog/daizu/normal/IMG_6676.jpg','images/dog/daizu/normal/IMG_7921.jpg'
    ],
    happy: [
      'images/dog/daizu/happy/IMG_0531.jpg','images/dog/daizu/happy/IMG_1564.jpg','images/dog/daizu/happy/IMG_2321.jpg',
      'images/dog/daizu/happy/IMG_4813.jpg','images/dog/daizu/happy/IMG_7980.jpg'
    ],
    thinking: [
      'images/dog/daizu/thinking/IMG_5696.jpg','images/dog/daizu/thinking/IMG_6656.jpg','images/dog/daizu/thinking/IMG_8245.jpg'
    ],
    sad: [
      'images/dog/daizu/sad/IMG_2975.jpg','images/dog/daizu/sad/IMG_3130.jpg','images/dog/daizu/sad/IMG_4820.jpg'
    ]
  }
};

// ========== 互換alias（既存コードを壊さない） ==========
const API_BASE_URL = AppState.API_BASE_URL;
const familyMembers = AppState.familyMembers;
const homeDogImages = AppState.homeDogImages;
const homeDaizuImages = AppState.homeDaizuImages;
// currentUser は可変状態なので Object.defineProperty で双方向同期
Object.defineProperty(window, 'currentUser', {
  get: function() { return AppState.currentUser; },
  set: function(v) { AppState.currentUser = v; },
  configurable: true
});
