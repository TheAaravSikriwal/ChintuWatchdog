#!/usr/bin/env node
// Test the Codex adapter against all 6 reference fixtures.
// Verifies: correct kind/role/action/target/toolUseId, sessionId override
// from session_meta, and both arguments encodings (JSON string + native object).

const fs = require('fs')
const path = require('path')
const codex = require('../main/adapters/codex')

const FIXTURE_DIR = path.join(
  'C:', 'Users', 'aarav', 'Downloads',
  'watchdog-reference', 'watchdog-reference',
  'parser', 'testdata', 'codex'
)

let totalTests = 0
let totalPassed = 0
let totalFailed = 0

function assert(condition, label) {
  totalTests++
  if (condition) {
    totalPassed++
  } else {
    totalFailed++
    console.error(`  FAIL: ${label}`)
  }
}

function assertEqual(actual, expected, label) {
  totalTests++
  if (actual === expected) {
    totalPassed++
  } else {
    totalFailed++
    console.error(`  FAIL: ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
  }
}

function parseFixture(filename) {
  const filePath = path.join(FIXTURE_DIR, filename)
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim())
  let seq = 0
  let sessionId = 'test-session'
  const allEvents = []
  for (const line of lines) {
    const result = codex.parseLine(line.trim(), sessionId, seq)
    seq = result.nextSeq
    sessionId = result.sessionId
    allEvents.push(...result.events)
  }
  return { events: allEvents, finalSessionId: sessionId }
}

// ── standard_session.jsonl ────────────────────────────────────────
// 3 lines: session_meta + user message + assistant message
console.log('\n--- standard_session.jsonl ---')
{
  const { events, finalSessionId } = parseFixture('standard_session.jsonl')

  assertEqual(events.length, 3, 'should emit 3 events')
  assertEqual(finalSessionId, 'abc-123', 'sessionId should be overridden by session_meta')

  // Event 0: session_start
  assertEqual(events[0].kind, 'session_start', 'event 0 kind')
  assertEqual(events[0].role, 'system', 'event 0 role')
  assertEqual(events[0].cwd, '/Users/alice/code/my-api', 'event 0 cwd')
  assertEqual(events[0].sessionId, 'abc-123', 'event 0 sessionId from meta')
  assertEqual(events[0].agent, 'codex', 'event 0 agent')
  assertEqual(events[0].sourceSeq, 0, 'event 0 sourceSeq')

  // Event 1: user message
  assertEqual(events[1].kind, 'message', 'event 1 kind')
  assertEqual(events[1].role, 'user', 'event 1 role')
  assertEqual(events[1].text, 'Add rate limiting', 'event 1 text')
  assertEqual(events[1].sessionId, 'abc-123', 'event 1 sessionId inherited')
  assertEqual(events[1].sourceSeq, 1, 'event 1 sourceSeq')

  // Event 2: assistant message
  assertEqual(events[2].kind, 'message', 'event 2 kind')
  assertEqual(events[2].role, 'assistant', 'event 2 role')
  assertEqual(events[2].text, 'I\'ll add rate limiting to the API.', 'event 2 text')
  assertEqual(events[2].sourceSeq, 2, 'event 2 sourceSeq')
}

// ── function_calls.jsonl ──────────────────────────────────────────
// 4 lines: session_meta + user msg + shell_command action + apply_patch action
// NOTE: no function_call_output lines -> no result events. Both are orphan actions.
console.log('\n--- function_calls.jsonl ---')
{
  const { events, finalSessionId } = parseFixture('function_calls.jsonl')

  assertEqual(events.length, 4, 'should emit 4 events')
  assertEqual(finalSessionId, 'fc-1', 'sessionId from meta')

  // Event 0: session_start
  assertEqual(events[0].kind, 'session_start', 'event 0 kind')
  assertEqual(events[0].cwd, '/Users/alice/code/app', 'event 0 cwd')

  // Event 1: user message
  assertEqual(events[1].kind, 'message', 'event 1 kind')
  assertEqual(events[1].role, 'user', 'event 1 role')
  assertEqual(events[1].text, 'Run the tests', 'event 1 text')

  // Event 2: shell_command action (no arguments field)
  assertEqual(events[2].kind, 'action', 'event 2 kind')
  assertEqual(events[2].role, 'assistant', 'event 2 role')
  assertEqual(events[2].action, 'run_command', 'event 2 normalized action')
  assertEqual(events[2].rawTool, 'shell_command', 'event 2 rawTool')
  assertEqual(events[2].toolUseId, 'call_test', 'event 2 toolUseId')
  assertEqual(events[2].target, undefined, 'event 2 target (no args)')

  // Event 3: apply_patch action (no arguments field)
  assertEqual(events[3].kind, 'action', 'event 3 kind')
  assertEqual(events[3].action, 'edit_file', 'event 3 normalized action')
  assertEqual(events[3].rawTool, 'apply_patch', 'event 3 rawTool')
  assertEqual(events[3].toolUseId, 'call_test', 'event 3 toolUseId')
}

// ── fc_args_1.jsonl ───────────────────────────────────────────────
// arguments as JSON-encoded STRING: "{\"cmd\":\"rg --files\",\"workdir\":\"/tmp\"}"
console.log('\n--- fc_args_1.jsonl ---')
{
  const { events, finalSessionId } = parseFixture('fc_args_1.jsonl')

  assertEqual(events.length, 3, 'should emit 3 events')
  assertEqual(finalSessionId, 'fc-args-1', 'sessionId from meta')

  // Event 2: exec_command with string-encoded arguments
  assertEqual(events[2].kind, 'action', 'event 2 kind')
  assertEqual(events[2].action, 'run_command', 'exec_command -> run_command')
  assertEqual(events[2].rawTool, 'exec_command', 'event 2 rawTool')
  assertEqual(events[2].target, 'rg --files', 'target extracted from parsed args.cmd')
  assertEqual(events[2].toolUseId, 'call_test', 'event 2 toolUseId')
}

// ── fc_stdin.jsonl ────────────────────────────────────────────────
// arguments as NATIVE OBJECT: {"chars":"yes\n","session_id":"sess-42"}
console.log('\n--- fc_stdin.jsonl ---')
{
  const { events, finalSessionId } = parseFixture('fc_stdin.jsonl')

  assertEqual(events.length, 3, 'should emit 3 events')
  assertEqual(finalSessionId, 'fc-stdin', 'sessionId from meta')

  // Event 2: write_stdin with native object arguments
  assertEqual(events[2].kind, 'action', 'event 2 kind')
  assertEqual(events[2].action, 'other', 'write_stdin -> other')
  assertEqual(events[2].rawTool, 'write_stdin', 'event 2 rawTool')
  assertEqual(events[2].target, undefined, 'no target field in write_stdin args')
  assertEqual(events[2].toolUseId, 'call_test', 'event 2 toolUseId')
}

// ── fc_args_2.jsonl ───────────────────────────────────────────────
// apply_patch with native object arguments containing patch text
// Target extraction: "*** Update File: internal/parser/codex.go"
console.log('\n--- fc_args_2.jsonl ---')
{
  const { events, finalSessionId } = parseFixture('fc_args_2.jsonl')

  assertEqual(events.length, 3, 'should emit 3 events')
  assertEqual(finalSessionId, 'fc-args-2', 'sessionId from meta')

  // Event 2: apply_patch with patch content -> target extracted
  assertEqual(events[2].kind, 'action', 'event 2 kind')
  assertEqual(events[2].action, 'edit_file', 'apply_patch -> edit_file')
  assertEqual(events[2].rawTool, 'apply_patch', 'event 2 rawTool')
  assertEqual(events[2].target, 'internal/parser/codex.go', 'target from *** Update File')
  assertEqual(events[2].toolUseId, 'call_test', 'event 2 toolUseId')
}

// ── blockquotes_session.jsonl ─────────────────────────────────────
// 4 lines: session_meta + user msg + event_msg (SKIPPED) + assistant msg
console.log('\n--- blockquotes_session.jsonl ---')
{
  const { events, finalSessionId } = parseFixture('blockquotes_session.jsonl')

  assertEqual(events.length, 3, 'should emit 3 events (event_msg skipped)')
  assertEqual(finalSessionId, 'quote-123', 'sessionId from meta')

  // Event 0: session_start
  assertEqual(events[0].kind, 'session_start', 'event 0 kind')
  assertEqual(events[0].cwd, '/tmp/agentsview-quote', 'event 0 cwd')

  // Event 1: user message
  assertEqual(events[1].kind, 'message', 'event 1 kind')
  assertEqual(events[1].role, 'user', 'event 1 role')
  assertEqual(events[1].text, 'blablabla?', 'event 1 text')

  // Event 2: assistant message (event_msg on line 3 was skipped)
  assertEqual(events[2].kind, 'message', 'event 2 kind')
  assertEqual(events[2].role, 'assistant', 'event 2 role')
  assert(events[2].text.includes('blabla1'), 'event 2 contains blockquote text')
  assert(events[2].text.includes('> blabla2'), 'event 2 preserves blockquote markers')

  // Verify event_msg was correctly skipped (not emitted)
  const eventMsgEvents = events.filter(e => e.kind === 'event_msg')
  assertEqual(eventMsgEvents.length, 0, 'no event_msg events emitted')
}

// ── Cross-fixture checks ──────────────────────────────────────────
console.log('\n--- Cross-fixture checks ---')
{
  // All events should have agent === 'codex'
  const allFixtures = [
    'standard_session.jsonl', 'function_calls.jsonl', 'fc_args_1.jsonl',
    'fc_stdin.jsonl', 'fc_args_2.jsonl', 'blockquotes_session.jsonl',
  ]
  for (const fixture of allFixtures) {
    const { events } = parseFixture(fixture)
    for (const ev of events) {
      assert(ev.agent === 'codex', `${fixture}: agent === 'codex'`)
      assert(ev.timestamp === null || typeof ev.timestamp === 'string',
        `${fixture}: timestamp is string or null`)
      assert(typeof ev.sourceSeq === 'number', `${fixture}: sourceSeq is number`)
    }
  }

  // Verify action/result pairing via toolUseId works
  // function_calls.jsonl has 2 actions with call_id but no results -> orphan actions
  const { events: fcEvents } = parseFixture('function_calls.jsonl')
  const actions = fcEvents.filter(e => e.kind === 'action')
  const results = fcEvents.filter(e => e.kind === 'result')
  assertEqual(actions.length, 2, 'function_calls has 2 actions')
  assertEqual(results.length, 0, 'function_calls has 0 results (orphan actions)')
  assert(actions.every(a => a.toolUseId !== undefined), 'all actions have toolUseId')
}

// ── Summary ───────────────────────────────────────────────────────
console.log('\n========================================')
console.log(`Total: ${totalTests} tests`)
console.log(`Passed: ${totalPassed}`)
console.log(`Failed: ${totalFailed}`)
console.log(totalFailed === 0 ? 'PASS' : 'FAIL')
console.log('========================================')

process.exit(totalFailed > 0 ? 1 : 0)
