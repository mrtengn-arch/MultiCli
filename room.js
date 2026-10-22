// FILE: room.js
// PURPOSE: Agent Room — agents answer one after another, each reading the whole room
//          so far. Every turn runs one headless CLI (claude -p / gemini -p / codex exec)
//          with the transcript on stdin. The log lives per project, in
//          <project>/.multicli/agent-room.json, so each project gets its own room.

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ORDER = ['claude', 'gemini', 'codex'];
const LABELS = { claude: 'Claude', gemini: 'Gemini', codex: 'Codex', qwen: 'Qwen', opencode: 'OpenCode' };
// ponytail: a hard cap, not a smart stop. Raise it or add a user-facing "continue" when it bites.
const MAX_REPLIES = 6;
const TIMEOUT_MS = 5 * 60 * 1000;
// An agent ends its reply with this when it wants the user to answer. Plain text on purpose: the
// CLIs can't call a tool to say so, and a visible marker is what the user looks for.
const STOP_MARKER = '[[NEEDS_USER]]';

// Prompt goes over stdin, never as an argument: no quoting or injection surface.
// Gemini's -p needs a value; the piped text is appended to it.
const RUNNERS = {
  claude: { cmd: 'claude', args: ['-p'] },
  // Quoted for the shell: shell:true on Windows joins args unquoted, so the spaces would
  // split this into positional words, which gemini rejects alongside -p.
  gemini: { cmd: 'gemini', args: ['-p', '"Follow the piped text exactly and reply to it."'] },
  codex: { cmd: 'codex', args: ['exec', '--skip-git-repo-check', '-'] },
  qwen: { cmd: 'qwen', args: ['-p', '"Follow the piped text exactly and reply to it."'] },
  // ponytail: opencode prints a "> build · model" header before the reply; not stripped yet.
  opencode: { cmd: 'opencode', args: ['run'] },
};

// Only agents whose CLI is on this machine can take part. Checked by command name, so the list
// is the same in every system language; the labels are the only text that changes.
function isInstalled(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { windowsHide: true }).status === 0;
}

function installedAgents() {
  return Object.keys(RUNNERS).filter((id) => isInstalled(RUNNERS[id].cmd));
}

// The agents this room uses: the ones picked for it (or the default trio), minus any not installed.
function activeAgents(log) {
  return (log.agents || ORDER).filter((id) => RUNNERS[id] && isInstalled(RUNNERS[id].cmd));
}

// projectDir -> the round in progress, so a message sent mid-round can join its log.
const activeRuns = new Map();

function logPath(projectDir) {
  return path.join(projectDir, '.multicli', 'agent-room.json');
}

// Messages written before ids existed get a stable one from their position, so replies can point at them.
function load(projectDir) {
  let log;
  try {
    log = JSON.parse(fs.readFileSync(logPath(projectDir), 'utf8'));
  } catch {
    log = { messages: [] };
  }
  log.messages.forEach((m, i) => { if (!m.id) m.id = `m${i}`; });
  return log;
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// The JSON is what the app reads back; the markdown copy is the same conversation for people
// (and for an agent that opens the project folder), written alongside it on every save.
function save(projectDir, log) {
  fs.mkdirSync(path.dirname(logPath(projectDir)), { recursive: true });
  fs.writeFileSync(logPath(projectDir), JSON.stringify(log, null, 2));
  const md = log.messages
    .map((m) => `### ${m.from === 'user' ? 'You' : LABELS[m.from] || m.from}\n\n${m.text}`)
    .join('\n\n');
  fs.writeFileSync(path.join(path.dirname(logPath(projectDir)), 'AGENT_ROOM.md'), md + '\n');
}

// Older messages get folded into log.summary (by Gemini, which has the larger context), so each
// turn sends the summary plus the last few messages instead of the whole log. Until a summary
// call succeeds, summarizedCount stays put and the agents keep getting the full transcript.
const KEEP_RECENT = 6;
const SUMMARIZE_BATCH = 6;

async function summarize(projectDir, log) {
  const covered = log.summarizedCount || 0;
  const cut = log.messages.length - KEEP_RECENT;
  if (cut - covered < SUMMARIZE_BATCH) return;
  const older = log.messages.slice(covered, cut)
    .map((m) => `[${LABELS[m.from] || m.from}] ${m.text}`)
    .join('\n\n');
  const prompt = [
    'Summarize this conversation between a user and AI agents in a shared room, so an agent who has not seen it can continue.',
    'Keep decisions, open questions, file names, and what the user asked for. Plain text, under 300 words.',
    '',
    log.summary ? `Earlier summary:\n${log.summary}\n` : '',
    'New messages:',
    older,
  ].join('\n');
  try {
    log.summary = await runAgent('gemini', prompt, log.cwd || projectDir);
    log.summarizedCount = cut;
  } catch {
    // Summary is optional; the room keeps working on the full transcript.
  }
}

function promptFor(agentId, log, quoted) {
  const covered = log.summarizedCount || 0;
  const recent = log.messages
    .slice(covered)
    .map((m) => `[${LABELS[m.from] || m.from}] ${m.text}`)
    .join('\n\n');
  const transcript = log.summary ? `[Earlier conversation, summarized]\n${log.summary}\n\n${recent}` : recent;
  // The message the user replied to is quoted in full, even when it has been summarized away.
  const reply = quoted
    ? `The user is replying to this message from ${LABELS[quoted.from] || 'the user'}; answer it:\n"""\n${quoted.text.slice(0, 2000)}\n"""\n`
    : '';
  return [
    `You are ${LABELS[agentId]} in a shared room where several AI agents work on the same project.`,
    'Read the conversation and reply with your next message only. Build on what the others said; do not repeat them.',
    `If you want the user to answer before going on, end your reply with ${STOP_MARKER}. The other agents still take their turns.`,
    '',
    reply,
    transcript,
  ].join('\n');
}

function runAgent(agentId, prompt, cwd) {
  const { cmd, args } = RUNNERS[agentId];
  return new Promise((resolve, reject) => {
    // shell on Windows: npm installs these as .cmd shims, which spawn can't start directly.
    // cmd and args are fixed strings here, so the shell adds no injection surface.
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32', windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `exited with code ${code}`));
    });
    child.stdin.end(prompt);
  });
}

// Appends the user's message, then lets every agent take its turn: the marker only flags a reply
// for the user, it never stops the round, so each agent's plan is seen. Stops at MAX_REPLIES or
// when an agent fails. The log is saved after every reply, so a crash mid-run keeps what was said.
// "@gemini ..." sends the message to just the agents named, in the order they are named.
// Without a name every active agent answers once, in order. Nobody answers twice for one message.
// A reply to an agent's message goes back to that agent alone.
function planTurns(text, active, target) {
  const named = Object.keys(RUNNERS)
    .map((id) => ({ id, at: text.search(new RegExp(`@${id}\\b`, 'i')) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((m) => m.id);
  if (named.length) return named;
  if (target && RUNNERS[target.from]) return [target.from];
  return [...active];
}

// onUpdate(log, thinking) runs after every change: thinking is the agent whose turn is running,
// or null between turns. The window uses it to show new replies and a "thinking" bubble as they happen.
// A message sent while a round is running joins that round's log instead: every agent reads the
// whole log on its turn, so it gets picked up on the next one.
// replyTo is the id of the message this one answers; the agent sees that message quoted in full.
async function post(projectDir, text, onUpdate = () => {}, replyTo = null) {
  const active = activeRuns.get(projectDir);
  if (active) {
    active.log.messages.push({ id: newId(), from: 'user', text, at: Date.now(), replyTo });
    save(projectDir, active.log);
    active.notify(active.log, active.thinking);
    return active.log;
  }

  const log = load(projectDir);
  const target = replyTo ? log.messages.find((m) => m.id === replyTo) || null : null;
  const run = { log, thinking: null };
  run.notify = (l, thinking) => { run.thinking = thinking; onUpdate(l, thinking); };
  activeRuns.set(projectDir, run);
  try {
    log.messages.push({ id: newId(), from: 'user', text, at: Date.now(), replyTo: target ? target.id : null });
    save(projectDir, log);
    run.notify(log, null);
    await summarize(projectDir, log);
    save(projectDir, log);

    const plan = planTurns(text, activeAgents(log), target);
    for (let turn = 0; turn < Math.min(plan.length, MAX_REPLIES); turn++) {
      const agentId = plan[turn];
      run.notify(log, agentId);
      try {
        const reply = await runAgent(agentId, promptFor(agentId, log, target), log.cwd || projectDir);
        log.messages.push({ id: newId(), from: agentId, text: reply, at: Date.now() });
        save(projectDir, log);
        run.notify(log, null);
      } catch (e) {
        log.messages.push({ id: newId(), from: agentId, text: `(failed: ${e.message})`, at: Date.now(), error: true });
        save(projectDir, log);
        run.notify(log, null); // a failed agent shows its error; the round goes on to the next one
      }
    }
    return log;
  } finally {
    activeRuns.delete(projectDir);
  }
}

// Where the agents run. The room's own log stays in the project; only the working folder moves.
function setCwd(projectDir, cwd) {
  const log = load(projectDir);
  if (cwd) log.cwd = cwd;
  else delete log.cwd;
  save(projectDir, log);
  return log;
}

// Which agents this room uses, picked from the Agents menu. Unknown ids are dropped.
function setAgents(projectDir, ids) {
  const log = load(projectDir);
  log.agents = ids.filter((id) => RUNNERS[id]);
  save(projectDir, log);
  return log;
}

function agentState(projectDir) {
  return { installed: installedAgents(), active: activeAgents(load(projectDir)) };
}

module.exports = { load, post, setCwd, setAgents, agentState, ORDER, LABELS, STOP_MARKER };
