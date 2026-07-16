#!/usr/bin/env node
// Validate aider.js adapter against the reference test fixture.
//
// Fixture: watchdog-reference/parser/testdata/aider/myrepo/.aider.chat.history.md
// This is the reference fixture, NOT real Aider sessions.
//
// Usage: node scripts/test-aider-fixture.js

const fs = require('fs')
const path = require('path')
const aider = require('../main/adapters/aider')

const FIXTURE = path.join(
  process.env.USERPROFILE || process.env.HOME,
  'Downloads', 'watchdog-reference', 'watchdog-reference',
  'parser', 'testdata', 'aider', 'myrepo', '.aider.chat.history.md'
)

console.log('Fixture:', FIXTURE)
console.log()

let buf
try {
  buf = fs.readFileSync(FIXTURE)
} catch (e) {
  console.error('Cannot read fixture:', e.message)
  process.exit(1)
}

const text = buf.toString('utf-8')
const lines = text.split('\n')
const sessionId = 'aider:myrepo'
let seq = 0
const events = []

for (const rawLine of lines) {
  const line = rawLine.trim()
  if (!line) continue
  const result = aider.parseLine(line, sessionId, seq)
  events.push(...result.events)
  seq = result.nextSeq
}

// ── Report ──────────────────────────────────────────────────────────

console.log(`Lines (non-blank): ${lines.filter(l => l.trim()).length}`)
console.log(`Events emitted:    ${events.length}`)
console.log()

// Per-event detail
for (const ev of events) {
  const parts = [`seq=${ev.sourceSeq}`, `role=${ev.role}`, `kind=${ev.kind}`]
  if (ev.timestamp) parts.push(`ts=${ev.timestamp}`)
  if (ev.action) parts.push(`action=${ev.action}`)
  if (ev.target) parts.push(`target=${ev.target}`)
  if (ev.text) parts.push(`text="${ev.text.slice(0, 60)}"`)
  console.log(`  ${parts.join('  ')}`)
}

// ── Counts ──────────────────────────────────────────────────────────

let sessionStarts = 0, userMsgs = 0, assistantMsgs = 0, actions = 0
let editActions = 0, writeActions = 0
let withTimestamp = 0, withoutTimestamp = 0

for (const ev of events) {
  if (ev.kind === 'session_start') sessionStarts++
  if (ev.role === 'user' && ev.kind === 'message') userMsgs++
  if (ev.role === 'assistant' && ev.kind === 'message') assistantMsgs++
  if (ev.kind === 'action') {
    actions++
    if (ev.action === 'edit_file') editActions++
    if (ev.action === 'write_file') writeActions++
  }
  if (ev.timestamp) withTimestamp++
  else withoutTimestamp++
}

console.log()
console.log('COUNTS')
console.log(`  session_start:  ${sessionStarts}`)
console.log(`  user messages:  ${userMsgs}`)
console.log(`  assistant msgs: ${assistantMsgs}`)
console.log(`  actions:        ${actions} (edit=${editActions} write=${writeActions})`)
console.log(`  with timestamp: ${withTimestamp}`)
console.log(`  null timestamp: ${withoutTimestamp}`)

// ── Structural checks ──────────────────────────────────────────────

console.log()
console.log('STRUCTURAL CHECKS')

let pass = 0, fail = 0
function check(cond, label) {
  if (cond) { console.log(`  OK  ${label}`); pass++ }
  else { console.log(`  FAIL  ${label}`); fail++ }
}

// The fixture has 3 run headers
check(sessionStarts === 3, `3 session_start events (got ${sessionStarts})`)

// Run 1: "add a retry to the webhook" + "Step 1" = 2 user messages
// Run 2: "make the timeout configurable" = 1 user message
// Run 3: empty
check(userMsgs === 3, `3 user messages (got ${userMsgs})`)

// Run 1: 2 Applied edit + 1 Creating empty file = 3 actions
// Run 2: 1 Applied edit = 1 action
check(actions === 4, `4 action events (got ${actions})`)
check(editActions === 3, `3 edit_file actions (got ${editActions})`)
check(writeActions === 1, `1 write_file action (got ${writeActions})`)

// All events have agent='aider'
check(events.every(e => e.agent === 'aider'), 'all events have agent=aider')

// All events have sessionId
check(events.every(e => e.sessionId === sessionId), 'all events have correct sessionId')

// Only session_start events have real timestamps
check(withTimestamp === sessionStarts, `only session_start events have timestamps (${withTimestamp} == ${sessionStarts})`)

// session_start timestamps should be parseable ISO 8601
const ssEvents = events.filter(e => e.kind === 'session_start')
check(ssEvents[0].timestamp === '2026-06-09T14:01:00Z', `run 1 timestamp = 2026-06-09T14:01:00Z (got ${ssEvents[0]?.timestamp})`)
check(ssEvents[1].timestamp === '2026-06-09T15:30:00Z', `run 2 timestamp = 2026-06-09T15:30:00Z (got ${ssEvents[1]?.timestamp})`)
check(ssEvents[2].timestamp === '2026-06-09T16:00:00Z', `run 3 timestamp = 2026-06-09T16:00:00Z (got ${ssEvents[2]?.timestamp})`)

// sourceSeq is monotonically increasing
let seqOk = true
for (let i = 1; i < events.length; i++) {
  if (events[i].sourceSeq <= events[i - 1].sourceSeq) { seqOk = false; break }
}
check(seqOk, 'sourceSeq is monotonically increasing')

// No 'result' events (Aider has no tool results)
check(events.filter(e => e.kind === 'result').length === 0, 'no result events')

// "Did not apply edit" and "Skipping edits" should NOT produce events
const skipTargets = events.filter(e => e.target === 'src/skip.py' || e.target === 'src/other.py')
check(skipTargets.length === 0, 'dry-run and skipped edits produce no events')

// Action targets are correct
const actionEvents = events.filter(e => e.kind === 'action')
check(actionEvents[0].target === 'src/webhook.py', `action 1 target = src/webhook.py (got ${actionEvents[0]?.target})`)
check(actionEvents[1].target === 'src/webhook.py', `action 2 target = src/webhook.py (got ${actionEvents[1]?.target})`)
check(actionEvents[2].target === 'src/retry.py', `action 3 target = src/retry.py (got ${actionEvents[2]?.target})`)
check(actionEvents[3].target === 'src/config.py', `action 4 target = src/config.py (got ${actionEvents[3]?.target})`)

// ── Mixed-stream ordering test ──────────────────────────────────────

console.log()
console.log('MIXED-STREAM ORDERING (timestamp: null behavior)')
const { compareEvents } = require('../main/event')

// Simulate mixing with a Claude event that has a real timestamp
const mixed = [
  ...events,
  { agent: 'claude-code', sessionId: 'test', timestamp: '2026-06-09T14:30:00Z', sourceSeq: 0, role: 'user', kind: 'message', text: 'claude message' },
]
mixed.sort(compareEvents)

const claudeIdx = mixed.findIndex(e => e.agent === 'claude-code')
const aiderSessionStartIdx = mixed.findIndex(e => e.kind === 'session_start' && e.timestamp)

console.log(`  Claude event (ts=14:30) sorts at position: ${claudeIdx}`)
console.log(`  First Aider session_start (ts=14:01) sorts at position: ${aiderSessionStartIdx}`)

// session_start with real timestamp should sort BEFORE null-timestamp content
const nullTimestampStart = mixed.findIndex(e => e.timestamp === null)
const lastRealTimestamp = [...mixed].reverse().findIndex(e => e.timestamp !== null)
const lastRealIdx = mixed.length - 1 - lastRealTimestamp

console.log(`  First null-timestamp event at position: ${nullTimestampStart}`)
console.log(`  Last real-timestamp event at position: ${lastRealIdx}`)
console.log(`  Behavior: timestamped events (session_starts + Claude) sort first,`)
console.log(`  then null-timestamp Aider content groups at the end.`)
console.log(`  Finding: this is correct per the comparator spec but means Aider`)
console.log(`  content appears separated from its session_start marker in mixed`)
console.log(`  streams. Acceptable for v1 — the session_start gives temporal`)
console.log(`  context, content follows grouped by agent+session+sourceSeq.`)

console.log()
if (fail > 0) {
  console.log(`${fail} check(s) FAILED`)
  process.exit(1)
}
console.log(`${pass}/${pass} checks passed. Validation complete (reference fixture).`)
