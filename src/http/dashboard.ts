/**
 * Matrix Dashboard HTML — v3
 * Design system mirrors claude-website: #000 bg, #22c55e accent, Inter + JetBrains Mono
 */

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Matrix Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#000;--bg2:#0a0a0a;--card:#111;
  --border:#27272a;
  --text:#fff;--text2:#a1a1aa;--muted:#71717a;
  --accent:#22c55e;
  --accent-dim:rgba(34,197,94,.1);
  --accent-border:rgba(34,197,94,.2);
  --danger:#ef4444;--warn:#eab308;--info:#3b82f6;
  --sans:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  --mono:'JetBrains Mono','Fira Code',monospace;
  --r:12px;--rl:16px;
  --shadow-sm:0 1px 3px rgba(0,0,0,.4),0 1px 2px rgba(0,0,0,.3);
  --shadow-md:0 4px 12px rgba(0,0,0,.5);
  --shadow-glow:0 20px 40px rgba(34,197,94,.1);
  --shadow-btn:0 10px 30px rgba(34,197,94,.25);
  --ring:0 0 0 3px rgba(34,197,94,.18);
}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:0.9375rem;line-height:1.5}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#3f3f46}
#app{display:grid;grid-template-columns:240px 1fr;min-height:100vh}

/* ── Sidebar ── */
nav{background:var(--bg2);border-right:1px solid var(--border);position:sticky;top:0;height:100vh;overflow-y:auto;display:flex;flex-direction:column}
.nav-logo{display:flex;align-items:center;gap:0.75rem;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);flex-shrink:0}
.logo-icon{width:30px;height:30px;background:var(--accent-dim);border:1px solid var(--accent-border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:16px;flex-shrink:0}
.nav-logo-text{display:flex;flex-direction:column;gap:2px}
.nav-title{font-weight:600;font-size:0.9375rem;color:var(--text);line-height:1.2}
.nav-version{font-size:0.6875rem;color:var(--muted)}
.nav-section{padding:1rem 0 0.5rem}
.nav-section-title{padding:1rem 1.5rem 0.375rem;font-size:0.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
nav a{display:block;padding:0.5rem 1.5rem;color:var(--text2);font-size:0.9375rem;border-left:3px solid transparent;transition:all .15s;cursor:pointer;text-decoration:none}
nav a:hover{color:var(--text);background:rgba(255,255,255,.04)}
nav a.active{color:var(--text);border-left-color:var(--accent);background:rgba(34,197,94,.08)}

/* ── Layout ── */
main{padding:2.5rem 2.75rem;overflow-y:auto;min-height:100vh}
.page{display:none}
.page.active{display:block}
.page-title{font-size:1.375rem;font-weight:600;color:var(--text);padding-bottom:1.25rem;margin-bottom:1.5rem;border-bottom:1px solid var(--border)}
.section-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:1.25rem;margin-bottom:1.5rem;border-bottom:1px solid var(--border)}
.section-header .page-title{padding-bottom:0;margin-bottom:0;border-bottom:none}

/* ── Stat Cards ── */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem;margin-bottom:1.5rem}
.stat{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:1.5rem;transition:all .2s;position:relative;overflow:hidden;cursor:default}
.stat::after{content:'';position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:radial-gradient(circle,var(--accent-dim),transparent 70%);opacity:0;transition:opacity .2s;pointer-events:none}
.stat:hover{border-color:var(--accent-border);transform:translateY(-4px);box-shadow:var(--shadow-glow)}
.stat:hover::after{opacity:1}
.stat-icon{width:34px;height:34px;background:var(--accent-dim);border:1px solid var(--accent-border);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:1rem;color:var(--accent);flex-shrink:0}
.stat-val{font-size:2.25rem;font-weight:700;color:var(--accent);font-family:var(--mono);line-height:1;margin-bottom:0.375rem;font-variant-numeric:tabular-nums}
.stat-lbl{color:var(--text2);font-size:0.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em}

/* ── Cards ── */
.charts-row{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:1.5rem;margin-bottom:1.5rem;transition:border-color .2s,box-shadow .2s}
.card:last-child{margin-bottom:0}
.card:hover{border-color:#3f3f46;box-shadow:var(--shadow-sm)}
.card-title{font-size:0.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:1rem}
.card .card-title{padding-bottom:0.875rem;border-bottom:1px solid var(--border)}
.card-table{padding:0;overflow:hidden;margin-bottom:0}

/* ── Empty State ── */
.empty-state{padding:3rem 1rem;text-align:center}
.empty-icon{font-size:1.5rem;margin-bottom:0.5rem;opacity:0.3}
.empty-msg{color:var(--muted);font-size:0.875rem}

/* ── Bar Charts ── */
.bar-list{display:flex;flex-direction:column;gap:0.75rem}
.bar-row{display:flex;align-items:center;gap:0.75rem}
.bar-lbl{width:7rem;color:var(--text2);font-size:0.75rem;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono)}
.bar-track{flex:1;background:var(--border);border-radius:4px;height:8px;overflow:hidden}
.bar-fill{height:100%;background:var(--accent);border-radius:4px;transition:width .5s ease}
.bar-cnt{width:28px;color:var(--muted);font-size:0.6875rem;text-align:right;flex-shrink:0;font-family:var(--mono)}

/* ── Pie ── */
.pie-wrap{display:flex;align-items:center;gap:1.5rem}
.pie{width:88px;height:88px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 4px var(--card)}
.pie-legend{display:flex;flex-direction:column;gap:0.5rem}
.pie-item{display:flex;align-items:center;gap:0.5rem;font-size:0.8125rem;color:var(--text2)}
.pie-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

/* ── Tables ── */
table{width:100%;border-collapse:collapse}
th{color:var(--muted);font-weight:600;font-size:0.6875rem;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:0.75rem 1rem;background:var(--bg2);border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:0.75rem 1rem;border-bottom:1px solid var(--border);vertical-align:middle;max-width:0;color:var(--text2);font-size:0.8125rem}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.025)}
.trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.mono{font-family:var(--mono)!important;font-size:0.75rem!important;font-feature-settings:'tnum'}
td.text-primary{color:var(--text)}
td.act{white-space:nowrap;width:1px}

/* ── Buttons ── */
.btn{background:none;border:1px solid var(--border);color:var(--text2);padding:0.5rem 1rem;border-radius:8px;cursor:pointer;font-family:var(--sans);font-size:0.875rem;font-weight:500;transition:all .15s;white-space:nowrap}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn-danger:hover{border-color:var(--danger);color:var(--danger);background:rgba(239,68,68,.08)}
.btn-primary{border-color:var(--accent-border);color:var(--accent);background:var(--accent-dim)}
.btn-primary:hover{border-color:var(--accent);background:rgba(34,197,94,.15);transform:translateY(-1px);box-shadow:var(--shadow-btn)}
.btn-sm{padding:0.25rem 0.625rem;font-size:0.75rem}

/* ── Filters ── */
select.filter{background:var(--card);border:1px solid var(--border);color:var(--text2);padding:0.5rem 0.875rem;border-radius:8px;font-family:var(--sans);font-size:0.875rem;cursor:pointer;outline:none;transition:all .15s}
select.filter:hover,select.filter:focus{border-color:var(--accent);color:var(--text);box-shadow:var(--ring)}

/* ── Badges ── */
.badge{display:inline-block;padding:0.125rem 0.5rem;border-radius:4px;font-size:0.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.b-global,.b-success,.b-bugfix,.b-feature,.b-pattern,.b-completed{background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.25)}
.b-repo,.b-info,.b-running{background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.25)}
.b-stack,.b-warn,.b-partial,.b-config,.b-optimization{background:rgba(234,179,8,.12);color:#eab308;border:1px solid rgba(234,179,8,.25)}
.b-failure,.b-block,.b-danger,.b-timeout{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25)}
.b-refactor{background:rgba(168,85,247,.12);color:#c084fc;border:1px solid rgba(168,85,247,.25)}
.b-skipped,.b-queued,.b-cancelled,.b-other{background:rgba(113,113,122,.15);color:var(--muted);border:1px solid rgba(113,113,122,.25)}

/* ── Score bar ── */
.sbar{display:inline-flex;align-items:center;gap:6px}
.sbar-track{width:48px;height:4px;background:var(--border);border-radius:2px;overflow:hidden}
.sbar-fill{height:100%;background:var(--accent);border-radius:2px}
.sbar-val{color:var(--muted);font-size:0.6875rem;font-family:var(--mono)}

/* ── Config ── */
.cfg-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.875rem}
.cfg-field{display:flex;flex-direction:column;gap:0.375rem}
.cfg-label{color:var(--muted);font-size:0.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.cfg-field input[type=text],.cfg-field input[type=number],.cfg-field select{background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:0.5625rem 0.75rem;border-radius:8px;font-family:var(--mono);font-size:0.8125rem;outline:none;transition:border-color .15s,box-shadow .15s;width:100%}
.cfg-field input:focus,.cfg-field select:focus{border-color:var(--accent);box-shadow:var(--ring)}
.cfg-bool{display:flex;align-items:center;gap:0.875rem;padding:0.625rem 0.875rem;background:var(--bg2);border:1px solid var(--border);border-radius:8px;transition:border-color .15s;cursor:pointer}
.cfg-bool:hover{border-color:#3f3f46}
.cfg-bool label{flex:1;cursor:pointer;font-size:0.875rem;color:var(--text2)}
.cfg-bool input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex-shrink:0}

/* ── Progress ── */
.progress-wrap{width:52px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;display:inline-block;vertical-align:middle}
.progress-fill{height:100%;background:var(--info);border-radius:3px}

/* ── Toast ── */
.toast{position:fixed;bottom:24px;right:24px;background:var(--card);border:1px solid var(--accent-border);color:var(--accent);padding:0.625rem 1.125rem;border-radius:12px;font-size:0.8125rem;font-weight:500;opacity:0;transition:opacity .25s;pointer-events:none;z-index:9999;box-shadow:var(--shadow-md)}
.toast.show{opacity:1}
</style>
</head>
<body>
<div id="app">

<nav>
  <div class="nav-logo">
    <div class="logo-icon">⬡</div>
    <div class="nav-logo-text">
      <span class="nav-title">Matrix</span>
      <span class="nav-version">MCP Plugin</span>
    </div>
  </div>
  <div class="nav-section">
    <div class="nav-section-title">Memory</div>
    <a class="active" data-page="overview" onclick="nav(this)">Overview</a>
    <a data-page="solutions" onclick="nav(this)">Solutions</a>
    <a data-page="failures" onclick="nav(this)">Failures</a>
    <a data-page="warnings" onclick="nav(this)">Warnings</a>
  </div>
  <div class="nav-section">
    <div class="nav-section-title">System</div>
    <a data-page="repos" onclick="nav(this)">Repos &amp; Index</a>
    <a data-page="jobs" onclick="nav(this)">Jobs</a>
    <a data-page="dreamer" onclick="nav(this)">Dreamer</a>
    <a data-page="config" onclick="nav(this)">Config</a>
  </div>
</nav>

<main>

<!-- OVERVIEW -->
<div id="page-overview" class="page active">
  <h1 class="page-title">Overview</h1>
  <div class="stats-row">
    <div class="stat">
      <div class="stat-icon"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>
      <div class="stat-val" id="s-sol">—</div><div class="stat-lbl">Solutions</div>
    </div>
    <div class="stat">
      <div class="stat-icon"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M15 9l-6 6M9 9l6 6"/></svg></div>
      <div class="stat-val" id="s-fail">—</div><div class="stat-lbl">Failures</div>
    </div>
    <div class="stat">
      <div class="stat-icon"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>
      <div class="stat-val" id="s-warn">—</div><div class="stat-lbl">Warnings</div>
    </div>
    <div class="stat">
      <div class="stat-icon"><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg></div>
      <div class="stat-val" id="s-repo">—</div><div class="stat-lbl">Repos</div>
    </div>
  </div>
  <div class="charts-row">
    <div class="card"><div class="card-title">By Category</div><div class="bar-list" id="c-cat"></div></div>
    <div class="card"><div class="card-title">By Scope</div><div class="pie-wrap" id="c-scope"></div></div>
  </div>
  <div class="charts-row">
    <div class="card"><div class="card-title">Score Distribution</div><div class="bar-list" id="c-score"></div></div>
    <div class="card"><div class="card-title">Top Tags</div><div class="bar-list" id="c-tags"></div></div>
  </div>
</div>

<!-- SOLUTIONS -->
<div id="page-solutions" class="page">
  <div class="section-header">
    <h1 class="page-title">Solutions <span id="sol-count" style="color:var(--muted);font-size:0.875rem;font-weight:400"></span></h1>
    <div style="display:flex;gap:0.5rem">
      <select class="filter" id="f-cat" onchange="loadSolutions()">
        <option value="">All Categories</option>
        <option>bugfix</option><option>feature</option><option>refactor</option>
        <option>config</option><option>pattern</option><option>optimization</option>
      </select>
      <select class="filter" id="f-scope" onchange="loadSolutions()">
        <option value="">All Scopes</option>
        <option>global</option><option>stack</option><option>repo</option>
      </select>
    </div>
  </div>
  <div class="card card-table">
    <table>
      <thead><tr>
        <th style="width:38%">Problem</th><th>Category</th><th>Scope</th>
        <th>Score</th><th>Uses</th><th>Created</th><th></th>
      </tr></thead>
      <tbody id="tb-solutions"></tbody>
    </table>
  </div>
</div>

<!-- FAILURES -->
<div id="page-failures" class="page">
  <div class="section-header"><h1 class="page-title">Failures</h1></div>
  <div class="card card-table">
    <table>
      <thead><tr>
        <th>Type</th><th style="width:35%">Message</th><th style="width:30%">Root Cause</th>
        <th>Count</th><th>Created</th><th></th>
      </tr></thead>
      <tbody id="tb-failures"></tbody>
    </table>
  </div>
</div>

<!-- WARNINGS -->
<div id="page-warnings" class="page">
  <div class="section-header"><h1 class="page-title">Warnings</h1></div>
  <div class="card card-table">
    <table>
      <thead><tr>
        <th>Type</th><th style="width:30%">Target</th><th style="width:32%">Reason</th>
        <th>Severity</th><th>Ecosystem</th><th>Created</th><th></th>
      </tr></thead>
      <tbody id="tb-warnings"></tbody>
    </table>
  </div>
</div>

<!-- REPOS -->
<div id="page-repos" class="page">
  <div class="section-header"><h1 class="page-title">Repos &amp; Index</h1></div>
  <div class="card card-table">
    <table>
      <thead><tr>
        <th>Name</th><th style="width:35%">Path</th><th>Languages</th>
        <th>Files</th><th>Symbols</th><th></th>
      </tr></thead>
      <tbody id="tb-repos"></tbody>
    </table>
  </div>
</div>

<!-- JOBS -->
<div id="page-jobs" class="page">
  <div class="section-header">
    <h1 class="page-title">Background Jobs</h1>
    <button class="btn btn-sm" onclick="loadJobs()">Refresh</button>
  </div>
  <div class="card card-table">
    <table>
      <thead><tr>
        <th>ID</th><th>Tool</th><th>Status</th><th>Progress</th>
        <th>Created</th><th>Completed</th><th></th>
      </tr></thead>
      <tbody id="tb-jobs"></tbody>
    </table>
  </div>
</div>

<!-- DREAMER -->
<div id="page-dreamer" class="page">
  <div class="section-header"><h1 class="page-title">Dreamer</h1></div>
  <div class="card-title" style="margin-bottom:1rem">Scheduled Tasks</div>
  <div class="card card-table" style="margin-bottom:1.5rem">
    <table>
      <thead><tr>
        <th>Name</th><th style="width:20%">Schedule</th><th style="width:32%">Command</th>
        <th>Enabled</th><th>Created</th><th></th>
      </tr></thead>
      <tbody id="tb-dreamer-tasks"></tbody>
    </table>
  </div>
  <div class="card-title" style="margin-bottom:1rem">Recent Executions</div>
  <div class="card card-table">
    <table>
      <thead><tr>
        <th style="width:35%">Task</th><th>Status</th><th>Duration</th>
        <th>Started</th><th style="width:30%">Error</th>
      </tr></thead>
      <tbody id="tb-dreamer-execs"></tbody>
    </table>
  </div>
</div>

<!-- CONFIG -->
<div id="page-config" class="page">
  <div class="section-header">
    <h1 class="page-title">Config</h1>
    <button class="btn btn-primary" onclick="saveConfig()">Save Changes</button>
  </div>
  <div id="cfg-sections"></div>
</div>

</main>
</div>
<div class="toast" id="toast"></div>

<script>
// ── Helpers ────────────────────────────────────────────────────────────
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  return r.json();
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
function fd(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' +
         d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function fdur(ms) { if (ms==null) return '—'; return ms<1000 ? ms+'ms' : (ms/1000).toFixed(1)+'s'; }
function tr(s,n) { if (!s) return '—'; s=String(s); return s.length>n ? s.slice(0,n)+'…' : s; }
function b(t,c) { return '<span class="badge b-'+(c||t)+'">'+t+'</span>'; }
function sbar(v) {
  const pct = Math.round((v||0)*100);
  return '<span class="sbar"><span class="sbar-track"><span class="sbar-fill" style="width:'+pct+'%"></span></span>'+
         '<span class="sbar-val">'+pct+'</span></span>';
}
function jarr(s) { try { return JSON.parse(s||'[]'); } catch { return []; } }
function emptyRow(cols, icon, msg) {
  return '<tr><td colspan="'+cols+'"><div class="empty-state"><div class="empty-icon">'+icon+'</div><div class="empty-msg">'+msg+'</div></div></td></tr>';
}

// ── Navigation ─────────────────────────────────────────────────────────
function nav(el) {
  document.querySelectorAll('nav a').forEach(a=>a.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  const pg = el.dataset.page;
  document.getElementById('page-'+pg).classList.add('active');
  ({overview:loadOverview,solutions:loadSolutions,failures:loadFailures,
    warnings:loadWarnings,repos:loadRepos,jobs:loadJobs,
    dreamer:loadDreamer,config:loadConfig})[pg]?.();
}

// ── Overview ───────────────────────────────────────────────────────────
async function loadOverview() {
  const d = await api('/api/stats');
  const t = d.totals;
  document.getElementById('s-sol').textContent  = t.total_solutions;
  document.getElementById('s-fail').textContent = t.total_failures;
  document.getElementById('s-warn').textContent = t.total_warnings;
  document.getElementById('s-repo').textContent = t.total_repos;
  renderBars('c-cat',   d.byCategory,  'category', 'count');
  renderBars('c-score', d.scoreDist,   'label',    'count');
  renderBars('c-tags',  d.topTags,     'tag',      'count');
  renderPie('c-scope',  d.byScope);
}
function renderBars(id, rows, lk, vk) {
  const el = document.getElementById(id);
  if (!rows||!rows.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">···</div><div class="empty-msg">No data</div></div>'; return; }
  const max = Math.max(...rows.map(r=>r[vk]),1);
  el.innerHTML = rows.map(r => {
    const pct = Math.round(r[vk]/max*100);
    return '<div class="bar-row"><span class="bar-lbl" title="'+r[lk]+'">'+r[lk]+'</span>'+
           '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div>'+
           '<span class="bar-cnt">'+r[vk]+'</span></div>';
  }).join('');
}
const SC = {global:'#22c55e',stack:'#eab308',repo:'#3b82f6'};
function renderPie(id, rows) {
  const el = document.getElementById(id);
  if (!rows||!rows.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">···</div><div class="empty-msg">No data</div></div>'; return; }
  const tot = rows.reduce((s,r)=>s+r.count,0);
  let deg=0;
  const stops = rows.map(r=>{
    const c=SC[r.scope]||'#71717a'; const sl=r.count/tot*360;
    const s=c+' '+deg+'deg '+(deg+sl)+'deg'; deg+=sl; return s;
  });
  el.innerHTML='<div class="pie" style="background:conic-gradient('+stops.join(',')+')"></div>'+
    '<div class="pie-legend">'+rows.map(r=>{
      const c=SC[r.scope]||'#71717a'; const pct=Math.round(r.count/tot*100);
      return '<div class="pie-item"><span class="pie-dot" style="background:'+c+'"></span>'+
             '<span>'+r.scope+' <span style="color:var(--muted)">'+pct+'%</span></span></div>';
    }).join('')+'</div>';
}

// ── Solutions ──────────────────────────────────────────────────────────
async function loadSolutions() {
  const cat   = document.getElementById('f-cat').value;
  const scope = document.getElementById('f-scope').value;
  const p = new URLSearchParams({limit:'300'});
  if (cat)   p.set('category',cat);
  if (scope) p.set('scope',scope);
  const rows = await api('/api/solutions?'+p);
  document.getElementById('sol-count').textContent = '('+rows.length+')';
  document.getElementById('tb-solutions').innerHTML = rows.length ? rows.map(r=>
    '<tr>'+
    '<td style="max-width:280px" class="text-primary"><span class="trunc" title="'+esc(r.problem)+'">'+tr(r.problem,70)+'</span></td>'+
    '<td>'+(r.category?b(r.category,r.category):'—')+'</td>'+
    '<td>'+b(r.scope,r.scope)+'</td>'+
    '<td>'+sbar(r.score)+'</td>'+
    '<td class="mono">'+(r.uses||0)+'</td>'+
    '<td class="mono">'+fd(r.created_at)+'</td>'+
    '<td class="act"><button class="btn btn-sm btn-danger" data-id="'+r.id+'" onclick="delSolution(this.dataset.id)">Del</button></td>'+
    '</tr>'
  ).join('') : emptyRow(7, '✦', 'No solutions stored yet');
}
async function delSolution(id) {
  if (!confirm('Delete solution?')) return;
  await api('/api/solutions/'+id,{method:'DELETE'});
  toast('Deleted'); loadSolutions();
}

// ── Failures ───────────────────────────────────────────────────────────
async function loadFailures() {
  const rows = await api('/api/failures');
  document.getElementById('tb-failures').innerHTML = rows.length ? rows.map(r=>
    '<tr>'+
    '<td>'+b(r.error_type,'warn')+'</td>'+
    '<td style="max-width:260px"><span class="trunc" title="'+esc(r.error_message)+'">'+tr(r.error_message,60)+'</span></td>'+
    '<td style="max-width:220px"><span class="trunc" title="'+esc(r.root_cause)+'">'+tr(r.root_cause,55)+'</span></td>'+
    '<td class="mono">'+(r.occurrences||1)+'</td>'+
    '<td class="mono">'+fd(r.created_at)+'</td>'+
    '<td class="act"><button class="btn btn-sm btn-danger" data-id="'+r.id+'" onclick="delFailure(this.dataset.id)">Del</button></td>'+
    '</tr>'
  ).join('') : emptyRow(6, '✓', 'No failures recorded');
}
async function delFailure(id) {
  if (!confirm('Delete failure?')) return;
  await api('/api/failures/'+id,{method:'DELETE'});
  toast('Deleted'); loadFailures();
}

// ── Warnings ───────────────────────────────────────────────────────────
async function loadWarnings() {
  const rows = await api('/api/warnings');
  document.getElementById('tb-warnings').innerHTML = rows.length ? rows.map(r=>
    '<tr>'+
    '<td>'+b(r.type,'info')+'</td>'+
    '<td style="max-width:220px"><span class="trunc" title="'+esc(r.target)+'">'+tr(r.target,50)+'</span></td>'+
    '<td style="max-width:240px"><span class="trunc" title="'+esc(r.reason)+'">'+tr(r.reason,60)+'</span></td>'+
    '<td>'+b(r.severity,r.severity)+'</td>'+
    '<td class="mono">'+(r.ecosystem||'—')+'</td>'+
    '<td class="mono">'+fd(r.created_at)+'</td>'+
    '<td class="act"><button class="btn btn-sm btn-danger" data-id="'+r.id+'" onclick="delWarning(this.dataset.id)">Del</button></td>'+
    '</tr>'
  ).join('') : emptyRow(7, '⚑', 'No warnings configured');
}
async function delWarning(id) {
  if (!confirm('Delete warning?')) return;
  await api('/api/warnings/'+id,{method:'DELETE'});
  toast('Deleted'); loadWarnings();
}

// ── Repos ──────────────────────────────────────────────────────────────
async function loadRepos() {
  const rows = await api('/api/repos');
  document.getElementById('tb-repos').innerHTML = rows.length ? rows.map(r=>
    '<tr>'+
    '<td class="text-primary">'+tr(r.name,30)+'</td>'+
    '<td style="max-width:260px"><span class="trunc mono" title="'+esc(r.path)+'">'+tr(r.path,55)+'</span></td>'+
    '<td class="mono">'+jarr(r.languages).slice(0,3).join(', ')+'</td>'+
    '<td class="mono">'+(r.indexed_files||0)+'</td>'+
    '<td class="mono">'+(r.symbol_count||0)+'</td>'+
    '<td class="act"><button class="btn btn-sm" data-path="'+encodeURIComponent(r.path||'')+'" onclick="reindex(this.dataset.path)">Reindex</button></td>'+
    '</tr>'
  ).join('') : emptyRow(6, '⌂', 'No repos indexed yet');
}
async function reindex(enc) {
  toast('Reindexing…');
  try {
    const r = await api('/api/repos/'+enc+'/reindex',{method:'POST'});
    toast(r.message||'Done'); loadRepos();
  } catch(e) { toast('Error: '+e.message); }
}

// ── Jobs ───────────────────────────────────────────────────────────────
async function loadJobs() {
  const rows = await api('/api/jobs');
  const sc = {completed:'completed',failed:'failure',running:'running',queued:'queued',cancelled:'cancelled'};
  document.getElementById('tb-jobs').innerHTML = rows.length ? rows.map(r=>
    '<tr>'+
    '<td class="mono" style="font-size:0.625rem">'+r.id.slice(0,14)+'</td>'+
    '<td class="text-primary">'+tr(r.tool_name,28)+'</td>'+
    '<td>'+b(r.status,sc[r.status]||'info')+'</td>'+
    '<td><div class="progress-wrap"><div class="progress-fill" style="width:'+(r.progress_percent||0)+'%"></div></div> <span class="mono">'+(r.progress_percent||0)+'%</span></td>'+
    '<td class="mono">'+fd(r.created_at)+'</td>'+
    '<td class="mono">'+fd(r.completed_at)+'</td>'+
    '<td class="act">'+(['queued','running'].includes(r.status)?'<button class="btn btn-sm btn-danger" data-id="'+r.id+'" onclick="cancelJob(this.dataset.id)">Cancel</button>':'')+'</td>'+
    '</tr>'
  ).join('') : emptyRow(7, '◎', 'No background jobs');
}
async function cancelJob(id) {
  await api('/api/jobs/'+id,{method:'DELETE'});
  toast('Cancelled'); loadJobs();
}

// ── Dreamer ────────────────────────────────────────────────────────────
async function loadDreamer() {
  const [tasks, execs] = await Promise.all([api('/api/dreamer/tasks'), api('/api/dreamer/executions')]);
  document.getElementById('tb-dreamer-tasks').innerHTML = tasks.length ? tasks.map(r=>
    '<tr>'+
    '<td class="text-primary">'+tr(r.name,38)+'</td>'+
    '<td class="mono" style="font-size:0.6875rem">'+tr(r.cron_expression,22)+'</td>'+
    '<td style="max-width:240px"><span class="trunc mono" title="'+esc(r.command)+'">'+tr(r.command,55)+'</span></td>'+
    '<td>'+(r.enabled?b('on','success'):b('off','warn'))+'</td>'+
    '<td class="mono">'+fd(r.created_at)+'</td>'+
    '<td class="act"><button class="btn btn-sm btn-danger" data-id="'+r.id+'" onclick="delDreamer(this.dataset.id)">Del</button></td>'+
    '</tr>'
  ).join('') : emptyRow(6, '⏱', 'No scheduled tasks');

  const es = {success:'success',failure:'failure',running:'running',timeout:'warn',skipped:'skipped'};
  document.getElementById('tb-dreamer-execs').innerHTML = execs.length ? execs.map(r=>
    '<tr>'+
    '<td style="max-width:260px" class="text-primary"><span class="trunc" title="'+esc(r.task_name)+'">'+tr(r.task_name,45)+'</span></td>'+
    '<td>'+b(r.status,es[r.status]||'info')+'</td>'+
    '<td class="mono">'+fdur(r.duration)+'</td>'+
    '<td class="mono">'+fd(r.started_at)+'</td>'+
    '<td style="max-width:220px"><span class="trunc mono" title="'+esc(r.error)+'">'+tr(r.error,50)+'</span></td>'+
    '</tr>'
  ).join('') : emptyRow(5, '◷', 'No executions yet');
}
async function delDreamer(id) {
  if (!confirm('Delete task and its execution history?')) return;
  await api('/api/dreamer/tasks/'+id,{method:'DELETE'});
  toast('Deleted'); loadDreamer();
}

// ── Config ─────────────────────────────────────────────────────────────
let _cfg = null;
const _fields = [
  {s:'Dashboard', fields:[
    {p:'dashboard.enabled', l:'Enabled',  t:'bool'},
    {p:'dashboard.port',    l:'Port',     t:'num'},
    {p:'dashboard.host',    l:'Host',     t:'text'},
  ]},
  {s:'Search', fields:[
    {p:'search.defaultLimit',    l:'Default Limit',   t:'num'},
    {p:'search.defaultMinScore', l:'Min Score (0–1)', t:'num'},
    {p:'search.defaultScope',    l:'Default Scope',   t:'sel', opts:['all','repo','stack','global']},
  ]},
  {s:'Merge & List', fields:[
    {p:'merge.defaultThreshold', l:'Merge Threshold (0–1)', t:'num'},
    {p:'list.defaultLimit',      l:'List Default Limit',    t:'num'},
  ]},
  {s:'Export', fields:[
    {p:'export.defaultDirectory', l:'Default Directory', t:'text'},
    {p:'export.defaultFormat',    l:'Default Format',    t:'sel', opts:['json','csv']},
  ]},
  {s:'Display', fields:[
    {p:'display.colors',         l:'Colors',          t:'bool'},
    {p:'display.boxWidth',       l:'Box Width',        t:'num'},
    {p:'display.cardWidth',      l:'Card Width',       t:'num'},
    {p:'display.truncateLength', l:'Truncate Length',  t:'num'},
  ]},
  {s:'Scoring', fields:[
    {p:'scoring.highThreshold', l:'High Threshold (0–1)', t:'num'},
    {p:'scoring.midThreshold',  l:'Mid Threshold (0–1)',  t:'num'},
  ]},
  {s:'Indexing', fields:[
    {p:'indexing.enabled',      l:'Enabled',              t:'bool'},
    {p:'indexing.includeTests', l:'Include Tests',         t:'bool'},
    {p:'indexing.maxFileSize',  l:'Max File Size (bytes)', t:'num'},
    {p:'indexing.timeout',      l:'Timeout (s)',           t:'num'},
  ]},
  {s:'Tool Search', fields:[
    {p:'toolSearch.enabled',           l:'Enabled',             t:'bool'},
    {p:'toolSearch.preferMatrixIndex', l:'Prefer Matrix Index', t:'bool'},
    {p:'toolSearch.preferContext7',    l:'Prefer Context7',     t:'bool'},
    {p:'toolSearch.verbose',           l:'Verbose',             t:'bool'},
  ]},
  {s:'Delegation', fields:[
    {p:'delegation.enabled', l:'Enabled', t:'bool'},
    {p:'delegation.model',   l:'Model',   t:'sel', opts:['haiku','sonnet']},
  ]},
  {s:'Dreamer', fields:[
    {p:'dreamer.execution.defaultTimeout',         l:'Default Timeout (s)',  t:'num'},
    {p:'dreamer.execution.defaultSkipPermissions', l:'Skip Permissions',     t:'bool'},
    {p:'dreamer.worktree.defaultBranchPrefix',     l:'Branch Prefix',        t:'text'},
    {p:'dreamer.worktree.defaultRemote',           l:'Default Remote',       t:'text'},
    {p:'dreamer.worktree.defaultBasePath',         l:'Base Path (optional)', t:'text'},
  ]},
  {s:'Hooks — General', fields:[
    {p:'hooks.enabled',                 l:'Hooks Enabled',             t:'bool'},
    {p:'hooks.verbosity',               l:'Verbosity',                 t:'sel', opts:['compact','full']},
    {p:'hooks.complexityThreshold',     l:'Complexity Threshold',      t:'num'},
    {p:'hooks.enableApiCache',          l:'API Cache',                 t:'bool'},
    {p:'hooks.cacheTtlHours',           l:'Cache TTL (hours)',         t:'num'},
    {p:'hooks.auditorTimeout',          l:'Auditor Timeout (s)',       t:'num'},
    {p:'hooks.skipDeprecationWarnings', l:'Skip Deprecation Warnings', t:'bool'},
    {p:'hooks.sizeWarningThreshold',    l:'Size Warning Threshold',    t:'num'},
  ]},
  {s:'Hooks — Permissions', fields:[
    {p:'hooks.permissions.autoApproveReadOnly',    l:'Auto-Approve Read-Only',  t:'bool'},
    {p:'hooks.permissions.autoApprove.coreRead',   l:'Auto-Approve: Core Read', t:'bool'},
    {p:'hooks.permissions.autoApprove.web',        l:'Auto-Approve: Web',       t:'bool'},
    {p:'hooks.permissions.autoApprove.matrixRead', l:'Auto-Approve: Matrix',    t:'bool'},
    {p:'hooks.permissions.autoApprove.context7',   l:'Auto-Approve: Context7',  t:'bool'},
  ]},
  {s:'Hooks — Sensitive Files', fields:[
    {p:'hooks.sensitiveFiles.enabled',                   l:'Enabled',           t:'bool'},
    {p:'hooks.sensitiveFiles.behavior',                  l:'Behavior',          t:'sel', opts:['ask','warn','block','disabled']},
    {p:'hooks.sensitiveFiles.patterns.envFiles',         l:'Env Files',         t:'bool'},
    {p:'hooks.sensitiveFiles.patterns.keysAndCerts',     l:'Keys & Certs',      t:'bool'},
    {p:'hooks.sensitiveFiles.patterns.secretDirs',       l:'Secret Dirs',       t:'bool'},
    {p:'hooks.sensitiveFiles.patterns.configFiles',      l:'Config Files',      t:'bool'},
    {p:'hooks.sensitiveFiles.patterns.passwordFiles',    l:'Password Files',    t:'bool'},
    {p:'hooks.sensitiveFiles.patterns.cloudCredentials', l:'Cloud Credentials', t:'bool'},
  ]},
  {s:'Hooks — Stop Hook', fields:[
    {p:'hooks.stop.enabled',                   l:'Enabled',        t:'bool'},
    {p:'hooks.stop.suggestStore.enabled',       l:'Suggest Store',  t:'bool'},
    {p:'hooks.stop.suggestStore.minComplexity', l:'Min Complexity', t:'num'},
    {p:'hooks.stop.suggestStore.minToolUses',   l:'Min Tool Uses',  t:'num'},
    {p:'hooks.stop.suggestStore.minMessages',   l:'Min Messages',   t:'num'},
  ]},
  {s:'Hooks — Package Auditor', fields:[
    {p:'hooks.packageAuditor.enabled',             l:'Enabled',               t:'bool'},
    {p:'hooks.packageAuditor.behavior',            l:'Behavior',              t:'sel', opts:['ask','warn','block','disabled']},
    {p:'hooks.packageAuditor.blockOnCriticalCVE',  l:'Block Critical CVEs',   t:'bool'},
    {p:'hooks.packageAuditor.checks.cve',          l:'Check CVEs',            t:'bool'},
    {p:'hooks.packageAuditor.checks.deprecated',   l:'Check Deprecated',      t:'bool'},
    {p:'hooks.packageAuditor.checks.bundleSize',   l:'Check Bundle Size',     t:'bool'},
    {p:'hooks.packageAuditor.checks.localWarnings',l:'Check Local Warnings',  t:'bool'},
  ]},
  {s:'Hooks — Cursed Files', fields:[
    {p:'hooks.cursedFiles.enabled',  l:'Enabled',  t:'bool'},
    {p:'hooks.cursedFiles.behavior', l:'Behavior', t:'sel', opts:['ask','warn','block']},
  ]},
  {s:'Hooks — Prompt Analysis', fields:[
    {p:'hooks.promptAnalysis.enabled',                      l:'Enabled',          t:'bool'},
    {p:'hooks.promptAnalysis.shortcuts.enabled',            l:'Shortcuts',        t:'bool'},
    {p:'hooks.promptAnalysis.codeNavigation.enabled',       l:'Code Navigation',  t:'bool'},
    {p:'hooks.promptAnalysis.memoryInjection.enabled',      l:'Memory Injection', t:'bool'},
    {p:'hooks.promptAnalysis.memoryInjection.maxSolutions', l:'Max Solutions',    t:'num'},
    {p:'hooks.promptAnalysis.memoryInjection.maxFailures',  l:'Max Failures',     t:'num'},
    {p:'hooks.promptAnalysis.memoryInjection.minScore',     l:'Min Score (0–1)',  t:'num'},
  ]},
  {s:'Hooks — Git Commit Review', fields:[
    {p:'hooks.gitCommitReview.suggestOnCommit', l:'Suggest on Commit', t:'bool'},
    {p:'hooks.gitCommitReview.defaultMode',     l:'Default Mode',      t:'sel', opts:['default','lazy']},
    {p:'hooks.gitCommitReview.autoRun',         l:'Auto Run',          t:'bool'},
  ]},
  {s:'Hooks — User Rules', fields:[
    {p:'hooks.userRules.enabled', l:'User Rules Enabled', t:'bool'},
  ]},
];
function gv(obj,path){return path.split('.').reduce((o,k)=>o?.[k],obj)}
function sv(obj,path,val){const ps=path.split('.');let c=obj;for(let i=0;i<ps.length-1;i++){if(c[ps[i]]==null)c[ps[i]]={};c=c[ps[i]]}c[ps[ps.length-1]]=val}

async function loadConfig() {
  _cfg = await api('/api/config');
  const el = document.getElementById('cfg-sections');
  el.innerHTML = _fields.map(sec =>
    '<div class="card"><div class="card-title">'+sec.s+'</div>'+
    '<div class="cfg-grid">'+sec.fields.map(f => {
      const val = gv(_cfg, f.p);
      if (f.t==='bool') return '<div class="cfg-bool"><label for="c-'+f.p+'">'+f.l+'</label>'+
        '<input type="checkbox" id="c-'+f.p+'" '+(val?'checked':'')+'></div>';
      if (f.t==='sel') return '<div class="cfg-field"><label class="cfg-label">'+f.l+'</label>'+
        '<select id="c-'+f.p+'">'+f.opts.map(o=>'<option '+(o===val?'selected':'')+'>'+o+'</option>').join('')+'</select></div>';
      return '<div class="cfg-field"><label class="cfg-label">'+f.l+'</label>'+
        '<input type="'+(f.t==='num'?'number':'text')+'" id="c-'+f.p+'" value="'+(val??'')+'"></div>';
    }).join('')+'</div></div>'
  ).join('');
}

async function saveConfig() {
  const updated = JSON.parse(JSON.stringify(_cfg));
  for (const sec of _fields) {
    for (const f of sec.fields) {
      const el = document.getElementById('c-'+f.p);
      if (!el) continue;
      const val = f.t==='bool' ? el.checked : f.t==='num' ? Number(el.value) : el.value;
      sv(updated, f.p, val);
    }
  }
  await api('/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(updated)});
  toast('Config saved'); _cfg = updated;
}

// ── XSS escape ──────────────────────────────────────────────────────────
function esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}

// ── Boot ───────────────────────────────────────────────────────────────
window.addEventListener('unhandledrejection', e => {
  console.error('[Matrix]', e.reason);
});
loadOverview().catch(e => {
  document.getElementById('page-overview').insertAdjacentHTML('afterbegin',
    '<div style="color:#ef4444;padding:12px 16px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:12px;margin-bottom:1.5rem;font-size:0.8125rem">Failed to load stats: '+e.message+'</div>'
  );
});
</script>
</body>
</html>`;
}
