// 오늘/홈 대시보드 — 오늘 요일 계획 바로 시작, 이번 주 진행 현황, 최근 기록
import { dbGetAll } from './db.js';
import { escapeHtml } from './utils.js';

const LOCATION_LABEL = { gym: 'Gym', home: 'Home', both: 'Gym·Home' };
const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date#getDay(): 0=일요일
const DAY_LABEL_FULL = {
  sun: '일요일',
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
};

function todayDayCode() {
  return DAY_CODES[new Date().getDay()];
}

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function renderHomeView(container) {
  const [plans, sessions] = await Promise.all([dbGetAll('plans'), dbGetAll('sessions')]);

  const todayCode = todayDayCode();
  const todaysPlans = plans.filter((p) => p.active !== false && p.dayOfWeek === todayCode);

  const finishedSessions = sessions.filter((s) => s.finishedAt).sort((a, b) => b.startedAt - a.startedAt);
  const recent = finishedSessions.slice(0, 5);
  const weekStats = computeWeekStats(finishedSessions);
  const planMap = new Map(plans.map((p) => [p.id, p]));

  container.innerHTML = `
    <section class="view">
      <h1>오늘의 운동</h1>

      ${renderTodaySection(todaysPlans, todayCode)}

      <h2 class="section-subtitle">이번 주 진행 현황</h2>
      <div class="stat-row">
        <div class="stat-tile"><span class="stat-value">${weekStats.sessionCount}</span><span class="stat-label">운동 횟수</span></div>
        <div class="stat-tile"><span class="stat-value">${weekStats.completedSets}</span><span class="stat-label">완료 세트</span></div>
        <div class="stat-tile"><span class="stat-value">${weekStats.totalMinutes}</span><span class="stat-label">총 시간(분)</span></div>
      </div>

      <h2 class="section-subtitle">최근 기록</h2>
      ${
        recent.length === 0
          ? '<p class="empty-state">아직 기록된 운동이 없습니다.</p>'
          : `<ul class="session-list">${recent.map((s) => renderRecentCard(s, planMap)).join('')}</ul>`
      }
    </section>
  `;
}

function renderTodaySection(todaysPlans, todayCode) {
  if (todaysPlans.length === 0) {
    return `
      <p class="placeholder">오늘(${DAY_LABEL_FULL[todayCode]})로 지정된 계획이 없습니다.</p>
      <a href="#/workout" class="btn btn-primary btn-block">운동 기록으로 이동</a>
    `;
  }
  return `
    <ul class="plan-list">
      ${todaysPlans
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
          <a href="#/workout?start=${encodeURIComponent(p.id)}" class="btn btn-primary">바로 시작</a>
        </li>
      `
        )
        .join('')}
    </ul>
  `;
}

function renderRecentCard(s, planMap) {
  const plan = s.planId ? planMap.get(s.planId) : null;
  const completedSets = (s.logs || []).filter((l) => l.completed).length;
  const totalSets = (s.logs || []).length;
  return `
    <li class="session-card">
      <div class="plan-card-main">
        <div class="exercise-card-title">
          <strong>${escapeHtml(plan ? plan.name : '자유 기록')}</strong>
          <span class="badge badge-${s.location}">${LOCATION_LABEL[s.location]}</span>
        </div>
        <p class="exercise-card-meta">${escapeHtml(s.date)} · 세트 ${completedSets}/${totalSets} 완료</p>
      </div>
    </li>
  `;
}

function computeWeekStats(finishedSessions) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - diffToMonday);
  const mondayStr = toISODate(monday);

  const weekSessions = finishedSessions.filter((s) => s.date >= mondayStr);
  const completedSets = weekSessions.reduce((sum, s) => sum + (s.logs || []).filter((l) => l.completed).length, 0);
  const totalMinutes = weekSessions.reduce(
    (sum, s) => sum + (s.finishedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : 0),
    0
  );

  return { sessionCount: weekSessions.length, completedSets, totalMinutes };
}
