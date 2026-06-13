/**
 * Self-contained dashboard shell served at GET /dashboard.
 *
 * One HTML string, zero build step, zero npm runtime deps. The only external
 * request is an optional Google Fonts @import (Fira Code/Sans) which degrades
 * to system fonts if blocked. All live data is fetched client-side from the
 * authenticated /api/* routes using an x-api-key held in localStorage — the
 * key is never placed in the URL.
 *
 * NOTE: the client <script> below intentionally uses string concatenation and
 * avoids backticks / template-literal syntax so it can live inside this outer
 * template literal without escaping.
 */
export function renderDashboardPage(defaultKey = ''): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MCP Dev Hub — Dashboard</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@400;500;600&display=swap');
  :root {
    --bg: #0F172A; --surface: #1E293B; --muted: #272F42; --border: #475569;
    --fg: #F8FAFC; --fg-dim: #94A3B8;
    --accent: #22C55E; --danger: #EF4444; --warn: #F59E0B; --info: #38BDF8;
    --mono: 'Fira Code', ui-monospace, 'Cascadia Code', Consolas, monospace;
    --sans: 'Fira Sans', system-ui, -apple-system, Segoe UI, sans-serif;
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: var(--sans); font-size: 15px; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--info); }
  .wrap { max-width: 1440px; margin: 0 auto; padding: 16px; }
  header.bar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 14px 16px; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 16px;
  }
  header.bar h1 { font-size: 18px; margin: 0; font-family: var(--mono); font-weight: 600; }
  header.bar .spacer { flex: 1; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
    border-radius: 999px; font-size: 12px; font-family: var(--mono);
    background: var(--muted); border: 1px solid var(--border); color: var(--fg-dim);
  }
  .pill.ok { color: var(--accent); border-color: var(--accent); }
  .pill.bad { color: var(--danger); border-color: var(--danger); }
  button {
    font-family: var(--sans); font-size: 13px; cursor: pointer;
    background: var(--muted); color: var(--fg); border: 1px solid var(--border);
    border-radius: 8px; padding: 7px 12px; transition: background 160ms ease, border-color 160ms ease;
    min-height: 36px;
  }
  button:hover { background: #313B52; }
  button:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  .panel {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px; min-width: 0;
  }
  .panel h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--fg-dim); margin: 0 0 12px; display: flex; align-items: center; gap: 8px;
  }
  .panel h2 .count { margin-left: auto; font-family: var(--mono); color: var(--fg); }
  svg.ic { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; flex: none; }
  .empty { color: var(--fg-dim); font-size: 13px; padding: 12px 8px; display: flex; align-items: center; gap: 8px; }
  .empty svg { width: 15px; height: 15px; opacity: .55; }
  .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }

  /* loading skeleton (shimmer; static under reduced-motion) */
  .skel { background: linear-gradient(90deg, var(--muted) 25%, #334155 50%, var(--muted) 75%);
    background-size: 200% 100%; animation: shimmer 1.4s linear infinite; border-radius: 8px; }
  .skel-row { height: 58px; margin-bottom: 10px; }
  .skel-line { height: 38px; margin-bottom: 8px; list-style: none; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* connection-lost banner + stale clock */
  .banner button { margin-left: auto; padding: 4px 10px; min-height: 30px; font-size: 12px; }
  .pill.stale { color: var(--warn); border-color: var(--warn); }

  /* AI agent cards */
  .agents { display: grid; gap: 10px; }
  .agent {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
    padding: 10px; background: var(--muted); border: 1px solid var(--border); border-radius: 8px;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--fg-dim); position: relative; }
  .dot.online { background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: pulse 2s ease-in-out infinite; }
  .dot.stale { background: var(--warn); }
  .dot.offline { background: var(--danger); }
  .dot.unknown { background: var(--fg-dim); }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
  .agent .name { font-family: var(--mono); font-weight: 600; }
  .agent .sub { font-size: 12px; color: var(--fg-dim); }
  .presence { font-size: 11px; font-family: var(--mono); text-transform: uppercase; letter-spacing: .04em; }
  .presence.online { color: var(--accent); }
  .presence.stale { color: var(--warn); }
  .presence.offline { color: var(--danger); }
  .presence.unknown { color: var(--fg-dim); }
  .bar-track { grid-column: 1 / -1; height: 6px; background: var(--bg); border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 300ms ease; }

  /* ZERO banners */
  .banner { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
  .banner.danger { background: rgba(239,68,68,.12); border: 1px solid var(--danger); color: #FCA5A5; }
  .banner.warn { background: rgba(245,158,11,.12); border: 1px solid var(--warn); color: #FCD34D; }

  /* lists */
  ul.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  ul.list li { padding: 9px 10px; background: var(--muted); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .tag { font-family: var(--mono); font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--fg-dim); }
  .tag.blocked { color: var(--danger); border-color: var(--danger); }
  .tag.high, .tag.critical { color: var(--warn); border-color: var(--warn); }
  .muted-text { color: var(--fg-dim); }
  .ev { font-size: 12px; }
  .ev .when { font-family: var(--mono); color: var(--fg-dim); }

  /* session timeline */
  .timeline { display: flex; gap: 6px; flex-wrap: wrap; }
  .stage { flex: 1; min-width: 70px; text-align: center; padding: 8px 4px; border-radius: 8px; font-size: 12px; font-family: var(--mono); background: var(--muted); border: 1px solid var(--border); color: var(--fg-dim); }
  .stage.active { background: rgba(34,197,94,.14); border-color: var(--accent); color: var(--accent); }

  /* project → session tree (grouped by local folder) */
  .proj-section { margin-top: 16px; }
  .proj-list { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
  .proj { background: var(--muted); border: 1px solid var(--border); border-radius: 10px; padding: 12px; min-width: 0; }
  .proj-head { display: flex; align-items: center; gap: 8px; }
  .proj-head svg { width: 16px; height: 16px; stroke: var(--fg-dim); }
  .proj-name { font-family: var(--mono); font-weight: 600; font-size: 14px; }
  .proj-meta { margin-left: auto; font-size: 11px; font-family: var(--mono); color: var(--fg-dim); white-space: nowrap; }
  .proj-path { font-size: 11px; color: var(--fg-dim); font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 4px 0 10px 24px; }
  .proj-sessions { display: grid; gap: 6px; }
  .sess { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
  .sess .sid { font-family: var(--mono); font-size: 11px; color: var(--fg-dim); flex: none; }
  .sess .stitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st { font-family: var(--mono); font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--fg-dim); flex: none; }
  .st.active { color: var(--accent); border-color: var(--accent); }
  .st.retro, .st.voting, .st.closing { color: var(--warn); border-color: var(--warn); }
  .st.closed { color: var(--fg-dim); }

  /* key overlay */
  .overlay { position: fixed; inset: 0; background: rgba(2,6,23,.85); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 100; }
  .overlay.show { display: flex; }
  .modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; width: 100%; max-width: 420px; }
  .modal h2 { margin: 0 0 6px; font-size: 16px; }
  .modal p { margin: 0 0 14px; color: var(--fg-dim); font-size: 13px; }
  .modal label { display: block; font-size: 12px; color: var(--fg-dim); margin-bottom: 6px; }
  .modal input { width: 100%; padding: 10px; font-family: var(--mono); font-size: 14px; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; min-height: 44px; }
  .modal input:focus-visible { outline: 2px solid var(--info); outline-offset: 1px; }
  .modal .err { color: var(--danger); font-size: 12px; min-height: 16px; margin-top: 8px; }
  .modal .actions { margin-top: 14px; display: flex; justify-content: flex-end; }
  .modal button.primary { background: var(--accent); color: #052e16; border-color: var(--accent); font-weight: 600; }

  footer { color: var(--fg-dim); font-size: 12px; text-align: center; padding: 18px 0 4px; }

  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="bar">
      <h1>MCP Dev Hub</h1>
      <span id="serverPill" class="pill">connecting…</span>
      <span id="dbPill" class="pill">D1 ?</span>
      <span id="toolsPill" class="pill">tools ?</span>
      <div class="spacer"></div>
      <span id="updated" class="pill" aria-live="polite"><span class="num">—</span></span>
      <button id="refreshBtn" type="button" aria-label="새로고침">새로고침</button>
      <button id="autoBtn" type="button" aria-pressed="true">auto 5s: on</button>
      <button id="keyBtn" type="button">API key</button>
    </header>

    <div id="connZone"></div>
    <div id="zeroZone"></div>

    <div class="grid">
      <section class="panel" aria-labelledby="h-agents">
        <h2 id="h-agents">AI 상태 <span id="agentsCount" class="count num">0</span></h2>
        <div id="agents" class="agents"><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
      </section>

      <section class="panel" aria-labelledby="h-session">
        <h2 id="h-session">세션 라이프사이클</h2>
        <div id="sessionBox"><div class="empty">활성 세션 없음</div></div>
      </section>

      <section class="panel" aria-labelledby="h-tasks">
        <h2 id="h-tasks">활성 태스크 <span id="tasksCount" class="count num">0</span></h2>
        <ul id="tasks" class="list"><li class="skel skel-line"></li><li class="skel skel-line"></li></ul>
      </section>

      <section class="panel" aria-labelledby="h-disc">
        <h2 id="h-disc">토론 · 투표 <span id="discCount" class="count num">0</span></h2>
        <ul id="disc" class="list"><li class="skel skel-line"></li><li class="skel skel-line"></li></ul>
      </section>

      <section class="panel" aria-labelledby="h-handoff">
        <h2 id="h-handoff">대기 핸드오프 <span id="handoffCount" class="count num">0</span></h2>
        <ul id="handoffs" class="list"><li class="skel skel-line"></li><li class="skel skel-line"></li></ul>
      </section>

      <section class="panel" aria-labelledby="h-events">
        <h2 id="h-events">이벤트 피드</h2>
        <ul id="events" class="list"><li class="skel skel-line"></li><li class="skel skel-line"></li></ul>
      </section>
    </div>

    <section class="panel proj-section" aria-labelledby="h-proj">
      <h2 id="h-proj">프로젝트별 세션 <span id="projectsCount" class="count num">0</span></h2>
      <div id="projects" class="proj-list"><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
    </section>

    <footer>D1 SSOT · 5초 polling · 인증된 /api 경로에서만 데이터 fetch</footer>
  </div>

  <div id="overlay" class="overlay" role="dialog" aria-modal="true" aria-labelledby="ov-title">
    <div class="modal">
      <h2 id="ov-title">API key 입력</h2>
      <p>대시보드 데이터는 인증된 요청으로만 불러옵니다. 키는 이 브라우저(localStorage)에만 저장되며 URL에 노출되지 않습니다.</p>
      <label for="keyInput">x-api-key</label>
      <input id="keyInput" type="password" autocomplete="off" spellcheck="false" />
      <div id="keyErr" class="err" role="alert"></div>
      <div class="actions"><button id="saveKey" type="button" class="primary">저장 후 연결</button></div>
    </div>
  </div>

<script>
(function () {
  'use strict';
  var KEY_NAME = 'mcp_api_key';
  // Injected by the server only outside production (see index.ts) so a public
  // prod /dashboard never ships a secret. In dev it auto-fills the key.
  var DEFAULT_KEY = ${JSON.stringify(defaultKey)};
  var apiKey = '';
  try { apiKey = localStorage.getItem(KEY_NAME) || ''; } catch (e) { apiKey = ''; }
  if (!apiKey) { apiKey = DEFAULT_KEY; }
  var timer = null;
  var auto = true;
  var failures = 0;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ago(sec) {
    if (sec == null) return '—';
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    return Math.floor(sec / 3600) + 'h';
  }

  function showOverlay(msg) {
    el('keyErr').textContent = msg || '';
    el('overlay').classList.add('show');
    el('keyInput').focus();
  }
  function hideOverlay() { el('overlay').classList.remove('show'); }

  function setPill(node, text, cls) {
    node.textContent = text;
    node.className = 'pill' + (cls ? ' ' + cls : '');
  }
  function emptyLi(t) { return '<li class="empty">' + svg('dash') + esc(t) + '</li>'; }
  function emptyBox(t) { return '<div class="empty">' + svg('dash') + esc(t) + '</div>'; }
  function setConn(connected) {
    if (connected) {
      el('connZone').innerHTML = '';
      el('updated').classList.remove('stale');
      return;
    }
    el('connZone').innerHTML = '<div class="banner danger" role="alert">' + svg('plug')
      + '<span>서버 연결 끊김 — 5초마다 자동 재시도 중</span>'
      + '<button id="retryNow" type="button">지금 재시도</button></div>';
    var r = el('retryNow');
    if (r) { r.addEventListener('click', load); }
    el('updated').classList.add('stale');
  }

  async function load() {
    if (!apiKey) { showOverlay(''); return; }
    var headers = { 'x-api-key': apiKey };
    try {
      var sRes = await fetch('/api/mcp-status', { headers: headers });
      var dRes = await fetch('/api/dashboard', { headers: headers });
      var pRes = await fetch('/api/projects', { headers: headers });
      if (sRes.status === 401 || dRes.status === 401) {
        showOverlay('인증 실패 — 키를 확인하세요.');
        return;
      }
      if (!sRes.ok || !dRes.ok) {
        failures++;
        setPill(el('serverPill'), 'server error', 'bad');
        setConn(false);
        return;
      }
      var status = await sRes.json();
      var data = await dRes.json();
      renderStatus(status);
      renderDashboard(data);
      // Projects panel is supplementary — a failure here must not blank the dashboard.
      if (pRes.ok) { renderProjects(await pRes.json()); }
      failures = 0;
      setConn(true);
      el('updated').innerHTML = '<span class="num">갱신 ' + new Date().toLocaleTimeString() + '</span>';
    } catch (e) {
      failures++;
      setPill(el('serverPill'), 'offline', 'bad');
      setConn(false);
    }
  }

  function renderStatus(s) {
    setPill(el('serverPill'), (s.server || 'mcp') + ' v' + (s.version || '?'), s.ok ? 'ok' : 'bad');
    setPill(el('dbPill'), 'D1 ' + (s.db && s.db.connected ? 'ok' : 'down'), s.db && s.db.connected ? 'ok' : 'bad');
    setPill(el('toolsPill'), 'tools ' + (s.tool_count != null ? s.tool_count : '?'), '');

    var agents = s.agents || [];
    el('agentsCount').textContent = agents.length;
    if (!agents.length) {
      el('agents').innerHTML = emptyBox('등록된 에이전트 없음');
    } else {
      var html = '';
      for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        var p = a.presence || 'unknown';
        var prog = Math.max(0, Math.min(100, Number(a.progress) || 0));
        var task = a.task_title ? esc(a.task_title) : '<span class="muted-text">대기</span>';
        html += '<div class="agent">'
          + '<span class="dot ' + p + '" aria-hidden="true"></span>'
          + '<div><div class="name">' + esc(a.agent) + '</div>'
          + '<div class="sub">' + esc(a.status) + ' · ' + task + '</div></div>'
          + '<div style="text-align:right"><div class="presence ' + p + '">' + p + '</div>'
          + '<div class="sub num">' + ago(a.age_sec) + ' · ' + prog + '%</div></div>'
          + '<div class="bar-track"><div class="bar-fill" style="width:' + prog + '%"></div></div>'
          + '</div>';
      }
      el('agents').innerHTML = html;
    }

    var z = s.zero_flags || {};
    var zhtml = '';
    if (z.blocked_escalation) {
      zhtml += '<div class="banner danger" role="alert">'
        + svg('alert')
        + '<span><strong>ZERO-T2</strong> · blocked ' + ((s.blocked_agents || 0) + (s.blocked_tasks || 0))
        + '건 (에이전트 ' + (s.blocked_agents || 0) + ' · 태스크 ' + (s.blocked_tasks || 0)
        + ') — 자동 에스컬레이션 대상</span></div>';
    }
    if (z.handoff_pending) {
      zhtml += '<div class="banner warn" role="alert">'
        + svg('alert')
        + '<span><strong>ZERO-T1</strong> · 대기 핸드오프 ' + (s.pending_handoffs || 0) + '건 — 확인 필요</span></div>';
    }
    el('zeroZone').innerHTML = zhtml;
  }

  function renderDashboard(d) {
    // session timeline
    var stages = ['active', 'retro', 'voting', 'closed'];
    var cur = d.active_session ? d.active_session.status : null;
    var sb = '';
    if (d.active_session) {
      sb += '<div class="row" style="margin-bottom:10px"><span class="name num">' + esc(d.active_session.id || '')
        + '</span><span class="muted-text">' + esc(d.active_session.title || '') + '</span></div>';
    } else {
      sb += '<div class="empty" style="margin-bottom:10px">' + svg('dash') + '활성 세션 없음</div>';
    }
    sb += '<div class="timeline">';
    for (var i = 0; i < stages.length; i++) {
      sb += '<div class="stage' + (stages[i] === cur ? ' active' : '') + '">' + stages[i] + '</div>';
    }
    sb += '</div>';
    el('sessionBox').innerHTML = sb;

    // tasks
    var tasks = d.active_tasks || [];
    el('tasksCount').textContent = tasks.length;
    el('tasks').innerHTML = tasks.length ? tasks.map(function (t) {
      var st = String(t.status || 'open');
      var pr = String(t.priority || 'normal');
      return '<li><div class="row"><span class="tag ' + esc(st) + '">' + esc(st) + '</span>'
        + '<span class="tag ' + esc(pr) + '">' + esc(pr) + '</span>'
        + '<span>' + esc(t.title) + '</span></div>'
        + (t.assigned_to ? '<div class="sub muted-text">→ ' + esc(t.assigned_to) + '</div>' : '')
        + '</li>';
    }).join('') : emptyLi('없음');

    // discussions + votes
    var disc = (d.active_discussions || []);
    var votes = (d.pending_votes || []);
    el('discCount').textContent = disc.length + votes.length;
    var dh = disc.map(function (x) {
      return '<li><span class="tag">' + esc(x.status) + '</span> ' + esc(x.title) + '</li>';
    }).join('');
    dh += votes.map(function (v) {
      return '<li><span class="tag high">vote</span> ' + esc(v.question)
        + ' <span class="muted-text num">(' + (v.ballot_count || 0) + ')</span></li>';
    }).join('');
    el('disc').innerHTML = dh || emptyLi('없음');

    // handoffs
    var hs = d.pending_handoffs || [];
    el('handoffCount').textContent = hs.length;
    el('handoffs').innerHTML = hs.length ? hs.map(function (h) {
      return '<li><div class="row"><span class="name num">' + esc(h.from_agent) + ' → ' + esc(h.to_agent) + '</span>'
        + '<span class="tag">' + esc(h.task_id) + '</span></div>'
        + (h.summary ? '<div class="sub muted-text">' + esc(h.summary) + '</div>' : '') + '</li>';
    }).join('') : emptyLi('없음');

    // events
    var evs = d.recent_events || [];
    el('events').innerHTML = evs.length ? evs.map(function (e) {
      return '<li class="ev"><span class="tag">' + esc(e.event_type) + '</span> '
        + esc(e.agent || '') + ' <span class="when">' + esc(e.created_at || '') + '</span></li>';
    }).join('') : emptyLi('없음');
  }

  function renderProjects(p) {
    var groups = (p && p.projects) || [];
    el('projectsCount').textContent = p && p.project_count != null ? p.project_count : groups.length;
    if (!groups.length) {
      el('projects').innerHTML = emptyBox('세션 없음 — start_session 호출 시 project 인자로 로컬 폴더 경로를 전달하세요');
      return;
    }
    var html = '';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var sess = g.sessions || [];
      var rows = '';
      for (var j = 0; j < sess.length; j++) {
        var s = sess[j];
        var st = String(s.status || '');
        rows += '<div class="sess">'
          + '<span class="sid">' + esc(s.id) + '</span>'
          + '<span class="stitle">' + esc(s.title) + '</span>'
          + '<span class="tag">' + esc(s.leader) + '</span>'
          + '<span class="st ' + esc(st) + '">' + esc(st) + '</span>'
          + '</div>';
      }
      var pathLine = g.project
        ? '<div class="proj-path" title="' + esc(g.project) + '">' + esc(g.project) + '</div>'
        : '';
      html += '<div class="proj">'
        + '<div class="proj-head">' + svg('folder')
        + '<span class="proj-name">' + esc(g.name) + '</span>'
        + '<span class="proj-meta">활성 ' + (Number(g.active) || 0) + ' / 전체 ' + (Number(g.total) || 0) + '</span>'
        + '</div>'
        + pathLine
        + '<div class="proj-sessions">' + rows + '</div>'
        + '</div>';
    }
    el('projects').innerHTML = html;
  }

  function svg(name) {
    if (name === 'folder') {
      return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
    }
    if (name === 'alert') {
      return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';
    }
    if (name === 'dash') {
      return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>';
    }
    if (name === 'plug') {
      return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22v-4M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0Z"/></svg>';
    }
    return '';
  }

  function setAuto(on) {
    auto = on;
    el('autoBtn').textContent = 'auto 5s: ' + (on ? 'on' : 'off');
    el('autoBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (timer) { clearInterval(timer); timer = null; }
    // Never poll without a key — load() would re-open the overlay and wipe the
    // field the user is typing into.
    if (on && apiKey) { timer = setInterval(load, 5000); }
  }

  el('refreshBtn').addEventListener('click', load);
  el('autoBtn').addEventListener('click', function () { setAuto(!auto); });
  el('keyBtn').addEventListener('click', function () {
    el('keyInput').value = apiKey;
    showOverlay('');
  });
  el('saveKey').addEventListener('click', function () {
    var v = el('keyInput').value.trim();
    if (!v) { el('keyErr').textContent = '키를 입력하세요.'; return; }
    apiKey = v;
    try { localStorage.setItem(KEY_NAME, v); } catch (e) {}
    hideOverlay();
    setAuto(true);
    load();
  });
  el('keyInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { el('saveKey').click(); }
  });
  el('overlay').addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && apiKey) { hideOverlay(); }
  });

  if (!apiKey) {
    showOverlay('');
  } else {
    load();
    setAuto(true);
  }
})();
</script>
</body>
</html>`;
}
