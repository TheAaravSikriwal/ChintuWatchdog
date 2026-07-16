// Event — the normalized shape every adapter emits.
// Display reads ONLY this shape. Never a raw format.
//
// Raw JSONL lines are JSON.parse'd into plain objects and read
// defensively (optional chaining, typeof checks). This file is
// the only place the Event shape is defined; adapters produce it,
// renderer consumes it, nothing else touches raw data.
//
// TOOL_ACTION_MAP lives in tool-map.js — it grows with each adapter.
// This file (typedef + core functions) is the stable contract.

/**
 * @typedef {Object} WatchdogEvent
 * @property {'claude-code'|'codex'|'cursor'|'aider'} agent
 * @property {string}      sessionId
 * @property {string|null} timestamp    - ISO 8601, null when source has none (Aider action lines)
 * @property {number}      sourceSeq    - monotonic per emitted event, scoped per session file.
 *                                        resets to 0 for each file. one raw line may emit several
 *                                        (e.g. thinking+text+tool_use → seq 42, 43, 44).
 * @property {'user'|'assistant'|'system'} role
 * @property {'session_start'|'message'|'thinking'|'action'|'result'} kind
 * @property {string}      [text]       - kind=message or kind=thinking
 * @property {string}      [action]     - kind=action: 'read_file'|'write_file'|'edit_file'|'run_command'|'search'|'task'|'other'
 * @property {string}      [target]     - kind=action: file path or command string
 * @property {string}      [rawTool]    - kind=action: original tool name ('Bash', 'Edit', 'shell_command', etc.)
 * @property {string}      [toolUseId]  - kind=action or kind=result: pairs action <-> result
 * @property {string}      [result]     - kind=result: truncated tool output
 * @property {string}      [cwd]        - session_start always; other events when source provides it.
 *                                        Claude: per-line, drifts mid-session. Codex: session_meta only.
 */

// ── Tool name normalization ────────────────────────────────────────

const TOOL_ACTION_MAP = require('./tool-map')

/**
 * Normalize a raw tool name to (action, target).
 * Input is read defensively — may be an object or undefined.
 *
 * @param {string} rawName - tool name from the session file
 * @param {*} input - tool input (object, string, or undefined)
 * @returns {{ action: string, target: string|undefined }}
 */
function normalizeToolCall(rawName, input) {
  const action = TOOL_ACTION_MAP[rawName] || 'other'
  let target

  if (input && typeof input === 'object') {
    // Claude: file_path for Read/Write/Edit, command for Bash
    // Codex: cmd/command in parsed arguments, path for patches
    target = input.file_path
      || input.command
      || input.cmd
      || input.path
      || input.pattern   // Grep/Glob
      || input.query
      || undefined

    // Codex apply_patch: extract file paths from patch content
    if (!target && rawName === 'apply_patch' && typeof input.patch === 'string') {
      const match = input.patch.match(/\*\*\* Update File: (.+)/);
      if (match) target = match[1]
    }
  }

  if (typeof target !== 'string') target = undefined

  return { action, target }
}

// ── Result truncation ──────────────────────────────────────────────

const MAX_RESULT_LENGTH = 2000

/**
 * Truncate a tool result for display.
 * Content may be a string or an array of content blocks.
 *
 * @param {*} content - raw content field from tool_result
 * @returns {string|undefined}
 */
function truncateResult(content) {
  if (content == null) return undefined

  let text
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    // Array of content blocks — extract text
    const parts = []
    for (const block of content) {
      if (block && typeof block.text === 'string') parts.push(block.text)
      else if (typeof block === 'string') parts.push(block)
    }
    text = parts.join('\n')
  } else {
    return undefined
  }

  if (text.length <= MAX_RESULT_LENGTH) return text
  return text.slice(0, MAX_RESULT_LENGTH) + '... (truncated)'
}

// ── Display helpers ────────────────────────────────────────────────

/** True when the event represents a file-touching action. */
function isFileTouching(event) {
  if (event.kind !== 'action') return false
  return event.action === 'read_file'
    || event.action === 'write_file'
    || event.action === 'edit_file'
}

/**
 * Merge comparator for sorting events from multiple adapters into
 * one time-ordered stream. Stable within a session via sourceSeq.
 *
 * Sort key: (timestamp, agent, sessionId, sourceSeq)
 */
function compareEvents(a, b) {
  // null timestamps sort last
  if (a.timestamp && b.timestamp) {
    if (a.timestamp < b.timestamp) return -1
    if (a.timestamp > b.timestamp) return 1
  } else if (a.timestamp && !b.timestamp) {
    return -1
  } else if (!a.timestamp && b.timestamp) {
    return 1
  }

  if (a.agent < b.agent) return -1
  if (a.agent > b.agent) return 1

  if (a.sessionId < b.sessionId) return -1
  if (a.sessionId > b.sessionId) return 1

  return a.sourceSeq - b.sourceSeq
}

module.exports = {
  normalizeToolCall,
  truncateResult,
  isFileTouching,
  compareEvents,
  MAX_RESULT_LENGTH,
}
