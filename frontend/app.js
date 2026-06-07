// ─── Config ───────────────────────────────────────────────
const API = 'https://sprintsense-api.delightfuldune-2503ad25.eastus.azurecontainerapps.io';

const FEATURE_NAMES = {
  todo_ratio:              'Todo Ratio',
  no_issuetodo:            'Tickets Todo',
  historical_overrun_rate: 'Historical Miss Rate',
  avg_issuelink:           'Avg Dependencies',
  vel_starttime:           'Story Points Planned',
  team_load:               'Team Load',
  no_teammember:           'Team Size',
  avg_comments:            'Avg Comments',
  planday:                 'Sprint Duration',
  no_issue_starttime:      'Tickets Planned',
  avg_priority_change:     'Priority Changes',
  inprogress_ratio:        'In-Progress Ratio',
  removal_ratio:           'Removal Ratio',
  no_issueinprogress:      'Tickets In Progress',
  scope_creep_ratio:       'Scope Creep',
  no_issue_removed:        'Tickets Removed',
  completion_ratio:        'Completion Ratio',
  no_issue_added:          'Tickets Added',
  snapshot:                'Snapshot',
  no_issuedone:            'Tickets Done',
  avg_blockedby:           'Avg Blocked By',
  avg_blocking:            'Avg Blocking',
  blocker_ratio:           'Blocker Ratio',
};

let charts = { gauge: null, shap: null };

// ─── API health check ─────────────────────────────────────
async function checkAPI() {
  const dot   = document.getElementById('apiDot');
  const label = document.getElementById('apiLabel');
  try {
    const res = await fetch(`${API}/health`);
    if (res.ok) {
      dot.className     = 'api-dot online';
      label.textContent = 'api · online';
    } else throw new Error();
  } catch {
    dot.className     = 'api-dot offline';
    label.textContent = 'api · offline';
  }
}

// ─── CSV upload ───────────────────────────────────────────
function handleCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const lines   = e.target.result.split('\n').filter(r => r.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

      const rows = lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj  = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/['"]/g, ''); });
        return obj;
      }).filter(r => Object.values(r).some(v => v));

      const statusCol   = headers.find(h => h.includes('status'))                                || 'status';
      const pointsCol   = headers.find(h => h.includes('story') || h === 'sp' || h === 'points') || 'storypoints';
      const assigneeCol = headers.find(h => h.includes('assignee') || h.includes('owner'))       || 'assignee';

      const isTodo   = s => ['to do', 'todo', 'open', 'backlog', 'new'].includes(s.toLowerCase().trim());
      const isInprog = s => s.toLowerCase().includes('progress') || s.toLowerCase() === 'active';
      const isDone   = s => ['done', 'completed', 'closed', 'resolved', 'fixed'].includes(s.toLowerCase().trim());

      const todo      = rows.filter(r => isTodo(r[statusCol]   || '')).length;
      const inprog    = rows.filter(r => isInprog(r[statusCol] || '')).length;
      const done      = rows.filter(r => isDone(r[statusCol]   || '')).length;
      const total     = rows.length;
      const assignees = new Set(rows.map(r => (r[assigneeCol] || '').trim().toLowerCase()).filter(a => a)).size;
      const points    = rows.reduce((sum, r) => sum + (parseFloat(r[pointsCol]) || 0), 0);

      if (total     > 0) setField('no_issue_starttime', total);
      if (todo      > 0) setField('no_issuetodo',       todo);
      if (inprog    > 0) setField('no_issueinprogress', inprog);
      if (done      > 0) setField('no_issuedone',       done);
      if (assignees > 0) setField('no_teammember',      assignees);
      if (points    > 0) setField('vel_starttime',      Math.round(points));

      showCSVSummary({ total, todo, inprog, done, assignees, points: Math.round(points) });

    } catch {
      showUploadResult('⚠ Could not parse CSV — check format', 'var(--red)');
    }
  };
  reader.readAsText(file);
}

function setField(id, val) { document.getElementById(id).value = val; }

function showCSVSummary({ total, todo, inprog, done, assignees, points }) {
  document.getElementById('manualFields').style.display   = 'none';
  document.getElementById('csvSummaryCard').style.display = 'block';

  document.getElementById('csvTotal').textContent  = total;
  document.getElementById('csvDone').textContent   = done;
  document.getElementById('csvInprog').textContent = inprog;
  document.getElementById('csvTodo').textContent   = todo;
  document.getElementById('csvTeam').textContent   = assignees;
  document.getElementById('csvPoints').textContent = points + ' pts';

  showUploadResult(`✓ ${total} tickets parsed from CSV`, 'var(--green)');
}

function resetToManual() {
  document.getElementById('manualFields').style.display   = 'block';
  document.getElementById('csvSummaryCard').style.display = 'none';
  document.getElementById('uploadResult').style.display   = 'none';
  document.getElementById('csvFile').value                = '';
}

function showUploadResult(msg, color) {
  const el         = document.getElementById('uploadResult');
  el.textContent   = msg;
  el.style.color   = color;
  el.style.display = 'block';
}

function readNum(id) { return parseFloat(document.getElementById(id).value) || 0; }

// ─── Main prediction ──────────────────────────────────────
async function runAnalysis() {
  const btn = document.getElementById('runBtn');
  const err = document.getElementById('errorBar');

  err.style.display = 'none';
  btn.disabled      = true;
  btn.textContent   = 'ANALYZING...';

  // Always read from same fields regardless of CSV or manual
  const csvMode   = document.getElementById('csvSummaryCard').style.display !== 'none';
  const planday   = csvMode ? readNum('planday_csv')     : readNum('planday')     || 14;
  const curDay    = csvMode ? readNum('current_day_csv') : readNum('current_day') || 7;
  const velStart  = readNum('vel_starttime');
  const noStart   = readNum('no_issue_starttime');
  const noAdded   = readNum('no_issue_added');
  const noRemoved = readNum('no_issue_removed');
  const noTodo    = readNum('no_issuetodo');
  const noInprog  = readNum('no_issueinprogress');
  const noDone    = readNum('no_issuedone');
  const noTeam    = readNum('no_teammember') || 1;

  // Read historical rate directly from checked radio
  const histRadio = document.querySelector('input[name="hist"]:checked');
  const hist      = histRadio ? parseFloat(histRadio.value) : 0.5;

  const compPct  = Math.round((curDay / planday) * 100);
  const snapshot = compPct <= 15 ? 0 : compPct <= 40 ? 30 : 50;
  const teamLoad = (noStart + noAdded) / (noTeam + 1);

  const payload = {
    planday,
    no_issue_starttime:  noStart,
    vel_starttime:       velStart,
    no_issue_added:      noAdded,
    no_issue_removed:    noRemoved,
    no_issuetodo:        noTodo,
    no_issueinprogress:  noInprog,
    no_issuedone:        noDone,
    no_teammember:       noTeam,
    snapshot,
    avg_blocking:        0,
    avg_blockedby:       0,
    avg_priority_change: 0,
    avg_issuelink:       0,
    avg_comments:        0,
    scope_creep_ratio:   noAdded   / (noStart + 1),
    removal_ratio:       noRemoved / (noStart + 1),
    completion_ratio:    noDone    / (noStart + 1),
    todo_ratio:          noTodo    / (noStart + 1),
    inprogress_ratio:    noInprog  / (noStart + 1),
    blocker_ratio:       0,
    team_load:           teamLoad,
    historical_overrun_rate: hist,
    completion_pct:      compPct,
  };

  // Debug — log payload to console so you can verify
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(`${API}/predict`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    const meta = { compPct, snapshot, noTodo, noInprog, noDone, noStart, velStart, planday, curDay, teamLoad, hist };
    renderDashboard(data, meta);
  } catch {
    err.textContent   = 'Cannot connect to API. Make sure backend is running on localhost:8000.';
    err.style.display = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'RUN ANALYSIS';
  }
}

// ─── Render dashboard ─────────────────────────────────────
function renderDashboard(data, meta) {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('results').style.display    = 'flex';

  const level  = data.risk_level.toLowerCase();
  const hexMap = { high: '#f74f6b', medium: '#f7c84f', low: '#4ff797' };
  const varMap = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' };

  updateModelLabel(data.snapshot_used);
  renderGauge(data.overrun_probability_pct, hexMap[level], varMap[level], level);
  renderModelOutput(data, meta);
  renderSHAP(data.full_shap);
  renderInsights(data, meta);
  renderShapChart(data.full_shap.slice(0, 8));
}

function updateModelLabel(snapshotUsed) {
  const label         = document.getElementById('modelLabel');
  label.style.display = 'block';
  label.textContent   = `model · snapshot ${snapshotUsed}`;

  document.querySelectorAll('.snap-pill').forEach(pill => {
    pill.classList.toggle('active', +pill.dataset.s === snapshotUsed);
  });
}

// ─── Gauge ────────────────────────────────────────────────
function renderGauge(pct, hex, cssVar, level) {
  if (charts.gauge) charts.gauge.destroy();

  charts.gauge = new Chart(document.getElementById('gaugeCanvas'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data:            [pct, 100 - pct],
        backgroundColor: [hex, '#1a1b26'],
        borderWidth:     0,
        circumference:   180,
        rotation:        270,
      }],
    },
    options: {
      responsive: false,
      cutout:     '75%',
      plugins:    { legend: { display: false }, tooltip: { enabled: false } },
    },
  });

  document.getElementById('gaugePct').textContent = pct + '%';
  document.getElementById('gaugePct').style.color = cssVar;

  const badge       = document.getElementById('riskBadge');
  badge.className   = `risk-badge ${level}`;
  badge.textContent = level === 'high' ? 'HIGH RISK' : level === 'medium' ? 'MEDIUM RISK' : 'LOW RISK';
}

// ─── Model output ─────────────────────────────────────────
function renderModelOutput(data, meta) {
  // Snapshot info
  const snapLabels = { 0: 'Snapshot 0 · sprint start', 30: 'Snapshot 30 · early sprint', 50: 'Snapshot 50 · mid sprint' };
  document.getElementById('mSnapshot').textContent = snapLabels[data.snapshot_used] || data.snapshot_used;

  const top  = data.top_risk_factors[0];
  const name = FEATURE_NAMES[top.feature] || top.feature;
  const dir  = top.shap_value > 0 ? 'increasing' : 'reducing';
  document.getElementById('mTopDriver').innerHTML =
    `Primary risk driver is <strong>${name}</strong> (value: ${typeof top.value === 'number' ? top.value.toFixed(2) : top.value}), ${dir} overrun probability by <strong>${Math.abs(top.shap_value).toFixed(3)}</strong> SHAP points.`;
}

// ─── SHAP rows ────────────────────────────────────────────
function renderSHAP(shapData) {
  const container = document.getElementById('shapRows');
  container.innerHTML = '';

  const top7   = shapData.slice(0, 7);
  const maxAbs = Math.max(...top7.map(f => Math.abs(f.shap_value)));

  top7.forEach(f => {
    const isPos  = f.shap_value > 0;
    const width  = Math.round((Math.abs(f.shap_value) / maxAbs) * 100);
    const name   = FEATURE_NAMES[f.feature] || f.feature;
    const rawVal = typeof f.value === 'number' ? f.value.toFixed(2) : f.value;

    const row = document.createElement('div');
    row.className = 'shap-row';
    row.innerHTML = `
      <div class="shap-name" title="${name}">${name}</div>
      <div class="shap-track">
        <div class="shap-fill ${isPos ? 'pos' : 'neg'}" style="width:${width}%"></div>
      </div>
      <div class="shap-raw">${rawVal}</div>
      <div class="shap-delta ${isPos ? 'pos' : 'neg'}">${isPos ? '+' : ''}${f.shap_value.toFixed(3)}</div>
    `;
    container.appendChild(row);
  });
}

// ─── Insights ─────────────────────────────────────────────
function renderInsights(data, meta) {
  const pct   = data.overrun_probability_pct;
  const top   = data.top_risk_factors;
  const items = [];

  if (pct >= 70)
    items.push({ level: 'red',    text: `<strong>High overrun risk (${pct}%).</strong> Consider scope reduction or adjusting the deadline immediately.` });
  else if (pct >= 40)
    items.push({ level: 'yellow', text: `<strong>Medium risk (${pct}%).</strong> Sprint is under pressure — monitor daily and address blockers.` });
  else
    items.push({ level: 'green',  text: `<strong>Low risk (${pct}%).</strong> Sprint is on track. Maintain current pace.` });

  const tf = top[0];
  if (tf && Math.abs(tf.shap_value) > 0.04) {
    const dir  = tf.shap_value > 0 ? 'increasing' : 'reducing';
    const name = FEATURE_NAMES[tf.feature] || tf.feature;
    items.push({ level: tf.shap_value > 0 ? 'red' : 'green', text: `<strong>${name}</strong> is the primary driver — ${dir} risk by ${Math.abs(tf.shap_value).toFixed(3)} SHAP points.` });
  }

  const sf = top[1];
  if (sf && Math.abs(sf.shap_value) > 0.03) {
    const dir  = sf.shap_value > 0 ? 'increasing' : 'reducing';
    const name = FEATURE_NAMES[sf.feature] || sf.feature;
    items.push({ level: sf.shap_value > 0 ? 'yellow' : 'green', text: `Secondary driver: <strong>${name}</strong> is ${dir} risk by ${Math.abs(sf.shap_value).toFixed(3)} SHAP points.` });
  }

  if (meta.hist > 0.6)
    items.push({ level: 'yellow', text: `High historical miss rate detected. Past sprint patterns are weighing heavily on this prediction.` });
  else if (meta.hist < 0.25)
    items.push({ level: 'green',  text: `Strong historical record is pulling overall risk down despite current sprint signals.` });

  const container = document.getElementById('insightRows');
  container.innerHTML = '';
  items.slice(0, 5).forEach(item => {
    const el = document.createElement('div');
    el.className = 'insight';
    el.innerHTML = `<div class="insight-dot ${item.level}"></div><div class="insight-text">${item.text}</div>`;
    container.appendChild(el);
  });
}

// ─── SHAP chart ───────────────────────────────────────────
function renderShapChart(shapData) {
  if (charts.shap) charts.shap.destroy();

  const monoFont = { family: "'IBM Plex Mono'", size: 10 };

  charts.shap = new Chart(document.getElementById('shapChart'), {
    type: 'bar',
    data: {
      labels:   shapData.map(f => FEATURE_NAMES[f.feature] || f.feature),
      datasets: [{
        data:            shapData.map(f => f.shap_value),
        backgroundColor: shapData.map(f => f.shap_value > 0 ? 'rgba(247,79,107,0.75)' : 'rgba(79,247,151,0.75)'),
        borderRadius:    3,
        borderWidth:     0,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend:  { display: false },
        tooltip: { callbacks: { label: ctx => ` SHAP: ${ctx.raw.toFixed(3)}` } },
      },
      scales: {
        x: { grid: { color: '#22243a' }, ticks: { color: '#a8aed0', font: monoFont } },
        y: { grid: { display: false },   ticks: { color: '#a8aed0', font: monoFont } },
      },
    },
  });
}

// ─── Init ─────────────────────────────────────────────────
checkAPI();
setInterval(checkAPI, 30000);