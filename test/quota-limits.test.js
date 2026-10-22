// FILE: test/quota-limits.test.js
// PURPOSE: Regression cases for reading Claude's real limit state (K25).
// RUN: npm test  (from the repo root)
//
// Why this exists: the dock used to fill its bar from a local token count against an
// invented 1M cap. Replayed against the 8 genuine rate-limit events sitting in this
// machine's transcripts (assistant messages carrying `quotaLimits.status === 'rejected'`),
// that count read a median of 381K — a bar ~38% full — at the exact moment the account
// was actually locked out. Readings ranged 313K..1.97M, so no cap could have made it
// honest; the limit is cost-weighted server-side and pooled across an org, and simply
// isn't derivable from one machine's files.
//
// What we read instead is `cachedUsageUtilization` in ~/.claude.json — the real answer,
// which Claude Code fetches and caches for us. That is someone else's file format, so
// these cases are mostly about surviving it changing shape underneath us: every branch
// must degrade to null rather than throw, because a crash here would take the whole
// quotas:get call (and the other agents' figures with it) down.
const fs = require('fs');
const path = require('path');
const realOs = require('os');

const FIXTURE = fs.mkdtempSync(path.join(realOs.tmpdir(), 'multicli-quota-'));

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const grab = (re) => {
  const m = src.match(re);
  if (!m) throw new Error(`main.js no longer contains ${re} — did it get renamed?`);
  return m[0];
};
const code = [
  grab(/const UTILIZATION_STALE_MS[^\n]*\n/),
  grab(/function readClaudeUtilization\(\)[\s\S]*?\n\}/),
].join('\n');

// Build a reader whose homedir is a throwaway directory holding the .claude.json we want.
// Shadowing `os` is enough: readClaudeUtilization joins the path itself.
let seq = 0;
function readerFor(contents) {
  const home = path.join(FIXTURE, `home-${seq++}`);
  fs.mkdirSync(home);
  if (contents !== null) fs.writeFileSync(path.join(home, '.claude.json'), contents);
  const os = { homedir: () => home };
  // eslint-disable-next-line no-new-func
  return new Function('fs', 'os', 'path', `${code}; return readClaudeUtilization;`)(fs, os, path);
}
const read = (contents) => readerFor(contents)();
const wrap = (utilization, fetchedAtMs = Date.now()) =>
  JSON.stringify({ numStartups: 3, cachedUsageUtilization: { fetchedAtMs, utilization } });

let failed = 0;
let total = 0;
function check(label, ok) {
  total++;
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok' : 'NOT OK'} - ${label}`);
}

console.log('# Claude limit reading (K25)');

// ---- the happy path ----
const full = read(wrap({
  five_hour: { utilization: 64, resets_at: '2026-09-01T12:30:00.351306+00:00', locked_reason: null },
  seven_day: { utilization: 73, resets_at: '2026-09-03T09:00:00.351335+00:00', locked_reason: null },
  spend: { enabled: true, percent: 25, used: { amount_minor: 500 }, limit: { amount_minor: 2000 } },
}));
check('five-hour percentage is read straight through', full.fiveHour.pct === 64);
check('weekly percentage is read too (the band the old dock never showed at all)',
  full.sevenDay.pct === 73);
check('ISO resets_at becomes an ms timestamp',
  full.fiveHour.resetsAt === Date.parse('2026-09-01T12:30:00.351306+00:00'));
check('spend minor units become dollars', full.spend.used === 5 && full.spend.limit === 20);
check('a fresh fetch is not stale', full.stale === false);

// ---- the case the whole change is for ----
const locked = read(wrap({
  five_hour: { utilization: 100, resets_at: '2026-09-01T12:30:00Z', locked_reason: 'usage_limit_reached' },
}));
check('an exhausted limit reports 100', locked.fiveHour.pct === 100);
check('locked_reason survives so the UI can say FULL rather than guess',
  locked.fiveHour.locked === 'usage_limit_reached');

// ---- staleness: the figure only refreshes while Claude Code is running ----
check('a fetch older than the window is flagged stale',
  read(wrap({ five_hour: { utilization: 9 } }, Date.now() - 60 * 60e3)).stale === true);
check('an absent fetchedAtMs is treated as stale, not as fresh',
  read(JSON.stringify({ cachedUsageUtilization: { utilization: { five_hour: { utilization: 9 } } } })).stale === true);
check('a fetch inside the window is fresh',
  read(wrap({ five_hour: { utilization: 9 } }, Date.now() - 60e3)).stale === false);

// ---- degrading instead of throwing: this is someone else's file format ----
check('no file at all -> null', read(null) === null);
check('malformed JSON -> null', read('{ not json at all') === null);
check('no cachedUsageUtilization key -> null', read('{"numStartups":3}') === null);
check('cachedUsageUtilization present but utilization null -> null',
  read(JSON.stringify({ cachedUsageUtilization: { utilization: null } })) === null);
const empty = read(wrap({ five_hour: null, seven_day: null }));
check('null bands become null fields, not a crash',
  empty && empty.fiveHour === null && empty.sevenDay === null);
check('a band with no numeric utilization is dropped rather than shown as 0',
  read(wrap({ five_hour: { utilization: null, resets_at: '2026-09-01T12:30:00Z' } })).fiveHour === null);
check('an unparseable resets_at leaves resetsAt null but keeps the percentage', (() => {
  const r = read(wrap({ five_hour: { utilization: 12, resets_at: 'not a date' } }));
  return r.fiveHour.pct === 12 && r.fiveHour.resetsAt === null;
})());
check('disabled spend is reported as null, not as $0 of $0',
  read(wrap({ five_hour: { utilization: 1 }, spend: { enabled: false, percent: 50 } })).spend === null);
check('spend enabled but with no amounts still yields numbers', (() => {
  const r = read(wrap({ five_hour: { utilization: 1 }, spend: { enabled: true } }));
  return r.spend.used === 0 && r.spend.limit === 0;
})());

// ---- a canary on the real file, when there is one ----
// Skipped rather than failed elsewhere: this only runs on a machine that has actually
// used Claude Code. Its job is to notice upstream renaming these fields on us.
const realPath = path.join(realOs.homedir(), '.claude.json');
let realRaw = null;
try { realRaw = JSON.parse(fs.readFileSync(realPath, 'utf8')).cachedUsageUtilization; } catch { /* not on this machine */ }
if (realRaw?.utilization?.five_hour) {
  const live = readerFor(null); // homedir doesn't matter; call the real reader below
  void live;
  // eslint-disable-next-line no-new-func
  const realReader = new Function('fs', 'os', 'path', `${code}; return readClaudeUtilization;`)(fs, realOs, path);
  const r = realReader();
  check('[live] the real ~/.claude.json still parses',
    !!r && typeof r.fiveHour.pct === 'number');
  check('[live] the parsed percentage matches the raw file',
    r.fiveHour.pct === realRaw.utilization.five_hour.utilization);
} else {
  console.log('  skip - [live] no cachedUsageUtilization on this machine');
}

fs.rmSync(FIXTURE, { recursive: true, force: true });
console.log(failed ? `\n${failed}/${total} FAILED` : `\nall ${total} quota-limit checks passed`);
process.exit(failed ? 1 : 0);
