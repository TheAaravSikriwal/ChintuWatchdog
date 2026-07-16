// Claude Code adapter — reads JSONL session files, emits WatchdogEvents.
//
// Reference: watchdog-reference/parser/claude.go (AgentsView, MIT)
// Reference corrections applied from PROMPT.md §2A-§2C.
//
// Raw lines are JSON.parse'd into plain objects. Properties are read
// defensively (optional chaining, typeof checks). The raw line shape
// is NEVER typed — only the emitted Event is.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { normalizeToolCall, truncateResult } = require('../event')

const AGENT = 'claude-code'

// ── Session discovery ──────────────────────────────────────────────

/**
 * Resolve the Claude projects directory.
 * Env overrides: CLAUDE_PROJECTS_DIR (direct), CLAUDE_CONFIG_DIR (root).
 * Default: ~/.claude/projects
 */
function getProjectsDir() {
  if (process.env.CLAUDE_PROJECTS_DIR) {
    return process.env.CLAUDE_PROJECTS_DIR
  }
  const configDir = process.env.CLAUDE_CONFIG_DIR
    || path.join(os.homedir(), '.claude')
  return path.join(configDir, 'projects')
}

/**
 * Discover session files under the projects directory.
 * Returns array of { path, sessionId, project }.
 * Skips subagent files (agent-* prefix).
 */
function discoverSessions(projectsDir) {
  const sessions = []
  let projects
  try {
    projects = fs.readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    return sessions
  }

  for (const proj of projects) {
    if (!proj.isDirectory() && !proj.isSymbolicLink()) continue
    const projDir = path.join(projectsDir, proj.name)

    let files
    try {
      files = fs.readdirSync(projDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const file of files) {
      if (file.isDirectory()) continue
      if (!file.name.endsWith('.jsonl')) continue
      if (file.name.startsWith('agent-')) continue
      sessions.push({
        path: path.join(projDir, file.name),
        sessionId: file.name.replace('.jsonl', ''),
        project: proj.name,
      })
    }
  }
  return sessions
}

// ── Line parsing ───────────────────────────────────────────────────
//
// parseLine is a pure function: one raw JSONL line in, zero or more
// WatchdogEvents out. No I/O, no state beyond the sequence counter.

/**
 * Parse a single JSONL line into WatchdogEvents.
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
    // Invalid JSON. Caller handles truncation detection.
    return { events, nextSeq: seq }
  }

  const type = typeof obj.type === 'string' ? obj.type : ''
  const timestamp = typeof obj.timestamp === 'string' ? obj.timestamp : null
  const cwd = typeof obj.cwd === 'string' ? obj.cwd : undefined

  // Only process user and assistant lines.
  // Skip: attachment, file-history-snapshot, system, queue-operation,
  // permission-mode, last-prompt, progress, and any unknown types.
  if (type !== 'user' && type !== 'assistant') {
    return { events, nextSeq: seq }
  }

  const message = obj.message
  if (!message || typeof message !== 'object') {
    return { events, nextSeq: seq }
  }

  // Streaming dedup: return message.id so callers can merge
  // consecutive same-id snapshots (claude.go:1212, mergeClaudeAssistantMessageChunks).
  const messageId = typeof message.id === 'string' ? message.id : undefined

  const content = message.content

  if (type === 'user') {
    // Skip meta entries — system-generated, not real user input (claude.go:724).
    if (obj.isMeta === true) {
      return { events, nextSeq: seq, messageId }
    }
    // Correction A: content is a bare string for user prompts,
    // an array for tool_result lines and text-block lines.
    if (typeof content === 'string') {
      // Skip system-injected messages
      if (isSystemMessage(content)) {
        return { events, nextSeq: seq }
      }

      if (content.trim()) {
        events.push({
          agent: AGENT,
          sessionId,
          timestamp,
          sourceSeq: seq++,
          role: 'user',
          kind: 'message',
          text: content,
          cwd,
        })
      }
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue

        if (block.type === 'text' && typeof block.text === 'string') {
          if (isSystemMessage(block.text)) continue
          if (!block.text.trim()) continue
          events.push({
            agent: AGENT,
            sessionId,
            timestamp,
            sourceSeq: seq++,
            role: 'user',
            kind: 'message',
            text: block.text,
            cwd,
          })
        } else if (block.type === 'tool_result') {
          const toolUseId = typeof block.tool_use_id === 'string'
            ? block.tool_use_id : undefined
          events.push({
            agent: AGENT,
            sessionId,
            timestamp,
            sourceSeq: seq++,
            role: 'user',
            kind: 'result',
            toolUseId,
            result: truncateResult(block.content),
            cwd,
          })
        }
      }
    }
    // If content is neither string nor array, skip silently.
  } else if (type === 'assistant') {
    // Assistant content is always an array (Correction A confirms:
    // only user lines carry bare strings).
    if (!Array.isArray(content)) {
      return { events, nextSeq: seq, messageId }
    }

    for (const block of content) {
      if (!block || typeof block !== 'object') continue

      if (block.type === 'thinking') {
        const text = typeof block.thinking === 'string' ? block.thinking : ''
        if (text) {
          events.push({
            agent: AGENT,
            sessionId,
            timestamp,
            sourceSeq: seq++,
            role: 'assistant',
            kind: 'thinking',
            text,
            cwd,
          })
        }
      } else if (block.type === 'text') {
        const text = typeof block.text === 'string' ? block.text : ''
        if (text.trim()) {
          events.push({
            agent: AGENT,
            sessionId,
            timestamp,
            sourceSeq: seq++,
            role: 'assistant',
            kind: 'message',
            text,
            cwd,
          })
        }
      } else if (block.type === 'tool_use') {
        const rawName = typeof block.name === 'string' ? block.name : 'unknown'
        const input = block.input && typeof block.input === 'object'
          ? block.input : {}
        const { action, target } = normalizeToolCall(rawName, input)
        const toolUseId = typeof block.id === 'string' ? block.id : undefined

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
          toolUseId,
          cwd,
        })
      }
      // Unknown block types skipped silently (Correction B).
    }
  }

  return { events, nextSeq: seq, messageId }
}

// ── System message detection ───────────────────────────────────────
// Matches patterns from claude.go classifyClaudeSystemMessage / isClaudeSystemMessage.
// These are system-injected user entries, not real user input.

const SYSTEM_PREFIXES = [
  'This session is being continued',
  '[Request interrupted',
  'Stop hook feedback:',
]

function isSystemMessage(text) {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart()
  for (const prefix of SYSTEM_PREFIXES) {
    if (trimmed.startsWith(prefix)) return true
  }
  // XML system envelopes
  if (trimmed.startsWith('<task-notification>')) return true
  if (trimmed.startsWith('<local-command-')) return true
  return false
}

// ── Truncation detection ───────────────────────────────────────────
// Correction C: the precise rule from claude.go ~line 261.
//
// Last line is non-empty AND invalid JSON AND the file does NOT end
// with a newline → truncated write, retry later.
// A newline-terminated invalid line is a *complete* malformed record,
// not a partial write — skip it and move on.

/**
 * Check if trailing data represents a truncated write.
 *
 * @param {string} lastLine - the final non-empty line
 * @param {Buffer} buf - the raw file buffer (to check trailing newline)
 * @returns {boolean}
 */
function isTruncatedWrite(lastLine, buf) {
  if (!lastLine || !lastLine.trim()) return false
  try {
    JSON.parse(lastLine)
    return false // valid JSON, not truncated
  } catch {
    // Invalid JSON — is the file missing a trailing newline?
    if (buf.length === 0) return false
    return buf[buf.length - 1] !== 0x0A // not '\n'
  }
}

module.exports = {
  AGENT,
  getProjectsDir,
  discoverSessions,
  parseLine,
  isTruncatedWrite,
}
