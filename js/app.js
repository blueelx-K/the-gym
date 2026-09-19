// 화면 전환(라우팅) — 해시 기반 SPA 라우터
import { renderHomeView } from './home.js';
import { renderExercisesView } from './exercises.js';
import { renderPlansView } from './plans.js';
import { renderWorkoutView } from './workout.js';
import { renderStatsView } from './stats.js';
import { renderSettingsView } from './backup.js';
import { getSettings, applyTheme } from './utils.js';

const routes = {
  '/home': renderHomeView,
  '/plans': renderPlansView,
  '/exercises': renderExercisesView,
  '/workout': renderWorkoutView,
  '/stats': renderStatsView,
  '/settings': renderSettingsView,
};

const appEl = document.getElementById('app');
const navLinks = document.querySelectorAll('[data-route]');

function setActiveNav(path) {
  navLinks.forEach((link) => {
    link.classList.toggle('active', link.getAttribute('data-route') === path);
  });
}

async function router() {
  const raw = window.location.hash.replace('#', '') || '/home';
  const [path, query] = raw.split('?');
  const view = routes[path] || renderHomeView;
  setActiveNav(routes[path] ? path : '/home');
  const params = new URLSearchParams(query || '');

  try {
    await view(appEl, params);
  } catch (err) {
    console.error('화면 렌더링 실패:', err);
    appEl.innerHTML = `<section class="view"><p class="error">화면을 불러오는 중 오류가 발생했습니다.</p></section>`;
  }
}

window.addEventListener('hashchange', router);

// 모듈 스크립트는 DOM 파싱이 끝난 뒤 실행되므로 DOMContentLoaded를 기다릴 필요가 없다.
// (top-level await 뒤에 등록하면 DOMContentLoaded가 이미 지나가버려 리스너가 못 잡는 경우가 있어 직접 호출한다.)
async function init() {
  const settings = await getSettings();
  applyTheme(settings.theme);
  await router();
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.error('서비스 워커 등록 실패:', err);
    });
  });
}
