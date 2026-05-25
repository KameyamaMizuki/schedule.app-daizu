// ========== [UI:SIDEBAR] サイドバー制御 ==========
// 依存: なし（DOM直操作のみ）
// 呼び出し元: home.html / dashboard.html (onclick×3), home.page.js, dashboard.page.js

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('active');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}

function toggleSubmenu(group) {
  const submenu = document.getElementById(group + '-submenu');
  const navItem = submenu.previousElementSibling;
  submenu.classList.toggle('active');
  navItem.classList.toggle('open');
}
