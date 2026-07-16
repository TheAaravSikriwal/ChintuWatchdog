// Antigravity (Gemini Code Assist) adapter — reads transcript JSONL files,
// emits WatchdogEvents.
//
// Reference: watchdog-reference/parser/antigravity-v1.1/ (AgentsView, MIT)
// Verified against real data at:
//   ~/.gemini/antigravity/brain/<uuid>/.system_generated/logs/transcript.jsonl
//
// This is a LINE-BASED adapter (same model as Claude/Codex/Cursor/Aider).
// Each line in transcript.jsonl is one "step" with fields:
//   step_index, source, type, status, created_at, content, thinking, tool_calls
//
// Source mapping: USER_EXPLICIT → user, MODEL → assistant, SYSTEM → skip
// Type mapping:
//   USER_INPUT → user message
//   PLANNER_RESPONSE → assistant message + thinking + tool_calls (actions)
//   GENERIC / CODE_ACTION / RUN_COMMAND → tool output (result)
//   CONVERSATION_HISTORY / CHECKPOINT → skip (system metadata)

const fs = require('fs')
const path = require('path')
const os = require('os')
const { normalizeToolCall, truncateResult } = require('../event')

const AGENT = 'antigravity'

const TRANSCRIPT_FILE = 'transcript.jsonl'

// ── Walk safety ────────────────────────────────────────────────────
// Glob-based discovery walks the root recursively, so we cap the work
// to protect against pathological directories on untrusted machines.

const WALK_MAX_DEPTH = 8   // transcript.jsonl is ~5 deep; 8 is generous
const WALK_MAX_DIRS  = 500  // stop if the root somehow has hundreds of dirs
const WALK_SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', 'vendor', 'dist', 'build',
  'target', 'Cache', 'CachedData', 'CachedProfilesData',
])

// ── Session discovery ──────────────────────────────────────────────

/**
 * Resolve the Antigravity root directory.
 * Env override: ANTIGRAVITY_DIR (for testing or non-standard installs).
 * Default: ~/.gemini/antigravity
 */
function getSessionsDir() {
  if (process.env.ANTIGRAVITY_DIR) {
    return process.env.ANTIGRAVITY_DIR
  }
  return path.join(os.homedir(), '.gemini', 'antigravity')
}

function getSessionsDirs() {
  return [getSessionsDir()]
}

/**
 * Discover transcript.jsonl files under any path matching the structural
 * pattern: <any>/.system_generated/logs/transcript.jsonl within the root.
 *
 * Resilient design: globs recursively rather than hardcoding brain/<uuid>/
 * so it survives Antigravity reorganizing its folder layout between versions.
 *
 * Walk safety: bounded by WALK_MAX_DEPTH + WALK_MAX_DIRS, skips symlinks
 * and irrelevant large dirs to prevent hangs on messy filesystems.
 *
 * Note: watcher.js watches these dirs with watchDepth:5, which matches the
 * current brain/<uuid>/.system_generated/logs/ nesting from root. If
 * Antigravity restructures, both this adapter AND watcher.js watchDepth
 * would need updating — that interaction is the Antigravity live-append bug
 * (tracked separately; not changed here).
 *
 * Returns array of { path, sessionId }.
 */
function discoverSessions(dirs) {
  const sessions = []
  for (const root of dirs) {
    const budget = { dirs: 0 }
    _walkForTranscripts(root, root, 0, sessions, budget)
  }
  return sessions
}

function _walkForTranscripts(root, dir, depth, sessions, budget) {
  if (depth > WALK_MAX_DEPTH || budget.dirs >= WALK_MAX_DIRS) return
  budget.dirs++

  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    if (WALK_SKIP_DIRS.has(entry.name)) continue
    if (entry.isSymbolicLink()) continue  // skip symlinks — prevent loops

    if (entry.isDirectory()) {
      _walkForTranscripts(root, path.join(dir, entry.name), depth + 1, sessions, budget)
    } else if (entry.isFile() && entry.name === TRANSCRIPT_FILE) {
      // Match structural pattern: <session-key>/.system_generated/logs/transcript.jsonl
      // dir is the 'logs' directory; its parent must be '.system_generated'.
      const parentName      = path.basename(dir)           // 'logs'
      const grandparentDir  = path.dirname(dir)
      const grandparentName = path.basename(grandparentDir) // '.system_generated'

      if (parentName !== 'logs' || grandparentName !== '.system_generated') continue

      // Session key = the dir above .system_generated (the UUID or equivalent).
      const sessionKey = path.basename(path.dirname(grandparentDir))

      sessions.push({
        path: path.join(dir, entry.name),
        sessionId: AGENT + ':' + sessionKey,
      })
    }
  }
}

// ── Line parsing ───────────────────────────────────────────────────

/**
 * Parse a single transcript JSONL line into WatchdogEvents.
 *
 * @param {string} line - raw JSONL line (already trimmed)
 * @param {string} sessionId
 * @param {number} seq - current sourceSeq counter
 * @returns {{ events: WatchdogEvent[], nextSeq: number }}
 */
function parseLine(line, sessionId, seq) {
  const events = []

  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    return { events, nextSeq: seq }
  }

  const source = typeof obj.source === 'string' ? obj.source : ''
  const type = typeof obj.type === 'string' ? obj.type : ''
  const timestamp = typeof obj.created_at === 'string' ? obj.created_at : null
  const content = typeof obj.content === 'string' ? obj.content : ''
  const thinking = typeof obj.thinking === 'string' ? obj.thinking : ''

  // Skip system metadata steps
  if (type === 'CONVERSATION_HISTORY' || type === 'CHECKPOINT') {
    return { events, nextSeq: seq }
  }

  // ── USER_INPUT (user prompt) ────────────────────────────────
  if (type === 'USER_INPUT' && source === 'USER_EXPLICIT') {
    // First USER_INPUT in a session → emit session_start
    if (obj.step_index === 0) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp,
        sourceSeq: seq++,
        role: 'system',
        kind: 'session_start',
      })
    }

    const text = stripUserRequestTags(content)
    if (text.trim()) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp,
        sourceSeq: seq++,
        role: 'user',
        kind: 'message',
        text,
      })
    }
    return { events, nextSeq: seq }
  }

  // ── PLANNER_RESPONSE (assistant thinking + message + tool calls) ─
  if (type === 'PLANNER_RESPONSE' && source === 'MODEL') {
    // Thinking
    if (thinking.trim()) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp,
        sourceSeq: seq++,
        role: 'assistant',
        kind: 'thinking',
        text: thinking,
      })
    }

    // Message content
    if (content.trim()) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp,
        sourceSeq: seq++,
        role: 'assistant',
        kind: 'message',
        text: content,
      })
    }

    // Tool calls
    const toolCalls = Array.isArray(obj.tool_calls) ? obj.tool_calls : []
    for (const call of toolCalls) {
      if (!call || typeof call !== 'object') continue
      const rawName = typeof call.name === 'string' ? call.name : 'unknown'
      const normalizedArgs = normalizeAntigravityArgs(call.args)
      const { action, target } = normalizeToolCall(rawName, normalizedArgs)

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
      })
    }

    return { events, nextSeq: seq }
  }

  // ── Tool output steps (GENERIC, CODE_ACTION, RUN_COMMAND) ───────
  if (source === 'MODEL' && (type === 'GENERIC' || type === 'CODE_ACTION' || type === 'RUN_COMMAND')) {
    if (content.trim()) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp,
        sourceSeq: seq++,
        role: 'user',
        kind: 'result',
        result: truncateResult(content),
      })
    }
    return { events, nextSeq: seq }
  }

  // Unknown types: skip
  return { events, nextSeq: seq }
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Extract user text from <USER_REQUEST> tags.
 * Real data wraps user prompts in these tags, often followed by
 * <ADDITIONAL_METADATA> and <USER_SETTINGS_CHANGE> blocks that
 * should not be shown.
 */
function stripUserRequestTags(text) {
  const match = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i)
  if (match) return match[1]
  // Fallback: strip opening tag only (no closing tag found)
  return text.replace(/^<USER_REQUEST>\s*/i, '')
}

/**
 * Normalize Antigravity tool call args to the shape normalizeToolCall expects.
 * Real args use different key names (TargetFile, CommandLine, etc.) and
 * values are sometimes JSON-quoted strings ("\"value\"").
 */
function normalizeAntigravityArgs(args) {
  if (!args || typeof args !== 'object') return {}
  const result = {}

  for (const [key, rawVal] of Object.entries(args)) {
    const val = stripArgQuotes(rawVal)

    // Map Antigravity-specific keys to the standard names normalizeToolCall checks
    if (key === 'TargetFile' || key === 'AbsolutePath') result.file_path = val
    else if (key === 'CommandLine') result.command = val
    else if (key === 'Target') result.path = val
    else if (key === 'Cwd') result.cwd = val
    else if (key === 'Pattern' || key === 'SearchPattern') result.pattern = val
    else if (key === 'Query') result.query = val
    else result[key] = val
  }

  return result
}

/**
 * Strip extraneous JSON quotes from arg values.
 * Real data has values like "\"C:\\path\"" — we want "C:\path".
 */
function stripArgQuotes(val) {
  if (typeof val !== 'string') return val
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    try {
      return JSON.parse(val)
    } catch {
      return val.slice(1, -1)
    }
  }
  return val
}

module.exports = {
  AGENT,
  TRANSCRIPT_FILE,
  getSessionsDir,
  getSessionsDirs,
  discoverSessions,
  parseLine,
}
