// Aider adapter — reads Markdown chat history files, emits WatchdogEvents.
//
// Reference: watchdog-reference/parser/aider.go (AgentsView, MIT)
// Validated against the reference test fixture.
//
// Key differences from JSONL adapters (Claude, Codex, Cursor):
//   - Markdown format, not JSONL — parseLine processes one text line
//   - No per-event timestamps — content events get timestamp: null
//   - Run headers ("# aider chat started at <ts>") → session_start with
//     the parsed timestamp (the only Aider event with a real timestamp)
//   - No tool IDs — no action/result pairing
//   - One file can contain multiple "runs", each starting with a header
//   - User messages: "#### <text>" (Markdown h4)
//   - Assistant messages: plain text (everything that isn't a header,
//     user prompt, or blockquote)
//   - Tool output: "> <text>" (blockquote) — actions derived from prose:
//       "Applied edit to <file>" → edit_file
//       "Creating empty file <file>" → write_file
//       "Did not apply edit ..." / "Skipping edits ..." → skipped
//   - No default discovery dir — requires AIDER_DIR env var
//   - Discovery walks the configured dir looking for .aider.chat.history.md

const fs = require('fs')
const path = require('path')

const AGENT = 'aider'
const HISTORY_FILE = '.aider.chat.history.md'
const HEADER_PREFIX = '# aider chat started at '
const MAX_WALK_DEPTH = 4

// Directories never descended into during discovery (mirrors reference).
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'target', '.cache', 'Library', 'go',
  '.cargo', '.rustup', '.npm', '.pnpm-store', '.gradle', '.m2',
  'vendor', 'dist', 'build', '.venv', 'venv', '__pycache__',
  '.svn', '.hg',
])

// ── Session discovery ──────────────────────────────────────────────

function getSessionsDirs() {
  if (process.env.AIDER_DIR) {
    return [process.env.AIDER_DIR]
  }
  // No default — aider is rootless (history lives at each repo root).
  // Returns empty when unconfigured; the watcher handles this gracefully.
  return []
}

/**
 * Discover .aider.chat.history.md files under the given directories.
 * Walks up to MAX_WALK_DEPTH levels, skipping vendor/build dirs.
 */
function discoverSessions(sessionsDirs) {
  const sessions = []
  for (const root of sessionsDirs) {
    walkForHistory(root, root, 0, sessions)
  }
  return sessions
}

function walkForHistory(root, dir, depth, sessions) {
  if (depth > MAX_WALK_DEPTH) return

  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue  // skip symlinks — prevent loops
    if (entry.isFile() && entry.name === HISTORY_FILE) {
      const project = path.basename(path.dirname(full))
      sessions.push({
        path: full,
        sessionId: 'aider:' + project,
        project,
      })
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      walkForHistory(root, full, depth + 1, sessions)
    }
  }
}

// ── Line parsing ───────────────────────────────────────────────────

/**
 * Parse a single line from an Aider Markdown history file.
 *
 * Aider's Markdown isn't line-oriented the way JSONL is, but each line
 * carries enough context to determine its role:
 *   - "# aider chat started at <ts>" → session_start
 *   - "#### <text>"                  → user message
 *   - "> Applied edit to <file>"     → action (edit_file)
 *   - "> Creating empty file <file>" → action (write_file)
 *   - "> Did not apply..."           → skipped
 *   - "> Skipping edits..."          → skipped
 *   - "> <other>"                    → assistant message (tool output)
 *   - everything else                → assistant message
 *
 * Multi-line turns produce one event per non-blank line (the watcher
 * skips blank lines before calling parseLine). This is higher granularity
 * than the reference's accumulate-and-flush approach but captures
 * identical information.
 *
 * @param {string} line - raw line (already trimmed by the watcher)
 * @param {string} sessionId
 * @param {number} seq - current sourceSeq counter
 * @returns {{ events: WatchdogEvent[], nextSeq: number }}
 */
function parseLine(line, sessionId, seq) {
  const events = []

  // ── Run header ────────────────────────────────────────────────
  if (line.startsWith(HEADER_PREFIX)) {
    const tsStr = line.slice(HEADER_PREFIX.length).trim()
    const timestamp = parseAiderTimestamp(tsStr)
    events.push({
      agent: AGENT,
      sessionId,
      timestamp,
      sourceSeq: seq++,
      role: 'system',
      kind: 'session_start',
      text: 'aider chat started',
    })
    return { events, nextSeq: seq }
  }

  // ── User prompt (h4) ─────────────────────────────────────────
  if (line.startsWith('#### ') || line === '####') {
    const text = line === '####' ? '' : line.slice(5).trimEnd()
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

  // ── Tool output (blockquote) ──────────────────────────────────
  if (line.startsWith('> ') || line === '>') {
    const content = line === '>' ? '' : line.slice(2)

    // Action: applied edit
    if (content.startsWith('Applied edit to ')) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp: null,
        sourceSeq: seq++,
        role: 'assistant',
        kind: 'action',
        action: 'edit_file',
        target: content.slice('Applied edit to '.length).trim(),
        rawTool: 'aider_edit',
      })
      return { events, nextSeq: seq }
    }

    // Action: creating file
    if (content.startsWith('Creating empty file ')) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp: null,
        sourceSeq: seq++,
        role: 'assistant',
        kind: 'action',
        action: 'write_file',
        target: content.slice('Creating empty file '.length).trim(),
        rawTool: 'aider_create',
      })
      return { events, nextSeq: seq }
    }

    // Skip: dry-run and skipped edits (no useful info)
    if (content.startsWith('Did not apply edit to ') ||
        content.startsWith('Skipping edits to ')) {
      return { events, nextSeq: seq }
    }

    // Other tool output → assistant message
    if (content.trim()) {
      events.push({
        agent: AGENT,
        sessionId,
        timestamp: null,
        sourceSeq: seq++,
        role: 'assistant',
        kind: 'message',
        text: content,
      })
    }
    return { events, nextSeq: seq }
  }

  // ── Assistant response (default) ──────────────────────────────
  events.push({
    agent: AGENT,
    sessionId,
    timestamp: null,
    sourceSeq: seq++,
    role: 'assistant',
    kind: 'message',
    text: line,
  })

  return { events, nextSeq: seq }
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Parse aider's header timestamp "YYYY-MM-DD HH:MM:SS" to ISO 8601.
 * Returns null for unparseable input.
 */
function parseAiderTimestamp(s) {
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
}

module.exports = {
  AGENT,
  HISTORY_FILE,
  getSessionsDirs,
  discoverSessions,
  parseLine,
}
