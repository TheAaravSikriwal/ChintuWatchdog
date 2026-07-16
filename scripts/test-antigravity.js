#!/usr/bin/env node
// Validate the Antigravity (Gemini Code Assist) JSONL adapter against a
// committed fixture derived from real transcript data.
//
// Fixture: scripts/fixtures/antigravity/transcript.jsonl
// Derived from a real session at:
//   ~/.gemini/antigravity/brain/<uuid>/.system_generated/logs/transcript.jsonl
//
// Asserts:
//   - USER_INPUT → user message with <USER_REQUEST> tags stripped
//   - PLANNER_RESPONSE → thinking + message + action events
//   - tool_calls → correct action/target via normalizeToolCall
//   - Arg-quote stripping (stripArgQuotes)
//   - Arg-key normalization (TargetFile→file_path, CommandLine→command, Cwd→cwd)
//   - GENERIC/CODE_ACTION/RUN_COMMAND → result events
//   - CONVERSATION_HISTORY and CHECKPOINT → skipped
//   - session_start emitted on step_index 0
//   - Discovery finds transcript.jsonl under brain/<uuid>/.system_generated/logs/
//
// Usage: node scripts/test-antigravity.js

const fs = require('fs')
const path = require('path')
const os = require('os')

// ── Setup: create directory structure mimicking real layout ─────────

const tmpBase = path.join(os.tmpdir(), 'watchdog-ag-test-' + Date.now())
const agRoot = tmpBase
const brainDir = path.join(agRoot, 'brain')
const SESSION_UUID = '11111111-2222-3333-4444-555555555555'
const logsDir = path.join(brainDir, SESSION_UUID, '.system_generated', 'logs')
fs.mkdirSync(logsDir, { recursive: true })

// Copy fixture into the synthetic directory structure
const fixtureSrc = path.join(__dirname, 'fixtures', 'antigravity', 'transcript.jsonl')
const fixtureDst = path.join(logsDir, 'transcript.jsonl')
fs.copyFileSync(fixtureSrc, fixtureDst)

// Also create a transcript.jsonl NOT in .system_generated/logs/ — should be skipped
// (glob-based discovery requires the .system_generated/logs/ structural pattern)
const badDir = path.join(brainDir, 'some-dir', 'wrong-parent', 'logs')
fs.mkdirSync(badDir, { recursive: true })
fs.writeFileSync(path.join(badDir, 'transcript.jsonl'), '{"step_index":0}\n')

// Point adapter at synthetic data
process.env.ANTIGRAVITY_DIR = agRoot
const antigravity = require('../main/adapters/antigravity')

console.log('=== Antigravity Adapter — JSONL Fixture Validation ===')
console.log(`Fixture: ${fixtureSrc}`)
console.log()

let pass = 0, fail = 0

function check(cond, label) {
  if (cond) { pass++ }
  else { console.error(`  FAIL  ${label}`); fail++ }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) { pass++ }
  else {
    fail++
    console.error(`  FAIL  ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
  }
}

// ── Test 1: Discovery ──────────────────────────────────────────────

console.log('--- Test 1: Session Discovery ---')
const dirs = antigravity.getSessionsDirs()
const sessions = antigravity.discoverSessions(dirs)

assertEqual(sessions.length, 1, `1 valid session discovered (got ${sessions.length})`)
check(sessions[0].sessionId.includes(SESSION_UUID), 'session UUID in sessionId')
check(sessions[0].path.endsWith('transcript.jsonl'), 'path ends with transcript.jsonl')

// Verify transcript NOT in .system_generated/logs/ structure was skipped
check(!sessions.some(s => s.sessionId.includes('wrong-parent')), 'transcript outside .system_generated/logs/ skipped')
console.log()

// ── Test 2: Parse all lines ────────────────────────────────────────

console.log('--- Test 2: Line-by-line parsing ---')
const text = fs.readFileSync(fixtureDst, 'utf-8')
const lines = text.split('\n').filter(l => l.trim())
const sessionId = 'antigravity:' + SESSION_UUID
let seq = 0
const events = []

for (const rawLine of lines) {
  const line = rawLine.trim()
  if (!line) continue
  const result = antigravity.parseLine(line, sessionId, seq)
  events.push(...result.events)
  seq = result.nextSeq
}

console.log(`  Lines parsed: ${lines.length}`)
console.log(`  Events emitted: ${events.length}`)

// The fixture has 10 lines. Expected events:
// step 0 (USER_INPUT):         session_start + user message = 2
// step 1 (CONVERSATION_HISTORY): skip = 0
// step 2 (PLANNER_RESPONSE):  thinking + message + action(list_permissions) = 3
// step 3 (GENERIC):           result = 1
// step 4 (CHECKPOINT):        skip = 0
// step 5 (PLANNER_RESPONSE):  thinking + message + action(write_to_file) = 3
// step 6 (CODE_ACTION):       result = 1
// step 7 (PLANNER_RESPONSE):  message + action(run_command) = 2
// step 8 (RUN_COMMAND):       result = 1
// step 9 (PLANNER_RESPONSE):  thinking + message = 2
// Total: 15

assertEqual(events.length, 17, `17 events total (got ${events.length})`)
console.log()

// ── Test 3: Event kinds and roles ──────────────────────────────────

console.log('--- Test 3: Event kinds and roles ---')
const kinds = {}
for (const ev of events) {
  kinds[ev.kind] = (kinds[ev.kind] || 0) + 1
}

assertEqual(kinds.session_start, 1, `1 session_start (got ${kinds.session_start || 0})`)
assertEqual(kinds.message, 6, `6 message events (got ${kinds.message || 0})`)
assertEqual(kinds.thinking, 3, `3 thinking events (got ${kinds.thinking || 0})`)
assertEqual(kinds.action, 4, `4 action events (got ${kinds.action || 0})`)
assertEqual(kinds.result, 3, `3 result events (got ${kinds.result || 0})`)
// Note: step 3 (GENERIC) also produces a result, so total results = 3
console.log()

// ── Test 4: USER_INPUT — <USER_REQUEST> tag stripping ──────────────

console.log('--- Test 4: USER_REQUEST tag stripping ---')
const userMsgs = events.filter(e => e.role === 'user' && e.kind === 'message')
assertEqual(userMsgs.length, 1, `1 user message (got ${userMsgs.length})`)
check(!userMsgs[0].text.includes('<USER_REQUEST>'), 'opening <USER_REQUEST> tag stripped')
check(!userMsgs[0].text.includes('</USER_REQUEST>'), 'closing </USER_REQUEST> tag stripped')
check(!userMsgs[0].text.includes('ADDITIONAL_METADATA'), 'ADDITIONAL_METADATA not in user text')
check(userMsgs[0].text.includes('WatchdogTest'), 'user text contains the actual request')
console.log()

// ── Test 5: PLANNER_RESPONSE — thinking events ────────────────────

console.log('--- Test 5: Thinking events ---')
const thinkingEvents = events.filter(e => e.kind === 'thinking')
assertEqual(thinkingEvents.length, 3, `3 thinking events (got ${thinkingEvents.length})`)
check(thinkingEvents.every(e => e.role === 'assistant'), 'all thinking events are assistant role')
check(thinkingEvents.every(e => e.agent === 'antigravity'), 'all thinking events have correct agent')
console.log()

// ── Test 6: Tool call normalization ────────────────────────────────

console.log('--- Test 6: Tool call action/target normalization ---')
const actionEvents = events.filter(e => e.kind === 'action')
assertEqual(actionEvents.length, 4, `4 action events (got ${actionEvents.length})`)

// Action 0: list_permissions → other
const a0 = actionEvents[0]
assertEqual(a0.rawTool, 'list_permissions', 'action 0 rawTool = list_permissions')
assertEqual(a0.action, 'other', 'list_permissions → other')

// Action 1: write_to_file → write_file with TargetFile arg
const a1 = actionEvents[1]
assertEqual(a1.rawTool, 'write_to_file', 'action 1 rawTool = write_to_file')
assertEqual(a1.action, 'write_file', 'write_to_file → write_file')
check(
  a1.target && a1.target.includes('hello.py'),
  `write_to_file target contains hello.py (got ${a1.target})`
)

// Action 2: run_command → run_command with CommandLine arg
const a2 = actionEvents[2]
assertEqual(a2.rawTool, 'run_command', 'action 2 rawTool = run_command')
assertEqual(a2.action, 'run_command', 'run_command → run_command')
assertEqual(a2.target, 'python hello.py', 'run_command target = python hello.py')

// Action 3: view_file → read_file with AbsolutePath arg
const a3 = actionEvents[3]
assertEqual(a3.rawTool, 'view_file', 'action 3 rawTool = view_file')
assertEqual(a3.action, 'read_file', 'view_file → read_file')
check(
  a3.target && a3.target.includes('hello.py'),
  `view_file target contains hello.py via AbsolutePath (got ${a3.target})`
)
console.log()

// ── Test 7: Skipped step types ─────────────────────────────────────

console.log('--- Test 7: CONVERSATION_HISTORY and CHECKPOINT skipped ---')
// If these weren't skipped, we'd have extra events
// CONVERSATION_HISTORY (step 1) and CHECKPOINT (step 4) should produce 0 events
// We already validated the total count, but let's be explicit
check(!events.some(e => e.text && e.text.includes('CHECKPOINT')), 'no CHECKPOINT content in events')
check(!events.some(e => e.text && e.text.includes('CONVERSATION_HISTORY')), 'no CONVERSATION_HISTORY in events')
console.log()

// ── Test 8: Tool output → result events ────────────────────────────

console.log('--- Test 8: Tool output result events ---')
const resultEvents = events.filter(e => e.kind === 'result')
check(resultEvents.length >= 2, `at least 2 result events (got ${resultEvents.length})`)
check(resultEvents.every(e => e.role === 'user'), 'all result events have role=user')
check(resultEvents.every(e => typeof e.result === 'string'), 'all results have string content')
// The RUN_COMMAND output should contain "hello"
const runResult = resultEvents.find(e => e.result.includes('hello'))
check(runResult !== undefined, 'RUN_COMMAND result contains "hello" output')
console.log()

// ── Test 9: Structural invariants ──────────────────────────────────

console.log('--- Test 9: Structural invariants ---')
check(events.every(e => e.agent === 'antigravity'), 'all events have agent=antigravity')
check(events.every(e => e.sessionId === sessionId), 'all events have correct sessionId')
check(events.every(e => typeof e.sourceSeq === 'number'), 'all events have numeric sourceSeq')

// Timestamps present on all events
check(events.every(e => typeof e.timestamp === 'string'), 'all events have timestamps')

// sourceSeq is monotonically increasing
let seqOk = true
for (let i = 1; i < events.length; i++) {
  if (events[i].sourceSeq <= events[i - 1].sourceSeq) { seqOk = false; break }
}
check(seqOk, 'sourceSeq is monotonically increasing')

// session_start is first event
assertEqual(events[0].kind, 'session_start', 'first event is session_start')
assertEqual(events[0].role, 'system', 'session_start has role=system')
console.log()

// ── Test 10: parseLine API contract ────────────────────────────────

console.log('--- Test 10: parseLine API contract ---')
// parseLine should return { events, nextSeq } — no sessionId (unlike Codex)
const sampleResult = antigravity.parseLine('{}', 'test', 0)
check(Array.isArray(sampleResult.events), 'parseLine returns events array')
check(typeof sampleResult.nextSeq === 'number', 'parseLine returns nextSeq')
check(!('sessionId' in sampleResult), 'parseLine does NOT return sessionId (not Codex)')

// Invalid JSON should not throw
const badResult = antigravity.parseLine('not json at all', 'test', 0)
check(badResult.events.length === 0, 'invalid JSON produces no events')
assertEqual(badResult.nextSeq, 0, 'invalid JSON preserves seq')
console.log()

// ── Test 11: Exports check ─────────────────────────────────────────

console.log('--- Test 11: Exports ---')
check(typeof antigravity.parseLine === 'function', 'exports parseLine')
check(typeof antigravity.discoverSessions === 'function', 'exports discoverSessions')
check(typeof antigravity.getSessionsDirs === 'function', 'exports getSessionsDirs')
check(typeof antigravity.getSessionsDir === 'function', 'exports getSessionsDir')
check(antigravity.AGENT === 'antigravity', 'AGENT = antigravity')
check(antigravity.TRANSCRIPT_FILE === 'transcript.jsonl', 'TRANSCRIPT_FILE = transcript.jsonl')
// Old exports should NOT exist
check(antigravity.parseSession === undefined, 'parseSession removed (old SQLite API)')
check(antigravity.readSQLiteMetadata === undefined, 'readSQLiteMetadata removed')
check(antigravity.getEffectiveMtime === undefined, 'getEffectiveMtime removed')
console.log()

// ── Cleanup ────────────────────────────────────────────────────────

fs.rmSync(tmpBase, { recursive: true, force: true })

// ── Summary ────────────────────────────────────────────────────────

console.log('========================================')
console.log(`Total: ${pass + fail} tests`)
console.log(`Passed: ${pass}`)
console.log(`Failed: ${fail}`)
console.log(fail === 0 ? 'PASS' : 'FAIL')
console.log('========================================')

process.exit(fail > 0 ? 1 : 0)
