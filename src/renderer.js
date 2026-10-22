// FILE: renderer.js
// PURPOSE: Panel grid (spawn/resize/maximize, per-panel project folder). Each panel is
//          directly typable (K4's "single shared input bar" was tried and dropped —
//          user found it redundant once panels are independently focusable, same as
//          any normal terminal multiplexer). title-bar menu wiring ("Agents" menu
//          starts new panels on demand).
// STATUS: MVP (26 Aug 2026). term.onData() forwards keystrokes straight to that panel's
//         PTY (xterm's own encoding — no more hand-rolled key-to-escape-sequence code).
//         Ctrl+1..8 (panel switch) and PageUp/PageDown/Ctrl+Home/Ctrl+End (scrollback)
//         are intercepted per-panel via attachCustomKeyEventHandler before they'd
//         otherwise be sent to the shell.

// ---------------- i18n ----------------
// tr/en is picked based on the system locale (Windows or Linux, doesn't matter —
// Chromium's navigator.language reads it from the OS). Only two languages for now;
// when adding a new string, add it to BOTH blocks, otherwise it shows "undefined" in
// that language.
const STRINGS = {
  tr: {
    menuFile: 'Dosya', menuAgents: 'Ajanlar', menuView: 'Görünüm',
    loading: 'Yükleniyor…',
    defaultLocationSet: 'Varsayılan Konum…',
    defaultLocationLabel: (name) => `Varsayılan Konum: ${name}`,
    addProject: 'Proje Ekle…',
    roomAgents: 'Agent Room ajanları',
    roomAgentsNoProject: 'Önce proje aç',
    roomActive: 'Aktif ajanlar',
    roomChipOn: 'Aktif — tıkla, pasif yap',
    roomChipOff: 'Pasif — tıkla, aktif yap',
    roomExpand: 'Genişlet',
    roomCollapse: 'Daralt',
    closeProject: 'Projeyi Kapat',
    toggleDock: 'Limit Paneli',
    toggleTaskDock: 'Görev Paneli',
    shortcutBar: 'Kısayol Çubuğu',
    justOpenProject: 'Sadece aç',
    panelColorsLabel: 'Panel Renkleri (ajan başına)',
    projectNone: 'Proje: (seçilmedi)',
    projectLabel: (name) => `Proje: ${name}`,
    dockTitle: 'Kota Takibi',
    dockHint: 'Claude gerçek limit verisi gösterir; diğerleri yerel token sayımıdır.',
    emptyHint: 'Üstteki "Ajanlar" menüsünden bir ajan başlatın.',
    startAgent: (label) => `${label} başlat`,
    sessionNew: 'Yeni Oturum',
    sessionContinue: 'Son Oturuma Devam Et',
    sessionResume: 'Oturum Seç…',
    colorBtnTitle: 'Panel rengini değiştir',
    folderBtnTitle: 'Bu pencere için proje klasörünü değiştir',
    closeBtnTitle: 'Paneli kapat',
    winMinimize: 'Küçült', winMaximize: 'Büyüt/Geri Al', winClose: 'Kapat',
    browseFolder: 'Klasör Seç (Gözat)…',
    noProject: 'Projesiz',
    projectChanged: (dir) => `[proje değiştirildi: ${dir} — kabuk yeniden başlatılıyor]`,
    projectRemoved: '[proje kaldırıldı — kabuk yeniden başlatılıyor]',
    processExited: (code) => `[process exited: ${code}]`,
    colors: { green: 'Yeşil', orange: 'Turuncu', yellow: 'Sarı', red: 'Kırmızı', turquoise: 'Turkuaz', purple: 'Mor', pink: 'Pembe', white: 'Beyaz', gray: 'Gri' },
    quotaNoData: 'yerel veri yok',
    quotaMeta: (shortNum, messages) => `${shortNum} token · ${messages} mesaj (son 5s)`,
    quotaBand5h: '5 saat',
    quotaBandWeek: 'Haftalık',
    quotaResets: (clock) => `sıfırlanır ${clock}`,
    quotaFull: 'DOLDU',
    quotaStale: 'veri eski',
    quotaSpend: (used, limit) => `ek kredi $${used}/$${limit}`,
    quotaNoLimitData: 'limit verisi yok — Claude Code en az bir kez çalışmalı',
    copyBtn: 'Kopyala', pasteBtn: 'Yapıştır', selectAllBtn: 'Tümünü Seç',
    shortcutHintText: 'PageUp/PageDown kaydır · Ctrl+1–8 panel değiştir',
    layoutLabel: 'Yerleşim',
    viewGrid: 'Izgara', viewCanvas: 'Tuval', viewBoard: 'Pano',
    resetCanvas: 'Tuval Görünümünü Sıfırla',
    restoreOnStart: 'Açılışta Oturumu Geri Yükle',
    statusIdle: 'boşta', statusRunning: 'çalışıyor', statusAttention: 'seni bekliyor', statusExited: 'kapandı',
    boardIdle: 'Boşta', boardRunning: 'Çalışıyor', boardAttention: 'Seni Bekliyor', boardExited: 'Kapandı',
    boardEmpty: '—',
    notifyAttentionTitle: 'multicli — ajan seni bekliyor',
    notifyAttentionBody: (label) => `${label} bir yanıt bekliyor.`,
    restoredHistory: '[önceki oturumun geçmişi — canlı değil]',
    restoringSession: '[oturum geri yükleniyor…]',
    sessionTokens: (full, messages) => `Bu oturum: ${full} token · ${messages} mesaj`,
    remoteAccessStart: 'Uzaktan Erişimi Başlat…',
    remoteAccessStop: 'Uzaktan Erişimi Durdur',
    remoteAccessUnavailable: 'Uzaktan erişim, uzak bir görüntüleyiciden başlatılamaz.',
    remoteAccessStarted: (url) => `Uzaktan erişim başlatıldı ve tarayıcıda açıldı:\n${url}\n\n(Bağlantı panoya kopyalandı.)`,
    remoteAccessFailed: (msg) => `Uzaktan erişim başlatılamadı:\n${msg}`,
    taskDockTitle: 'Görevler',
    taskDockHintEmpty: 'Henüz görev yok.',
    newTaskBtn: '+ Yeni Görev',
    newTaskTitlePrompt: 'Görev adı:',
    addPhaseAgent: (label) => `Faz olarak ekle: ${label}`,
    donePhases: 'Fazları eklemeyi bitir',
    taskStatusPending: 'bekliyor',
    taskStatusActive: 'aktif',
    taskStatusDone: 'tamam',
    startPhaseBtn: 'Başlat',
    advancePhaseBtn: 'İlerlet',
    taskHandoffPrompt: (file) => `Devam etmeden önce şu dosyayı oku (önceki fazın çıktısı): ${file}`,
    okBtn: 'Tamam', cancelBtn: 'Vazgeç',
    phaseLabelPrompt: 'Fazın amacı (örn. Plan, İnceleme, Kod):',
    confirmDeleteTask: (title) => `"${title}" görevi silinsin mi? Fazların çıktıları kaybolur.`,
    removeTaskTitle: 'Görevi sil',
    advanceNoSession: 'Bu fazın oturumu henüz belirlenemedi. Panel açıldıktan birkaç saniye sonra tekrar dene.',
  },
  en: {
    menuFile: 'File', menuAgents: 'Agents', menuView: 'View',
    loading: 'Loading…',
    defaultLocationSet: 'Default Location…',
    defaultLocationLabel: (name) => `Default Location: ${name}`,
    addProject: 'Add Project…',
    roomAgents: 'Agent Room agents',
    roomAgentsNoProject: 'Open a project first',
    roomActive: 'Active agents',
    roomChipOn: 'Active — click to turn off',
    roomChipOff: 'Inactive — click to turn on',
    roomExpand: 'Expand',
    roomCollapse: 'Collapse',
    closeProject: 'Close Project',
    toggleDock: 'Limit Panel',
    toggleTaskDock: 'Task Panel',
    shortcutBar: 'Shortcut Bar',
    justOpenProject: 'Just open it',
    panelColorsLabel: 'Panel Colors (per agent)',
    projectNone: 'Project: (none)',
    projectLabel: (name) => `Project: ${name}`,
    dockTitle: 'Quota Tracking',
    dockHint: 'Claude shows real limit data; the others are local token counts.',
    emptyHint: 'Start an agent from the "Agents" menu above.',
    startAgent: (label) => `Start ${label}`,
    sessionNew: 'New Session',
    sessionContinue: 'Continue Last Session',
    sessionResume: 'Choose Session…',
    colorBtnTitle: 'Change panel color',
    folderBtnTitle: 'Change the project folder for this panel',
    closeBtnTitle: 'Close panel',
    winMinimize: 'Minimize', winMaximize: 'Maximize/Restore', winClose: 'Close',
    browseFolder: 'Browse for Folder…',
    noProject: 'No Project',
    projectChanged: (dir) => `[project changed: ${dir} — restarting shell]`,
    projectRemoved: '[project cleared — restarting shell]',
    processExited: (code) => `[process exited: ${code}]`,
    colors: { green: 'Green', orange: 'Orange', yellow: 'Yellow', red: 'Red', turquoise: 'Turquoise', purple: 'Purple', pink: 'Pink', white: 'White', gray: 'Gray' },
    quotaNoData: 'no local data',
    quotaMeta: (shortNum, messages) => `${shortNum} tokens · ${messages} msgs (last 5h)`,
    quotaBand5h: '5h',
    quotaBandWeek: 'Weekly',
    quotaResets: (clock) => `resets ${clock}`,
    quotaFull: 'FULL',
    quotaStale: 'stale',
    quotaSpend: (used, limit) => `extra credit $${used}/$${limit}`,
    quotaNoLimitData: 'no limit data — Claude Code must have run at least once',
    copyBtn: 'Copy', pasteBtn: 'Paste', selectAllBtn: 'Select All',
    shortcutHintText: 'PageUp/PageDown scroll · Ctrl+1–8 switch panel',
    layoutLabel: 'Layout',
    viewGrid: 'Grid', viewCanvas: 'Canvas', viewBoard: 'Board',
    resetCanvas: 'Reset Canvas View',
    restoreOnStart: 'Restore Session on Start',
    statusIdle: 'idle', statusRunning: 'running', statusAttention: 'needs you', statusExited: 'exited',
    boardIdle: 'Idle', boardRunning: 'Running', boardAttention: 'Needs You', boardExited: 'Exited',
    boardEmpty: '—',
    notifyAttentionTitle: 'multicli — an agent needs you',
    notifyAttentionBody: (label) => `${label} is waiting for a reply.`,
    restoredHistory: '[history from the previous session — not live]',
    restoringSession: '[restoring session…]',
    sessionTokens: (full, messages) => `This session: ${full} tokens · ${messages} msgs`,
    remoteAccessStart: 'Start Remote Access…',
    remoteAccessStop: 'Stop Remote Access',
    remoteAccessUnavailable: 'Remote access can’t be started from a remote viewer.',
    remoteAccessStarted: (url) => `Remote access started and opened in your browser:\n${url}\n\n(Link copied to clipboard.)`,
    remoteAccessFailed: (msg) => `Couldn’t start remote access:\n${msg}`,
    taskDockTitle: 'Tasks',
    taskDockHintEmpty: 'No tasks yet.',
    newTaskBtn: '+ New Task',
    newTaskTitlePrompt: 'Task name:',
    addPhaseAgent: (label) => `Add as phase: ${label}`,
    donePhases: 'Done adding phases',
    taskStatusPending: 'pending',
    taskStatusActive: 'active',
    taskStatusDone: 'done',
    startPhaseBtn: 'Start',
    advancePhaseBtn: 'Advance',
    taskHandoffPrompt: (file) => `Read this file for the previous phase's output before continuing: ${file}`,
    okBtn: 'OK', cancelBtn: 'Cancel',
    phaseLabelPrompt: 'Phase purpose (e.g. Plan, Review, Code):',
    confirmDeleteTask: (title) => `Delete task "${title}"? Its phase output will be lost.`,
    removeTaskTitle: 'Delete task',
    advanceNoSession: "This phase's session hasn't been identified yet. Wait a few seconds after the panel opens and try again.",
  },
};
const LOCALE = (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
const t = STRINGS[LOCALE];
document.documentElement.lang = LOCALE;

function applyStaticI18n() {
  document.getElementById('menu-file-btn').textContent = t.menuFile;
  document.getElementById('menu-agents-btn').textContent = t.menuAgents;
  document.getElementById('menu-view-btn').textContent = t.menuView;
  document.getElementById('agents-loading-item').textContent = t.loading;
  document.getElementById('add-project-item').textContent = t.addProject;
  document.getElementById('close-project-item').textContent = t.closeProject;
  document.querySelector('#toggle-dock-item .name').textContent = t.toggleDock;
  document.querySelector('#toggle-task-dock-item .name').textContent = t.toggleTaskDock;
  document.getElementById('panel-colors-label').textContent = t.panelColorsLabel;
  document.getElementById('layout-label').textContent = t.layoutLabel;
  document.querySelector('#view-grid-item .name').textContent = t.viewGrid;
  document.querySelector('#view-canvas-item .name').textContent = t.viewCanvas;
  document.querySelector('#view-board-item .name').textContent = t.viewBoard;
  document.getElementById('reset-canvas-item').textContent = t.resetCanvas;
  document.querySelector('#toggle-restore-item .name').textContent = t.restoreOnStart;
  document.querySelector('#toggle-shortcut-bar-item .name').textContent = t.shortcutBar;
  document.getElementById('remote-access-item').textContent = t.remoteAccessStart;
  document.getElementById('dock-title').textContent = t.dockTitle;
  document.getElementById('dock-hint').textContent = t.dockHint;
  document.getElementById('task-dock-title').textContent = t.taskDockTitle;
  document.getElementById('task-dock-hint').textContent = t.taskDockHintEmpty;
  document.getElementById('task-new-btn').textContent = t.newTaskBtn;
  document.querySelector('#shortcut-copy-btn .btn-label').textContent = t.copyBtn;
  document.querySelector('#shortcut-paste-btn .btn-label').textContent = t.pasteBtn;
  document.querySelector('#shortcut-selectall-btn .btn-label').textContent = t.selectAllBtn;
  document.getElementById('shortcut-hint-text').textContent = t.shortcutHintText;
  document.querySelector('[data-action="minimize"]').title = t.winMinimize;
  document.querySelector('[data-action="maximize"]').title = t.winMaximize;
  document.querySelector('[data-action="close"]').title = t.winClose;
}

const panelGrid = document.getElementById('panel-grid');
const projectLabel = document.getElementById('project-label');
const limitDock = document.getElementById('limit-dock');
const taskDock = document.getElementById('task-dock');
const taskListEl = document.getElementById('task-list');
const taskDockHint = document.getElementById('task-dock-hint');
const agentsMenu = document.getElementById('agents-menu');
const savedProjectsList = document.getElementById('saved-projects-list');

/** @type {Map<string, {term:any, fit:any, el:HTMLElement, body:HTMLElement, label:string, agent:object, projectDir:string|null}>} */
const panels = new Map();
let activePanelId = null;
let openProject = null; // { name, path } | null — the project "opened" from the File menu, the default cwd for new panels
let savedProjects = []; // [{ name, path }] — the list of saved locations in the File menu
let availableAgents = [];
let bodyObservers = new Map(); // panelId -> ResizeObserver
let panelSeq = 0;

// Collision-resistant across independent JS contexts (K22): a plain `${agent.id}-${++panelSeq}`
// restarts from 0 in every page load, so the local Electron window and a remote browser
// tab could each mint the identical id for their first Claude panel — and main.js's
// pty:spawn kills+replaces whatever already holds an id, so a remote page load could
// silently kill a live local session sharing that id. Same recipe as newPanelKey() below.
function mintPanelId(agentId) {
  return `${agentId}-${++panelSeq}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------- View mode / canvas state (K15) ----------------
// 'grid'   — the original split-pane grid (unchanged, still the default)
// 'canvas' — infinite pan/zoom surface, panels are freely placed nodes
// 'board'  — kanban-style triage columns grouped by agent status
let viewMode = 'grid';
let maximizedId = null; // set by toggleMaximize(); renders alone in a `.view-max` host
let restoreOnStart = true;
let showShortcutBar = true; // bottom copy/paste row — kept, but optional (View menu)
let showLimitDock = true;   // right-hand quota dock — same deal
let showTaskDock = true;    // right-hand task dock (Phase 1, K26) — same deal again
let tasks = [];              // Task[] — loaded from main.js at boot, see init()
const canvasView = { x: 40, y: 40, z: 1 }; // pan offset + zoom of #canvas-world
const CANVAS_MIN_Z = 0.25;
const CANVAS_MAX_Z = 1.6;
// Below this zoom the terminal bodies stop accepting mouse input — see the
// `.zoomed-out` rule in styles.css for why.
const CANVAS_INTERACTIVE_Z = 0.85;
const CANVAS_DEFAULT_W = 560;
const CANVAS_DEFAULT_H = 380;

// View > Active Panel Color — glow palette (name -> hex). "green" is the default.
const GLOW_PALETTE = {
  green: '#39ff88',
  orange: '#ff9f40',
  yellow: '#ffe066',
  red: '#ff5f5f',
  turquoise: '#2dd4bf',
  purple: '#a78bfa',
  pink: '#f472b6',
  white: '#f5f5f5',
  gray: '#9ca3af',
};

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Per-agent color assignment. Falls back to green for an unknown agent.
const DEFAULT_AGENT_COLORS = { claude: 'orange', gemini: 'turquoise', qwen: 'purple', codex: 'green', opencode: 'pink' };
let agentColors = {}; // { agentId: colorKey } — loaded from settings, overrides DEFAULT_AGENT_COLORS

function colorKeyForAgent(agentId) {
  return agentColors[agentId] || DEFAULT_AGENT_COLORS[agentId] || 'green';
}

// Applies the color to a single panel (its own DOM element, not globally) — this is
// how Claude-orange and Qwen-purple can sit side by side at the same time.
function applyPanelGlow(el, agentId) {
  const hex = GLOW_PALETTE[colorKeyForAgent(agentId)] || GLOW_PALETTE.green;
  el.style.setProperty('--glow', hex);
  el.style.setProperty('--glow-dim', hexToRgba(hex, 0.35));
  const btn = el.querySelector('.color-btn');
  if (btn) btn.style.background = hex;
}

function repaintOpenPanelsForAgent(agentId) {
  for (const p of panels.values()) {
    if (p.agent.id === agentId) applyPanelGlow(p.el, agentId);
  }
}

function showColorPicker(anchorEl, currentKey, onPick) {
  document.querySelectorAll('.project-picker').forEach((el) => el.remove());
  const picker = document.createElement('div');
  picker.className = 'project-picker';
  const rect = anchorEl.getBoundingClientRect();
  picker.style.top = `${rect.bottom + 4}px`;
  picker.style.left = `${Math.min(rect.left, window.innerWidth - 200)}px`;

  Object.keys(GLOW_PALETTE).forEach((key) => {
    const row = document.createElement('div');
    row.className = 'color-row';
    row.innerHTML = `<span class="check">${key === currentKey ? '✓' : ''}</span>` +
      `<span class="swatch" style="background:${GLOW_PALETTE[key]}"></span>` +
      `<span>${t.colors[key]}</span>`;
    row.addEventListener('click', () => {
      picker.remove();
      onPick(key);
    });
    picker.appendChild(row);
  });

  document.body.appendChild(picker);
  setTimeout(() => {
    window.addEventListener('click', function closeOnce() {
      picker.remove();
      window.removeEventListener('click', closeOnce);
    }, { once: true });
  }, 0);
}

// ---------------- Quota/usage (PROJECT.md §3.5 — real local data, not a percentage) ----------------

function formatTokenCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// An arbitrary visual scale — not a real plan cap, just a reference point so the dock's
// bar looks filled. Computing a real "% remaining" would require knowing the plan cap,
// which can't be obtained from local file scanning (see the comments in main.js).
const QUOTA_VISUAL_CAP = 1000000;

// Thresholds for the limit bars. Deliberately pessimistic at the top end: the point of
// the dock is to warn you before a run dies mid-task, not to be pretty at 95%.
function quotaColor(pct, locked) {
  if (locked || pct >= 100) return '#ff4d4d';
  if (pct >= 80) return '#ff8a3d';
  if (pct >= 50) return '#ffd23d';
  return '#39ff88';
}

function formatResetClock(ms) {
  const d = new Date(ms);
  const clock = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // The weekly band usually resets on another day, so name it; the 5-hour one rarely does.
  return d.toDateString() === new Date().toDateString()
    ? clock
    : `${d.toLocaleDateString([], { weekday: 'short' })} ${clock}`;
}

// Claude is the one agent where we have a real, server-issued percentage (main.js
// readClaudeUtilization) instead of a token count against an invented cap, so it gets
// its own renderer: two true bars (5-hour and weekly) rather than one meaningless one.
// `activity` is still shown, but as a footnote — it no longer drives any bar.
function renderClaudeQuota(limits, activity) {
  const card = document.querySelector('.dock-card[data-agent="claude"]');
  const mini = document.querySelector('.mini-limit[data-agent="claude"]');
  const miniDot = mini?.querySelector('.dot');
  const miniVal = mini?.querySelector('b');
  const dockDot = card?.querySelector('.dock-card-head .dot');

  for (const [key, label] of [['fiveHour', t.quotaBand5h], ['sevenDay', t.quotaBandWeek]]) {
    const wrap = card?.querySelector(`.dock-limit[data-band="${key}"]`);
    if (!wrap) continue;
    const band = limits?.[key] || null;
    const fill = wrap.querySelector('.dock-bar-fill');
    const pctEl = wrap.querySelector('.band-pct');
    wrap.querySelector('.band-name').textContent = label;
    wrap.querySelector('.band-reset').textContent =
      band?.resetsAt ? t.quotaResets(formatResetClock(band.resetsAt)) : '';
    if (band) {
      const color = quotaColor(band.pct, band.locked);
      fill.style.width = `${Math.min(100, band.pct)}%`;
      fill.style.background = color;
      pctEl.textContent = band.locked ? t.quotaFull : `${Math.round(band.pct)}%`;
      pctEl.style.color = color;
    } else {
      fill.style.width = '0%';
      fill.style.background = '';
      pctEl.textContent = '—';
      pctEl.style.color = '';
    }
  }
  card?.classList.toggle('is-stale', !!limits?.stale);

  const locked = !!(limits?.fiveHour?.locked || limits?.sevenDay?.locked);
  // Whichever band is closest to biting is the one worth a colour and the one number the
  // title bar has room for — the weekly limit stops us at least as often as the 5-hour one.
  const worst = Math.max(limits?.fiveHour?.pct ?? 0, limits?.sevenDay?.pct ?? 0);
  const dotColor = limits ? quotaColor(worst, locked) : (activity ? '#39ff88' : '#4a4f5c');
  if (miniDot) miniDot.style.background = dotColor;
  if (dockDot) dockDot.style.background = dotColor;
  if (miniVal) {
    miniVal.textContent = limits
      ? (locked ? t.quotaFull : `${Math.round(worst)}%`)
      : (activity ? formatTokenCount(activity.tokens) : '—');
    miniVal.style.color = limits ? dotColor : '';
  }
  if (mini) {
    mini.title = limits
      ? [['fiveHour', t.quotaBand5h], ['sevenDay', t.quotaBandWeek]]
        .map(([k, label]) => {
          const b = limits[k];
          if (!b) return `${label}: —`;
          const reset = b.resetsAt ? ` (${t.quotaResets(formatResetClock(b.resetsAt))})` : '';
          return `${label}: ${b.locked ? t.quotaFull : `${Math.round(b.pct)}%`}${reset}`;
        }).join('\n')
      : '';
  }

  const meta = card?.querySelector('.dock-meta');
  if (meta) {
    const parts = [];
    if (!limits) parts.push(t.quotaNoLimitData);
    if (activity) parts.push(t.quotaMeta(formatTokenCount(activity.tokens), activity.messages));
    if (limits?.spend?.limit) parts.push(t.quotaSpend(limits.spend.used, limits.spend.limit));
    if (limits?.stale) parts.push(t.quotaStale);
    meta.textContent = parts.length ? parts.join(' · ') : t.quotaNoData;
  }
}

async function refreshQuotas() {
  let data;
  try { data = await window.multicli.quotas.get(); } catch { return; }
  if (!data) return;
  renderClaudeQuota(data.claudeLimits, data.claude);
  // The rest still have no server-side figure to read, so they keep the token count and
  // the arbitrary visual cap — honest as "activity", not claimed to be a limit.
  for (const agentId of ['gemini', 'qwen', 'codex', 'opencode']) {
    const usage = data[agentId];
    const miniDot = document.querySelector(`.mini-limit[data-agent="${agentId}"] .dot`);
    const miniVal = document.querySelector(`.mini-limit[data-agent="${agentId}"] b`);
    const dockDot = document.querySelector(`.dock-card[data-agent="${agentId}"] .dock-card-head .dot`);
    const dockFill = document.querySelector(`.dock-card[data-agent="${agentId}"] .dock-bar-fill`);
    const dockMeta = document.querySelector(`.dock-card[data-agent="${agentId}"] .dock-meta`);
    const hasData = !!usage;
    const dotColor = hasData ? '#39ff88' : '#4a4f5c';
    if (miniDot) miniDot.style.background = dotColor;
    if (dockDot) dockDot.style.background = dotColor;
    if (hasData) {
      const shortNum = formatTokenCount(usage.tokens);
      if (miniVal) miniVal.textContent = shortNum;
      if (dockFill) dockFill.style.width = `${Math.min(100, (usage.tokens / QUOTA_VISUAL_CAP) * 100)}%`;
      if (dockMeta) dockMeta.textContent = t.quotaMeta(shortNum, usage.messages);
    } else {
      if (miniVal) miniVal.textContent = '—';
      if (dockFill) dockFill.style.width = '0%';
      if (dockMeta) dockMeta.textContent = t.quotaNoData;
    }
  }
}

// The dock above answers "how much have I burned in the last 5 hours, everywhere".
// This answers "how much has THIS panel burned", read from the session transcript that
// belongs to the panel's working directory (K19). Panels whose agent writes no readable
// transcript, or that haven't produced one yet, just show nothing rather than a "0" that
// would look like a real measurement.
// Ties a panel to the specific transcript file its CLI is writing. Retried rather than
// done once, because the file often doesn't exist until the first exchange.
// `allowReclaim` is only set during the short window right after spawn: a restored panel
// carries an id that `claude -r` may have forked away from, and this is when that would
// have happened. Outside that window a held id is left alone, so an unrelated session
// starting in the same folder can never be adopted by an idle panel.
async function claimPanelSession(id, { allowReclaim = false } = {}) {
  const p = panels.get(id);
  if (!p || !p.cwd || !p.spawnedAt) return;
  if (p.sessionId && !allowReclaim) return;
  // Exclude self: the whole point of passing `current` is to be told to keep it.
  const taken = [...panels.values()]
    .filter((o) => o !== p)
    .map((o) => o.sessionId)
    .filter(Boolean);
  let claimed;
  try {
    claimed = await window.multicli.session.claim(
      p.agent.id, p.cwd, p.spawnedAt, taken, p.sessionId || null,
    );
  } catch { return; }
  if (!claimed || claimed === p.sessionId) return;
  p.sessionId = claimed;
  syncPhaseFromPanel(p); // a task phase bound to this panel needs the id too, see below
  // Provenance, recorded only when the id actually changes: which panel start this claim
  // was judged against. A restored panel that keeps its id keeps the *original* run's
  // number, because that's what the transcript's creation time has to be compared to —
  // overwriting it with the current spawn would erase the only evidence session:verify has.
  p.sessionSince = p.spawnedAt;
  announcePanel(id); // keep the live registry's copy of sessionId current for later attachers (K22)
  saveWorkspaceSoon(); // the id is what makes the next restore land on the right session
}

// Tells main.js's live-panel registry what this panel currently looks like, so a viewer
// attaching later (a remote tab, or the host itself after a devtools reload) can
// recreate the same DOM/xterm without spawning a duplicate pty (K22). Fire-and-forget,
// called after anything that changes a panel's identity: spawn, project reassignment,
// session claim.
function announcePanel(id) {
  const p = panels.get(id);
  if (!p) return;
  window.multicli.panels.announce({
    id, agentId: p.agent.id, projectDir: p.projectDir, key: p.key,
    cwd: p.cwd, sessionId: p.sessionId, sessionSince: p.sessionSince ?? null, geom: p.geom,
  });
}

async function refreshPanelTokens(id) {
  const p = panels.get(id);
  if (!p || !p.cwd) return;
  const badge = p.el.querySelector('.token-badge');
  if (!badge) return;
  if (!p.sessionId) await claimPanelSession(id);
  let usage;
  try { usage = await window.multicli.quotas.getSession(p.agent.id, p.cwd, p.sessionId); }
  catch { return; }
  if (!usage || !usage.tokens) {
    badge.textContent = '';
    badge.removeAttribute('title');
    return;
  }
  badge.textContent = formatTokenCount(usage.tokens);
  badge.title = t.sessionTokens(usage.tokens.toLocaleString(LOCALE === 'tr' ? 'tr-TR' : 'en-US'), usage.messages);
}

function refreshAllPanelTokens() {
  for (const id of panels.keys()) refreshPanelTokens(id);
}

function buildAgentColorMenu(agents) {
  const list = document.getElementById('agent-color-list');
  list.innerHTML = '';
  agents.forEach((agent) => {
    const row = document.createElement('div');
    row.className = 'color-row';
    const key = colorKeyForAgent(agent.id);
    row.innerHTML = `<span class="swatch" style="background:${GLOW_PALETTE[key]}"></span>` +
      `<span style="flex:1">${agent.label}</span>` +
      `<span style="opacity:.6;font-size:11px">${t.colors[key]}</span>`;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      showColorPicker(row, key, async (newKey) => {
        agentColors[agent.id] = newKey;
        await window.multicli.settings.setAgentColor(agent.id, newKey);
        repaintOpenPanelsForAgent(agent.id);
        buildAgentColorMenu(agents);
      });
    });
    list.appendChild(row);
  });
}

function projectBaseName(dir) {
  if (!dir) return null;
  const norm = dir.replace(/[\\/]+$/, '');
  const parts = norm.split(/[\\/]/);
  return parts[parts.length - 1] || norm;
}

function labelFor(agent, dir) {
  // Always show a project name at the panel's top, even when none is assigned,
  // so it's never ambiguous which folder a given CLI window is running in.
  return `${dir ? projectBaseName(dir) : t.noProject} - ${agent.label}`;
}

// Once an agent is actually running in a "Projesiz" (no project folder) panel, the
// header is otherwise stuck on a generic placeholder with no clue which conversation
// is which. Watch the user's own keystrokes (never the auto-injected launch command —
// see captureTitle) and use the first line they submit as a stand-in session title,
// same convention chat UIs use (title = first message). One-shot: whether or not the
// first line produces a usable title, stop watching so later input can't retitle it.
function feedTitleCandidate(id, data) {
  const p = panels.get(id);
  if (!p || !p.captureTitle || p.titleFromInput || p.projectDir) return;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    if (ch === '\r' || ch === '\n') {
      const line = p.inputLineBuf.trim();
      p.inputLineBuf = '';
      p.titleFromInput = true;
      if (line) {
        const excerpt = line.length > 40 ? `${line.slice(0, 40)}…` : line;
        p.label = `${excerpt} - ${p.agent.label}`;
        const titleEl = p.el.querySelector('.panel-title');
        titleEl.textContent = p.label;
        titleEl.title = line;
      }
      return;
    }
    if (ch === '\x7f' || ch === '\b') { p.inputLineBuf = p.inputLineBuf.slice(0, -1); continue; }
    // Bail out (don't retitle at all) rather than risk garbage from an arrow-key/
    // escape sequence leaking into the title — safe default, same as today's behavior.
    if (ch === '\x1b') { p.titleFromInput = true; p.inputLineBuf = ''; return; }
    if (ch.charCodeAt(0) >= 0x20) p.inputLineBuf += ch;
  }
}

// Agent CLIs announce what they're working on through the OSC terminal-title sequence,
// which xterm surfaces as onTitleChange. That's far more reliable than guessing from
// typed input — and it's the only thing that works for `claude -r`, where the session is
// picked from a TUI list instead of typed, so feedTitleCandidate() never sees a line and
// the panel just kept saying "Projesiz" (user-reported, 29 Aug 2026).
function applyTerminalTitle(id, rawTitle) {
  const p = panels.get(id);
  // captureTitle only flips on once the launch command has been sent, so the shell's
  // own startup title never wins.
  if (!p || !p.captureTitle) return;
  const title = (rawTitle || '').trim();
  if (!title) return;
  // When the agent exits, the shell retitles itself to the cwd — a path is not a
  // session name, so leave the last real title in place.
  if (/^[A-Za-z]:[\\/]/.test(title) || title.startsWith('/')) return;

  p.titleFromInput = true; // a title straight from the CLI beats the typed-line fallback
  p.label = `${title} - ${p.agent.label}`;
  const titleEl = p.el.querySelector('.panel-title');
  titleEl.textContent = p.label;
  titleEl.title = title;
}

// Arrange N panels into a roughly square row/column grid so panels are resizable
// both horizontally AND vertically (a single row only allows left/right resize).
function layoutIds(ids) {
  const n = ids.length;
  const rows = Math.max(1, Math.round(Math.sqrt(n)));
  const perRow = Math.ceil(n / rows);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const slice = ids.slice(r * perRow, (r + 1) * perRow);
    if (slice.length) grid.push(slice);
  }
  return grid;
}

// ---------------- Agent status (K17) ----------------
// nodeterm drives its RUNNING / NEEDS-YOU badges from Claude Code's hook system, which
// would mean writing into the user's global ~/.claude/settings.json and would only ever
// cover one of our five agents. We infer the same thing from the pty stream instead:
// costs nothing, touches no config outside this app, works for every CLI.
//
// The model is deliberately dumb:
//   running   — output arrived within the last SETTLE_MS
//   attention — output stopped AND the tail looks like a question awaiting an answer
//   idle      — output stopped and it doesn't
//   exited    — the pty is gone
const SETTLE_MS = 900;

// Matched against the last few non-empty lines once output has settled. Kept
// deliberately conservative: a bare `>` or `$` is a *shell* prompt (i.e. idle), so
// those are NOT in here — only markers that specifically mean "something asked you".
// A false "needs you" is much more annoying than a missed one, since it fires an OS
// notification.
const ATTENTION_PATTERNS = [
  /\((y|yes)\/(n|no)\)/i,
  /\[(y|yes)\/(n|no)\]/i,
  /\by\/n\b/i,
  /press\s+(enter|any key)/i,
  /^\s*❯\s*\d?\s*\S/m,          // arrow-marked choice in a selection menu (Claude Code)
  /^\s*[►▶]\s+\S/m,
  /\bdo you want\b/i,
  /\bwould you like\b/i,
  /\bselect an option\b/i,
  /\bwaiting for (your )?(input|approval|confirmation)\b/i,
  /\b(devam etmek istiyor musunuz|onaylıyor musunuz)\b/i,
];

// Ctrl+Shift+1/2/3 → grid / canvas / board. Matched on e.code, since Shift turns the
// digit keys into '!' '"' '^' etc. and e.key would be layout-dependent (this machine
// is on a Turkish Q layout). Returns true when it handled the event, so both the
// window-level listener and xterm's per-panel handler can share one implementation.
function handleViewShortcut(e) {
  if (!e.ctrlKey || !e.shiftKey || !/^Digit[1-3]$/.test(e.code)) return false;
  setViewMode(['grid', 'canvas', 'board'][Number(e.code.slice(5)) - 1]);
  return true;
}

function statusLabel(status) {
  if (status === 'running') return t.statusRunning;
  if (status === 'attention') return t.statusAttention;
  if (status === 'exited') return t.statusExited;
  return t.statusIdle;
}

// Reads the bottom `count` non-empty rows straight out of xterm's buffer (trailing
// blank lines skipped, since agents usually leave one after a prompt).
function tailLines(term, count) {
  const buf = term.buffer.active;
  const out = [];
  for (let i = buf.length - 1; i >= 0 && out.length < count; i--) {
    const line = buf.getLine(i);
    if (!line) continue;
    const text = line.translateToString(true);
    if (!text.trim() && out.length === 0) continue;
    out.unshift(text);
  }
  return out;
}

function looksLikeAttention(lines) {
  if (!lines.length) return false;
  const lastLine = [...lines].reverse().find((l) => l.trim()) || '';
  if (/\?\s*$/.test(lastLine.trim())) return true;
  const joined = lines.join('\n');
  return ATTENTION_PATTERNS.some((re) => re.test(joined));
}

function setPanelStatus(id, status) {
  const p = panels.get(id);
  if (!p || p.status === status) return;
  const previous = p.status;
  p.status = status;
  const badge = p.el.querySelector('.status-badge');
  if (badge) {
    badge.dataset.status = status;
    badge.title = statusLabel(status);
  }
  p.el.classList.toggle('needs-you', status === 'attention');
  if (status === 'attention' && previous !== 'attention') {
    window.multicli.notify.attention(t.notifyAttentionTitle, t.notifyAttentionBody(p.label));
  }
  scheduleBoardMove(p);
}

// Which board column a panel sits in lags its raw status on purpose. An agent TUI that
// is sitting idle still repaints itself every couple of seconds (Claude Code redraws
// its input box), and each repaint reads as running → idle → running — which made the
// card hop between the Running and Idle columns every few seconds (user-reported,
// 29 Aug 2026). The card only moves once the new status has held for BOARD_STICKY_MS,
// so a periodically-redrawing panel simply stays put instead of flapping.
// `attention` is exempt: being told an agent needs you late defeats the point.
const BOARD_STICKY_MS = 4000;

function scheduleBoardMove(p) {
  clearTimeout(p.boardTimer);
  if (p.boardStatus === p.status) return;

  if (p.status === 'attention' || p.boardStatus == null) {
    p.boardStatus = p.status;
    scheduleBoardReflow();
    return;
  }
  p.boardTimer = setTimeout(() => {
    if (p.boardStatus === p.status) return;
    p.boardStatus = p.status;
    scheduleBoardReflow();
  }, BOARD_STICKY_MS);
}

// Called on every chunk of pty output: flip to "running" now, and schedule the
// settle check that decides between idle and attention once the stream goes quiet.
function notePanelOutput(id) {
  const p = panels.get(id);
  if (!p || p.status === 'exited') return;
  setPanelStatus(id, 'running');
  clearTimeout(p.settleTimer);
  p.settleTimer = setTimeout(() => {
    const cur = panels.get(id);
    if (!cur || cur.status === 'exited') return;
    setPanelStatus(id, looksLikeAttention(tailLines(cur.term, 8)) ? 'attention' : 'idle');
  }, SETTLE_MS);
}

// ---------------- Panel construction ----------------

function buildPanel(id, agent, projectDir, key) {
  const el = document.createElement('div');
  el.className = 'agent-panel';
  el.dataset.id = id;
  el.style.flex = '1 1 0';
  applyPanelGlow(el, agent.id); // per-agent color (Claude orange, Qwen purple, etc.)

  const head = document.createElement('div');
  // canvas-drag-handle: in canvas mode the head doubles as the node's drag grip.
  head.className = 'agent-panel-head canvas-drag-handle';
  const statusBadge = document.createElement('span');
  statusBadge.className = 'status-badge';
  statusBadge.dataset.status = 'idle';
  statusBadge.title = statusLabel('idle');
  const titleSpan = document.createElement('span');
  titleSpan.className = 'panel-title';
  titleSpan.textContent = labelFor(agent, projectDir);
  // This panel's own token total, sitting just left of the color dot. Stays empty
  // until the first reading lands, and for agents with no readable transcript (K19).
  const tokenBadge = document.createElement('span');
  tokenBadge.className = 'token-badge';
  const colorBtn = document.createElement('span');
  colorBtn.className = 'color-btn';
  colorBtn.title = t.colorBtnTitle;
  colorBtn.style.background = GLOW_PALETTE[colorKeyForAgent(agent.id)] || GLOW_PALETTE.green;
  const folderBtn = document.createElement('span');
  folderBtn.className = 'folder-btn';
  folderBtn.title = t.folderBtnTitle;
  folderBtn.textContent = '📁';
  const closeBtn = document.createElement('span');
  closeBtn.className = 'close-btn';
  closeBtn.title = t.closeBtnTitle;
  closeBtn.textContent = '✕';
  head.appendChild(statusBadge);
  head.appendChild(titleSpan);
  head.appendChild(tokenBadge);
  head.appendChild(colorBtn);
  head.appendChild(folderBtn);
  head.appendChild(closeBtn);

  colorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorPicker(colorBtn, colorKeyForAgent(agent.id), async (newKey) => {
      agentColors[agent.id] = newKey;
      await window.multicli.settings.setAgentColor(agent.id, newKey);
      repaintOpenPanelsForAgent(agent.id);
      buildAgentColorMenu(availableAgents);
    });
  });

  head.addEventListener('click', () => {
    setActive(id);
    panels.get(id)?.term.focus();
  });
  head.addEventListener('dblclick', (e) => {
    if (e.target === folderBtn || e.target === closeBtn) return;
    toggleMaximize(id);
  });
  folderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reassignPanelProject(id, folderBtn);
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel(id);
  });

  const body = document.createElement('div');
  body.className = 'agent-panel-body';

  // Only visible (CSS) in canvas mode. A single 14px corner turned out to be almost
  // ungrabbable (user-reported 29 Aug 2026) — worse the further you zoom out, since it
  // shrinks with the canvas. Now there are three handles, all kept at a constant
  // *screen* size via the --inv-z variable: right edge, bottom edge, and a big corner.
  const gripE = document.createElement('div');
  gripE.className = 'resize-grip resize-grip-e';
  const gripS = document.createElement('div');
  gripS.className = 'resize-grip resize-grip-s';
  const gripSE = document.createElement('div');
  gripSE.className = 'resize-grip resize-grip-se';

  el.appendChild(head);
  el.appendChild(body);
  el.appendChild(gripE);
  el.appendChild(gripS);
  el.appendChild(gripSE); // last = on top where it overlaps the edge handles
  el.addEventListener('mousedown', (e) => {
    setActive(id);
    // Always focus, at any zoom. What CSS scale actually breaks is xterm's *mouse* math
    // (selection lands on the wrong cells), which `.zoomed-out` handles by taking pointer
    // events off the body — the click then falls through to this handler. Typing was
    // never the problem.
    //
    // preventDefault matters as much as the focus() call: when the body isn't taking
    // pointer events the click target is this plain <div>, and mousedown's default action
    // then moves focus off our textarea again *after* this handler runs — which is why
    // simply calling focus() wasn't enough to fix zoomed-out typing (29 Aug 2026).
    // Skipped for the head controls, which need their normal click behaviour.
    if (!e.target.closest('.agent-panel-head')) e.preventDefault();
    term.focus();
  });

  head.addEventListener('mousedown', (e) => startCanvasDrag(e, id));
  gripE.addEventListener('mousedown', (e) => startCanvasResize(e, id, 'x'));
  gripS.addEventListener('mousedown', (e) => startCanvasResize(e, id, 'y'));
  gripSE.addEventListener('mousedown', (e) => startCanvasResize(e, id, 'both'));

  const term = new Terminal({
    fontSize: 13,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    theme: { background: '#101215', foreground: '#e6e8eb', cursor: '#39ff88' },
    cursorBlink: true,
    scrollback: 5000,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(body);

  // Directly typable panel: xterm does its own key-to-escape-sequence encoding, we
  // just forward it to the pty (the K4 single-global-input idea was dropped — the
  // user wanted to click and type into each panel like a normal terminal).
  term.onTitleChange((title) => applyTerminalTitle(id, title));

  term.onData((data) => {
    window.multicli.pty.write(id, data);
    feedTitleCandidate(id, data);
    // Answering the question is the point — drop the amber "needs you" state the
    // instant the user types, instead of waiting for the echo to settle.
    if (panels.get(id)?.status === 'attention') setPanelStatus(id, 'running');
  });

  // Ctrl+1..8 (panel switch), PageUp/PageDown/Ctrl+Home/Ctrl+End (scrollback), and
  // copy/paste/select-all are intercepted here before reaching the shell; everything
  // else is forwarded normally.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (handleViewShortcut(e)) return false;
    if (e.ctrlKey && /^[1-8]$/.test(e.key)) {
      cyclePanelByIndex(Number(e.key) - 1);
      return false;
    }
    if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
      if (e.key === 'PageUp') { term.scrollPages(-1); return false; }
      if (e.key === 'PageDown') { term.scrollPages(1); return false; }
    }
    if (e.ctrlKey && e.key === 'Home') { term.scrollToTop(); return false; }
    if (e.ctrlKey && e.key === 'End') { term.scrollToBottom(); return false; }

    // Copy: Ctrl+Shift+C always copies; plain Ctrl+C copies only when there's a
    // selection (a shell already treats plain Ctrl+C as SIGINT, so that meaning is
    // preserved whenever nothing is selected — the standard Windows Terminal behavior).
    const wantsCopy = (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') ||
      (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c' && term.hasSelection());
    if (wantsCopy) { copyPanelSelection(id); return false; }
    // Paste: both Ctrl+V and Ctrl+Shift+V paste the clipboard straight into the pty.
    if (e.ctrlKey && e.key.toLowerCase() === 'v') { pasteIntoPanel(id); return false; }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') { selectAllInPanel(id); return false; }
    return true;
  });

  panels.set(id, {
    term, fit, el, body, label: labelFor(agent, projectDir), agent, projectDir: projectDir || null,
    // `key` is stable across restarts (unlike `id`, which is sequence-based): it's what
    // the workspace record and the scrollback file on disk are keyed by (K15/K16).
    key: key || newPanelKey(),
    status: 'idle',
    settleTimer: null,
    // The transcript file this panel's CLI is writing (K19): drives both the token badge
    // and which conversation a restore resumes. Claimed shortly after spawn.
    cwd: null,
    sessionId: null,
    sessionSince: null, // the spawnedAt the sessionId was claimed against — see session:verify
    spawnedAt: null,
    // Canvas geometry; filled in lazily by placeOnCanvas() the first time this panel
    // is rendered on the canvas, or restored from the workspace.
    geom: null,
    // Live-title tracking (28 Aug 2026): a "Projesiz" panel gives no clue which
    // conversation is running in it once the agent has actually started. captureTitle
    // is flipped on right after the launch command is sent (see startAgentPanel), so
    // we only ever look at what the user types, never the injected launch command.
    captureTitle: false, titleFromInput: false, inputLineBuf: '',
  });

  const ro = new ResizeObserver(() => fitPanel(id));
  ro.observe(body);
  bodyObservers.set(id, ro);

  return el;
}

// orientation: 'col' = vertical bar, resizes width of left/right neighbors.
//              'row' = horizontal bar, resizes height of top/bottom neighbors.
function addResizer(orientation) {
  const r = document.createElement('div');
  r.className = orientation === 'row' ? 'resizer resizer-row' : 'resizer resizer-col';
  let dragging = false;
  let startPos = 0;
  let firstEl = null, secondEl = null;
  let firstStart = 0, secondStart = 0;

  r.addEventListener('mousedown', (e) => {
    dragging = true;
    r.classList.add('dragging');
    firstEl = r.previousElementSibling;
    secondEl = r.nextElementSibling;
    if (orientation === 'row') {
      startPos = e.clientY;
      firstStart = firstEl.getBoundingClientRect().height;
      secondStart = secondEl.getBoundingClientRect().height;
    } else {
      startPos = e.clientX;
      firstStart = firstEl.getBoundingClientRect().width;
      secondStart = secondEl.getBoundingClientRect().width;
    }
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    if (orientation === 'row') {
      const dy = e.clientY - startPos;
      firstEl.style.flex = `0 0 ${Math.max(80, firstStart + dy)}px`;
      secondEl.style.flex = `0 0 ${Math.max(80, secondStart - dy)}px`;
    } else {
      const dx = e.clientX - startPos;
      firstEl.style.flex = `0 0 ${Math.max(120, firstStart + dx)}px`;
      secondEl.style.flex = `0 0 ${Math.max(120, secondStart - dx)}px`;
    }
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    r.classList.remove('dragging');
  });
  return r;
}

// ---------------- View dispatch (K15) ----------------
// Every render path below re-parents the EXISTING panel DOM nodes — an xterm instance
// is never recreated, so live sessions, scrollback and pty wiring survive switching
// between grid / canvas / board exactly like they already survived a grid reshuffle.

function newPanelKey() {
  // Charset must stay within what main.js's scrollbackFile() whitelists.
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Inline styles set by one view mode would otherwise leak into the next (canvas
// leaves left/top/width/height behind, the grid resizers leave a px flex-basis).
function resetPanelInlineLayout(el) {
  el.style.flex = '1 1 0';
  el.style.left = '';
  el.style.top = '';
  el.style.width = '';
  el.style.height = '';
}

function renderView() {
  // Re-parenting a DOM node blurs whatever inside it had focus, and the board
  // re-renders on every status change — without this, typing into a panel would lose
  // the cursor the moment another agent went idle.
  const hadFocus = activePanelId && panels.get(activePanelId)?.el.contains(document.activeElement);

  panelGrid.innerHTML = '';
  panelGrid.style.backgroundSize = '';
  panelGrid.style.backgroundPosition = '';
  for (const p of panels.values()) resetPanelInlineLayout(p.el);

  if (panels.size === 0) {
    panelGrid.className = 'view-grid';
    const hint = document.createElement('div');
    hint.id = 'empty-hint';
    hint.textContent = t.emptyHint;
    panelGrid.appendChild(hint);
    return;
  }

  if (maximizedId && panels.has(maximizedId)) renderMaximized();
  else if (viewMode === 'canvas') renderCanvas();
  else if (viewMode === 'board') renderBoard();
  else renderGrid();

  requestAnimationFrame(() => {
    fitAllPanels();
    if (hadFocus) panels.get(activePanelId)?.term.focus();
  });
}

function renderMaximized() {
  panelGrid.className = 'view-max';
  panelGrid.appendChild(panels.get(maximizedId).el);
}

// Re-arranges the grid wrapper (rows/resizers) using the EXISTING panel DOM nodes —
// never recreates an xterm instance for a panel that was already open, so running
// sessions/scrollback survive whenever a panel is added, closed, or maximized.
function renderGrid() {
  panelGrid.className = 'view-grid';
  const ids = [...panels.keys()];

  // A manually-dragged resizer sets a fixed-px flex-basis directly on the two
  // neighboring `.agent-panel` elements. Since this function reuses those same DOM
  // nodes rather than recreating them, that pixel value survives into whatever new
  // row/column arrangement layoutIds() produces next — harmless right after opening a
  // panel (buildPanel() always starts it at '1 1 0'), but closing one reshuffles the
  // survivors into a layout their old pixel sizes were never meant for, which read as
  // "gets confused" (28 Aug 2026). Reset everyone to an even split on every structural
  // change; live dragging within a stable layout is unaffected.
  ids.forEach((id) => { panels.get(id).el.style.flex = '1 1 0'; });

  const grid = layoutIds(ids);
  grid.forEach((rowIds, rIdx) => {
    if (rIdx > 0) panelGrid.appendChild(addResizer('row'));
    const rowEl = document.createElement('div');
    rowEl.className = 'panel-row';
    rowEl.style.flex = '1 1 0';
    rowIds.forEach((id, cIdx) => {
      if (cIdx > 0) rowEl.appendChild(addResizer('col'));
      rowEl.appendChild(panels.get(id).el);
    });
    panelGrid.appendChild(rowEl);
  });
}

// ---------------- Canvas view (K15) ----------------

// First time a panel shows up on the canvas it gets slotted into a loose 3-wide grid
// so restored/new panels never land on top of each other; after that its geometry is
// whatever the user dragged it to (and is persisted with the workspace).
function placeOnCanvas(p, index) {
  if (p.geom) return;
  const perRow = 3;
  p.geom = {
    x: (index % perRow) * (CANVAS_DEFAULT_W + 24),
    y: Math.floor(index / perRow) * (CANVAS_DEFAULT_H + 24),
    w: CANVAS_DEFAULT_W,
    h: CANVAS_DEFAULT_H,
  };
}

function applyCanvasGeom(p) {
  p.el.style.flex = 'none';
  p.el.style.left = `${p.geom.x}px`;
  p.el.style.top = `${p.geom.y}px`;
  p.el.style.width = `${p.geom.w}px`;
  p.el.style.height = `${p.geom.h}px`;
}

function applyCanvasTransform() {
  const world = document.getElementById('canvas-world');
  if (!world) return;
  world.style.transform = `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.z})`;
  world.classList.toggle('zoomed-out', canvasView.z < CANVAS_INTERACTIVE_Z);
  // The whole world is scaled, so a 20px grip becomes 10 physical px at 50% zoom —
  // unusable exactly when you most need to rearrange things. The grips size themselves
  // off this inverse factor so they stay a constant size on screen at any zoom.
  world.style.setProperty('--inv-z', String(1 / canvasView.z));
  // Keep the backdrop dot grid locked to the content so panning reads as movement
  // across a surface rather than panels sliding over a static background.
  const step = 28 * canvasView.z;
  panelGrid.style.backgroundSize = `${step}px ${step}px`;
  panelGrid.style.backgroundPosition = `${canvasView.x}px ${canvasView.y}px`;
  const label = document.getElementById('canvas-zoom-label');
  if (label) label.textContent = `${Math.round(canvasView.z * 100)}%`;
}

function renderCanvas() {
  panelGrid.className = 'view-canvas';
  const world = document.createElement('div');
  world.id = 'canvas-world';
  [...panels.values()].forEach((p, i) => {
    placeOnCanvas(p, i);
    applyCanvasGeom(p);
    world.appendChild(p.el);
  });
  panelGrid.appendChild(world);

  const zoomLabel = document.createElement('div');
  zoomLabel.id = 'canvas-zoom-label';
  panelGrid.appendChild(zoomLabel);

  applyCanvasTransform();
}

// Drag a node by its header. Deltas are divided by the zoom factor, otherwise the
// panel drifts away from the cursor at anything other than 100%.
function startCanvasDrag(e, id) {
  if (viewMode !== 'canvas' || maximizedId || e.button !== 0) return;
  if (e.target.closest('.color-btn, .folder-btn, .close-btn')) return;
  const p = panels.get(id);
  if (!p || !p.geom) return;
  e.preventDefault();
  setActive(id);

  const startX = e.clientX, startY = e.clientY;
  const originX = p.geom.x, originY = p.geom.y;
  const onMove = (ev) => {
    p.geom.x = originX + (ev.clientX - startX) / canvasView.z;
    p.geom.y = originY + (ev.clientY - startY) / canvasView.z;
    applyCanvasGeom(p);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    saveWorkspaceSoon();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// axis: 'x' (right edge), 'y' (bottom edge) or 'both' (corner).
function startCanvasResize(e, id, axis) {
  if (viewMode !== 'canvas' || maximizedId || e.button !== 0) return;
  const p = panels.get(id);
  if (!p || !p.geom) return;
  e.preventDefault();
  e.stopPropagation();
  setActive(id);

  const startX = e.clientX, startY = e.clientY;
  const originW = p.geom.w, originH = p.geom.h;
  const onMove = (ev) => {
    // Deltas are divided by the zoom, same as dragging — otherwise the edge runs away
    // from the cursor at anything other than 100%.
    if (axis !== 'y') p.geom.w = Math.max(220, originW + (ev.clientX - startX) / canvasView.z);
    if (axis !== 'x') p.geom.h = Math.max(140, originH + (ev.clientY - startY) / canvasView.z);
    applyCanvasGeom(p);
    fitPanel(id); // live reflow, so the terminal follows the drag instead of snapping at the end
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    fitPanel(id);
    saveWorkspaceSoon();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// Zoom about the cursor: the world point under the pointer must not move.
function zoomCanvasAt(clientX, clientY, factor) {
  const rect = panelGrid.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const nextZ = Math.min(CANVAS_MAX_Z, Math.max(CANVAS_MIN_Z, canvasView.z * factor));
  if (nextZ === canvasView.z) return;
  const ratio = nextZ / canvasView.z;
  canvasView.x = px - (px - canvasView.x) * ratio;
  canvasView.y = py - (py - canvasView.y) * ratio;
  canvasView.z = nextZ;
  applyCanvasTransform();
  saveWorkspaceSoon();
}

function resetCanvasView() {
  canvasView.x = 40;
  canvasView.y = 40;
  canvasView.z = 1;
  applyCanvasTransform();
  saveWorkspaceSoon();
}

// Pan: left-drag on empty canvas, or middle-drag anywhere (including over a panel,
// so you can still move around without hunting for a gap).
panelGrid.addEventListener('mousedown', (e) => {
  if (viewMode !== 'canvas' || maximizedId) return;
  const onPanel = e.target.closest('.agent-panel');
  const middle = e.button === 1;
  if (!middle && (e.button !== 0 || onPanel)) return;
  e.preventDefault();
  panelGrid.classList.add('panning');

  const startX = e.clientX, startY = e.clientY;
  const originX = canvasView.x, originY = canvasView.y;
  const onMove = (ev) => {
    canvasView.x = originX + (ev.clientX - startX);
    canvasView.y = originY + (ev.clientY - startY);
    applyCanvasTransform();
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    panelGrid.classList.remove('panning');
    saveWorkspaceSoon();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

panelGrid.addEventListener('wheel', (e) => {
  if (viewMode !== 'canvas' || maximizedId) return;
  // Over a live, readable terminal a plain wheel belongs to xterm's scrollback;
  // Ctrl+wheel always zooms, and once zoomed out the bodies aren't interactive
  // anyway so the wheel is free to zoom there too.
  const overLiveTerminal = e.target.closest('.agent-panel-body') && canvasView.z >= CANVAS_INTERACTIVE_Z;
  if (overLiveTerminal && !e.ctrlKey) return;
  e.preventDefault();
  zoomCanvasAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

// ---------------- Board view (K18) ----------------
// Columns are agent STATUS, not user-assigned buckets — so there is nothing to drag:
// a panel moves itself into "Needs You" the moment its agent asks a question. That's
// the triage value; hand-sorted kanban columns would just be a second thing to
// maintain. Terminals stay live inside the cards.
const BOARD_STATUSES = ['attention', 'running', 'idle', 'exited'];
let boardReflowTimer = null;

function boardColumnLabel(status) {
  if (status === 'attention') return t.boardAttention;
  if (status === 'running') return t.boardRunning;
  if (status === 'exited') return t.boardExited;
  return t.boardIdle;
}

function scheduleBoardReflow() {
  clearTimeout(boardReflowTimer);
  boardReflowTimer = setTimeout(() => { if (viewMode === 'board') renderView(); }, 250);
}

function renderBoard() {
  panelGrid.className = 'view-board';
  const byStatus = new Map(BOARD_STATUSES.map((s) => [s, []]));
  for (const p of panels.values()) {
    // boardStatus, not status: the debounced copy (see scheduleBoardMove) is what keeps
    // a card from hopping columns every time a TUI repaints itself.
    const col = p.boardStatus ?? p.status;
    (byStatus.get(col) || byStatus.get('idle')).push(p);
  }

  BOARD_STATUSES.forEach((status) => {
    const members = byStatus.get(status);
    const col = document.createElement('div');
    col.className = 'board-column';
    col.dataset.status = status;

    const head = document.createElement('div');
    head.className = 'board-column-head';
    head.innerHTML = '<span class="dot"></span>';
    const name = document.createElement('span');
    name.textContent = boardColumnLabel(status);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(members.length);
    head.appendChild(name);
    head.appendChild(count);

    const body = document.createElement('div');
    body.className = 'board-column-body';
    if (!members.length) {
      const empty = document.createElement('div');
      empty.className = 'board-empty';
      empty.textContent = t.boardEmpty;
      body.appendChild(empty);
    } else {
      members.forEach((p) => body.appendChild(p.el));
    }

    col.appendChild(head);
    col.appendChild(body);
    panelGrid.appendChild(col);
  });
}

// ---------------- View mode switching ----------------

function setViewMode(mode) {
  if (!['grid', 'canvas', 'board'].includes(mode) || mode === viewMode) return;
  viewMode = mode;
  maximizedId = null; // a maximized panel would hide the layout the user just asked for
  refreshViewMenu();
  renderView();
  saveWorkspaceSoon();
}

function refreshViewMenu() {
  document.querySelectorAll('.view-mode-item').forEach((item) => {
    item.querySelector('.check').textContent = item.dataset.mode === viewMode ? '✓' : '';
  });
  document.querySelector('#toggle-restore-item .check').textContent = restoreOnStart ? '✓' : '';
  document.querySelector('#toggle-shortcut-bar-item .check').textContent = showShortcutBar ? '✓' : '';
  document.querySelector('#toggle-dock-item .check').textContent = showLimitDock ? '✓' : '';
  document.querySelector('#toggle-task-dock-item .check').textContent = showTaskDock ? '✓' : '';
}

function applyShortcutBarVisibility() {
  document.getElementById('shortcut-bar').classList.toggle('hidden', !showShortcutBar);
}

function applyLimitDockVisibility() {
  limitDock.classList.toggle('hidden', !showLimitDock);
}

function applyTaskDockVisibility() {
  taskDock.classList.toggle('hidden', !showTaskDock);
}

// ---------------- Workspace + scrollback persistence (K15/K16) ----------------
// Saved debounced on every structural change and flushed once more when the window is
// closing (main.js holds the close until we report back).
const SCROLLBACK_KEEP_LINES = 400;
let workspaceSaveTimer = null;

function collectWorkspace() {
  return {
    viewMode,
    restoreOnStart,
    showShortcutBar,
    showLimitDock,
    showTaskDock,
    canvas: { ...canvasView },
    panels: [...panels.values()].map((p) => ({
      key: p.key,
      agentId: p.agent.id,
      projectDir: p.projectDir,
      sessionId: p.sessionId || null, // resume THIS session, not "the folder's latest"
      sessionSince: p.sessionSince ?? null, // ...but only if it still checks out (session:verify)
      geom: p.geom ? { ...p.geom } : null,
    })),
  };
}

function saveWorkspaceSoon() {
  clearTimeout(workspaceSaveTimer);
  workspaceSaveTimer = setTimeout(saveWorkspaceNow, 600);
}

function saveWorkspaceNow() {
  clearTimeout(workspaceSaveTimer);
  window.multicli.workspace.save(collectWorkspace());
}

function saveScrollback(p) {
  try {
    window.multicli.scrollback.save(p.key, tailLines(p.term, SCROLLBACK_KEEP_LINES).join('\n'));
  } catch { /* a dead terminal has nothing worth saving */ }
}

// Written back into the panel dimmed, above whatever the freshly launched agent
// prints, so it's obvious which part is history and which part is live.
async function replayScrollback(p) {
  const text = await window.multicli.scrollback.load(p.key);
  if (!text) return;
  p.term.write(`\x1b[2m${text.replace(/\r?\n/g, '\r\n')}\x1b[0m\r\n`);
  p.term.write(`\x1b[33m${t.restoredHistory}\x1b[0m\r\n`);
}

window.multicli.workspace.onFlush(() => {
  try {
    saveWorkspaceNow();
    for (const p of panels.values()) saveScrollback(p);
  } finally {
    // Must always fire — main.js is blocking the window close on it.
    window.multicli.workspace.flushed();
  }
});

function fitPanel(id) {
  const p = panels.get(id);
  if (!p) return;
  try {
    p.fit.fit();
    window.multicli.pty.resize(id, p.term.cols, p.term.rows);
  } catch { /* panel not laid out yet */ }
}

function fitAllPanels() {
  for (const id of panels.keys()) fitPanel(id);
}

// ---------------- Start / close / reassign ----------------

// opts (all optional) is how workspace restore reuses this same path instead of
// duplicating the spawn logic: { key, projectDir, geom, restore }.
async function startAgentPanel(agent, startCommand, opts = {}) {
  // If a project is open, the new panel starts in it automatically; if a different
  // location is wanted, it can be changed for just this panel afterwards via the 📁
  // button. A restored panel brings its own folder instead.
  const dir = opts.projectDir !== undefined ? opts.projectDir : (openProject?.path ?? null);
  const id = mintPanelId(agent.id);
  buildPanel(id, agent, dir, opts.key);
  const p = panels.get(id);
  if (opts.geom) p.geom = { ...opts.geom };
  if (opts.sessionId) {
    p.sessionId = opts.sessionId;
    p.sessionSince = opts.sessionSince ?? null;
  }

  // Add the new panel next to the existing ones and re-render the current view
  // (existing panels are preserved).
  renderView();

  // History first, so the agent's own banner lands *below* the previous session.
  if (opts.restore) await replayScrollback(p);

  // spawn returns the cwd main.js actually used, which may be the configured default
  // rather than `dir` — that resolved path is what the session lookup keys off.
  p.cwd = await window.multicli.pty.spawn(id, dir);
  p.spawnedAt = Date.now(); // lower bound for "which transcript file is mine"
  announcePanel(id); // live-panel registry (K22) — lets a later viewer attach instead of respawn
  // The transcript usually doesn't exist for a few seconds, hence the staggered retries.
  // A restored panel joins in too (allowReclaim) in case its CLI forked a new session.
  [3000, 8000, 20000].forEach((ms) =>
    setTimeout(() => claimPanelSession(id, { allowReclaim: !!p.sessionId }), ms));
  refreshPanelTokens(id);
  const command = startCommand ?? agent.command;
  if (command) {
    setTimeout(() => {
      window.multicli.pty.write(id, `${command}\r`);
      const panel = panels.get(id);
      if (panel) panel.captureTitle = true;
    }, 200);
  }
  if (!opts.restore) {
    setActive(id);
    p.term.focus();
  }
  saveWorkspaceSoon();
  return id; // lets a caller (e.g. a Task phase) bind itself to the panel it just started
}

function closePanel(id) {
  const p = panels.get(id);
  if (!p) return;
  window.multicli.pty.kill(id);
  window.multicli.panels.closed(id); // un-announce (K22) — nothing left here to attach to
  clearTimeout(p.settleTimer);
  clearTimeout(p.boardTimer);
  bodyObservers.get(id)?.disconnect();
  bodyObservers.delete(id);
  // Closing a panel is an explicit "I'm done with this one" — drop its saved history
  // so the file doesn't linger for a key that will never be restored (K16).
  window.multicli.scrollback.clear(p.key);
  p.term.dispose();
  panels.delete(id);
  if (activePanelId === id) activePanelId = null;
  if (maximizedId === id) maximizedId = null;
  renderView();
  if (!activePanelId) {
    const next = panels.keys().next().value;
    if (next) setActive(next);
  }
  saveWorkspaceSoon();
}

async function reassignPanelProject(id, anchorEl) {
  const p = panels.get(id);
  if (!p) return;
  showProjectPicker(anchorEl, async (dir) => {
    p.term.write(dir
      ? `\r\n\x1b[33m${t.projectChanged(dir)}\x1b[0m\r\n`
      : `\r\n\x1b[33m${t.projectRemoved}\x1b[0m\r\n`);
    window.multicli.pty.kill(id);
    p.cwd = await window.multicli.pty.spawn(id, dir);
    p.projectDir = dir;
    p.sessionId = null;      // different folder = different transcript; re-claim below
    p.sessionSince = null;
    p.spawnedAt = Date.now();
    p.label = labelFor(p.agent, dir);
    p.el.querySelector('.panel-title').textContent = p.label;
    announcePanel(id); // new cwd/projectDir under the same id (K22)
    [3000, 8000, 20000].forEach((ms) => setTimeout(() => claimPanelSession(id), ms));
    refreshPanelTokens(id);
    if (p.agent.command) {
      setTimeout(() => window.multicli.pty.write(id, `${p.agent.command}\r`), 200);
    }
    saveWorkspaceSoon(); // the panel's folder is part of the restored workspace (K15)
  });
}

// A small dropdown offering saved projects + "Browse" + "No Project".
// Positioned below anchorEl; onPick(dirOrNull) is called once a choice is made.
function showProjectPicker(anchorEl, onPick) {
  document.querySelectorAll('.project-picker').forEach((el) => el.remove());

  const picker = document.createElement('div');
  picker.className = 'project-picker';
  const rect = anchorEl.getBoundingClientRect();
  picker.style.top = `${rect.bottom + 4}px`;
  picker.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;

  const addItem = (text, handler) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.textContent = text;
    item.addEventListener('click', async () => {
      picker.remove();
      await handler();
    });
    picker.appendChild(item);
  };

  savedProjects.forEach((proj) => addItem(proj.name, () => onPick(proj.path)));
  if (savedProjects.length) {
    const sep = document.createElement('div');
    sep.className = 'menu-sep';
    picker.appendChild(sep);
  }
  addItem(t.browseFolder, async () => {
    const dir = await window.multicli.projects.browse();
    if (dir) onPick(dir);
  });
  addItem(t.noProject, () => onPick(null));

  document.body.appendChild(picker);
  setTimeout(() => {
    window.addEventListener('click', function closeOnce() {
      picker.remove();
      window.removeEventListener('click', closeOnce);
    }, { once: true });
  }, 0);
}

// ---------------- Copy / paste / select-all (keyboard shortcuts + bottom-bar buttons) ----------------

function copyPanelSelection(id) {
  const p = panels.get(id);
  if (!p || !p.term.hasSelection()) return;
  window.multicli.clipboard.writeText(p.term.getSelection());
  p.term.clearSelection();
}

function pasteIntoPanel(id) {
  const p = panels.get(id);
  if (!p) return;
  const text = window.multicli.clipboard.readText();
  if (text) window.multicli.pty.write(id, text);
}

function selectAllInPanel(id) {
  panels.get(id)?.term.selectAll();
}

// ---------------- Active panel / glow ----------------

function setActive(id) {
  if (!id || !panels.has(id)) return;
  activePanelId = id;
  for (const [pid, p] of panels) p.el.classList.toggle('active', pid === id);
}

// Maximize is now a render mode rather than a CSS overlay: `position:absolute` can't
// escape the canvas's transformed world, so instead the single maximized panel is
// rendered on its own in a `.view-max` host. Works the same in grid/canvas/board.
function toggleMaximize(id) {
  if (!panels.has(id)) return;
  maximizedId = maximizedId === id ? null : id;
  setActive(id);
  renderView();
}

function cyclePanelByIndex(idx) {
  const id = [...panels.keys()][idx];
  if (id) {
    setActive(id);
    panels.get(id).term.focus();
  }
}

// ---------------- PTY <-> xterm wiring ----------------

window.multicli.pty.onData(({ id, data }) => {
  const p = panels.get(id);
  if (!p) return;
  p.term.write(data);
  notePanelOutput(id); // drives the running / needs-you / idle badge (K17)
});
window.multicli.pty.onExit(({ id, exitCode }) => {
  const p = panels.get(id);
  if (!p) return;
  p.term.write(`\r\n\x1b[31m${t.processExited(exitCode)}\x1b[0m\r\n`);
  clearTimeout(p.settleTimer);
  setPanelStatus(id, 'exited');
});

// ---------------- Live panel add/remove from *other* viewers (K22) ----------------
// The host opening a new panel while a remote tab is attached, or vice versa, needs to
// show up on both sides — each viewer announces after spawning (announcePanel above)
// and un-announces on close (closePanel above); this is what makes every attached
// viewer converge on the same panel set.
window.multicli.panels.onNew((meta) => {
  if (panels.has(meta.id)) return;
  const agent = availableAgents.find((a) => a.id === meta.agentId);
  if (!agent) return;
  buildPanel(meta.id, agent, meta.projectDir ?? null, meta.key);
  const p = panels.get(meta.id);
  p.cwd = meta.cwd ?? null;
  p.sessionId = meta.sessionId ?? null;
  p.sessionSince = meta.sessionSince ?? null;
  if (meta.geom) p.geom = { ...meta.geom };
  renderView();
  fitPanel(meta.id);
});
window.multicli.panels.onClosed((id) => {
  const p = panels.get(id);
  if (!p) return;
  bodyObservers.get(id)?.disconnect();
  bodyObservers.delete(id);
  p.term.dispose();
  panels.delete(id);
  if (activePanelId === id) activePanelId = null;
  if (maximizedId === id) maximizedId = null;
  renderView();
  if (!activePanelId) {
    const next = panels.keys().next().value;
    if (next) setActive(next);
  }
});

window.addEventListener('resize', () => requestAnimationFrame(fitAllPanels));

// Same view shortcuts when focus isn't inside a terminal (menus, empty state).
window.addEventListener('keydown', (e) => {
  if (handleViewShortcut(e)) e.preventDefault();
});

// ---------------- Title bar: window controls ----------------

document.querySelector('[data-action="minimize"]').addEventListener('click', () => window.multicli.window.minimize());
document.querySelector('[data-action="maximize"]').addEventListener('click', () => window.multicli.window.maximize());
document.querySelector('[data-action="close"]').addEventListener('click', () => window.multicli.window.close());

// ---------------- Title bar: menus ----------------

document.querySelectorAll('.menu-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const menu = btn.closest('.menu');
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    if (!wasOpen) menu.classList.add('open');
    e.stopPropagation();
  });
});
window.addEventListener('click', () => {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
});

function setOpenProject(proj) {
  openProject = proj; // { name, path } | null
  window.multicli.projects.setOpen(proj?.path ?? null);
  projectLabel.textContent = proj ? t.projectLabel(proj.name) : t.projectNone;
  projectLabel.title = proj?.path ?? '';
  // The room belongs to the open project, so it follows the project while it is on screen.
  if (!document.getElementById('agent-room').hidden) loadRoom();
  renderRoomAgentMenu();
  renderRoomChips();
  renderFileMenu();
}

function renderFileMenu() {
  savedProjectsList.innerHTML = '';
  savedProjects.forEach((proj) => {
    const row = document.createElement('div');
    row.className = 'project-row';
    const isOpen = openProject?.path === proj.path;
    row.innerHTML = `<span class="check">${isOpen ? '✓' : ''}</span><span class="name">${proj.name}</span><span class="remove-x">✕</span>`;
    // Opening a saved project asks what to run in it. The rect has to be measured first:
    // setOpenProject() re-renders this list, so by the time the picker is built this very
    // row has already been thrown away and replaced.
    const openAndOffer = (e) => {
      e.stopPropagation(); // let the picker replace the menu, not race it
      const rect = e.currentTarget.getBoundingClientRect();
      setOpenProject(proj);
      showAgentLaunchPicker(rect, proj);
    };
    row.querySelector('.name').addEventListener('click', openAndOffer);
    row.querySelector('.check').addEventListener('click', openAndOffer);
    row.querySelector('.remove-x').addEventListener('click', async (e) => {
      e.stopPropagation();
      savedProjects = await window.multicli.projects.remove(proj.path);
      if (openProject?.path === proj.path) setOpenProject(null);
      else renderFileMenu();
    });
    savedProjectsList.appendChild(row);
  });
}

const defaultBaseItem = document.getElementById('default-base-item');
let defaultBaseDir = null;

function refreshDefaultBaseItem() {
  defaultBaseItem.textContent = defaultBaseDir ? t.defaultLocationLabel(projectBaseName(defaultBaseDir)) : t.defaultLocationSet;
  defaultBaseItem.title = defaultBaseDir || '';
}

document.querySelector('[data-action="set-default-base"]').addEventListener('click', async () => {
  const dir = await window.multicli.settings.setDefaultBaseDir();
  if (!dir) return;
  defaultBaseDir = dir;
  refreshDefaultBaseItem();
});

document.querySelector('[data-action="add-project"]').addEventListener('click', async () => {
  const added = await window.multicli.projects.add();
  if (!added) return;
  savedProjects = await window.multicli.projects.list();
  setOpenProject(added);
  // Anchored to the title bar's project label rather than the menu item that was clicked:
  // the File menu closed while the folder dialog was up, and a hidden element measures as
  // a zero rect, which would park the picker in the top-left corner.
  showAgentLaunchPicker(projectLabel, added);
});

document.querySelector('[data-action="close-project"]').addEventListener('click', () => {
  setOpenProject(null);
});

// Checkbox-style like the two rows above it, and remembered across restarts — it used to
// be a bare class toggle that reset on every launch, so hiding the dock never stuck
// (Murat, 1 Sep 2026).
document.querySelector('[data-action="toggle-dock"]').addEventListener('click', (e) => {
  e.stopPropagation();
  showLimitDock = !showLimitDock;
  applyLimitDockVisibility();
  refreshViewMenu();
  saveWorkspaceNow();
  fitAllPanels(); // the terminals just gained or lost the dock's width
});

document.querySelector('[data-action="toggle-task-dock"]').addEventListener('click', (e) => {
  e.stopPropagation();
  showTaskDock = !showTaskDock;
  applyTaskDockVisibility();
  refreshViewMenu();
  saveWorkspaceNow();
  fitAllPanels(); // the terminals just gained or lost the dock's width
});

document.querySelectorAll('.view-mode-item').forEach((item) => {
  item.addEventListener('click', () => setViewMode(item.dataset.mode));
});

document.querySelector('[data-action="reset-canvas"]').addEventListener('click', () => {
  if (viewMode !== 'canvas') setViewMode('canvas');
  resetCanvasView();
});

document.querySelector('[data-action="toggle-restore"]').addEventListener('click', (e) => {
  e.stopPropagation(); // a checkbox-style row shouldn't slam the whole menu shut
  restoreOnStart = !restoreOnStart;
  refreshViewMenu();
  saveWorkspaceNow();
});

// The shortcut bar is largely redundant on Windows — PowerShell's own right-click does
// copy/paste — but it's kept behind a toggle rather than deleted, for anyone who wants
// the buttons (Murat's call, 29 Aug 2026). Default on. It also carries the keyboard
// hint text, so hiding it is a deliberate choice, not the default.
document.querySelector('[data-action="toggle-shortcut-bar"]').addEventListener('click', (e) => {
  e.stopPropagation();
  showShortcutBar = !showShortcutBar;
  applyShortcutBarVisibility();
  refreshViewMenu();
  saveWorkspaceNow();
  fitAllPanels(); // the terminals just gained or lost ~34px of height
});

// Remote access (K22) — host-only. In a remote viewer window.multicli.remote.start/stop
// are no-ops (remote-bridge.js), so the click there just explains why instead of doing
// nothing silently.
const remoteAccessItem = document.getElementById('remote-access-item');
if (window.__MULTICLI_REMOTE__) {
  remoteAccessItem.addEventListener('click', () => window.alert(t.remoteAccessUnavailable));
} else {
  remoteAccessItem.addEventListener('click', async () => {
    // Without the catch, a failed start (port already taken is the realistic one) went
    // nowhere at all: the label never flipped, no dialog appeared, and the rejection
    // only showed up in devtools — the menu item just looked dead.
    try {
      const status = await window.multicli.remote.status();
      if (status?.running) {
        await window.multicli.remote.stop();
        remoteAccessItem.textContent = t.remoteAccessStart;
      } else {
        // main.js's remote:start handler does the URL dialog + clipboard + opening the
        // browser itself — nothing more to do here than flip the label.
        await window.multicli.remote.start();
        remoteAccessItem.textContent = t.remoteAccessStop;
      }
    } catch (err) {
      window.alert(t.remoteAccessFailed(String(err && err.message || err)));
    }
  });
}

document.querySelector('[data-action="copy"]').addEventListener('click', () => {
  if (activePanelId) copyPanelSelection(activePanelId);
});
document.querySelector('[data-action="paste"]').addEventListener('click', () => {
  if (activePanelId) { pasteIntoPanel(activePanelId); panels.get(activePanelId)?.term.focus(); }
});
document.querySelector('[data-action="select-all"]').addEventListener('click', () => {
  if (activePanelId) selectAllInPanel(activePanelId);
});

function buildAgentMenu(agents) {
  agentsMenu.innerHTML = '';
  agents.forEach((agent) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.textContent = t.startAgent(agent.label);
    item.addEventListener('click', (e) => {
      // Agents with a known continue/resume flag (currently Claude and Codex) get
      // asked which mode to start in; others just start a plain new session.
      if (agent.continueCommand || agent.resumeCommand) {
        // Without this, the click bubbles to the window-level "close all open
        // menus" listener and the Agents dropdown vanishes the instant the
        // session-mode picker opens next to it — disorienting (27 Aug 2026 bug).
        // Picking an option in the picker still bubbles normally and closes
        // everything together, which is the behavior we want at that point.
        e.stopPropagation();
        showSessionModePicker(item, agent);
      } else {
        startAgentPanel(agent);
      }
    });
    agentsMenu.appendChild(item);
  });
  // The room is not an agent, but it sits in the same place so it's easy to find.
  const roomItem = document.createElement('div');
  roomItem.className = 'menu-item';
  roomItem.textContent = 'Agent Room';
  roomItem.addEventListener('click', () => {
    document.getElementById('tab-room').hidden = false;
    setTab('room');
  });
  agentsMenu.appendChild(roomItem);

  // Which installed agents take part in the Agent Room; picked per project.
  const roomAgentsBox = document.createElement('div');
  roomAgentsBox.id = 'room-agents-box';
  agentsMenu.appendChild(roomAgentsBox);
  renderRoomAgentMenu();
}

// The active-agent chips beside the working-folder button. Same state as the Agents menu list.
async function renderRoomChips() {
  const box = document.getElementById('room-agent-chips');
  if (!box) return;
  box.replaceChildren();
  const dir = openProject?.path ?? null;
  if (!dir) return;
  const state = await window.multicli.room.agents(dir);
  if (!state) return;
  const label = document.createElement('span');
  label.className = 'room-chips-label';
  label.textContent = t.roomActive;
  box.appendChild(label);
  for (const id of state.installed) {
    const on = state.active.includes(id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `room-chip${on ? ' on' : ' off'}`;
    chip.textContent = `${on ? '●' : '○'} ${ROOM_NAMES[id] || id}`;
    chip.title = on ? t.roomChipOn : t.roomChipOff;
    chip.addEventListener('click', async () => {
      const next = state.installed.filter((x) => (x === id ? !on : state.active.includes(x)));
      await window.multicli.room.setAgents(dir, next);
      renderRoomChips();
      renderRoomAgentMenu();
    });
    box.appendChild(chip);
  }
}

async function renderRoomAgentMenu() {
  const box = document.getElementById('room-agents-box');
  if (!box) return;
  box.replaceChildren();
  const head = document.createElement('div');
  head.className = 'menu-label';
  head.textContent = t.roomAgents;
  box.appendChild(head);
  const dir = openProject?.path ?? null;
  if (!dir) {
    const note = document.createElement('div');
    note.className = 'menu-item';
    note.style.opacity = '.5';
    note.textContent = t.roomAgentsNoProject;
    box.appendChild(note);
    return;
  }
  const state = await window.multicli.room.agents(dir);
  if (!state) return;
  for (const id of state.installed) {
    const on = state.active.includes(id);
    const row = document.createElement('div');
    row.className = 'menu-item';
    row.innerHTML = `<span class="check">${on ? '✓' : ''}</span><span class="name">${ROOM_NAMES[id] || id}</span>`;
    row.addEventListener('click', async (e) => {
      e.stopPropagation(); // keep the Agents menu open so several can be toggled in a row
      // Installed order, so the turn order stays the same however agents are toggled.
      const next = state.installed.filter((x) => (x === id ? !on : state.active.includes(x)));
      await window.multicli.room.setAgents(dir, next);
      renderRoomAgentMenu();
    });
    box.appendChild(row);
  }
}

// The little dropdown both pickers below are built from: parked beside whatever was
// clicked, dismissed by the next click anywhere. `anchor` may be an element or a plain
// rect — a rect, because a row can be asked to anchor a picker after the menu holding it
// has already been torn down, and by then its own rect is all zeros.
function openPicker(anchor) {
  document.querySelectorAll('.project-picker').forEach((el) => el.remove());

  const el = document.createElement('div');
  el.className = 'project-picker';
  const rect = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
  el.style.top = `${rect.top}px`;
  el.style.left = `${Math.min(rect.right + 4, window.innerWidth - 240)}px`;

  // The row's own rect is handed to the callback before the picker goes away, which is
  // what lets one picker anchor the next one to the exact row that opened it.
  const addRow = (text, onPick) => {
    const row = document.createElement('div');
    row.className = 'menu-item';
    row.textContent = text;
    row.addEventListener('click', () => {
      const rowRect = row.getBoundingClientRect();
      el.remove();
      onPick(rowRect);
    });
    el.appendChild(row);
  };

  document.body.appendChild(el);
  // Deferred by a tick, or the very click that opened this picker would close it again.
  setTimeout(() => {
    window.addEventListener('click', function closeOnce() {
      el.remove();
      window.removeEventListener('click', closeOnce);
    }, { once: true });
  }, 0);

  return { el, addRow };
}

// Small dropdown offering "New / Continue last / Choose session…" for agents that
// support resuming a previous CLI session (K-decision: session recall, see PROJECT.md §3.6).
// `opts` is forwarded to startAgentPanel so the project-launch path can pin the panel to a
// folder explicitly instead of leaning on openProject as an ambient default.
function showSessionModePicker(anchor, agent, opts = {}) {
  const { addRow } = openPicker(anchor);
  const addItem = (text, command) => addRow(text, () => startAgentPanel(agent, command, opts));

  addItem(t.sessionNew, agent.command);
  if (agent.continueCommand) addItem(t.sessionContinue, agent.continueCommand);
  if (agent.resumeCommand) addItem(t.sessionResume, agent.resumeCommand);
}

// Choosing a project now offers to start something in it. Adding a folder and then
// silently changing nothing but the default cwd was the whole complaint: "otherwise why
// add the path at all" (Murat, 1 Sep 2026). Reached from both entry points — a freshly
// added project and a click on a saved one — so the two behave the same.
//
// Same two-step shape as the Agents menu, deliberately: agents that can resume drill into
// New / Continue / Choose session…, the rest start straight away. "Just open it" is the way
// out for when the folder really was all that was wanted; by the time this picker is up the
// project is already open, so that row only has to dismiss.
function showAgentLaunchPicker(anchor, project) {
  const { addRow } = openPicker(anchor);
  const opts = { projectDir: project.path };

  availableAgents.forEach((agent) => {
    addRow(t.startAgent(agent.label), (rowRect) => {
      if (agent.continueCommand || agent.resumeCommand) {
        showSessionModePicker(rowRect, agent, opts);
      } else {
        startAgentPanel(agent, agent.command, opts);
      }
    });
  });

  addRow(t.justOpenProject, () => { /* the project is already open — nothing left to do */ });
}

// ---------------- Tasks (Phase 1 of the Task/orchestrator design, K26) ----------------
// A Task is an ordered list of Phases (agent + status), scoped to a project path.
// Deliberately no automation here: a phase is only ever started or advanced by an
// explicit click. Persisted the same debounced-save way workspace.js is (main.js is
// just a snapshot store; the renderer owns the logic).
let tasksSaveTimer = null;

function saveTasksSoon() {
  clearTimeout(tasksSaveTimer);
  tasksSaveTimer = setTimeout(() => window.multicli.tasks.save(tasks), 600);
}

function taskStatusLabel(status) {
  if (status === 'active') return t.taskStatusActive;
  if (status === 'done') return t.taskStatusDone;
  return t.taskStatusPending;
}

function renderTaskDock() {
  taskListEl.innerHTML = '';
  taskDockHint.classList.toggle('hidden', tasks.length > 0);

  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'dock-card';

    const head = document.createElement('div');
    head.className = 'dock-card-head';
    const titleEl = document.createElement('span');
    titleEl.textContent = task.title;
    const removeBtn = document.createElement('span');
    removeBtn.className = 'remove-x';
    removeBtn.title = t.removeTaskTitle;
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteTask(task); });
    head.append(titleEl, removeBtn);
    card.appendChild(head);

    // Which project a phase spawns into isn't a per-phase choice — it's fixed to
    // whatever project was open when the task was created (see startPhase).
    const projectEl = document.createElement('div');
    projectEl.className = 'task-project';
    projectEl.textContent = task.projectPath ? projectBaseName(task.projectPath) : t.noProject;
    card.appendChild(projectEl);

    task.phases.forEach((phase, i) => {
      const row = document.createElement('div');
      row.className = 'task-phase-row';

      const label = document.createElement('span');
      label.textContent = `${i + 1}. ${phase.label} — ${taskStatusLabel(phase.status)}`;
      row.appendChild(label);

      if (phase.status === 'pending' && task.activePhase === i) {
        const btn = document.createElement('button');
        btn.className = 'task-phase-btn';
        btn.textContent = t.startPhaseBtn;
        btn.addEventListener('click', () => startPhase(task, i));
        row.appendChild(btn);
      } else if (phase.status === 'active') {
        const btn = document.createElement('button');
        btn.className = 'task-phase-btn';
        btn.textContent = t.advancePhaseBtn;
        btn.addEventListener('click', () => advancePhase(task, i));
        row.appendChild(btn);
      }

      card.appendChild(row);
    });

    taskListEl.appendChild(card);
  });
}

// Drops the task record only — doesn't touch any panel a phase already spawned (a
// panel is its own surface, independent of the task that started it; see K26).
function deleteTask(task) {
  if (!window.confirm(t.confirmDeleteTask(task.title))) return;
  tasks = tasks.filter((tk) => tk.id !== task.id);
  saveTasksSoon();
  renderTaskDock();
}

// Mirrors a panel's cwd/sessionId onto whichever task phase it's bound to. Advance only
// needs those two values to find the transcript on disk (session:tail), not a live pty —
// but the panel can get closed before Advance is clicked, so the phase keeps its own
// copy instead of reading the (possibly gone) panel at Advance-time. Single sync point,
// called from both startPhase (cwd is already known then) and claimPanelSession (where
// sessionId becomes known, possibly seconds later — see its staggered retries).
function syncPhaseFromPanel(p) {
  if (!p?.key) return;
  for (const task of tasks) {
    const phase = task.phases.find((ph) => ph.panelKey === p.key);
    if (phase) {
      if (p.cwd) phase.cwd = p.cwd;
      if (p.sessionId) phase.sessionId = p.sessionId;
      saveTasksSoon();
      return;
    }
  }
}

// Starts phase i's panel. If a previous phase left output behind, it's written to a
// scratch file and the new panel gets pointed at it with one line — never pasted
// straight into the TUI (a multi-KB paste garbles a terminal input line, see PROJECT.md).
async function startPhase(task, i) {
  const phase = task.phases[i];
  const agent = availableAgents.find((a) => a.id === phase.agentId);
  if (!agent) return;
  const prevHandoff = task.phases[i - 1]?.handoff;

  const id = await startAgentPanel(agent, agent.command, { projectDir: task.projectPath });
  const p = panels.get(id);
  phase.panelKey = p?.key ?? null;
  phase.status = 'active';
  syncPhaseFromPanel(p); // cwd is already resolved by the time startAgentPanel returns
  saveTasksSoon();
  renderTaskDock();

  if (prevHandoff) {
    const file = await window.multicli.tasks.writeHandoff(`${task.id}-${i}`, prevHandoff);
    // Long enough after the launch command (200ms, see startAgentPanel) that this line
    // lands below the agent's own startup banner rather than racing it.
    if (file) setTimeout(() => window.multicli.pty.write(id, `${t.taskHandoffPrompt(file)}\r`), 1500);
  }
}

// The only "automation" Phase 1 has, and it's entirely user-triggered: capture the
// active phase's last turn as its handoff text, mark it done, and point activePhase at
// the next phase — which still needs its own Start click. No exit-code detection, no
// polling (that's Phase 2, deliberately deferred).
async function advancePhase(task, i) {
  const phase = task.phases[i];
  // Prefer a still-open panel (freshest values) but fall back to what was last synced
  // onto the phase — the panel may already be closed, see syncPhaseFromPanel.
  const entry = [...panels.entries()].find(([, pp]) => pp.key === phase.panelKey);
  const [panelId, p] = entry || [];
  if (p) syncPhaseFromPanel(p);
  // The panel's own claim only auto-retries at 3s/8s/20s after spawn (see
  // startAgentPanel) and then gives up — a real conversation with the agent often takes
  // longer than that, so Advance gets one on-demand attempt of its own before failing.
  if (p && !phase.sessionId) {
    await claimPanelSession(panelId);
    syncPhaseFromPanel(p);
  }
  if (!phase.cwd || !phase.sessionId) {
    window.alert(t.advanceNoSession);
    return;
  }
  phase.handoff = await window.multicli.session.tail(phase.agentId, phase.cwd, phase.sessionId, 1);
  phase.status = 'done';
  task.activePhase = i + 1 < task.phases.length ? i + 1 : -1;
  saveTasksSoon();
  renderTaskDock();
}

// Chained the same way showSessionModePicker/showAgentLaunchPicker are: picking a row
// re-anchors the next picker to that row's own rect, so "add another phase" just means
// calling this again.
function showAddPhasePicker(anchor, task) {
  const { addRow } = openPicker(anchor);
  availableAgents.forEach((agent) => {
    addRow(t.addPhaseAgent(agent.label), (rowRect) => {
      // Pre-filled with the agent's own name so Enter alone still works (matches the
      // old one-click behavior); typing over it gives the phase a real purpose
      // ("Plan"/"Review"/…) instead of just repeating which agent runs it.
      showTextPrompt(rowRect, t.phaseLabelPrompt, (label) => {
        task.phases.push({
          agentId: agent.id, label, status: 'pending',
          panelKey: null, cwd: null, sessionId: null, handoff: null,
        });
        saveTasksSoon();
        renderTaskDock();
        showAddPhasePicker(rowRect, task);
      }, agent.label);
    });
  });
  addRow(t.donePhases, () => { /* phases were already added incrementally above */ });
}

// A tiny floating text-input box, `.project-picker`-styled like every other picker here.
// Not window.prompt(): Electron's renderer doesn't implement it at all (it throws
// "prompt() is not supported." — confirmed against this exact installed Electron
// version), which is what made the New Task button look like it did nothing.
function showTextPrompt(anchor, placeholder, onSubmit, defaultValue = '') {
  document.querySelectorAll('.project-picker').forEach((el) => el.remove());

  const el = document.createElement('div');
  el.className = 'project-picker task-prompt';
  const rect = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
  el.style.top = `${rect.top}px`;
  el.style.left = `${Math.min(rect.right + 4, window.innerWidth - 240)}px`;
  // Clicks inside the box (typing, hitting the buttons) must not reach the window-level
  // dismiss listener below, or focusing the input would instantly close the picker.
  el.addEventListener('click', (e) => e.stopPropagation());

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-prompt-input';
  input.placeholder = placeholder;
  input.value = defaultValue;
  el.appendChild(input);

  const actions = document.createElement('div');
  actions.className = 'task-prompt-actions';
  const okBtn = document.createElement('button');
  okBtn.className = 'task-phase-btn';
  okBtn.textContent = t.okBtn;
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'task-phase-btn';
  cancelBtn.textContent = t.cancelBtn;
  actions.append(okBtn, cancelBtn);
  el.appendChild(actions);

  document.body.appendChild(el);
  setTimeout(() => { input.focus(); input.select(); }, 0);

  const submit = () => { const v = input.value.trim(); el.remove(); if (v) onSubmit(v); };
  okBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', () => el.remove());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') el.remove();
  });

  setTimeout(() => {
    window.addEventListener('click', function closeOnce() {
      el.remove();
      window.removeEventListener('click', closeOnce);
    }, { once: true });
  }, 0);
}

function showNewTaskPicker(anchor) {
  showTextPrompt(anchor, t.newTaskTitlePrompt, (title) => {
    const task = {
      id: `task-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      projectPath: openProject?.path ?? null,
      title, activePhase: 0, createdAt: Date.now(), phases: [],
    };
    tasks.push(task);
    saveTasksSoon();
    renderTaskDock();
    showAddPhasePicker(anchor, task);
  });
}

document.getElementById('task-new-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  showNewTaskPicker(e.currentTarget);
});

// ---------------- Boot ----------------

// Brings back the previous window: view mode, canvas pan/zoom, and every panel that
// was open — each one relaunched with its agent's continue flag where there is one
// (`claude -c`, `codex resume --last`, see K12), so the CLI picks up its own
// conversation too rather than just reopening an empty shell in the right folder.
// Agents without a continue flag (gemini/qwen/opencode) start fresh, and their
// previous output is still replayed as dimmed history (K16).
// How to relaunch a restored panel, in descending order of confidence:
//   1. its own claimed session      -> `claude -r <id>`   (exact)
//   2. sole panel for that folder   -> `claude -c`        (unambiguous: only one candidate)
//   3. anything else                -> `claude`           (fresh)
//
// Case 3 exists because `-c` means "continue this *folder's* latest conversation", so
// firing it from several panels rooted in the same folder drops them all into one session
// — the bug Murat hit on the first real restore (29 Aug 2026). Starting fresh loses the
// thread, but landing in someone else's thread is worse, and the dimmed scrollback replay
// still shows what the panel was doing. `siblings` is how many restored panels share this
// panel's (agent, folder) pair.
//
// `distrusted` says the panel *had* an id and session:verify rejected it. That also rules
// out case 2, which would otherwise quietly undo the whole check: `-c` means "continue this
// folder's latest conversation", and the reason the id was rejected is that we can't tell
// whose conversations this folder holds. Falling through to `-c` there is how a panel would
// land in the user's own PowerShell session anyway (31 Aug 2026).
function restoreCommandFor(agent, sessionId, siblings, { distrusted = false } = {}) {
  if (sessionId && agent.resumeCommand) return `${agent.resumeCommand} ${sessionId}`;
  if (distrusted) return agent.command;
  if (siblings === 1 && agent.continueCommand) return agent.continueCommand;
  return agent.command;
}

async function restoreWorkspace(ws) {
  if (!ws) return;
  if (['grid', 'canvas', 'board'].includes(ws.viewMode)) viewMode = ws.viewMode;
  restoreOnStart = ws.restoreOnStart !== false;
  showShortcutBar = ws.showShortcutBar !== false; // absent in older saves = on
  showLimitDock = ws.showLimitDock !== false;     // same
  showTaskDock = ws.showTaskDock !== false;       // same
  applyShortcutBarVisibility();
  applyLimitDockVisibility();
  applyTaskDockVisibility();
  if (ws.canvas) {
    canvasView.x = Number.isFinite(ws.canvas.x) ? ws.canvas.x : canvasView.x;
    canvasView.y = Number.isFinite(ws.canvas.y) ? ws.canvas.y : canvasView.y;
    canvasView.z = Math.min(CANVAS_MAX_Z, Math.max(CANVAS_MIN_Z, ws.canvas.z || 1));
  }
  if (!restoreOnStart || !Array.isArray(ws.panels)) return;

  // Anything attachLivePanels() (called just before this, see init()) already brought
  // in — a devtools reload while panels were alive, or a remote tab attaching to an
  // already-running host — must NOT also be spawned here, or it'd get a second, fresh
  // pty duplicating the one that's already running under that `key` (K22).
  const attachedKeys = new Set([...panels.values()].map((p) => p.key));

  for (const rec of ws.panels) {
    if (rec.key && attachedKeys.has(rec.key)) continue;
    const agent = availableAgents.find((a) => a.id === rec.agentId);
    if (!agent) continue; // agent was removed from agents.json since the last run
    const siblings = ws.panels.filter(
      (o) => o.agentId === rec.agentId && (o.projectDir ?? null) === (rec.projectDir ?? null),
    ).length;
    // Never resume on the record's say-so — re-check it against the file on disk first.
    // A record that doesn't survive this comes back null and the panel starts clean,
    // which is the whole point: a fresh start costs a thread, resuming into a stranger's
    // conversation costs the stranger's (31 Aug 2026).
    let sessionId = null;
    try {
      sessionId = await window.multicli.session.verify(
        rec.agentId, rec.projectDir ?? null, rec.sessionId || null, rec.sessionSince || null,
      );
    } catch { /* treat an unreachable check as "can't vouch for it" */ }
    const distrusted = !!rec.sessionId && !sessionId;
    await startAgentPanel(agent, restoreCommandFor(agent, sessionId, siblings, { distrusted }), {
      key: rec.key,
      projectDir: rec.projectDir ?? null,
      sessionId,
      sessionSince: sessionId ? rec.sessionSince : null,
      geom: rec.geom || null,
      restore: true,
    });
  }

  const first = panels.keys().next().value;
  if (first) setActive(first);
}

// Attach to whatever's already running (K22) instead of spawning fresh copies — used by
// the host itself (fixes a latent devtools-hot-reload bug: reloading used to spawn
// brand-new duplicate ptys right on top of the still-running old ones) and by any
// remote tab connecting to an already-running desktop session. Reuses buildPanel()'s
// DOM/xterm wiring but skips pty.spawn entirely — the pty already exists in main.js,
// this just wires a fresh xterm to receive its future output (pty:data is broadcast to
// every attached viewer, see main.js's broadcast()).
async function attachLivePanels() {
  const live = await window.multicli.panels.listLive();
  for (const meta of live) {
    if (panels.has(meta.id)) continue;
    const agent = availableAgents.find((a) => a.id === meta.agentId);
    if (!agent) continue;
    buildPanel(meta.id, agent, meta.projectDir ?? null, meta.key);
    const p = panels.get(meta.id);
    p.cwd = meta.cwd ?? null;
    p.sessionId = meta.sessionId ?? null;
    p.sessionSince = meta.sessionSince ?? null;
    if (meta.geom) p.geom = { ...meta.geom };
    // Best-effort catch-up only — as fresh as the last debounced scrollback save, not a
    // truly live tail of everything since the pty started. Good enough: it's the same
    // trade-off K16's restore already makes.
    await replayScrollback(p);
  }
  if (live.length) { renderView(); fitAllPanels(); }
}

(async function init() {
  applyStaticI18n();
  agentColors = await window.multicli.settings.getAgentColors();

  defaultBaseDir = await window.multicli.settings.getDefaultBaseDir();
  if (!defaultBaseDir) {
    // First run: ask once where panels with no assigned project should start from.
    // If cancelled, this is silently skipped — main.js already falls back to
    // USERPROFILE.
    defaultBaseDir = await window.multicli.settings.setDefaultBaseDir();
  }
  refreshDefaultBaseItem();

  savedProjects = await window.multicli.projects.list();
  const openPath = await window.multicli.projects.getOpen();
  const openRecord = openPath ? savedProjects.find((p) => p.path === openPath) : null;
  openProject = openRecord || null;
  projectLabel.textContent = openProject ? t.projectLabel(openProject.name) : t.projectNone;
  projectLabel.title = openProject?.path ?? '';
  renderFileMenu();

  availableAgents = await window.multicli.agents.list();
  buildAgentMenu(availableAgents);
  buildAgentColorMenu(availableAgents);

  tasks = await window.multicli.tasks.get();
  renderTaskDock();

  // Attach to whatever's already running before ever considering the on-disk snapshot
  // (K22) — both the host and a remote viewer do this; only the host additionally falls
  // back to restoreWorkspace()'s spawn-from-disk path below, and only for panels that
  // attach didn't already cover, so this is safe on every kind of launch (cold start,
  // devtools reload, remote tab joining a live host).
  await attachLivePanels();
  if (!window.__MULTICLI_REMOTE__) {
    await restoreWorkspace(await window.multicli.workspace.get());
  }
  if (!activePanelId) {
    const first = panels.keys().next().value;
    if (first) setActive(first);
  }
  refreshViewMenu();
  renderView(); // shows the empty-state message (no panels) or lays out restored/attached ones

  refreshQuotas();
  setInterval(refreshQuotas, 45000); // passive scan, makes no network requests — fine to run often
  // Faster than the dock's 45s: a panel badge is one file read, and it's the number
  // you're actually watching while an agent works.
  setInterval(refreshAllPanelTokens, 15000);
})();

// ---- Tabs and Agent Room (the room itself lives in room.js on the main side) ----
// The Agent Room tab takes the main area. Workspace panels are hidden, not unmounted,
// so running sessions survive a tab switch the same way a view-mode switch keeps them.
const ROOM_NAMES = { user: 'You', claude: 'Claude', gemini: 'Gemini', codex: 'Codex', qwen: 'Qwen', opencode: 'OpenCode' };
const roomEl = document.getElementById('agent-room');
const roomLogEl = document.getElementById('room-log');
const roomForm = document.getElementById('room-form');
const roomInput = document.getElementById('room-input');
const roomStatus = document.getElementById('room-status');
let roomLog = { messages: [] };
let roomBusy = false;
let roomPending = 0; // posts not yet resolved; the round's own post is the last one to finish
let roomThinking = null; // the agent whose turn is running right now, or null
let roomReplyTo = null; // id of the message the next send answers, or null
const ROOM_FOLD_LINES = 15; // replies longer than this start folded
// An image path inside the project's Otomatik Media folder, Windows or POSIX separators.
const ROOM_MEDIA_RE = /[^\s"'`]*Otomatik Media[\\/][^\s"'`]+?\.(?:png|jpe?g|gif|webp|bmp)/gi;
// A picture path outside the project's Otomatik Media folder, as typed or pasted as text.
const ROOM_EXTERNAL_IMAGE_RE = /[A-Za-z]:[\\/][^\s"'`]+?\.(?:png|jpe?g|gif|webp|bmp)\b/gi;
const roomMediaCache = new Map(); // path -> promise of its data URL, so redraws don't reread the file

function loadRoomMedia(img, p) {
  const dir = openProject?.path ?? null;
  if (!dir) return;
  if (!roomMediaCache.has(p)) roomMediaCache.set(p, window.multicli.room.readMedia(dir, p));
  roomMediaCache.get(p).then((url) => {
    if (url) img.src = url;
    else img.alt = `${p} (not found)`;
  });
}
const roomExpanded = new Set(); // ids of long replies the user opened
const roomReplyBar = document.getElementById('room-reply');
const roomReplyText = document.getElementById('room-reply-text');

function setRoomReply(m) {
  roomReplyTo = m.id;
  roomReplyText.textContent = `↪ ${ROOM_NAMES[m.from] || m.from}: ${m.text.slice(0, 80)}`;
  roomReplyBar.hidden = false;
  if (m.from !== 'user') roomInput.value = `@${m.from} `; // the agent it names is the one that answers
  roomInput.focus();
}

function clearRoomReply() {
  roomReplyTo = null;
  roomReplyBar.hidden = true;
}

document.getElementById('room-reply-clear').addEventListener('click', clearRoomReply);

// Ctrl+V with a picture on the clipboard: it is saved into the project and its path goes in the box.
// Listens on the window while the room is on screen, so it works even when focus is on the log
// rather than the input box. Terminals are hidden while the room is shown, so nothing else gets it.
// The picture comes from the paste event's own clipboard data first (works for any screenshot tool),
// and from Electron's clipboard reader as a fallback. Plain text falls through as usual.
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

window.addEventListener('paste', async (e) => {
  const dir = openProject?.path ?? null;
  if (roomEl.hidden || !dir) return;
  const data = e.clipboardData;
  const blob = [...(data?.files || []), ...[...(data?.items || [])].map((i) => i.getAsFile())]
    .find((f) => f?.type.startsWith('image/'));
  // Copied as text: a path to an image file (Explorer, or the saved Snipping Tool shot).
  const path = (data?.getData('text/plain') || '').trim().replace(/^"(.*)"$/, '$1');
  const isImagePath = /\.(png|jpe?g|gif|webp|bmp)$/i.test(path);
  if (!blob && !isImagePath && !window.multicli.clipboard.hasImage()) return; // plain text as usual
  e.preventDefault();
  let file = null;
  if (blob) file = await window.multicli.room.saveImageData(dir, await blobToBase64(blob));
  else if (isImagePath) file = await window.multicli.room.importImage(dir, path);
  else file = await window.multicli.room.saveImage(dir);
  roomStatus.textContent = file ? `Image saved: ${file}` : 'Image could not be saved.';
  if (file) insertRoomPath(file);
});

// The 📎 button: the same copy into Otomatik Media, from a file picked on disk.
// The picture is attached as a thumbnail above the box, not typed into it; the path is only
// added to the message text when it is sent.
let roomAttachments = [];
const roomImportsInFlight = new Set(); // paths being copied right now, so one paste isn't handled twice

// Whatever way a picture path reaches the box (paste, drop, typing), it is copied into the
// project and shown as an attachment instead of staying as text.
roomInput.addEventListener('input', async () => {
  const dir = openProject?.path ?? null;
  if (!dir) return;
  for (const src of roomInput.value.match(ROOM_EXTERNAL_IMAGE_RE) || []) {
    if (/Otomatik Media/i.test(src) || roomImportsInFlight.has(src)) continue;
    roomImportsInFlight.add(src);
    const copied = await window.multicli.room.importImage(dir, src);
    roomImportsInFlight.delete(src);
    if (!copied) continue;
    roomInput.value = roomInput.value.replace(src, '').replace(/\s{2,}/g, ' ').trimStart();
    insertRoomPath(copied);
  }
});

function insertRoomPath(file) {
  roomAttachments.push(file);
  renderRoomAttachments();
}

function renderRoomAttachments() {
  const box = document.getElementById('room-attachments');
  box.replaceChildren();
  box.hidden = roomAttachments.length === 0;
  for (const p of roomAttachments) {
    const chip = document.createElement('div');
    chip.className = 'room-attach';
    const img = document.createElement('img');
    img.alt = p;
    loadRoomMedia(img, p);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      roomAttachments = roomAttachments.filter((a) => a !== p);
      renderRoomAttachments();
    });
    chip.append(img, remove);
    box.appendChild(chip);
  }
}

document.getElementById('room-attach').addEventListener('click', async () => {
  const dir = openProject?.path ?? null;
  if (!dir) return;
  const file = await window.multicli.room.pickImage(dir);
  if (!file) return;
  roomStatus.textContent = `Image added: ${file}`;
  insertRoomPath(file);
});

function setTab(name) {
  for (const btn of document.querySelectorAll('#tab-bar .tab')) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  }
  panelGrid.hidden = name !== 'workspace';
  roomEl.hidden = name !== 'room';
  document.getElementById('room-cwd').hidden = name !== 'room';
  document.getElementById('room-agent-chips').hidden = name !== 'room';
  if (name === 'room') renderRoomChips();
  if (name === 'room') loadRoom();
}

// Each project has its own room, keyed by the project it is opened on.
async function loadRoom() {
  const dir = openProject?.path ?? null;
  roomLog = (dir && (await window.multicli.room.get(dir))) || { messages: [] };
  renderRoom();
  loadRoomFiles();
}

let lastRoomKey = '';
function renderRoom() {
  const dir = openProject?.path ?? null;
  // Rebuilding the log replaces the buttons, so a click that lands during a rebuild is lost.
  // Skip the rebuild when nothing the log shows has changed.
  const key = [dir, roomLog.cwd, roomLog.messages.length, roomLog.messages.at(-1)?.id, roomThinking,
    roomExpanded.size, roomReplyTo, roomBusy, roomPending].join('|');
  if (key === lastRoomKey) return;
  lastRoomKey = key;
  // Say which project this room is for, in the tab itself and above the log.
  const roomTab = document.getElementById('tab-room');
  document.getElementById('tab-room-label').textContent = dir ? `Agent Room · ${openProject.name}` : 'Agent Room';
  roomTab.title = dir ?? 'No project open';
  const cwdBtn = document.getElementById('room-cwd');
  cwdBtn.textContent = `📁 ${roomLog.cwd || dir || 'No folder'}`;
  cwdBtn.disabled = !dir;
  roomLogEl.replaceChildren();
  roomInput.disabled = !dir;
  roomStatus.textContent = !dir
    ? 'Open a project first (File → Add Project…) — each project has its own room.'
    : roomBusy ? `Agents are taking turns in ${openProject.name}…` : `Room for ${openProject.name} (${dir})`;
  for (const m of roomLog.messages) {
    const card = document.createElement('div');
    card.className = `room-msg room-${m.from}${m.error ? ' room-error' : ''}`;
    const who = document.createElement('div');
    who.className = 'room-who';
    who.textContent = ROOM_NAMES[m.from] || m.from;
    const copy = document.createElement('button');
    copy.className = 'room-copy';
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      window.multicli.clipboard.writeText(m.text);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
    });
    who.appendChild(copy);
    const reply = document.createElement('button');
    reply.className = 'room-copy';
    reply.type = 'button';
    reply.textContent = 'Reply';
    reply.addEventListener('click', () => setRoomReply(m));
    who.appendChild(reply);
    const body = document.createElement('div');
    body.className = 'room-text';
    body.textContent = m.text;
    // Long replies start folded to ROOM_FOLD_LINES; the expanded set survives the redraws of a live turn.
    const long = m.text.split('\n').length > ROOM_FOLD_LINES;
    const folded = long && !roomExpanded.has(m.id);
    body.classList.toggle('collapsed', folded);
    let foldBtn = null;
    if (long) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'room-fold';
      toggle.textContent = folded ? t.roomExpand : t.roomCollapse;
      toggle.addEventListener('click', () => {
        if (roomExpanded.has(m.id)) roomExpanded.delete(m.id);
        else roomExpanded.add(m.id);
        renderRoom();
      });
      foldBtn = toggle;
    }
    const parent = m.replyTo && roomLog.messages.find((x) => x.id === m.replyTo);
    if (parent) {
      const quote = document.createElement('div');
      quote.className = 'room-quote';
      quote.textContent = `↪ ${ROOM_NAMES[parent.from] || parent.from}: ${parent.text.slice(0, 80)}`;
      card.appendChild(quote);
    }
    card.append(who, body);
    // Pictures saved into Otomatik Media show as thumbnails under the message; the text keeps the path.
    for (const p of new Set(m.text.match(ROOM_MEDIA_RE) || [])) {
      const img = document.createElement('img');
      img.className = 'room-media';
      img.alt = p;
      card.appendChild(img);
      loadRoomMedia(img, p);
    }
    if (foldBtn) card.appendChild(foldBtn);
    roomLogEl.appendChild(card);
  }
  if (roomThinking) {
    const card = document.createElement('div');
    card.className = `room-msg room-${roomThinking} room-thinking`;
    card.textContent = `${ROOM_NAMES[roomThinking]} is thinking…`;
    roomLogEl.appendChild(card);
  }
  roomLogEl.scrollTop = roomLogEl.scrollHeight;
}

// The main process sends the whole room after every change, so new replies and the
// thinking bubble show up as they happen instead of all at once when the round ends.
window.multicli.room.onUpdate(({ log, thinking }) => {
  roomLog = log;
  roomThinking = thinking;
  renderRoom();
  if (!thinking) loadRoomFiles(); // a turn step finished: the agents may have written files
});

// ---- Agent Room file viewer: the working folder's files, and a preview of the one picked ----
let roomOpenFile = null;

async function loadRoomFiles() {
  const dir = openProject?.path ?? null;
  const listEl = document.getElementById('room-file-list');
  listEl.replaceChildren();
  if (!dir) return;
  const data = await window.multicli.room.files(dir);
  if (!data?.files.length) {
    const none = document.createElement('div');
    none.className = 'room-file';
    none.textContent = '—';
    listEl.appendChild(none);
    return;
  }
  // "new" = changed since the user's last message, so what the agents just wrote stands out.
  const users = roomLog.messages.filter((m) => m.from === 'user');
  const since = users.length ? users[users.length - 1].at : 0;
  for (const f of data.files) {
    const row = document.createElement('div');
    row.className = `room-file${f.path === roomOpenFile ? ' active' : ''}`;
    const name = document.createElement('span');
    name.className = 'path';
    name.textContent = f.path;
    row.appendChild(name);
    if (f.mtime >= since) {
      const badge = document.createElement('span');
      badge.className = 'new';
      badge.textContent = 'new';
      row.appendChild(badge);
    }
    row.addEventListener('click', () => openRoomFile(dir, f.path));
    listEl.appendChild(row);
  }
}

async function openRoomFile(dir, rel) {
  roomOpenFile = rel;
  const preview = document.getElementById('room-preview');
  preview.replaceChildren();
  const note = (text) => {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = text;
    preview.appendChild(p);
  };
  const res = await window.multicli.room.readFile(dir, rel);
  if (!res) note('Cannot open this file.');
  else if (res.kind === 'image') {
    const img = document.createElement('img');
    img.src = res.dataUrl;
    img.alt = rel;
    preview.appendChild(img);
  } else if (res.kind === 'text') {
    const pre = document.createElement('pre');
    pre.textContent = res.text;
    preview.appendChild(pre);
    if (res.truncated) note('Showing the first 300 KB.');
  } else if (res.kind === 'binary') note(`Binary file (${res.size} bytes), no preview.`);
  else note(res.message);
  document.querySelectorAll('.room-file').forEach((row) => {
    row.classList.toggle('active', row.querySelector('.path')?.textContent === rel);
  });
}

document.getElementById('room-files-refresh').addEventListener('click', loadRoomFiles);

// Drag the divider to resize the file panel; the chat takes whatever is left.
document.getElementById('room-splitter').addEventListener('pointerdown', (e) => {
  const splitter = e.currentTarget;
  splitter.setPointerCapture(e.pointerId);
  const onMove = (ev) => {
    const rect = roomEl.getBoundingClientRect();
    const width = Math.min(Math.max(rect.right - ev.clientX, 200), rect.width - 300);
    document.getElementById('room-files').style.width = `${width}px`;
  };
  const onUp = () => {
    splitter.removeEventListener('pointermove', onMove);
    splitter.removeEventListener('pointerup', onUp);
  };
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', onUp);
});

// Same picker as a panel's 📁: saved projects, Browse, or back to the project folder (null).
document.getElementById('room-cwd').addEventListener('click', (e) => {
  const dir = openProject?.path ?? null;
  if (!dir) return;
  showProjectPicker(e.currentTarget, async (picked) => {
    roomLog = (await window.multicli.room.setCwd(dir, picked)) || roomLog;
    renderRoom();
  });
});

roomForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dir = openProject?.path ?? null;
  if (!dir) return;
  // Any picture path typed or pasted as text (e.g. a Snipping Tool file outside the project) is copied
  // into Otomatik Media first, so the agents always get a path inside the project.
  let typed = roomInput.value.trim();
  for (const src of typed.match(ROOM_EXTERNAL_IMAGE_RE) || []) {
    if (/Otomatik Media/i.test(src)) continue; // already in the project
    const copied = await window.multicli.room.importImage(dir, src);
    if (copied) typed = typed.replace(src, copied);
  }
  // Attached pictures go out as their paths, after the typed text.
  const text = [typed, ...roomAttachments].filter(Boolean).join('\n');
  if (!text) return;
  roomPending++;
  roomBusy = true;
  roomInput.value = '';
  roomAttachments = [];
  renderRoomAttachments();
  const replyTo = roomReplyTo;
  clearRoomReply();
  // Show the user's line at once; the room.post reply replaces this log when the turn ends.
  roomLog.messages.push({ from: 'user', text, at: Date.now(), replyTo });
  renderRoom();
  try {
    roomLog = (await window.multicli.room.post(dir, text, replyTo)) || roomLog;
  } catch (err) {
    roomStatus.textContent = `Room failed: ${err.message}`;
  } finally {
    // A message sent during a round resolves at once; the round's own message is the one that ends busy.
    roomPending--;
    roomBusy = roomPending > 0;
    if (!roomBusy) roomThinking = null;
    renderRoom();
  }
});

for (const btn of document.querySelectorAll('#tab-bar .tab')) {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
}
// Closing hides the tab (the room keeps its log); the Agents menu brings it back.
document.getElementById('tab-room-close').addEventListener('click', (e) => {
  e.stopPropagation(); // the click is on the tab button too, which would reopen the room
  document.getElementById('tab-room').hidden = true;
  if (!roomEl.hidden) setTab('workspace');
});
