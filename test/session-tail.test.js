// FILE: test/session-tail.test.js
// PURPOSE: Pins down session:tail (§3.6 Phase 0 of the Task/orchestrator design) — the
//          "last N assistant turns as plain text" extraction that a future Task handoff
//          would hand to the next phase's agent. Confirms it reads real transcript shapes
//          (Claude's array-of-blocks message.content, Gemini's plain-string content),
//          skips non-text blocks (thinking/tool_use), and stays within the same
//          claimed-session-only coverage as quotas:getSession — no folder-newest fallback.
// RUN: npm test  (from the repo root)
const fs = require('fs');
const path = require('path');
const realOs = require('os');

const FIXTURE = fs.mkdtempSync(path.join(realOs.tmpdir(), 'multicli-tail-'));
const os = { homedir: () => FIXTURE };

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const grab = (re) => src.match(re)[0];
const handlers = {};
const ipcMain = { handle: (name, fn) => { handlers[name] = fn; } };
eval([
  grab(/function readRecentJsonlLines[\s\S]*?\n\}/),
  grab(/function claudeProjectDirFor[\s\S]*?\n\}/),
  grab(/function sessionDirFor[\s\S]*?\n\}/),
  grab(/function sessionTail[\s\S]*?\nipcMain\.handle\('session:tail', sessionTail\);/),
].join('\n'));

const CWD = path.join(FIXTURE, 'project');
const dir = claudeProjectDirFor(CWD);
fs.mkdirSync(dir, { recursive: true });

// Real shapes, taken from an actual transcript: assistant content is an array of typed
// blocks (thinking/tool_use blocks carry no .text and must be skipped); user turns and
// tool-result turns have no `message.content` array of that shape either.
const claudeTranscript = [
  { type: 'user', timestamp: '2026-09-01T10:00:00.000Z', message: { role: 'user', content: 'plan the thing' } },
  { type: 'assistant', timestamp: '2026-09-01T10:00:01.000Z', message: { content: [{ type: 'thinking', thinking: '...' }] } },
  { type: 'assistant', timestamp: '2026-09-01T10:00:02.000Z', message: { content: [{ type: 'tool_use', name: 'Read' }] } },
  { type: 'assistant', timestamp: '2026-09-01T10:00:03.000Z', message: { content: [{ type: 'text', text: 'Step 1: do X.' }] } },
  { type: 'assistant', timestamp: '2026-09-01T10:00:04.000Z', message: { content: [{ type: 'text', text: 'Step 2: do Y.' }] } },
].map((o) => JSON.stringify(o)).join('\n');
fs.writeFileSync(path.join(dir, 'claude-sess.jsonl'), claudeTranscript);

const geminiDir = path.join(FIXTURE, '.gemini', 'tmp', path.basename(CWD).toLowerCase(), 'chats');
fs.mkdirSync(geminiDir, { recursive: true });
const geminiTranscript = [
  { type: 'user', timestamp: '2026-09-01T10:00:00.000Z', content: 'review the plan' },
  { type: 'gemini', timestamp: '2026-09-01T10:00:01.000Z', content: 'Looks correct, one edge case missing.' },
].map((o) => JSON.stringify(o)).join('\n');
fs.writeFileSync(path.join(geminiDir, 'gemini-sess.jsonl'), geminiTranscript);

const tail = (o) => handlers['session:tail'](null, { agentId: 'claude', cwd: CWD, ...o });
const tailGemini = (o) => handlers['session:tail'](null, { agentId: 'gemini', cwd: CWD, ...o });

let fails = 0;
let total = 0;
const check = (label, got, want) => {
  total++;
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) { fails++; console.log(`FAIL  ${label}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
};

check('claude: last turn only, thinking/tool_use blocks skipped',
  tail({ sessionId: 'claude-sess', turns: 1 }), 'Step 2: do Y.');
check('claude: last 2 turns joined, in order',
  tail({ sessionId: 'claude-sess', turns: 2 }), 'Step 1: do X.\n\n---\n\nStep 2: do Y.');
check('claude: turns beyond what exists just returns what there is',
  tail({ sessionId: 'claude-sess', turns: 99 }), 'Step 1: do X.\n\n---\n\nStep 2: do Y.');
check('gemini: plain string content read directly',
  tailGemini({ sessionId: 'gemini-sess', turns: 1 }), 'Looks correct, one edge case missing.');
check('no session id -> nothing (never guesses the folder’s newest file)',
  tail({ sessionId: null }), null);
check('bogus session id',
  tail({ sessionId: 'no-such-session' }), null);
check('agent with no readable transcript store',
  handlers['session:tail'](null, { agentId: 'qwen', cwd: CWD, sessionId: 'claude-sess' }), null);
check('a session file with only user turns, no assistant text yet',
  (() => {
    fs.writeFileSync(path.join(dir, 'empty-sess.jsonl'),
      JSON.stringify({ type: 'user', timestamp: '2026-09-01T10:00:00.000Z' }));
    return tail({ sessionId: 'empty-sess' });
  })(), null);

fs.rmSync(FIXTURE, { recursive: true, force: true });

if (fails === 0) {
  console.log(`all ${total} session-tail cases passed`);
} else {
  console.log(`${fails} case(s) failed`);
  process.exit(1);
}
