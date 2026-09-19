// 여러 화면에서 공용으로 쓰는 작은 헬퍼 함수
import { dbGet, dbPut } from './db.js';

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

const DEFAULT_SETTINGS = { key: 'app', theme: 'system' };

export async function getSettings() {
  const s = await dbGet('settings', 'app');
  return s || DEFAULT_SETTINGS;
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial, key: 'app' };
  await dbPut('settings', next);
  return next;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}
