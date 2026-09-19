// 운동 계획(루틴) 화면 — 목록/추가/수정/삭제, Gym·Home 필터, 종목 구성(목표 세트/횟수/무게/휴식, 순서 변경)
import { dbGetAll, dbAdd, dbPut, dbDelete, generateId } from './db.js';
import { escapeHtml } from './utils.js';

const LOCATION_LABEL = { gym: 'Gym', home: 'Home', both: 'Gym·Home' };
const DAY_ORDER = ['none', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { none: '자유', mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

let filterLocation = 'all';
let editingId = null; // null | 'new' | 기존 plan id
let formDraft = null;
let exerciseCache = []; // 폼에서 종목 선택용, paint 때마다 갱신

function blankDraft() {
  return {
    name: '',
    dayOfWeek: 'none',
    location: 'gym',
    active: true,
    exercises: [],
  };
}

export async function renderPlansView(container) {
  await paint(container);
}

async function paint(container) {
  const [plans, exercises] = await Promise.all([dbGetAll('plans'), dbGetAll('exercises')]);
  exerciseCache = [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  plans.sort(
    (a, b) =>
      DAY_ORDER.indexOf(a.dayOfWeek || 'none') - DAY_ORDER.indexOf(b.dayOfWeek || 'none') ||
      a.name.localeCompare(b.name, 'ko')
  );
  const filtered =
    filterLocation === 'all'
      ? plans
      : plans.filter((p) => p.location === filterLocation || p.location === 'both');

  container.innerHTML = `
    <section class="view">
      <h1>운동 계획</h1>

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
        <button type="button" class="btn btn-primary" id="btn-new-plan">+ 계획 추가</button>
      </div>

      ${editingId ? renderForm(exerciseMap) : ''}

      ${
        filtered.length === 0
          ? '<p class="empty-state">해당 조건의 계획이 없습니다.</p>'
          : `<ul class="plan-list">${filtered.map((p) => renderCard(p, exerciseMap)).join('')}</ul>`
      }
    </section>
  `;

  attachEvents(container);
}

function renderCard(plan, exerciseMap) {
  const items = plan.exercises || [];
  const summary = items.length
    ? items
        .map((pe) => {
          const ex = exerciseMap.get(pe.exerciseId);
          const name = ex ? ex.name : '(삭제된 종목)';
          return `${escapeHtml(name)} ${pe.targetSets}x${pe.targetReps}`;
        })
        .join(', ')
    : '등록된 종목 없음';

  return `
    <li class="plan-card" data-id="${escapeHtml(plan.id)}">
      <div class="plan-card-main">
        <div class="exercise-card-title">
          <strong>${escapeHtml(plan.name)}</strong>
          <span class="badge badge-${plan.location}">${LOCATION_LABEL[plan.location]}</span>
          <span class="badge badge-day">${DAY_LABEL[plan.dayOfWeek || 'none']}</span>
          ${plan.active === false ? '<span class="badge badge-inactive">비활성</span>' : ''}
        </div>
        <p class="exercise-card-meta">${summary}</p>
      </div>
      <div class="exercise-actions">
        <button type="button" class="btn-icon" data-edit="${escapeHtml(plan.id)}" aria-label="수정">✏️</button>
        <button type="button" class="btn-icon" data-delete="${escapeHtml(plan.id)}" aria-label="삭제">🗑️</button>
      </div>
    </li>
  `;
}

function renderForm(exerciseMap) {
  const d = formDraft;
  return `
    <form class="form" id="plan-form">
      <h2>${editingId === 'new' ? '새 계획' : '계획 수정'}</h2>

      <div class="form-field">
        <label for="p-name">계획 이름 *</label>
        <input id="p-name" type="text" value="${escapeHtml(d.name)}" placeholder="예: 월요일 - 가슴/삼두" required />
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="p-day">요일</label>
          <select id="p-day">
            ${DAY_ORDER.map((day) => `<option value="${day}" ${d.dayOfWeek === day ? 'selected' : ''}>${DAY_LABEL[day]}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="p-location">장소</label>
          <select id="p-location">
            ${['gym', 'home', 'both']
              .map((loc) => `<option value="${loc}" ${d.location === loc ? 'selected' : ''}>${LOCATION_LABEL[loc]}</option>`)
              .join('')}
          </select>
        </div>
      </div>

      <div class="form-field">
        <label class="checkbox-label"><input type="checkbox" id="p-active" ${d.active ? 'checked' : ''} /> 활성 루틴</label>
      </div>

      <div class="form-field">
        <label>종목 구성</label>
        ${
          exerciseCache.length === 0
            ? '<p class="placeholder">먼저 종목 라이브러리에서 종목을 추가하세요.</p>'
            : `<div class="picker-row">
                <select id="picker-select">
                  ${exerciseCache.map((ex) => `<option value="${escapeHtml(ex.id)}">${escapeHtml(ex.name)} (${LOCATION_LABEL[ex.location]})</option>`).join('')}
                </select>
                <button type="button" class="btn btn-secondary" id="btn-add-exercise">+ 추가</button>
              </div>`
        }

        ${
          d.exercises.length === 0
            ? '<p class="empty-state-small">아직 추가된 종목이 없습니다.</p>'
            : d.exercises.map((pe, i) => renderExerciseRow(pe, i, d.exercises.length, exerciseMap)).join('')
        }
      </div>

      <div class="form-actions">
        <button type="button" class="btn" id="btn-cancel-form">취소</button>
        <button type="submit" class="btn btn-primary">저장</button>
      </div>
    </form>
  `;
}

function renderExerciseRow(pe, i, total, exerciseMap) {
  const ex = exerciseMap.get(pe.exerciseId);
  const name = ex ? ex.name : '(삭제된 종목)';
  return `
    <div class="plan-exercise-row" data-idx="${i}">
      <div class="plan-exercise-name">${escapeHtml(name)}</div>
      <div class="plan-exercise-targets">
        <input type="number" class="pe-sets" min="0" value="${pe.targetSets}" aria-label="세트" />
        <span>세트 ×</span>
        <input type="number" class="pe-reps" min="0" value="${pe.targetReps}" aria-label="횟수" />
        <span>회</span>
        <input type="number" class="pe-weight" min="0" step="0.5" value="${pe.targetWeight}" aria-label="무게" />
        <span>kg</span>
        <input type="number" class="pe-rest" min="0" value="${pe.restSeconds}" aria-label="휴식 시간" />
        <span>초 휴식</span>
      </div>
      <div class="plan-exercise-actions">
        <button type="button" class="btn-icon" data-move-up="${i}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn-icon" data-move-down="${i}" aria-label="아래로" ${i === total - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn-icon" data-remove-exercise="${i}" aria-label="삭제">✕</button>
      </div>
    </div>
  `;
}

function syncDraftFromForm(form) {
  formDraft.name = form.querySelector('#p-name').value;
  formDraft.dayOfWeek = form.querySelector('#p-day').value;
  formDraft.location = form.querySelector('#p-location').value;
  formDraft.active = form.querySelector('#p-active').checked;

  form.querySelectorAll('.plan-exercise-row').forEach((row) => {
    const idx = Number(row.getAttribute('data-idx'));
    formDraft.exercises[idx] = {
      ...formDraft.exercises[idx],
      targetSets: Number(row.querySelector('.pe-sets').value) || 0,
      targetReps: Number(row.querySelector('.pe-reps').value) || 0,
      targetWeight: Number(row.querySelector('.pe-weight').value) || 0,
      restSeconds: Number(row.querySelector('.pe-rest').value) || 0,
    };
  });
}

function attachEvents(container) {
  container.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterLocation = btn.getAttribute('data-filter');
      paint(container);
    });
  });

  const newBtn = container.querySelector('#btn-new-plan');
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
      const all = await dbGetAll('plans');
      const plan = all.find((p) => p.id === id);
      if (!plan) return;
      editingId = id;
      formDraft = {
        name: plan.name,
        dayOfWeek: plan.dayOfWeek || 'none',
        location: plan.location,
        active: plan.active !== false,
        exercises: (plan.exercises || [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((e) => ({ ...e })),
      };
      paint(container);
    });
  });

  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete');
      if (!window.confirm('이 계획을 삭제할까요?')) return;
      await dbDelete('plans', id);
      if (editingId === id) {
        editingId = null;
        formDraft = null;
      }
      paint(container);
    });
  });

  const form = container.querySelector('#plan-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncDraftFromForm(form);

    const name = formDraft.name.trim();
    if (!name) return;

    const exercisesPayload = formDraft.exercises.map((pe, i) => ({
      exerciseId: pe.exerciseId,
      targetSets: pe.targetSets,
      targetReps: pe.targetReps,
      targetWeight: pe.targetWeight,
      restSeconds: pe.restSeconds,
      order: i,
    }));

    if (editingId === 'new') {
      await dbAdd('plans', {
        id: generateId(),
        name,
        dayOfWeek: formDraft.dayOfWeek,
        location: formDraft.location,
        active: formDraft.active,
        exercises: exercisesPayload,
      });
    } else {
      const all = await dbGetAll('plans');
      const existing = all.find((p) => p.id === editingId);
      await dbPut('plans', {
        ...existing,
        name,
        dayOfWeek: formDraft.dayOfWeek,
        location: formDraft.location,
        active: formDraft.active,
        exercises: exercisesPayload,
      });
    }

    editingId = null;
    formDraft = null;
    paint(container);
  });

  const addExerciseBtn = form.querySelector('#btn-add-exercise');
  if (addExerciseBtn) {
    addExerciseBtn.addEventListener('click', () => {
      syncDraftFromForm(form);
      const exerciseId = form.querySelector('#picker-select').value;
      if (!exerciseId) return;
      formDraft.exercises.push({ exerciseId, targetSets: 3, targetReps: 10, targetWeight: 0, restSeconds: 60 });
      paint(container);
    });
  }

  form.querySelectorAll('[data-remove-exercise]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncDraftFromForm(form);
      const idx = Number(btn.getAttribute('data-remove-exercise'));
      formDraft.exercises.splice(idx, 1);
      paint(container);
    });
  });

  form.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncDraftFromForm(form);
      const idx = Number(btn.getAttribute('data-move-up'));
      if (idx > 0) {
        [formDraft.exercises[idx - 1], formDraft.exercises[idx]] = [formDraft.exercises[idx], formDraft.exercises[idx - 1]];
      }
      paint(container);
    });
  });

  form.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncDraftFromForm(form);
      const idx = Number(btn.getAttribute('data-move-down'));
      if (idx < formDraft.exercises.length - 1) {
        [formDraft.exercises[idx + 1], formDraft.exercises[idx]] = [formDraft.exercises[idx], formDraft.exercises[idx + 1]];
      }
      paint(container);
    });
  });

  form.querySelector('#btn-cancel-form').addEventListener('click', () => {
    editingId = null;
    formDraft = null;
    paint(container);
  });
}
