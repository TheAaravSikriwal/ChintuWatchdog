#!/usr/bin/env node
// Validate the Claude adapter against all real sessions on this machine.
// Persists the pre-codex-checks numbers as a re-runnable source of truth.
//
// Checks:
// 1. Action/result pairing — orphan actions and orphan results
// 2. Skip decomposition — where do non-event lines go?

const fs = require('fs')
const path = require('path')
const claude = require('../main/adapters/claude')

const projectsDir = claude.getProjectsDir()
const sessions = claude.discoverSessions(projectsDir)

console.log(`Projects dir: ${projectsDir}`)
console.log(`Sessions found: ${sessions.length}`)
console.log()

// ── Parse all sessions ────────────────────────────────────────────

let totalLines = 0
let totalEvents = 0
let totalActions = 0
let totalResults = 0

// Skip counters
let skipTypeNotUserAssistant = 0
let skipNoMessage = 0
let skipSystemMessage = 0
let skipEmptyUserContent = 0
let skipEmptyThinking = 0
let skipEmptyLines = 0
let skipInvalidJson = 0

// Pairing maps
const actionIds = new Map()   // toolUseId -> count
const resultIds = new Map()   // toolUseId -> count

for (const session of sessions) {
  let buf
  try {
    buf = fs.readFileSync(session.path)
  } catch {
    continue
  }

  const text = buf.toString('utf-8')
  const rawLines = text.split('\n')
  let seq = 0

  for (const rawLine of rawLines) {
    const line = rawLine.trim()
    if (!line) {
      skipEmptyLines++
      totalLines++
      continue
    }

    totalLines++

    // Count what the adapter does with each line
    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      skipInvalidJson++
      continue
    }

    const type = typeof obj.type === 'string' ? obj.type : ''

    // Count type skips
    if (type !== 'user' && type !== 'assistant') {
      skipTypeNotUserAssistant++
      // Still pass through adapter for consistency
    }

    // Parse through the real adapter
    const result = claude.parseLine(line, session.sessionId, seq)
    const events = result.events
    seq = result.nextSeq

    // If the line produced no events AND it was user/assistant, count the skip reason
    if (events.length === 0 && (type === 'user' || type === 'assistant')) {
      const message = obj.message
      if (!message || typeof message !== 'object') {
        skipNoMessage++
      } else {
        const content = message.content
        if (type === 'user') {
          if (typeof content === 'string') {
            // Check if it was a system message
            const trimmed = content.replace(/^\uFEFF/, '').trimStart()
            if (trimmed.startsWith('This session is being continued') ||
                trimmed.startsWith('[Request interrupted') ||
                trimmed.startsWith('Stop hook feedback:') ||
                trimmed.startsWith('<task-notification>') ||
                trimmed.startsWith('<local-command-')) {
              skipSystemMessage++
            } else if (!content.trim()) {
              skipEmptyUserContent++
            } else {
              // Unknown skip for user string content
              skipEmptyUserContent++
            }
          } else if (Array.isArray(content)) {
            // Array content that produced no events - could be all tool_results
            // that are counted elsewhere, or all system messages
            let foundSkipReason = false
            for (const block of content) {
              if (block && block.type === 'text' && typeof block.text === 'string') {
                const trimmed = block.text.replace(/^\uFEFF/, '').trimStart()
                if (trimmed.startsWith('This session is being continued') ||
                    trimmed.startsWith('[Request interrupted') ||
                    trimmed.startsWith('Stop hook feedback:') ||
                    trimmed.startsWith('<task-notification>') ||
                    trimmed.startsWith('<local-command-')) {
                  skipSystemMessage++
                  foundSkipReason = true
                }
              }
            }
            if (!foundSkipReason) {
              skipEmptyUserContent++
            }
          }
        } else if (type === 'assistant') {
          // Assistant line with no events — likely all-empty thinking blocks
          if (Array.isArray(content)) {
            let allEmptyThinking = true
            for (const block of content) {
              if (!block || typeof block !== 'object') continue
              if (block.type === 'thinking') {
                const thinkText = typeof block.thinking === 'string' ? block.thinking : ''
                if (thinkText) { allEmptyThinking = false; break }
              } else if (block.type === 'text') {
                const t = typeof block.text === 'string' ? block.text : ''
                if (t.trim()) { allEmptyThinking = false; break }
              } else if (block.type === 'tool_use') {
                allEmptyThinking = false; break
              }
            }
            if (allEmptyThinking) {
              skipEmptyThinking++
            } else {
              // Unknown assistant skip
              skipNoMessage++
            }
          } else {
            skipNoMessage++
          }
        }
      }
    }

    totalEvents += events.length

    for (const ev of events) {
      if (ev.kind === 'action') {
        totalActions++
        if (ev.toolUseId) {
          actionIds.set(ev.toolUseId, (actionIds.get(ev.toolUseId) || 0) + 1)
        }
      } else if (ev.kind === 'result') {
        totalResults++
        if (ev.toolUseId) {
          resultIds.set(ev.toolUseId, (resultIds.get(ev.toolUseId) || 0) + 1)
        }
      }
    }
  }
}

// ── Pairing analysis ──────────────────────────────────────────────

let orphanActions = 0  // actions with toolUseId that have no matching result
let orphanResults = 0  // results with toolUseId that have no matching action

for (const [id, count] of actionIds) {
  if (!resultIds.has(id)) {
    orphanActions += count
  }
}

for (const [id, count] of resultIds) {
  if (!actionIds.has(id)) {
    orphanResults += count
  }
}

// ── Report ────────────────────────────────────────────────────────

console.log('=== SUMMARY ===')
console.log(`Sessions:       ${sessions.length}`)
console.log(`Total lines:    ${totalLines}`)
console.log(`Total events:   ${totalEvents}`)
console.log()
console.log('=== ACTION/RESULT PAIRING ===')
console.log(`Actions:        ${totalActions}`)
console.log(`Results:        ${totalResults}`)
console.log(`Orphan actions: ${orphanActions} (action with toolUseId, no matching result)`)
console.log(`Orphan results: ${orphanResults} (result with toolUseId, no matching action)`)
console.log()
console.log('=== SKIP DECOMPOSITION ===')
console.log(`Type not user/assistant:  ${skipTypeNotUserAssistant}`)
console.log(`System messages:          ${skipSystemMessage}`)
console.log(`Empty user content:       ${skipEmptyUserContent}`)
console.log(`Empty thinking blocks:    ${skipEmptyThinking}`)
console.log(`No message object:        ${skipNoMessage}`)
console.log(`Empty lines:              ${skipEmptyLines}`)
console.log(`Invalid JSON:             ${skipInvalidJson}`)
const totalSkips = skipTypeNotUserAssistant + skipSystemMessage + skipEmptyUserContent +
  skipEmptyThinking + skipNoMessage + skipEmptyLines + skipInvalidJson
console.log(`Total skips:              ${totalSkips}`)
console.log(`Lines producing events:   ${totalLines - totalSkips}`)
console.log()

// ── Assertions ────────────────────────────────────────────────────

let failures = 0

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`)
    failures++
  } else {
    console.log(`PASS: ${label}`)
  }
}

console.log('=== ASSERTIONS ===')
check(sessions.length >= 91, `sessions >= 91 (got ${sessions.length})`)
check(orphanResults === 0, `orphan results == 0 (got ${orphanResults})`)

// Session files are LIVE — Claude Code appends to them as it works.
// Exact counts grow over time. Assert structural invariants, not stale snapshots.
//
// Baseline (first check, 91 sessions): 22,025 events / 8,242 actions / 8,231 results / 11 orphan
// These numbers will only grow. The gap (actions - results) should remain stable
// because new orphans are rare — they require an interrupted tool call.
check(totalEvents >= 22025, `total events >= 22,025 baseline (got ${totalEvents})`)
check(totalActions >= 8242, `total actions >= 8,242 baseline (got ${totalActions})`)
check(totalResults >= 8231, `total results >= 8,231 baseline (got ${totalResults})`)
check(totalActions >= totalResults, `actions >= results (${totalActions} >= ${totalResults})`)
check(orphanActions === totalActions - totalResults,
  `orphan actions == actions - results (${orphanActions} == ${totalActions} - ${totalResults})`)
check(orphanActions >= 11, `orphan actions >= 11 baseline (got ${orphanActions})`)

console.log()
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures > 0 ? 1 : 0)
