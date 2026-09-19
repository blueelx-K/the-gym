// 운동 실행/기록 화면 — 계획에서 시작 또는 자유 기록, 세트별 실제 기록, 휴식 타이머
import { dbGetAll, dbAdd, dbPut, dbDelete, generateId } from './db.js';
import { escapeHtml } from './utils.js';

const LOCATION_LABEL = { gym: 'Gym', home: 'Home' };

let viewMode = 'list'; // 'list' | 'setup' | 'active'
let activeSession = null;
let setupLocation = 'gym';
let exerciseMap = new Map();
let exerciseLibraryCache = [];
let restTimerState = null;

function todayISODate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function renderWorkoutView(container, params) {
  const sessions = await dbGetAll('sessions');
  const unfinished = sessions.find((s) => !s.finishedAt);
  const startPlanId = params && params.get('start');

  if (unfinished) {
    activeSession = unfinished;
    viewMode = 'active';
  } else if (startPlanId) {
    const plans = await dbGetAll('plans');
    const plan = plans.find((p) => p.id === startPlanId);
    if (plan) {
      await startSessionFromPlan(plan, plan.location === 'both' ? 'gym' : plan.location);
      viewMode = 'active';
    } else {
      activeSession = null;
      viewMode = 'list';
    }
    history.replaceState(null, '', '#/workout');
  } else if (viewMode === 'active') {
    activeSession = null;
    viewMode = 'list';
  }
  await paint(container);
}

async function paint(container) {
  const [sessions, plans, exercises] = await Promise.all([
    dbGetAll('sessions'),
    dbGetAll('plans'),
    dbGetAll('exercises'),
  ]);
  exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  exerciseLibraryCache = [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const planMap = new Map(plans.map((p) => [p.id, p]));

  if (viewMode === 'active' && activeSession) {
    container.innerHTML = renderActive(activeSession, planMap);
  } else if (viewMode === 'setup') {
    const activePlans = plans
      .filter((p) => p.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    container.innerHTML = renderSetup(activePlans);
  } else {
    const finished = sessions
      .filter((s) => s.finishedAt)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 20);
    container.innerHTML = renderList(finished, planMap);
  }

  attachEvents(container);
}

function renderList(sessions, planMap) {
  return `
    <section class="view">
      <h1>운동 기록</h1>
      <button type="button" class="btn btn-primary btn-block" id="btn-start-session">+ 새 운동 시작</button>
      ${
        sessions.length === 0
          ? '<p class="empty-state">아직 기록된 운동이 없습니다.</p>'
          : `<ul class="session-list">${sessions.map((s) => renderSessionCard(s, planMap)).join('')}</ul>`
      }
    </section>
  `;
}

function renderSessionCard(s, planMap) {
  const plan = s.planId ? planMap.get(s.planId) : null;
  const completedSets = (s.logs || []).filter((l) => l.completed).length;
  const totalSets = (s.logs || []).length;
  const durationMin = s.finishedAt ? Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000)) : null;

  return `
    <li class="session-card" data-id="${escapeHtml(s.id)}">
      <div class="plan-card-main">
        <div class="exercise-card-title">
          <strong>${escapeHtml(plan ? plan.name : '자유 기록')}</strong>
          <span class="badge badge-${s.location}">${LOCATION_LABEL[s.location]}</span>
        </div>
        <p class="exercise-card-meta">
          ${escapeHtml(s.date)} · 세트 ${completedSets}/${totalSets} 완료${durationMin != null ? ` · ${durationMin}분` : ''}
        </p>
      </div>
      <div class="exercise-actions">
        <button type="button" class="btn-icon" data-delete-session="${escapeHtml(s.id)}" aria-label="삭제">🗑️</button>
      </div>
    </li>
  `;
}

function renderSetup(activePlans) {
  return `
    <section class="view">
      <h1>새 운동 시작</h1>

      <div class="form-field">
        <label>이번 세션 장소</label>
        <div class="filter-group">
          <button type="button" class="filter-btn${setupLocation === 'gym' ? ' active' : ''}" data-setup-location="gym">Gym</button>
          <button type="button" class="filter-btn${setupLocation === 'home' ? ' active' : ''}" data-setup-location="home">Home</button>
        </div>
      </div>

      <h2 class="section-subtitle">계획에서 시작</h2>
      ${
        activePlans.length === 0
          ? '<p class="placeholder">활성화된 계획이 없습니다. 계획 화면에서 먼저 만들어보세요.</p>'
          : `<ul class="plan-list">${activePlans
              .map(
                (p) => `
              <li class="plan-card">
                <div class="plan-card-main">
                  <div class="exercise-card-title">
                    <strong>${escapeHtml(p.name)}</strong>
                    <span class="badge badge-${p.location}">${p.location === 'both' ? 'Gym·Home' : LOCATION_LABEL[p.location]}</span>
                  </div>
                  <p class="exercise-card-meta">${(p.exercises || []).length}개 종목</p>
                </div>
                <button type="button" class="btn btn-secondary" data-start-plan="${escapeHtml(p.id)}">시작</button>
              </li>
            `
              )
              .join('')}</ul>`
      }

      <button type="button" class="btn btn-block" id="btn-start-free">계획 없이 자유 기록 시작</button>
      <button type="button" class="btn" id="btn-cancel-setup">취소</button>
    </section>
  `;
}

function renderActive(session, planMap) {
  const plan = session.planId ? planMap.get(session.planId) : null;
  const isFree = session.planId === null;
  const groups = groupLogsByExercise(session.logs);

  return `
    <section class="view">
      <h1>${escapeHtml(plan ? plan.name : '자유 기록')}</h1>
      <p class="exercise-card-meta">${escapeHtml(session.date)} · <span class="badge badge-${session.location}">${LOCATION_LABEL[session.location]}</span></p>

      ${isFree ? renderExercisePicker() : ''}

      ${
        groups.length === 0
          ? '<p class="empty-state">아직 추가된 종목이 없습니다.</p>'
          : groups.map((g) => renderExerciseGroup(g, isFree)).join('')
      }

      <div class="form-field">
        <label for="session-memo">메모</label>
        <textarea id="session-memo" rows="2">${escapeHtml(session.memo || '')}</textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="btn" id="btn-discard-session">운동 취소</button>
        <button type="button" class="btn btn-primary" id="btn-finish-session">운동 종료</button>
      </div>

      <div id="rest-timer-banner" class="rest-timer" hidden></div>
    </section>
  `;
}

function renderExercisePicker() {
  if (exerciseLibraryCache.length === 0) {
    return '<p class="placeholder">먼저 종목 라이브러리에서 종목을 추가하세요.</p>';
  }
  return `
    <div class="picker-row">
      <select id="workout-picker-select">
        ${exerciseLibraryCache
          .map((ex) => `<option value="${escapeHtml(ex.id)}">${escapeHtml(ex.name)} (${ex.location === 'both' ? 'Gym·Home' : LOCATION_LABEL[ex.location]})</option>`)
          .join('')}
      </select>
      <button type="button" class="btn btn-secondary" id="btn-add-exercise-to-session">+ 종목 추가</button>
    </div>
  `;
}

function groupLogsByExercise(logs) {
  const order = [];
  const map = new Map();
  (logs || []).forEach((log, idx) => {
    if (!map.has(log.exerciseId)) {
      map.set(log.exerciseId, []);
      order.push(log.exerciseId);
    }
    map.get(log.exerciseId).push({ ...log, _index: idx });
  });
  return order.map((exerciseId) => ({ exerciseId, sets: map.get(exerciseId) }));
}

function renderExerciseGroup(group, isFree) {
  const ex = exerciseMap.get(group.exerciseId);
  const name = ex ? ex.name : '(삭제된 종목)';
  const unit = ex ? ex.unit : 'weight';
  const links = ex && ex.referenceUrls ? ex.referenceUrls.filter((r) => r.url) : [];

  return `
    <div class="workout-group" data-exercise-id="${escapeHtml(group.exerciseId)}">
      <div class="workout-group-header">
        <strong>${escapeHtml(name)}</strong>
        ${isFree ? `<button type="button" class="btn-icon" data-remove-exercise-group="${escapeHtml(group.exerciseId)}" aria-label="종목 삭제">✕</button>` : ''}
      </div>
      ${
        links.length
          ? `<div class="exercise-links">${links
              .map((l) => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(l.label || l.url)}</a>`)
              .join('')}</div>`
          : ''
      }
      ${group.sets.map((set) => renderSetRow(set, unit)).join('')}
      <button type="button" class="btn btn-secondary btn-sm" data-add-set="${escapeHtml(group.exerciseId)}">+ 세트 추가</button>
    </div>
  `;
}

function renderSetRow(set, unit) {
  let fields = '';
  if (unit === 'weight') {
    fields = `
      <input type="number" class="set-reps" data-log-index="${set._index}" min="0" value="${set.reps}" aria-label="횟수" /><span>회 ×</span>
      <input type="number" class="set-weight" data-log-index="${set._index}" min="0" step="0.5" value="${set.weight}" aria-label="무게" /><span>kg</span>
    `;
  } else if (unit === 'bodyweight') {
    fields = `<input type="number" class="set-reps" data-log-index="${set._index}" min="0" value="${set.reps}" aria-label="횟수" /><span>회</span>`;
  } else if (unit === 'time') {
    fields = `<input type="number" class="set-duration" data-log-index="${set._index}" min="0" value="${set.durationSec}" aria-label="시간(초)" /><span>초</span>`;
  } else {
    fields = `<input type="number" class="set-reps" data-log-index="${set._index}" min="0" value="${set.reps}" aria-label="거리(m)" /><span>m</span>`;
  }

  return `
    <div class="set-row${set.completed ? ' completed' : ''}" data-log-index="${set._index}">
      <span class="set-number">#${set.setNumber}</span>
      <div class="set-fields">${fields}</div>
      <label class="set-check"><input type="checkbox" class="set-completed" data-log-index="${set._index}" ${set.completed ? 'checked' : ''} /> 완료</label>
      <button type="button" class="btn-icon" data-remove-set="${set._index}" aria-label="세트 삭제">✕</button>
    </div>
  `;
}

async function persistSession() {
  if (!activeSession) return;
  await dbPut('sessions', activeSession);
}

function renumberSets(session) {
  const counters = new Map();
  session.logs.forEach((log) => {
    const n = (counters.get(log.exerciseId) || 0) + 1;
    counters.set(log.exerciseId, n);
    log.setNumber = n;
  });
}

async function startSessionFromPlan(plan, location) {
  const sortedExercises = (plan.exercises || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const logs = [];
  sortedExercises.forEach((pe) => {
    const setCount = Math.max(1, pe.targetSets || 1);
    for (let i = 1; i <= setCount; i++) {
      logs.push({
        exerciseId: pe.exerciseId,
        setNumber: i,
        reps: pe.targetReps || 0,
        weight: pe.targetWeight || 0,
        durationSec: 0,
        completed: false,
        restSeconds: pe.restSeconds || 60,
      });
    }
  });

  activeSession = {
    id: generateId(),
    date: todayISODate(),
    planId: plan.id,
    location: location === 'both' ? 'gym' : location,
    startedAt: Date.now(),
    finishedAt: null,
    logs,
    memo: '',
  };
  await dbAdd('sessions', activeSession);
}

async function startSessionFree(location) {
  activeSession = {
    id: generateId(),
    date: todayISODate(),
    planId: null,
    location,
    startedAt: Date.now(),
    finishedAt: null,
    logs: [],
    memo: '',
  };
  await dbAdd('sessions', activeSession);
}

function startRestTimer(container, seconds) {
  stopRestTimer();
  const banner = container.querySelector('#rest-timer-banner');
  if (!banner) return;

  let remaining = seconds;
  banner.hidden = false;
  banner.innerHTML = `<span>휴식 ${remaining}초</span> <button type="button" id="btn-skip-rest">건너뛰기</button>`;
  banner.querySelector('#btn-skip-rest').addEventListener('click', stopRestTimer);

  restTimerState = {
    banner,
    intervalId: setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stopRestTimer();
        return;
      }
      const span = banner.querySelector('span');
      if (span) span.textContent = `휴식 ${remaining}초`;
    }, 1000),
  };
}

function stopRestTimer() {
  if (!restTimerState) return;
  clearInterval(restTimerState.intervalId);
  if (restTimerState.banner) {
    restTimerState.banner.hidden = true;
    restTimerState.banner.innerHTML = '';
  }
  restTimerState = null;
}

function attachEvents(container) {
  const startBtn = container.querySelector('#btn-start-session');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      viewMode = 'setup';
      setupLocation = 'gym';
      paint(container);
    });
  }

  container.querySelectorAll('[data-delete-session]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-session');
      if (!window.confirm('이 기록을 삭제할까요?')) return;
      await dbDelete('sessions', id);
      paint(container);
    });
  });

  container.querySelectorAll('[data-setup-location]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setupLocation = btn.getAttribute('data-setup-location');
      paint(container);
    });
  });

  container.querySelectorAll('[data-start-plan]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const planId = btn.getAttribute('data-start-plan');
      const plans = await dbGetAll('plans');
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return;
      await startSessionFromPlan(plan, setupLocation);
      viewMode = 'active';
      paint(container);
    });
  });

  const freeBtn = container.querySelector('#btn-start-free');
  if (freeBtn) {
    freeBtn.addEventListener('click', async () => {
      await startSessionFree(setupLocation);
      viewMode = 'active';
      paint(container);
    });
  }

  const cancelSetupBtn = container.querySelector('#btn-cancel-setup');
  if (cancelSetupBtn) {
    cancelSetupBtn.addEventListener('click', () => {
      viewMode = 'list';
      paint(container);
    });
  }

  if (!activeSession) return;

  const pickerAddBtn = container.querySelector('#btn-add-exercise-to-session');
  if (pickerAddBtn) {
    pickerAddBtn.addEventListener('click', async () => {
      const select = container.querySelector('#workout-picker-select');
      const exerciseId = select.value;
      if (!exerciseId) return;
      stopRestTimer();
      activeSession.logs.push({
        exerciseId,
        setNumber: 1,
        reps: 0,
        weight: 0,
        durationSec: 0,
        completed: false,
        restSeconds: 60,
      });
      await persistSession();
      paint(container);
    });
  }

  container.querySelectorAll('[data-remove-exercise-group]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const exerciseId = btn.getAttribute('data-remove-exercise-group');
      if (!window.confirm('이 종목의 모든 세트를 삭제할까요?')) return;
      stopRestTimer();
      activeSession.logs = activeSession.logs.filter((l) => l.exerciseId !== exerciseId);
      await persistSession();
      paint(container);
    });
  });

  container.querySelectorAll('[data-add-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const exerciseId = btn.getAttribute('data-add-set');
      const existing = activeSession.logs.filter((l) => l.exerciseId === exerciseId);
      const last = existing[existing.length - 1];
      stopRestTimer();
      activeSession.logs.push({
        exerciseId,
        setNumber: existing.length + 1,
        reps: last ? last.reps : 0,
        weight: last ? last.weight : 0,
        durationSec: last ? last.durationSec : 0,
        completed: false,
        restSeconds: last ? last.restSeconds : 60,
      });
      await persistSession();
      paint(container);
    });
  });

  container.querySelectorAll('[data-remove-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-remove-set'));
      stopRestTimer();
      activeSession.logs.splice(idx, 1);
      renumberSets(activeSession);
      await persistSession();
      paint(container);
    });
  });

  container.querySelectorAll('.set-reps, .set-weight, .set-duration').forEach((input) => {
    input.addEventListener('change', async () => {
      const idx = Number(input.getAttribute('data-log-index'));
      const log = activeSession.logs[idx];
      if (!log) return;
      const val = Number(input.value) || 0;
      if (input.classList.contains('set-reps')) log.reps = val;
      else if (input.classList.contains('set-weight')) log.weight = val;
      else if (input.classList.contains('set-duration')) log.durationSec = val;
      await persistSession();
    });
  });

  container.querySelectorAll('.set-completed').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const idx = Number(checkbox.getAttribute('data-log-index'));
      const log = activeSession.logs[idx];
      if (!log) return;
      log.completed = checkbox.checked;
      const row = checkbox.closest('.set-row');
      if (row) row.classList.toggle('completed', log.completed);
      await persistSession();
      if (log.completed) {
        startRestTimer(container, log.restSeconds || 60);
      }
    });
  });

  const memo = container.querySelector('#session-memo');
  if (memo) {
    memo.addEventListener('change', async () => {
      activeSession.memo = memo.value;
      await persistSession();
    });
  }

  const finishBtn = container.querySelector('#btn-finish-session');
  if (finishBtn) {
    finishBtn.addEventListener('click', async () => {
      activeSession.finishedAt = Date.now();
      await persistSession();
      stopRestTimer();
      activeSession = null;
      viewMode = 'list';
      paint(container);
    });
  }

  const discardBtn = container.querySelector('#btn-discard-session');
  if (discardBtn) {
    discardBtn.addEventListener('click', async () => {
      if (!window.confirm('이 운동 기록을 취소하고 삭제할까요?')) return;
      await dbDelete('sessions', activeSession.id);
      stopRestTimer();
      activeSession = null;
      viewMode = 'list';
      paint(container);
    });
  }
}
