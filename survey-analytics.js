function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

const CHART_COLORS = ['#1c1b19', '#d4a24e', '#3a3835', '#9c6f2c', '#59564f', '#8f8b82', '#ddd9d1'];

const CONSTRUCT_LABELS = {
  c1: 'C1 Info Clarity',
  c2: 'C2 Emotional Burden',
  c3: 'C3 Financial Burden',
  c4: 'C4 Trustworthy Support',
  c5: 'C5 Community Support',
  c6: 'C6 Tech & AI Trust',
};

const SOLUTION_LABELS = {
  d1: 'D1 Real-time policy alerts',
  d2: 'D2 Predicted timeline',
  d3: 'D3 Case tracking hub',
  d4: 'D4 Attorney introduction',
  d5: 'D5 Community forum',
  d6: 'D6 Document checklists',
  d7: 'D7 Language support',
  d8: 'D8 Upfront cost info',
};

const OPEN_FIELD_LABELS = {
  b1: 'B1 — Most difficult part',
  b2: 'B2 — Confusing moment',
  b3: 'B3 — Wish they’d known',
  b4: 'B4 — Effect on daily life',
  b5: 'B5 — Who/what helped most',
  b6: 'B6 — What they’d change',
  d9: 'D9 — The one thing that would help',
};

function showState(id) {
  ['stateChecking', 'stateLoggedOut', 'stateDenied', 'stateLoading', 'stateContent'].forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.hidden = s !== id;
  });
}

function renderKpis(totals) {
  const el = document.getElementById('kpiRow');
  if (!el) return;
  el.innerHTML = `
    <div class="kpi-tile"><div class="kpi-value">${totals.totalResponses}</div><div class="kpi-label">Total responses</div></div>
    <div class="kpi-tile"><div class="kpi-value">${totals.last7Days}</div><div class="kpi-label">Last 7 days</div></div>
    <div class="kpi-tile"><div class="kpi-value">${totals.last30Days}</div><div class="kpi-label">Last 30 days</div></div>
    <div class="kpi-tile"><div class="kpi-value">${totals.contactsLeft}</div><div class="kpi-label">Left contact info</div></div>
  `;
}

function renderLineChart(canvasId, points) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map((p) => p.date.slice(5)),
      datasets: [{
        data: points.map((p) => p.count),
        borderColor: '#1c1b19',
        backgroundColor: 'rgba(28,27,25,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } },
      },
    },
  });
}

function renderConstructChart(canvasId, constructMeans) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();
  const codes = Object.keys(CONSTRUCT_LABELS);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: codes.map((c) => CONSTRUCT_LABELS[c]),
      datasets: [{
        data: codes.map((c) => constructMeans[c]),
        backgroundColor: CHART_COLORS,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 1, max: 5, ticks: { stepSize: 1 } },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  });
}

function renderSolutionChart(canvasId, solutionMeans) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();
  const entries = Object.entries(solutionMeans)
    .filter(([, v]) => v != null)
    .sort((a, b) => b[1] - a[1]);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => SOLUTION_LABELS[k] || k),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: '#d4a24e',
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { min: 1, max: 5, ticks: { stepSize: 1 } } },
    },
  });
}

function renderCategoryChart(canvasId, counts, type) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length) {
    ctx.closest('.widget-card').querySelector('.chart-container').innerHTML =
      '<p class="widget-empty">No data yet.</p>';
    return;
  }
  new Chart(ctx, {
    type: type || 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: CHART_COLORS, borderWidth: 0, borderRadius: type === 'bar' ? 4 : 0 }],
    },
    options: {
      indexAxis: type === 'bar' ? 'y' : undefined,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: type !== 'bar', position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: type === 'bar' ? { x: { beginAtZero: true, ticks: { precision: 0 } } } : undefined,
    },
  });
}

function renderFraudFlag(fraudFlag) {
  const el = document.getElementById('fraudFlagBody');
  const card = document.getElementById('fraudFlagCard');
  if (!el) return;
  if (!fraudFlag.answeredCount) {
    el.innerHTML = '<p class="widget-empty">No responses to this item yet.</p>';
    return;
  }
  const flagged = fraudFlag.flaggedPct > 0;
  card.classList.toggle('is-flagged', flagged);
  el.innerHTML = `
    <div class="stat-flag ${flagged ? 'has-flags' : ''}">
      <div class="stat-flag-value">${fraudFlag.flaggedPct}%</div>
      <div class="stat-flag-note">${fraudFlag.flaggedCount} of ${fraudFlag.answeredCount} respondents reported being taken advantage of while seeking help with their case. Treated as a standalone signal — not averaged into any construct score.</div>
    </div>
  `;
}

function renderOpenResponses(responses) {
  const el = document.getElementById('openResponsesFeed');
  if (!el) return;
  if (!responses.length) {
    el.innerHTML = '<p class="widget-empty">No open-ended responses yet.</p>';
    return;
  }
  el.innerHTML = responses.map((r) => {
    const fields = Object.keys(OPEN_FIELD_LABELS).filter((f) => r[f]);
    const date = new Date(r.created_at).toLocaleDateString();
    return `
      <div class="feed-item">
        <div class="feed-item-meta">${date}</div>
        ${fields.map((f) => `
          <div class="feed-item-qa">${escapeHtml(OPEN_FIELD_LABELS[f])}</div>
          <div class="feed-item-body">${escapeHtml(r[f])}</div>
        `).join('')}
      </div>
    `;
  }).join('');
}

async function loadAnalytics() {
  showState('stateLoading');
  try {
    const res = await fetch('/api/admin/survey-stats');
    if (res.status === 401) {
      showState('stateLoggedOut');
      return;
    }
    if (res.status === 403) {
      showState('stateDenied');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showState('stateDenied');
      return;
    }

    renderKpis(data.totals);
    renderLineChart('chartOverTime', data.responsesOverTime);
    renderConstructChart('chartConstructs', data.constructMeans);
    renderFraudFlag(data.fraudFlag);
    renderSolutionChart('chartSolutions', data.solutionMeans);
    renderCategoryChart('chartPricing', data.categorical.d10, 'bar');
    renderCategoryChart('chartAge', data.categorical.a3, 'doughnut');
    renderCategoryChart('chartCategory', data.categorical.a7, 'bar');
    renderCategoryChart('chartDevice', data.categorical.a12, 'doughnut');
    renderCategoryChart('chartCountry', data.categorical.a6, 'bar');
    renderOpenResponses(data.recentOpenResponses);

    showState('stateContent');
  } catch (err) {
    showState('stateDenied');
  }
}

(async function init() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json().catch(() => ({}));
    if (!data || !data.authenticated) {
      showState('stateLoggedOut');
      return;
    }
    await loadAnalytics();
  } catch (err) {
    showState('stateLoggedOut');
  }
})();
