// FILE: preload.js
// PURPOSE: contextBridge surface exposed to the renderer (contextIsolation stays on —
//          renderer never gets raw Node/ipcRenderer access).

const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('multicli', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  // Electron's clipboard module is synchronous and available directly in the preload
  // context — no IPC round-trip needed, which matters since these are called from
  // inside xterm's synchronous keydown handler (see renderer.js Ctrl+C/Ctrl+V).
  clipboard: {
    readText: () => clipboard.readText(),
    writeText: (text) => clipboard.writeText(text),
    hasImage: () => !clipboard.readImage().isEmpty(),
  },
  settings: {
    getDefaultBaseDir: () => ipcRenderer.invoke('settings:getDefaultBaseDir'),
    setDefaultBaseDir: () => ipcRenderer.invoke('settings:setDefaultBaseDir'),
    getAgentColors: () => ipcRenderer.invoke('settings:getAgentColors'),
    setAgentColor: (agentId, colorKey) => ipcRenderer.invoke('settings:setAgentColor', { agentId, colorKey }),
  },
  projects: {
    add: () => ipcRenderer.invoke('projects:add'),
    browse: () => ipcRenderer.invoke('projects:browse'),
    list: () => ipcRenderer.invoke('projects:list'),
    remove: (dir) => ipcRenderer.invoke('projects:remove', dir),
    getOpen: () => ipcRenderer.invoke('projects:getOpen'),
    setOpen: (dir) => ipcRenderer.invoke('projects:setOpen', dir),
  },
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
  },
  room: {
    get: (projectDir) => ipcRenderer.invoke('room:get', projectDir),
    post: (projectDir, text, replyTo) => ipcRenderer.invoke('room:post', { projectDir, text, replyTo }),
    setCwd: (projectDir, cwd) => ipcRenderer.invoke('room:setCwd', { projectDir, cwd }),
    agents: (projectDir) => ipcRenderer.invoke('room:agents', projectDir),
    files: (projectDir) => ipcRenderer.invoke('room:files', projectDir),
    saveImage: (projectDir) => ipcRenderer.invoke('room:saveImage', projectDir),
    saveImageData: (projectDir, base64) => ipcRenderer.invoke('room:saveImageData', { projectDir, base64 }),
    importImage: (projectDir, src) => ipcRenderer.invoke('room:importImage', { projectDir, src }),
    readMedia: (projectDir, absPath) => ipcRenderer.invoke('room:readMedia', { projectDir, absPath }),
    pickImage: (projectDir) => ipcRenderer.invoke('room:pickImage', projectDir),
    readFile: (projectDir, relPath) => ipcRenderer.invoke('room:readFile', { projectDir, relPath }),
    setAgents: (projectDir, agents) => ipcRenderer.invoke('room:setAgents', { projectDir, agents }),
    onUpdate: (cb) => ipcRenderer.on('room:update', (_event, payload) => cb(payload)),
  },
  quotas: {
    get: () => ipcRenderer.invoke('quotas:get'),
    // Per-panel total for the panel's own session transcript.
    getSession: (agentId, cwd, sessionId) =>
      ipcRenderer.invoke('quotas:getSession', { agentId, cwd, sessionId }),
  },
  session: {
    // Find the transcript file this panel just started writing. `taken` lists the ids
    // sibling panels already hold, so two panels on one folder don't claim the same one.
    claim: (agentId, cwd, sinceMs, taken, current) =>
      ipcRenderer.invoke('session:claim', { agentId, cwd, sinceMs, taken, current }),
    // Re-check a saved id before resuming into it. Returns the id, or null to start clean.
    verify: (agentId, cwd, sessionId, since) =>
      ipcRenderer.invoke('session:verify', { agentId, cwd, sessionId, since }),
    // Last N assistant turns of a claimed transcript, plain text — the Task handoff
    // payload (PROJECT.md §3.6). null for agents with no readable transcript.
    tail: (agentId, cwd, sessionId, turns) =>
      ipcRenderer.invoke('session:tail', { agentId, cwd, sessionId, turns }),
  },
  // Workspace = which panels were open + view mode + canvas geometry (K15).
  // `save` is fire-and-forget on purpose: it's called from the window-close flush,
  // where an async round-trip would race the teardown.
  workspace: {
    get: () => ipcRenderer.invoke('workspace:get'),
    save: (ws) => ipcRenderer.send('workspace:save', ws),
    onFlush: (cb) => ipcRenderer.on('workspace:flush', () => cb()),
    flushed: () => ipcRenderer.send('workspace:flushed'),
  },
  // Tasks (Phase 1 of the Task/orchestrator design, K26). Same fire-and-forget `save`
  // reasoning as workspace above — the renderer holds the live copy.
  tasks: {
    get: () => ipcRenderer.invoke('tasks:get'),
    save: (tasks) => ipcRenderer.send('tasks:save', tasks),
    // Writes a phase's output to disk so the next phase's agent can be pointed at it
    // with one line instead of a raw paste. Returns the file's absolute path, or null.
    writeHandoff: (key, text) => ipcRenderer.invoke('tasks:writeHandoff', { key, text }),
  },
  // Terminal history for restored panels (K16).
  scrollback: {
    save: (key, text) => ipcRenderer.send('scrollback:save', { key, text }),
    load: (key) => ipcRenderer.invoke('scrollback:load', key),
    clear: (key) => ipcRenderer.send('scrollback:clear', key),
  },
  notify: {
    attention: (title, body) => ipcRenderer.send('notify:attention', { title, body }),
  },
  pty: {
    spawn: (id, cwd, cols, rows) => ipcRenderer.invoke('pty:spawn', { id, cwd, cols, rows }),
    write: (id, data) => ipcRenderer.send('pty:write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.send('pty:kill', { id }),
    onData: (cb) => ipcRenderer.on('pty:data', (_e, payload) => cb(payload)),
    onExit: (cb) => ipcRenderer.on('pty:exit', (_e, payload) => cb(payload)),
  },
  // Remote access (K22) — host-only (a remote browser tab uses remote-bridge.js's own
  // window.multicli instead of this file entirely, so it never sees these).
  remote: {
    start: () => ipcRenderer.invoke('remote:start'),
    stop: () => ipcRenderer.invoke('remote:stop'),
    status: () => ipcRenderer.invoke('remote:status'),
  },
  // The live-panel registry (K22): who's actually running right now, independent of
  // the on-disk workspace snapshot. `announce`/`closed` are fire-and-forget, same
  // reasoning as workspace:save above.
  panels: {
    listLive: () => ipcRenderer.invoke('panels:listLive'),
    announce: (meta) => ipcRenderer.send('panel:announce', meta),
    closed: (id) => ipcRenderer.send('panel:closed', id),
    onNew: (cb) => ipcRenderer.on('panel:new', (_e, p) => cb(p)),
    onClosed: (cb) => ipcRenderer.on('panel:closed', (_e, id) => cb(id)),
  },
});
