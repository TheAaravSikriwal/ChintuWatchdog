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
 * Extract parent session ID from a sub-agent file path.
 * Sub-agents live at: <projectsDir>/<project>/<parentSessionId>/subagents/<agent-file>.jsonl
 * The parent is the directory BEFORE 'subagents', not after.
 */
function getParentSessionId(filePath, sessionId) {
  if (!sessionId.startsWith('agent-')) return null
  const parts = filePath.split(/[/\\]/)
  const idx = parts.indexOf('subagents')
  if (idx >= 1) return parts[idx - 1]
  return null
}

/**
 * Discover session files under the projects directory.
 * Returns array of { path, sessionId, project, parentSessionId }.
 * Includes sub-agent files from subagents/ subdirectories.
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
    _scanDir(projDir, proj.name, sessions)
  }
  return sessions
}

function _scanDir(dir, project, sessions, depth) {
  if (depth === undefined) depth = 0
  if (depth > 4) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      // At depth 0: recurse into 'subagents' dirs AND session UUID dirs
      // (which contain their own subagents/ subdirectory).
      // At depth 1+: recurse into everything.
      if (entry.name === 'subagents' || depth > 0 || /^[0-9a-f]{8}-/.test(entry.name)) {
        _scanDir(fullPath, project, sessions, depth + 1)
      }
    } else if (entry.name.endsWith('.jsonl')) {
      const sessionId = entry.name.replace('.jsonl', '')
      sessions.push({
        path: fullPath,
        sessionId,
        project,
        parentSessionId: getParentSessionId(fullPath, sessionId),
      })
    }
  }
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

  // ── Sub-agent linking sources 2 & 3 ─────────────────────────────
  // queue-operation and progress lines carry sub-agent metadata.
  // Return as metadata alongside empty events array.

  if (type === 'queue-operation') {
    const op = typeof obj.operation === 'string' ? obj.operation : ''
    if (op === 'enqueue') {
      const toolUseId = typeof obj.tool_use_id === 'string' ? obj.tool_use_id : null
      const taskId = typeof obj.task_id === 'string' ? obj.task_id : null
      if (toolUseId && taskId) {
        return {
          events: [],
          nextSeq: seq,
          subagentLink: { toolUseId, subagentSessionId: 'agent-' + taskId },
        }
      }
    }
    return { events: [], nextSeq: seq }
  }

  if (type === 'progress') {
    const data = obj.data && typeof obj.data === 'object' ? obj.data : {}
    if (data.type === 'agent_progress') {
      const toolUseId = typeof obj.parentToolUseID === 'string' ? obj.parentToolUseID : null
      const agentId = typeof data.agentId === 'string' ? data.agentId : null
      if (toolUseId && agentId) {
        return {
          events: [],
          nextSeq: seq,
          subagentLink: { toolUseId, subagentSessionId: 'agent-' + agentId },
        }
      }
    }
    return { events: [], nextSeq: seq }
  }

  // [INVESTIGATE A] — /rename extraction.
  // Format confirmed: type="system", subtype="local_command",
  // content contains <command-name>/rename</command-name><command-args>new name</command-args>
  // Same XML envelope as /color, /theme, etc.
  if (type === 'system') {
    const content = typeof obj.content === 'string' ? obj.content : ''
    const nameMatch = content.match(/<command-name>\/?rename<\/command-name>/)
    if (nameMatch) {
      const argsMatch = content.match(/<command-args>([^<]*)<\/command-args>/)
      const renamedTo = argsMatch ? argsMatch[1].trim() : ''
      return { events: [], nextSeq: seq, renamedTo: renamedTo || null }
    }
    return { events, nextSeq: seq }
  }

  // [INVESTIGATE B] — /resume continuation detection.
  // Format confirmed: if a line's inner sessionId field differs from the
  // file-derived sessionId, the inner sessionId is the parent (source) session.
  // This file is a continuation of that session. Extracted by the caller in
  // electron.js, not here — parseLine returns sourceSessionId when present.
  const innerSessionId = typeof obj.sessionId === 'string' ? obj.sessionId : null

  // Only process user and assistant lines.
  // Skip: attachment, file-history-snapshot, permission-mode,
  // last-prompt, and any unknown types.
  if (type !== 'user' && type !== 'assistant') {
    return { events, nextSeq: seq, sourceSessionId: innerSessionId }
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
  getParentSessionId,
  discoverSessions,
  parseLine,
  isTruncatedWrite,
}
