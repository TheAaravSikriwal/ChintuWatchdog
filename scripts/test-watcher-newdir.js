#!/usr/bin/env node
// Empirical test: does the watcher pick up a directory created after launch?
//
// Test A: dir does NOT exist at launch → create it mid-session → check
// Test B (baseline): file created in already-watched dir → check
// Test C (double-emit): rescan runs again after file is tracked → check no dups

const fs = require('fs')
const path = require('path')
const os = require('os')

const tmpBase = path.join(os.tmpdir(), 'watchdog-newdir-test-' + Date.now())
const newDir = path.join(tmpBase, 'new-agent', 'sessions')
const existingDir = path.join(tmpBase, 'existing-agent', 'sessions')

// Create "existing" dir now; leave "new-agent" absent
fs.mkdirSync(existingDir, { recursive: true })

// Point Codex at the NEW dir (doesn't exist yet)
process.env.CODEX_SESSIONS_DIR = newDir

const { SessionWatcher } = require('../main/watcher')
const codex = require('../main/adapters/codex')

// Valid Codex JSONL fixture (must be response_item to produce events)
const fixtureLine = JSON.stringify({
  type: 'response_item',
  timestamp: '2026-07-15T12:00:00Z',
  payload: {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'test message from late-appearing dir' }],
  },
}) + '\n'

const receivedEvents = []
// Use a short rescan interval (2s) for testing
const watcher = new SessionWatcher((events) => {
  for (const e of events) {
    receivedEvents.push({ ...e, receivedAt: Date.now() })
    console.log(`  [EVENT] agent=${e.agent} kind=${e.kind} text="${(e.text || '').slice(0, 50)}"`)
  }
}, { rescanIntervalMs: 2000 })

console.log('=== Test Setup ===')
console.log(`New dir (absent at launch): ${newDir}`)
console.log(`Rescan interval: 2000ms (shortened for test)`)
console.log()

watcher.start()
console.log('Watcher started.\n')

// After 1s: create the new dir + drop a file (Test A)
setTimeout(() => {
  console.log('=== Test A: Creating non-existent directory + file ===')
  fs.mkdirSync(newDir, { recursive: true })
  const dest = path.join(newDir, 'test-session.jsonl')
  fs.writeFileSync(dest, fixtureLine)
  console.log(`Created: ${dest}`)
  console.log('Waiting for rescan to pick it up...\n')
}, 1000)

// After 5s: check Test A results, then test baseline (Test B)
setTimeout(() => {
  const testAEvents = receivedEvents.filter(e => e.text && e.text.includes('late-appearing'))
  console.log(`=== Test A Result (${testAEvents.length > 0 ? 'PASS' : 'FAIL'}) ===`)
  console.log(`Events from new dir: ${testAEvents.length}`)
  console.log()

  // Test B: append to the file now that the dir IS being watched
  console.log('=== Test B: Appending to file in now-watched dir ===')
  const dest = path.join(newDir, 'test-session.jsonl')
  const newLine = JSON.stringify({
    type: 'response_item',
    timestamp: '2026-07-15T12:01:00Z',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'live update after watch started' }],
    },
  }) + '\n'
  fs.appendFileSync(dest, newLine)
  console.log('Appended new line. Waiting for chokidar to pick it up...\n')
}, 5000)

// After 8s: check Test B + Test C (double-emit)
setTimeout(() => {
  const testBEvents = receivedEvents.filter(e => e.text && e.text.includes('live update'))
  console.log(`=== Test B Result (${testBEvents.length === 1 ? 'PASS' : testBEvents.length > 1 ? 'DOUBLE-EMIT' : 'FAIL'}) ===`)
  console.log(`Events from live update: ${testBEvents.length}`)
  console.log()

  // Test C: check no double-emission from rescan
  const allLateEvents = receivedEvents.filter(e => e.text && e.text.includes('late-appearing'))
  console.log(`=== Test C: Double-emit check ===`)
  console.log(`"late-appearing" events: ${allLateEvents.length} (should be exactly 1)`)
  console.log(`${allLateEvents.length === 1 ? 'PASS' : 'FAIL'}: no double-emission from rescan`)
  console.log()

  // Summary
  console.log('=== Summary ===')
  console.log(`Total events received: ${receivedEvents.length}`)
  console.log(`Test A (new dir mid-session):     ${receivedEvents.filter(e => e.text?.includes('late-appearing')).length > 0 ? 'PASS' : 'FAIL'}`)
  console.log(`Test B (live update after watch):  ${testBEvents.length === 1 ? 'PASS' : 'FAIL'}`)
  console.log(`Test C (no double-emit):           ${allLateEvents.length === 1 ? 'PASS' : 'FAIL'}`)

  watcher.stop()
  fs.rmSync(tmpBase, { recursive: true, force: true })
  process.exit(0)
}, 9000)
