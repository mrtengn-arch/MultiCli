// FILE: test/tasks.test.js
// PURPOSE: Phase 1 of the Task/orchestrator design (K26, PROJECT.md §3.6) — pins down
//          that tasks:get/tasks:save round-trip through the same loadConfig/saveConfig
//          file workspace:get/save already use, and that tasks:writeHandoff only ever
//          writes inside its own folder under a safe key (same rule as scrollbackFile).
// RUN: npm test  (from the repo root)
const fs = require('fs');
const path = require('path');
const realOs = require('os');

const FIXTURE = fs.mkdtempSync(path.join(realOs.tmpdir(), 'multicli-tasks-'));
// Shadows what the extracted functions close over: configPath()/taskHandoffDir() both
// go through Electron's `app`, which doesn't exist outside a running Electron process.
const app = { getPath: () => FIXTURE };

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const grab = (re) => src.match(re)[0];
const handlers = {};
const ipcMain = { handle: (name, fn) => { handlers[name] = fn; }, on: (name, fn) => { handlers[name] = fn; } };
eval([
  grab(/function configPath[\s\S]*?\n\}/),
  grab(/function loadConfig[\s\S]*?\n\}/),
  grab(/function saveConfig[\s\S]*?\n\}/),
  grab(/function tasksGet[\s\S]*?\n\}/),
  grab(/function tasksSave[\s\S]*?\nipcMain\.on\('tasks:save', tasksSave\);/),
  grab(/function taskHandoffDir[\s\S]*?\n\}/),
  grab(/function taskHandoffFile[\s\S]*?\n\}/),
  grab(/function taskHandoffWrite[\s\S]*?\nipcMain\.handle\('tasks:writeHandoff', taskHandoffWrite\);/),
].join('\n'));

let fails = 0;
let total = 0;
const check = (label, got, want) => {
  total++;
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) { fails++; console.log(`FAIL  ${label}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
};

check('no config yet -> empty task list', handlers['tasks:get'](), []);

const sample = [{
  id: 'task-abc', projectPath: 'C:\\proj', title: 'Add feature', activePhase: 0, createdAt: 1,
  phases: [{ agentId: 'claude', label: 'Claude', status: 'pending', panelKey: null, sessionId: null, handoff: null }],
}];
handlers['tasks:save'](null, sample);
check('saved tasks round-trip back out', handlers['tasks:get'](), sample);

// workspace:save's own sibling test (session-claim/session-tail suites) never checks this,
// so it's pinned here: writing tasks must not clobber an unrelated cfg key.
const cfgFile = path.join(FIXTURE, 'multicli-config.json');
const raw = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
raw.workspace = { viewMode: 'board' };
fs.writeFileSync(cfgFile, JSON.stringify(raw, null, 2));
handlers['tasks:save'](null, sample);
check('saving tasks preserves an unrelated cfg key (workspace)',
  JSON.parse(fs.readFileSync(cfgFile, 'utf8')).workspace, { viewMode: 'board' });

check('handoff write returns the file path and the text lands on disk', (() => {
  const file = handlers['tasks:writeHandoff'](null, { key: 'task-abc-0', text: 'Step 1 done.' });
  return file && fs.readFileSync(file, 'utf8');
})(), 'Step 1 done.');

check('a key that tries to escape the folder is rejected',
  handlers['tasks:writeHandoff'](null, { key: '../../evil', text: 'x' }), null);

fs.rmSync(FIXTURE, { recursive: true, force: true });

if (fails === 0) {
  console.log(`all ${total} task cases passed`);
} else {
  console.log(`${fails} case(s) failed`);
  process.exit(1);
}
