import './style.css';
import { icons } from './icons.js';
import { store } from './store.js';
import { openAddMenu } from './meal-editor.js';
import { home } from './views/home.js';
import { weight } from './views/weight.js';
import { report } from './views/report.js';
import { settings } from './views/settings.js';
import { todayStr } from './utils.js';

const routes = { home, weight, report, settings };
const viewEl = document.getElementById('view');
const headerEl = document.getElementById('app-header');
const tabbarEl = document.getElementById('tabbar');
let current = null;

function renderTabbar(active) {
  const tab = (id, label, icon) =>
    `<a href="#${id}" class="tab ${active === id ? 'active' : ''}" id="tab-${id}" aria-label="${label}">${icon}<span>${label}</span></a>`;
  tabbarEl.innerHTML = `
    ${tab('home', 'ホーム', icons.home)}
    ${tab('weight', '体重', icons.scale)}
    <div class="fab-wrap"><button class="fab" id="fab-camera" aria-label="食事を撮影して記録">${icons.camera}</button></div>
    ${tab('report', 'レポート', icons.chart)}
    ${tab('settings', '設定', icons.settings)}`;
}

function route() {
  const name = location.hash.slice(1) || 'home';
  const next = routes[name] || home;
  current?.destroy?.();
  current = next;
  viewEl.style.animation = 'none';
  void viewEl.offsetWidth; // 画面切替アニメーションをリセット
  viewEl.style.animation = '';
  next.mount(viewEl, headerEl);
  renderTabbar(routes[name] ? name : 'home');
  window.scrollTo(0, 0);
}

tabbarEl.addEventListener('click', (e) => {
  if (e.target.closest('#fab-camera')) {
    const date = current === home ? home.date : todayStr();
    openAddMenu({ date });
  }
});

store.subscribe(() => current?.update?.());
window.addEventListener('hashchange', route);
route();

// PWA: 本番ビルド時のみ Service Worker を登録
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
