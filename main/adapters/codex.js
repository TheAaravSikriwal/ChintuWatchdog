// Codex adapter — reads JSONL session files, emits WatchdogEvents.
//
// Reference: watchdog-reference/parser/codex.go (AgentsView, MIT)
// Reference fixtures: watchdog-reference/parser/testdata/codex/
//
// Key differences from Claude:
//   - Top-level type is always "session_meta", "response_item", or "event_msg"
//   - Role lives at payload.role, not top-level type
//   - Actions are payload.type "function_call" with call_id (not tool_use id)
//   - Results are payload.type "function_call_output" with call_id
//   - arguments field is polymorphic: JSON-encoded string OR native object
//   - No uuid/parentUuid — no DAG to resolve
//   - session_meta carries cwd + session id as a dedicated opening line

const fs = require('fs')
const path = require('path')
const os = require('os')
const { normalizeToolCall, truncateResult } = require('../event')

const AGENT = 'codex'

// ── Walk safety ────────────────────────────────────────────────────
// walkDateDirs descends 3 levels (YYYY/MM/DD). Budget cap prevents hangs
// on pathological layouts; symlink skip prevents infinite loops.
const WALK_MAX_DIRS = 500

// ── Session discovery ──────────────────────────────────────────────

function getSessionsDirs() {
  if (process.env.CODEX_SESSIONS_DIR) {
    return [process.env.CODEX_SESSIONS_DIR]
  }
  const home = os.homedir()
  return [
    path.join(home, '.codex', 'sessions'),
    path.join(home, '.codex', 'archived_sessions'),
  ]
}

/**
 * Discover Codex session files.
 * Codex stores sessions under ~/.codex/sessions/ (and archived_sessions/)
 * in a YYYY/MM/DD/rollout-*.jsonl structure, or flat in archived_sessions.
 */
function discoverSessions(sessionsDirs) {
  const sessions = []

  for (const dir of sessionsDirs) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        // Flat structure (archived)
        sessions.push({
          path: path.join(dir, entry.name),
          sessionId: extractSessionId(entry.name),
        })
      } else if (entry.isDirectory()) {
        // Year/Month/Day structure
        const budget = { dirs: 0 }
        walkDateDirs(path.join(dir, entry.name), sessions, budget)
      }
    }
  }

  return sessions
}

function walkDateDirs(yearDir, sessions, budget) {
  if (budget.dirs >= WALK_MAX_DIRS) return
  budget.dirs++
  let months
  try { months = fs.readdirSync(yearDir, { withFileTypes: true }) } catch { return }
  for (const month of months) {
    if (!month.isDirectory() || month.isSymbolicLink()) continue
    if (budget.dirs >= WALK_MAX_DIRS) return
    budget.dirs++
    let days
    try { days = fs.readdirSync(path.join(yearDir, month.name), { withFileTypes: true }) } catch { continue }
    for (const day of days) {
      if (!day.isDirectory() || day.isSymbolicLink()) continue
      if (budget.dirs >= WALK_MAX_DIRS) return
      budget.dirs++
      let files
      try { files = fs.readdirSync(path.join(yearDir, month.name, day.name), { withFileTypes: true }) } catch { continue }
      for (const file of files) {
        if (file.isSymbolicLink() || !file.name.endsWith('.jsonl')) continue
        sessions.push({
          path: path.join(yearDir, month.name, day.name, file.name),
          sessionId: extractSessionId(file.name),
        })
      }
    }
  }
}

function extractSessionId(filename) {
  // rollout-{timestamp}-{uuid}.jsonl → uuid
  const stem = filename.replace('.jsonl', '')
  const match = stem.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  if (match) return match[1]
  return stem
}

// ── Line parsing ───────────────────────────────────────────────────

/**
 * Parse a single Codex JSONL line into WatchdogEvents.
 *
 * @param {string} line - raw JSONL line (already trimmed)
 * @param {string} sessionId - may be overridden by session_meta
 * @param {number} seq - current sourceSeq counter
 * @returns {{ events: WatchdogEvent[], nextSeq: number, sessionId: string }}
 */
function parseLine(line, sessionId, seq) {
  const events = []

  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    return { events, nextSeq: seq, sessionId }
  }

  const type = typeof obj.type === 'string' ? obj.type : ''
  const timestamp = typeof obj.timestamp === 'string' ? obj.timestamp : null
  const payload = obj.payload && typeof obj.payload === 'object' ? obj.payload : {}

  // ── session_meta ─────────────────────────────────────────────
  if (type === 'session_meta') {
    const metaId = typeof payload.id === 'string' ? payload.id : sessionId
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : undefined

    events.push({
      agent: AGENT,
      sessionId: metaId,
      timestamp,
      sourceSeq: seq++,
      role: 'system',
      kind: 'session_start',
      cwd,
    })

    return { events, nextSeq: seq, sessionId: metaId }
  }

  // ── response_item ────────────────────────────────────────────
  if (type === 'response_item') {
    const payloadType = typeof payload.type === 'string' ? payload.type : ''

    // function_call → action
    if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
      const rawName = typeof payload.name === 'string' ? payload.name : 'unknown'
      const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined

      // Arguments polymorphism: JSON-encoded string OR native object.
      // fc_args_1.jsonl: "arguments": "{\"cmd\":\"rg --files\"}"
      // fc_stdin.jsonl:  "arguments": {"chars":"yes\n"}
      let parsedArgs = {}
      if (payload.arguments != null) {
        if (typeof payload.arguments === 'string') {
          try { parsedArgs = JSON.parse(payload.arguments) } catch { /* leave empty */ }
        } else if (typeof payload.arguments === 'object') {
          parsedArgs = payload.arguments
        }
      }

      const { action, target } = normalizeToolCall(rawName, parsedArgs)

      events.push({
        agent: AGENT,
        sessionId,
        timestamp,
        sourceSeq: seq++,
        role: 'assistant',
        kind: 'action',
        action,
        target,
        rawTool: rawName,
        toolUseId: callId,
      })

      return { events, nextSeq: seq, sessionId }
    }

    // function_call_output → result
    if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
      const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined
      const output = typeof payload.output === 'string' ? payload.output : undefined

      events.push({
        agent: AGENT,
        sessionId,
        timestamp,
        sourceSeq: seq++,
        role: 'user',
        kind: 'result',
        toolUseId: callId,
        result: truncateResult(output),
      })

      return { events, nextSeq: seq, sessionId }
    }

    // message → user or assistant message
    const role = typeof payload.role === 'string' ? payload.role : ''
    if (role !== 'user' && role !== 'assistant') {
      return { events, nextSeq: seq, sessionId }
    }

    const text = extractContent(payload)
    if (!text || !text.trim()) {
      return { events, nextSeq: seq, sessionId }
    }

    // Skip system-injected content in user messages (codex.go:2208, 314, 1400)
    if (role === 'user' && isCodexSystemMessage(text)) {
      return { events, nextSeq: seq, sessionId }
    }

    events.push({
      agent: AGENT,
      sessionId,
      timestamp,
      sourceSeq: seq++,
      role,
      kind: 'message',
      text,
    })

    return { events, nextSeq: seq, sessionId }
  }

  // event_msg, turn_context, and unknown types: skip
  return { events, nextSeq: seq, sessionId }
}

// ── System message detection (codex.go:2208) ──────────────────────
// Codex user messages may contain injected system envelopes that are
// not real user input: agent instructions, environment context, etc.

function isCodexSystemMessage(text) {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trimStart()
  return trimmed.startsWith('# AGENTS.md')
    || trimmed.startsWith('<environment_context>')
    || trimmed.startsWith('<INSTRUCTIONS>')
    || trimmed.startsWith('<turn_aborted>')
    || trimmed.startsWith('<skill>')
    || trimmed.startsWith('<subagent_notification>')
    || trimmed.startsWith('<goal_context>')
    || trimmed.startsWith('<recommended_plugins>')
}

// ── Content extraction ─────────────────────────────────────────────

/**
 * Extract text content from a Codex payload.
 * Content blocks use input_text (user) or output_text (assistant).
 */
function extractContent(payload) {
  const content = payload.content
  if (!Array.isArray(content)) return ''

  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    // Codex uses input_text for user, output_text for assistant
    if ((block.type === 'input_text' || block.type === 'output_text') &&
        typeof block.text === 'string') {
      parts.push(block.text)
    }
    // Also handle plain text blocks
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

module.exports = {
  AGENT,
  getSessionsDirs,
  discoverSessions,
  parseLine,
}
