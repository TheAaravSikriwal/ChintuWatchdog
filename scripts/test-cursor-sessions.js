#!/usr/bin/env node
// Validate cursor.js adapter against real Cursor sessions on this machine.
//
// Usage: node scripts/test-cursor-sessions.js
//
// Reports: sessions found, events produced, action counts, orphans,
//          structural invariants.

const fs = require('fs')
const cursor = require('../main/adapters/cursor')

const sessionsDirs = cursor.getSessionsDirs()
console.log('Sessions dirs:', sessionsDirs)

const sessions = cursor.discoverSessions(sessionsDirs)
console.log(`\nDiscovered ${sessions.length} session(s):\n`)

let totalEvents = 0
let totalUser = 0
let totalAssistant = 0
let totalMessages = 0
let totalThinking = 0
let totalActions = 0
let totalResults = 0
const actionCounts = {}   // rawTool -> count
const actionTypes = {}    // action -> count
let withToolUseId = 0
let withoutToolUseId = 0

for (const session of sessions) {
  console.log(`  Session: ${session.sessionId}`)
  console.log(`  Project: ${session.project}`)
  console.log(`  Path:    ${session.path}`)

  let buf
  try { buf = fs.readFileSync(session.path) } catch (e) {
    console.log(`  ERROR: ${e.message}\n`)
    continue
  }
  const text = buf.toString('utf-8')
  const lines = text.split('\n')
  let seq = 0
  const sessionEvents = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const result = cursor.parseLine(line, session.sessionId, seq)
    sessionEvents.push(...result.events)
    seq = result.nextSeq
  }

  // Per-session stats
  let sUser = 0, sAssistant = 0, sMessages = 0, sThinking = 0, sActions = 0, sResults = 0
  for (const ev of sessionEvents) {
    if (ev.role === 'user') sUser++
    if (ev.role === 'assistant') sAssistant++
    if (ev.kind === 'message') sMessages++
    if (ev.kind === 'thinking') sThinking++
    if (ev.kind === 'action') {
      sActions++
      actionCounts[ev.rawTool] = (actionCounts[ev.rawTool] || 0) + 1
      actionTypes[ev.action] = (actionTypes[ev.action] || 0) + 1
      if (ev.toolUseId) withToolUseId++
      else withoutToolUseId++
    }
    if (ev.kind === 'result') sResults++
  }

  totalEvents += sessionEvents.length
  totalUser += sUser
  totalAssistant += sAssistant
  totalMessages += sMessages
  totalThinking += sThinking
  totalActions += sActions
  totalResults += sResults

  console.log(`  Lines:   ${lines.filter(l => l.trim()).length}`)
  console.log(`  Events:  ${sessionEvents.length} (user=${sUser} assistant=${sAssistant})`)
  console.log(`  Messages=${sMessages}  Thinking=${sThinking}  Actions=${sActions}  Results=${sResults}`)
  console.log()
}

console.log('═══════════════════════════════════════════════════')
console.log('TOTALS')
console.log(`  Sessions:  ${sessions.length}`)
console.log(`  Events:    ${totalEvents}`)
console.log(`  User:      ${totalUser}`)
console.log(`  Assistant: ${totalAssistant}`)
console.log(`  Messages:  ${totalMessages}`)
console.log(`  Thinking:  ${totalThinking}`)
console.log(`  Actions:   ${totalActions}`)
console.log(`  Results:   ${totalResults}`)
console.log()

console.log('Action breakdown by rawTool:')
for (const [tool, count] of Object.entries(actionCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tool}: ${count}`)
}

console.log('\nAction breakdown by normalized action:')
for (const [action, count] of Object.entries(actionTypes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${action}: ${count}`)
}

console.log(`\nToolUseId presence: with=${withToolUseId} without=${withoutToolUseId}`)
console.log(`Orphan actions (no pairing possible): ${withoutToolUseId} (expected — Cursor has no tool_use IDs)`)
console.log(`Orphan results: ${totalResults} (expected 0 — Cursor has no tool_result blocks)`)

// ── Structural checks ──────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════')
console.log('STRUCTURAL CHECKS')

let pass = 0
let fail = 0

function check(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ FAIL: ${label}`)
    fail++
  }
}

check(sessions.length >= 1, `at least 1 session discovered (got ${sessions.length})`)
check(totalEvents > 0, `at least 1 event emitted (got ${totalEvents})`)
check(totalUser > 0, `at least 1 user event (got ${totalUser})`)
check(totalAssistant > 0, `at least 1 assistant event (got ${totalAssistant})`)
check(totalActions > 0, `at least 1 action event (got ${totalActions})`)
check(totalResults === 0, `0 result events — Cursor has no tool_result blocks (got ${totalResults})`)
check(withToolUseId === 0, `0 tool_use IDs — Cursor has no IDs on tool_use blocks (got ${withToolUseId})`)

// Every event must have required fields
let allValid = true
for (const session of sessions) {
  let buf
  try { buf = fs.readFileSync(session.path) } catch { continue }
  const lines = buf.toString('utf-8').split('\n')
  let seq = 0
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const result = cursor.parseLine(line, session.sessionId, seq)
    for (const ev of result.events) {
      if (ev.agent !== 'cursor') { allValid = false; console.log(`  BAD agent: ${ev.agent}`) }
      if (!ev.sessionId) { allValid = false; console.log('  BAD: missing sessionId') }
      if (typeof ev.sourceSeq !== 'number') { allValid = false; console.log('  BAD: missing sourceSeq') }
      if (!ev.role) { allValid = false; console.log('  BAD: missing role') }
      if (!ev.kind) { allValid = false; console.log('  BAD: missing kind') }
      if (ev.timestamp !== null) { allValid = false; console.log(`  BAD: timestamp should be null, got ${ev.timestamp}`) }
    }
    seq = result.nextSeq
  }
}
check(allValid, 'all events have required fields (agent, sessionId, sourceSeq, role, kind) and timestamp=null')

// No 'unknown' actions (all tools should be in TOOL_ACTION_MAP)
let noUnknown = true
for (const [action] of Object.entries(actionTypes)) {
  if (action === 'other' || action === 'unknown') {
    // 'other' is valid for unmapped tools; 'unknown' would be a bug
    if (action === 'unknown') noUnknown = false
  }
}
check(noUnknown, 'no action === "unknown" (all tools resolved via TOOL_ACTION_MAP)')

console.log(`\n${pass}/${pass + fail} checks passed`)
if (fail > 0) {
  console.log('*** FAILURES DETECTED ***')
  process.exit(1)
}
console.log('All checks passed.')
