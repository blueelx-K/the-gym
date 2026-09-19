// 설정 화면 — 테마, 데이터 백업(내보내기)/복원(가져오기), 앱 정보
import { dbGetAll, dbClear, dbPut, STORE_NAMES } from './db.js';
import { getSettings, saveSettings, applyTheme } from './utils.js';

const THEME_LABEL = { system: '시스템 설정', light: '라이트', dark: '다크' };
const BACKUP_STORES = STORE_NAMES;

export async function renderSettingsView(container) {
  const settings = await getSettings();

  container.innerHTML = `
    <section class="view">
      <h1>설정</h1>

      <h2 class="section-subtitle">테마</h2>
      <div class="filter-group">
        ${['system', 'light', 'dark']
          .map(
            (t) =>
              `<button type="button" class="filter-btn${settings.theme === t ? ' active' : ''}" data-theme-choice="${t}">${THEME_LABEL[t]}</button>`
          )
          .join('')}
      </div>

      <h2 class="section-subtitle">데이터 백업</h2>
      <p class="placeholder">
        모든 종목·계획·운동 기록을 JSON 파일로 내보내거나, 이전에 내보낸 파일로 복원할 수 있습니다.
        서버가 없는 앱이라 기기를 바꾸거나 브라우저 데이터를 지울 때는 내보내기 파일이 유일한 백업입니다.
      </p>
      <button type="button" class="btn btn-primary btn-block" id="btn-export">내보내기 (다운로드)</button>
      <label class="btn btn-block" id="btn-import-label" for="import-file">가져오기 (파일 선택)</label>
      <input type="file" id="import-file" accept="application/json" hidden />

      <h2 class="section-subtitle">앱 정보</h2>
      <p class="exercise-card-meta">The Gym · 개인 로컬 저장 전용 앱 (서버·계정 없음, 데이터는 이 기기의 브라우저에만 저장됩니다)</p>
    </section>
  `;

  attachEvents(container);
}

async function exportData() {
  const values = await Promise.all(BACKUP_STORES.map((name) => dbGetAll(name)));
  const data = {};
  BACKUP_STORES.forEach((name, i) => {
    data[name] = values[i];
  });

  const payload = {
    app: 'the-gym',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `the-gym-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importData(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('올바른 JSON 파일이 아닙니다.');
  }

  const data = payload && payload.data ? payload.data : payload;
  const hasAnyKnownStore = BACKUP_STORES.some((name) => Array.isArray(data && data[name]));
  if (!hasAnyKnownStore) {
    throw new Error('백업 파일 형식이 올바르지 않습니다.');
  }

  for (const name of BACKUP_STORES) {
    const items = Array.isArray(data[name]) ? data[name] : [];
    await dbClear(name);
    for (const item of items) {
      await dbPut(name, item);
    }
  }
}

function attachEvents(container) {
  container.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const theme = btn.getAttribute('data-theme-choice');
      await saveSettings({ theme });
      applyTheme(theme);
      renderSettingsView(container);
    });
  });

  const exportBtn = container.querySelector('#btn-export');
  exportBtn.addEventListener('click', async () => {
    try {
      await exportData();
    } catch (err) {
      console.error(err);
      window.alert('내보내기에 실패했습니다.');
    }
  });

  const fileInput = container.querySelector('#import-file');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    if (!window.confirm('가져오기를 하면 현재 저장된 모든 데이터가 파일 내용으로 덮어써집니다. 계속할까요?')) {
      return;
    }

    try {
      await importData(file);
      window.alert('가져오기가 완료되었습니다.');
      renderSettingsView(container);
    } catch (err) {
      console.error(err);
      window.alert(err.message || '가져오기에 실패했습니다.');
    }
  });
}
