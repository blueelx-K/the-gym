// 통계 화면 — 주간 운동 횟수, Gym/Home 비교, 종목별 무게·볼륨 추이
import { dbGetAll } from './db.js';
import { escapeHtml } from './utils.js';

const LOCATION_LABEL = { gym: 'Gym', home: 'Home' };
const PERIOD_LABEL = { week: '이번 주', month: '이번 달', all: '전체' };

let period = 'week';
let selectedExerciseId = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

export async function renderStatsView(container) {
  const [sessions, exercises] = await Promise.all([dbGetAll('sessions'), dbGetAll('exercises')]);
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const finished = sessions.filter((s) => s.finishedAt);

  const withHistoryIds = new Set(
    exercises
      .filter((ex) => finished.some((s) => (s.logs || []).some((l) => l.exerciseId === ex.id && l.completed)))
      .map((ex) => ex.id)
  );

  if (!selectedExerciseId || !withHistoryIds.has(selectedExerciseId)) {
    const firstWithHistory = exercises
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .find((ex) => withHistoryIds.has(ex.id));
    selectedExerciseId = firstWithHistory ? firstWithHistory.id : '';
  }

  container.innerHTML = `
    <section class="view viz-root">
      <h1>통계</h1>

      <div class="form-field">
        <label>기간</label>
        <div class="filter-group">
          ${['week', 'month', 'all']
            .map((p) => `<button type="button" class="filter-btn${period === p ? ' active' : ''}" data-period="${p}">${PERIOD_LABEL[p]}</button>`)
            .join('')}
        </div>
      </div>

      ${renderSummarySection(finished)}
      ${renderLocationSection(finished)}

      <h2 class="section-subtitle">주간 운동 횟수 (최근 8주)</h2>
      ${renderWeeklyChart(finished)}

      <h2 class="section-subtitle">종목별 추이 (전체 기간)</h2>
      ${renderExerciseTrendSection(finished, exercises, exerciseMap)}
    </section>
  `;

  attachEvents(container, finished, exerciseMap);
}

function filterByPeriod(finished, p) {
  if (p === 'all') return finished;
  const now = new Date();
  let startStr;
  if (p === 'week') {
    startStr = toISODate(mondayOf(now));
  } else {
    startStr = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  return finished.filter((s) => s.date >= startStr);
}

function renderSummarySection(finished) {
  const scoped = filterByPeriod(finished, period);
  const completedSets = scoped.reduce((sum, s) => sum + (s.logs || []).filter((l) => l.completed).length, 0);
  const totalMinutes = scoped.reduce((sum, s) => sum + Math.max(0, Math.round((s.finishedAt - s.startedAt) / 60000)), 0);

  return `
    <div class="stat-row">
      <div class="stat-tile"><span class="stat-value">${scoped.length}</span><span class="stat-label">운동 횟수</span></div>
      <div class="stat-tile"><span class="stat-value">${completedSets}</span><span class="stat-label">완료 세트</span></div>
      <div class="stat-tile"><span class="stat-value">${totalMinutes}</span><span class="stat-label">총 시간(분)</span></div>
    </div>
  `;
}

function renderLocationSection(finished) {
  const scoped = filterByPeriod(finished, period);
  const gymCount = scoped.filter((s) => s.location === 'gym').length;
  const homeCount = scoped.filter((s) => s.location === 'home').length;

  if (gymCount === 0 && homeCount === 0) {
    return `
      <h2 class="section-subtitle">Gym vs Home (${PERIOD_LABEL[period]})</h2>
      <p class="empty-state">이 기간에 기록된 운동이 없습니다.</p>
    `;
  }

  const chart = buildColumnChartSVG(
    [
      { label: 'Gym', value: gymCount, color: 'var(--series-1)' },
      { label: 'Home', value: homeCount, color: 'var(--series-2)' },
    ],
    { height: 150 }
  );

  return `
    <h2 class="section-subtitle">Gym vs Home (${PERIOD_LABEL[period]})</h2>
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-swatch" style="background:var(--series-1)"></span>Gym</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--series-2)"></span>Home</span>
    </div>
    <div class="chart-card chart-card-narrow">${chart}</div>
  `;
}

function buildWeeklyBuckets(finished, weeksCount) {
  const thisMonday = mondayOf(new Date());
  const buckets = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    buckets.push({
      startStr: toISODate(start),
      endStr: toISODate(end),
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      value: 0,
    });
  }
  finished.forEach((s) => {
    const bucket = buckets.find((b) => s.date >= b.startStr && s.date <= b.endStr);
    if (bucket) bucket.value += 1;
  });
  return buckets;
}

function renderWeeklyChart(finished) {
  const buckets = buildWeeklyBuckets(finished, 8);
  if (buckets.every((b) => b.value === 0)) {
    return '<p class="empty-state">아직 기록된 운동이 없습니다.</p>';
  }
  const chart = buildColumnChartSVG(
    buckets.map((b) => ({ label: b.label, value: b.value, color: 'var(--series-1)' })),
    { height: 160 }
  );
  return `<div class="chart-card">${chart}</div>`;
}

function metricForUnit(unit) {
  if (unit === 'time') return { key: 'duration', label: '총 시간(초)' };
  if (unit === 'bodyweight' || unit === 'distance') return { key: 'reps', label: '총 횟수' };
  return { key: 'volume', label: '총 볼륨(reps×kg)' };
}

function buildExerciseTrend(finished, exerciseId, unit) {
  const metric = metricForUnit(unit);
  const points = [];
  finished
    .slice()
    .sort((a, b) => a.startedAt - b.startedAt)
    .forEach((s) => {
      const sets = (s.logs || []).filter((l) => l.exerciseId === exerciseId && l.completed);
      if (sets.length === 0) return;
      let value = 0;
      if (metric.key === 'volume') value = sets.reduce((sum, l) => sum + l.reps * l.weight, 0);
      else if (metric.key === 'reps') value = sets.reduce((sum, l) => sum + l.reps, 0);
      else value = sets.reduce((sum, l) => sum + l.durationSec, 0);
      points.push({ date: s.date, value });
    });
  return { points, metric };
}

function renderExerciseTrendSection(finished, exercises, exerciseMap) {
  const withHistory = exercises
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .filter((ex) => finished.some((s) => (s.logs || []).some((l) => l.exerciseId === ex.id && l.completed)));

  if (withHistory.length === 0) {
    return '<p class="empty-state">완료한 세트 기록이 있는 종목이 없습니다. 운동을 기록하면 여기에 추이가 표시됩니다.</p>';
  }

  const picker = `
    <div class="form-field">
      <select id="stats-exercise-select">
        ${withHistory.map((ex) => `<option value="${escapeHtml(ex.id)}" ${ex.id === selectedExerciseId ? 'selected' : ''}>${escapeHtml(ex.name)}</option>`).join('')}
      </select>
    </div>
  `;

  const ex = exerciseMap.get(selectedExerciseId);
  if (!ex) {
    return picker + '<p class="empty-state">종목을 선택하세요.</p>';
  }

  const { points, metric } = buildExerciseTrend(finished, selectedExerciseId, ex.unit);
  if (points.length === 0) {
    return picker + '<p class="empty-state">이 종목의 완료된 기록이 없습니다.</p>';
  }

  const chart = buildLineChartSVG(points, { height: 170, color: 'var(--series-1)' });

  return `
    ${picker}
    <p class="exercise-card-meta">${escapeHtml(metric.label)}</p>
    <div class="chart-card">${chart}</div>
  `;
}

// --- SVG 차트 빌더 ---

function roundedTopBarPath(x, yTop, w, h, r) {
  if (h <= 0) return `M${x},${yTop} L${x + w},${yTop} Z`;
  const rr = Math.min(r, w / 2, h);
  const yBottom = yTop + h;
  return `M${x},${yBottom} L${x},${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} L${x + w - rr},${yTop} Q${x + w},${yTop} ${x + w},${yTop + rr} L${x + w},${yBottom} Z`;
}

function buildColumnChartSVG(items, opts = {}) {
  const { height = 160 } = opts;
  const n = items.length;
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const padTop = 22;
  const padBottom = 20;
  const plotH = height - padTop - padBottom;
  const barMax = 24;
  const gap = 16;
  const unit = barMax + gap;
  const totalW = n * unit;

  const bars = items
    .map((item, i) => {
      const h = (item.value / maxVal) * plotH;
      const x = i * unit + (unit - barMax) / 2;
      const yTop = padTop + (plotH - h);
      const path = roundedTopBarPath(x, yTop, barMax, h, 4);
      return `
        <path d="${path}" fill="${item.color}"><title>${escapeHtml(item.label)}: ${escapeHtml(String(item.value))}</title></path>
        <text x="${x + barMax / 2}" y="${yTop - 6}" text-anchor="middle" class="chart-value-label">${escapeHtml(String(item.value))}</text>
        <text x="${x + barMax / 2}" y="${height - 4}" text-anchor="middle" class="chart-axis-label">${escapeHtml(item.label)}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${totalW} ${height}" class="chart-svg" role="img" aria-label="막대 차트">${bars}</svg>`;
}

function buildLineChartSVG(points, opts = {}) {
  const { height = 170, color = 'var(--series-1)' } = opts;
  const padTop = 24;
  const padBottom = 20;
  const padX = 12;
  const plotH = height - padTop - padBottom;
  const n = points.length;
  const stepX = 48;
  const totalW = Math.max(padX * 2 + stepX, padX * 2 + (n - 1) * stepX);
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const minVal = 0;

  const coords = points.map((p, i) => {
    const x = n === 1 ? totalW / 2 : padX + i * stepX;
    const ratio = (p.value - minVal) / (maxVal - minVal || 1);
    const y = padTop + (1 - ratio) * plotH;
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const lastIndex = coords.length - 1;

  const dots = coords
    .map((c, i) => {
      const isLast = i === lastIndex;
      return `
        <circle cx="${c.x}" cy="${c.y}" r="6" fill="var(--surface)"></circle>
        <circle cx="${c.x}" cy="${c.y}" r="4" fill="${color}"></circle>
        <circle cx="${c.x}" cy="${c.y}" r="12" fill="transparent" class="chart-point" data-date="${escapeHtml(c.date)}" data-value="${escapeHtml(String(c.value))}" tabindex="0">
          <title>${escapeHtml(c.date)}: ${escapeHtml(String(c.value))}</title>
        </circle>
        ${isLast ? `<text x="${c.x}" y="${c.y - 12}" text-anchor="middle" class="chart-value-label">${escapeHtml(String(c.value))}</text>` : ''}
      `;
    })
    .join('');

  return `
    <div class="chart-scroll">
      <svg viewBox="0 0 ${totalW} ${height}" width="${totalW}" class="chart-svg chart-svg-line" role="img" aria-label="추이 차트">
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        ${dots}
      </svg>
    </div>
    <div class="chart-tooltip" id="stats-line-tooltip" hidden></div>
  `;
}

function attachEvents(container, finished, exerciseMap) {
  container.querySelectorAll('[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      period = btn.getAttribute('data-period');
      renderStatsView(container);
    });
  });

  const select = container.querySelector('#stats-exercise-select');
  if (select) {
    select.addEventListener('change', () => {
      selectedExerciseId = select.value;
      renderStatsView(container);
    });
  }

  const tooltip = container.querySelector('#stats-line-tooltip');
  if (tooltip) {
    container.querySelectorAll('.chart-point').forEach((pointEl) => {
      const show = () => {
        const date = pointEl.getAttribute('data-date');
        const value = pointEl.getAttribute('data-value');
        tooltip.textContent = `${date} · ${value}`;
        tooltip.hidden = false;
      };
      pointEl.addEventListener('click', show);
      pointEl.addEventListener('focus', show);
    });
  }
}
