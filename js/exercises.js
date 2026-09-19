// 종목 라이브러리 화면 — 목록/추가/수정/삭제, Gym·Home 필터, 참고 URL 관리
import { dbGetAll, dbAdd, dbPut, dbDelete, generateId } from './db.js';
import { escapeHtml } from './utils.js';

const LOCATION_LABEL = { gym: 'Gym', home: 'Home', both: 'Gym·Home' };
const UNIT_LABEL = {
  weight: '무게(kg)',
  bodyweight: '맨몸/reps',
  time: '시간',
  distance: '거리',
};

const DEFAULT_EXERCISES = [
  { name: '벤치프레스', category: '가슴', location: 'gym', unit: 'weight' },
  { name: '스쿼트', category: '하체', location: 'gym', unit: 'weight' },
  { name: '데드리프트', category: '등', location: 'gym', unit: 'weight' },
  { name: '랫풀다운', category: '등', location: 'gym', unit: 'weight' },
  { name: '숄더프레스 머신', category: '어깨', location: 'gym', unit: 'weight' },
  { name: '푸시업', category: '가슴', location: 'both', unit: 'bodyweight' },
  { name: '맨몸 스쿼트', category: '하체', location: 'home', unit: 'bodyweight' },
  { name: '플랭크', category: '코어', location: 'home', unit: 'time' },
  { name: '런지', category: '하체', location: 'both', unit: 'bodyweight' },
  { name: '버피', category: '유산소', location: 'home', unit: 'bodyweight' },
];

let filterLocation = 'all';
let editingId = null; // null | 'new' | 기존 exercise id
let formDraft = null;

function blankDraft() {
  return {
    name: '',
    category: '',
    location: 'gym',
    unit: 'weight',
    notes: '',
    referenceUrls: [{ label: '', url: '' }],
  };
}

function normalizeUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function seedExercisesIfEmpty() {
  const existing = await dbGetAll('exercises');
  if (existing.length > 0) return;
  for (const seed of DEFAULT_EXERCISES) {
    await dbAdd('exercises', {
      id: generateId(),
      ...seed,
      isCustom: false,
      referenceUrls: [],
      notes: '',
    });
  }
}

export async function renderExercisesView(container) {
  await seedExercisesIfEmpty();
  await paint(container);
}

async function paint(container) {
  const all = await dbGetAll('exercises');
  all.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const filtered =
    filterLocation === 'all'
      ? all
      : all.filter((e) => e.location === filterLocation || e.location === 'both');

  container.innerHTML = `
    <section class="view">
      <h1>종목 라이브러리</h1>

      <div class="toolbar">
        <div class="filter-group">
          ${['all', 'gym', 'home']
            .map(
              (loc) => `
            <button type="button" class="filter-btn${filterLocation === loc ? ' active' : ''}" data-filter="${loc}">
              ${loc === 'all' ? '전체' : LOCATION_LABEL[loc]}
            </button>`
            )
            .join('')}
        </div>
        <button type="button" class="btn btn-primary" id="btn-new-exercise">+ 종목 추가</button>
      </div>

      ${editingId ? renderForm() : ''}

      ${
        filtered.length === 0
          ? '<p class="empty-state">해당 조건의 종목이 없습니다.</p>'
          : `<ul class="exercise-list">${filtered.map(renderCard).join('')}</ul>`
      }
    </section>
  `;

  attachEvents(container);
}

function renderCard(ex) {
  const links = (ex.referenceUrls || []).filter((r) => r.url);
  return `
    <li class="exercise-card" data-id="${escapeHtml(ex.id)}">
      <div class="exercise-card-main">
        <div class="exercise-card-title">
          <strong>${escapeHtml(ex.name)}</strong>
          <span class="badge badge-${ex.location}">${LOCATION_LABEL[ex.location]}</span>
        </div>
        <div class="exercise-card-meta">
          ${ex.category ? `<span>${escapeHtml(ex.category)}</span> · ` : ''}
          <span>${UNIT_LABEL[ex.unit] || ex.unit}</span>
        </div>
        ${
          links.length
            ? `<div class="exercise-links">
                ${links
                  .map(
                    (l) =>
                      `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(l.label || l.url)}</a>`
                  )
                  .join('')}
              </div>`
            : ''
        }
        ${ex.notes ? `<p class="exercise-notes">${escapeHtml(ex.notes)}</p>` : ''}
      </div>
      <div class="exercise-actions">
        <button type="button" class="btn-icon" data-edit="${escapeHtml(ex.id)}" aria-label="수정">✏️</button>
        <button type="button" class="btn-icon" data-delete="${escapeHtml(ex.id)}" aria-label="삭제">🗑️</button>
      </div>
    </li>
  `;
}

function renderForm() {
  const d = formDraft;
  return `
    <form class="form" id="exercise-form">
      <h2>${editingId === 'new' ? '새 종목' : '종목 수정'}</h2>

      <div class="form-field">
        <label for="f-name">종목명 *</label>
        <input id="f-name" name="name" type="text" value="${escapeHtml(d.name)}" required />
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="f-category">부위/카테고리</label>
          <input id="f-category" name="category" type="text" value="${escapeHtml(d.category)}" />
        </div>
        <div class="form-field">
          <label for="f-location">장소</label>
          <select id="f-location" name="location">
            ${['gym', 'home', 'both']
              .map((loc) => `<option value="${loc}" ${d.location === loc ? 'selected' : ''}>${LOCATION_LABEL[loc]}</option>`)
              .join('')}
          </select>
        </div>
      </div>

      <div class="form-field">
        <label for="f-unit">측정 단위</label>
        <select id="f-unit" name="unit">
          ${Object.entries(UNIT_LABEL)
            .map(([val, label]) => `<option value="${val}" ${d.unit === val ? 'selected' : ''}>${label}</option>`)
            .join('')}
        </select>
      </div>

      <div class="form-field">
        <label for="f-notes">메모</label>
        <textarea id="f-notes" name="notes" rows="2">${escapeHtml(d.notes)}</textarea>
      </div>

      <div class="form-field">
        <label>참고 URL</label>
        ${d.referenceUrls
          .map(
            (r, i) => `
          <div class="url-row" data-idx="${i}">
            <input type="text" class="url-label" placeholder="이름 (예: 자세 영상)" value="${escapeHtml(r.label)}" />
            <input type="text" class="url-value" placeholder="https://..." value="${escapeHtml(r.url)}" />
            <button type="button" class="btn-icon" data-remove-url="${i}" aria-label="링크 삭제">✕</button>
          </div>
        `
          )
          .join('')}
        <button type="button" class="btn btn-secondary" id="btn-add-url">+ 참고 URL 추가</button>
      </div>

      <div class="form-actions">
        <button type="button" class="btn" id="btn-cancel-form">취소</button>
        <button type="submit" class="btn btn-primary">저장</button>
      </div>
    </form>
  `;
}

function syncDraftFromForm(form) {
  formDraft.name = form.querySelector('#f-name').value;
  formDraft.category = form.querySelector('#f-category').value;
  formDraft.location = form.querySelector('#f-location').value;
  formDraft.unit = form.querySelector('#f-unit').value;
  formDraft.notes = form.querySelector('#f-notes').value;
  formDraft.referenceUrls = Array.from(form.querySelectorAll('.url-row')).map((row) => ({
    label: row.querySelector('.url-label').value,
    url: row.querySelector('.url-value').value,
  }));
}

function attachEvents(container) {
  container.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterLocation = btn.getAttribute('data-filter');
      paint(container);
    });
  });

  const newBtn = container.querySelector('#btn-new-exercise');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      editingId = 'new';
      formDraft = blankDraft();
      paint(container);
    });
  }

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit');
      const all = await dbGetAll('exercises');
      const ex = all.find((e) => e.id === id);
      if (!ex) return;
      editingId = id;
      formDraft = {
        name: ex.name,
        category: ex.category || '',
        location: ex.location,
        unit: ex.unit,
        notes: ex.notes || '',
        referenceUrls:
          ex.referenceUrls && ex.referenceUrls.length ? ex.referenceUrls.map((r) => ({ ...r })) : [{ label: '', url: '' }],
      };
      paint(container);
    });
  });

  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete');
      if (!window.confirm('이 종목을 삭제할까요?')) return;
      await dbDelete('exercises', id);
      if (editingId === id) {
        editingId = null;
        formDraft = null;
      }
      paint(container);
    });
  });

  const form = container.querySelector('#exercise-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      syncDraftFromForm(form);

      const name = formDraft.name.trim();
      if (!name) return;

      const referenceUrls = formDraft.referenceUrls
        .map((r) => ({ label: r.label.trim(), url: normalizeUrl(r.url) }))
        .filter((r) => r.url)
        .map((r) => ({ label: r.label || r.url, url: r.url }));

      if (editingId === 'new') {
        await dbAdd('exercises', {
          id: generateId(),
          name,
          category: formDraft.category.trim(),
          location: formDraft.location,
          unit: formDraft.unit,
          notes: formDraft.notes.trim(),
          referenceUrls,
          isCustom: true,
        });
      } else {
        const all = await dbGetAll('exercises');
        const existing = all.find((ex) => ex.id === editingId);
        await dbPut('exercises', {
          ...existing,
          name,
          category: formDraft.category.trim(),
          location: formDraft.location,
          unit: formDraft.unit,
          notes: formDraft.notes.trim(),
          referenceUrls,
        });
      }

      editingId = null;
      formDraft = null;
      paint(container);
    });

    const addUrlBtn = form.querySelector('#btn-add-url');
    addUrlBtn.addEventListener('click', () => {
      syncDraftFromForm(form);
      formDraft.referenceUrls.push({ label: '', url: '' });
      paint(container);
    });

    form.querySelectorAll('[data-remove-url]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncDraftFromForm(form);
        const idx = Number(btn.getAttribute('data-remove-url'));
        formDraft.referenceUrls.splice(idx, 1);
        if (formDraft.referenceUrls.length === 0) formDraft.referenceUrls.push({ label: '', url: '' });
        paint(container);
      });
    });

    form.querySelector('#btn-cancel-form').addEventListener('click', () => {
      editingId = null;
      formDraft = null;
      paint(container);
    });
  }
}
