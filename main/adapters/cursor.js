// Cursor adapter — reads JSONL transcript files, emits WatchdogEvents.
//
// Reference: watchdog-reference/parser/cursor.go (AgentsView, MIT)
// Validated against 2 real Cursor sessions on the dev machine.
//
// Key differences from Claude:
//   - Top-level `role` (not top-level `type`)
//   - No `uuid`/`parentUuid`, no `timestamp`, no `cwd` per line
//   - tool_use blocks have NO `id` — no action/result pairing possible
//   - tool_result blocks are absent in real data — Cursor doesn't write them
//   - User content wrapped in <user_query> tags — stripped here
//   - Two transcript layouts: flat and nested within agent-transcripts/
//   - Prefers .jsonl over .txt; plain text transcripts are not supported (v1)

const fs = require('fs')
const path = require('path')
const os = require('os')
const { normalizeToolCall, truncateResult } = require('../event')

const AGENT = 'cursor'

// ── Session discovery ──────────────────────────────────────────────

function getSessionsDirs() {
  if (process.env.CURSOR_PROJECTS_DIR) {
    return [process.env.CURSOR_PROJECTS_DIR]
  }
  // Include both stable and nightly installs. discoverSessions() skips dirs
  // that don't exist, so listing both is safe.
  const home = os.homedir()
  return [
    path.join(home, '.cursor', 'projects'),
    path.join(home, '.cursor-nightly', 'projects'),
  ]
}

/**
 * Valid transcript file extensions.
 * .jsonl is preferred over .txt when both exist.
 */
function isTranscriptExt(name) {
  return name.endsWith('.jsonl') || name.endsWith('.txt')
}

/**
 * Discover Cursor transcript files.
 * Layout: <projectsDir>/<project>/agent-transcripts/<uuid>.{jsonl,txt}
 *    or:  <projectsDir>/<project>/agent-transcripts/<uuid>/<uuid>.{jsonl,txt}
 * When both .jsonl and .txt exist for the same stem, .jsonl wins.
 */
function discoverSessions(sessionsDirs) {
  const sessions = []

  for (const projectsDir of sessionsDirs) {
    let projects
    try { projects = fs.readdirSync(projectsDir, { withFileTypes: true }) } catch { continue }

    for (const proj of projects) {
      if (!proj.isDirectory()) continue

      const transcriptsDir = path.join(projectsDir, proj.name, 'agent-transcripts')
      let entries
      try { entries = fs.readdirSync(transcriptsDir, { withFileTypes: true }) } catch { continue }

      // Collect transcripts, deduping by stem. Prefer .jsonl over .txt.
      const seen = new Map() // stem -> { path, ext }

      for (const entry of entries) {
        if (entry.isFile() && isTranscriptExt(entry.name)) {
          // Flat layout: agent-transcripts/<uuid>.{jsonl,txt}
          addSeen(seen, entry.name, path.join(transcriptsDir, entry.name))
        } else if (entry.isDirectory()) {
          // Nested layout: agent-transcripts/<uuid>/<uuid>.{jsonl,txt}
          const subDir = path.join(transcriptsDir, entry.name)
          let subEntries
          try { subEntries = fs.readdirSync(subDir, { withFileTypes: true }) } catch { continue }
          for (const sub of subEntries) {
            if (!sub.isFile() || !isTranscriptExt(sub.name)) continue
            // Only accept files whose stem matches the parent dir name
            const stem = sub.name.replace(/\.(jsonl|txt)$/, '')
            if (stem !== entry.name) continue
            addSeen(seen, sub.name, path.join(subDir, sub.name))
          }
        }
      }

      for (const [stem, info] of seen) {
        sessions.push({
          path: info.path,
          sessionId: 'cursor:' + stem,
          project: proj.name,
        })
      }
    }
  }

  return sessions
}

function addSeen(seen, filename, fullPath) {
  const stem = filename.replace(/\.(jsonl|txt)$/, '')
  const ext = path.extname(filename)
  const existing = seen.get(stem)
  if (existing) {
    // Prefer .jsonl over .txt
    if (existing.ext === '.txt' && ext === '.jsonl') {
      seen.set(stem, { path: fullPath, ext })
    }
    return
  }
  seen.set(stem, { path: fullPath, ext })
}

// ── Line parsing ───────────────────────────────────────────────────

/**
 * Parse a single Cursor JSONL line into WatchdogEvents.
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
    // Not JSON — could be a .txt transcript line. Skip in v1.
    return { events, nextSeq: seq }
  }

  const role = typeof obj.role === 'string' ? obj.role : ''
  if (role !== 'user' && role !== 'assistant') {
    return { events, nextSeq: seq }
  }

  const message = obj.message
  if (!message || typeof message !== 'object') {
    return { events, nextSeq: seq }
  }

  const content = message.content

  if (role === 'user') {
    // User content: string or array of text blocks.
    // Content may be wrapped in <user_query> tags.
    let text = ''
    if (typeof content === 'string') {
      text = stripUserQueryTags(content)
    } else if (Array.isArray(content)) {
      const parts = []
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text)
        }
      }
      text = stripUserQueryTags(parts.join('\n'))
    }

    text = text.trim()
    if (!text) return { events, nextSeq: seq }

    events.push({
      agent: AGENT,
      sessionId,
      timestamp: null,
      sourceSeq: seq++,
      role: 'user',
      kind: 'message',
      text,
    })

    return { events, nextSeq: seq }
  }

  // role === 'assistant'
  if (!Array.isArray(content)) {
    return { events, nextSeq: seq }
  }

  for (const block of content) {
    if (!block || typeof block !== 'object') continue

    if (block.type === 'thinking') {
      const text = typeof block.thinking === 'string' ? block.thinking : ''
      if (text) {
        events.push({
          agent: AGENT,
          sessionId,
          timestamp: null,
          sourceSeq: seq++,
          role: 'assistant',
          kind: 'thinking',
          text,
        })
      }
    } else if (block.type === 'text') {
      const text = typeof block.text === 'string' ? block.text : ''
      if (text.trim()) {
        events.push({
          agent: AGENT,
          sessionId,
          timestamp: null,
          sourceSeq: seq++,
          role: 'assistant',
          kind: 'message',
          text,
        })
      }
    } else if (block.type === 'tool_use' || block.type === 'toolCall') {
      const rawName = typeof block.name === 'string' ? block.name : 'unknown'
      // Cursor tool_use blocks may use 'input' or 'arguments'
      let input = block.input && typeof block.input === 'object' ? block.input : null
      if (!input && block.arguments && typeof block.arguments === 'object') {
        input = block.arguments
      }
      const { action, target } = normalizeToolCall(rawName, input || {})
      // Cursor tool_use blocks typically have no `id` field
      const toolUseId = typeof block.id === 'string' ? block.id : undefined

      events.push({
        agent: AGENT,
        sessionId,
        timestamp: null,
        sourceSeq: seq++,
        role: 'assistant',
        kind: 'action',
        action,
        target,
        rawTool: rawName,
        toolUseId,
      })
    } else if (block.type === 'tool_result') {
      // Cursor transcripts typically don't include tool_result blocks,
      // but handle them if they appear.
      const toolUseId = typeof block.tool_use_id === 'string'
        ? block.tool_use_id : undefined
      events.push({
        agent: AGENT,
        sessionId,
        timestamp: null,
        sourceSeq: seq++,
        role: 'user',
        kind: 'result',
        toolUseId,
        result: truncateResult(block.content),
      })
    }
    // Unknown block types skipped silently.
  }

  return { events, nextSeq: seq }
}

// ── Content helpers ───────────────────────────────────────────────

/**
 * Strip <user_query> XML tags from user content.
 * Cursor wraps user input in these tags.
 */
function stripUserQueryTags(text) {
  const start = text.indexOf('<user_query>')
  const end = text.indexOf('</user_query>')
  if (start >= 0 && end > start) {
    return text.slice(start + '<user_query>'.length, end).trim()
  }
  return text.trim()
}

module.exports = {
  AGENT,
  getSessionsDirs,
  discoverSessions,
  parseLine,
}
