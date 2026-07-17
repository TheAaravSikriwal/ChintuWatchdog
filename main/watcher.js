// File watcher — chokidar-based, with batching and overflow detection.
//
// Ported from watchdog-reference/watch/sync_watcher.go (AgentsView, MIT).
// Key ideas retained:
//   - Coalesced batches: collect changed paths, dispatch after a delay
//   - Overflow signal: when pending paths exceed a limit, stop enumerating
//     and tell the consumer to rescan everything (FullSync). Silent drops
//     are worse than a rescan.
//   - Per-file offset tracking: only read new bytes on each change
//   - Partial-line holdback: don't parse a line that might be mid-write
//
// Multi-adapter: watches Claude, Codex, Cursor, Aider, and Antigravity
// directories. All adapters are line-based and route through parseLine().
// New agents add an entry to _buildAgentSources().
//
// Late-appearing agents: when an agent's session directory does not exist
// at launch (e.g. Codex not installed), a periodic rescan discovers and
// watches it once it appears — no app restart required.

const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const claude = require('./adapters/claude')
const codex = require('./adapters/codex')
const cursor = require('./adapters/cursor')
const aider = require('./adapters/aider')
const antigravity = require('./adapters/antigravity')

// ── Batch accumulator ──────────────────────────────────────────────

const MAX_BATCH_ENTRIES = 8192

// Maximum bytes held in the partial-line holdback buffer per file.
// A session file that never emits a newline (e.g. a binary or corrupted file)
// would otherwise grow state.holdback without bound on every chokidar event.
// When the threshold is exceeded the holdback is discarded; the next complete
// line that arrives will still be parsed correctly.
const HOLDBACK_MAX_BYTES = 50 * 1024 * 1024  // 50 MiB

class PendingBatch {
  constructor() {
    this.paths = new Set()
    this.fullSync = false
  }

  empty() {
    return !this.fullSync && this.paths.size === 0
  }

  add(filePath) {
    if (this.fullSync) return
    if (this.paths.size + 1 > MAX_BATCH_ENTRIES) {
      this.paths.clear()
      this.fullSync = true
      return
    }
    this.paths.add(filePath)
  }

  take() {
    if (this.empty()) return null
    if (this.fullSync) {
      this.fullSync = false
      return { fullSync: true, paths: [] }
    }
    const paths = [...this.paths].sort()
    this.paths.clear()
    return { fullSync: false, paths }
  }
}

// ── Per-file state ─────────────────────────────────────────────────

class FileState {
  /**
   * @param {string} sessionId
   * @param {object} adapter - adapter module (must have parseLine)
   */
  constructor(sessionId, adapter) {
    this.sessionId = sessionId
    this.adapter = adapter
    this.byteOffset = 0
    this.seq = 0
    this.holdback = ''  // partial last line from previous read
  }
}

// ── Watcher ────────────────────────────────────────────────────────

// How often to check for newly-appeared agent directories (ms).
// Cheap: just checks a handful of paths with fs.accessSync.
const RESCAN_INTERVAL_MS = 15000

class SessionWatcher {
  /**
   * @param {function(WatchdogEvent[]): void} onEvents - callback for new events
   * @param {object} [options]
   * @param {number} [options.batchDelayMs=300] - ms to wait before dispatching
   * @param {number} [options.rescanIntervalMs=15000] - ms between rescans
   */
  constructor(onEvents, options = {}) {
    this.onEvents = onEvents
    this.batchDelayMs = options.batchDelayMs || 300
    this.rescanIntervalMs = options.rescanIntervalMs || RESCAN_INTERVAL_MS
    this.fileStates = new Map()  // filePath → FileState
    this.pending = new PendingBatch()
    this.batchTimer = null
    this.watchers = []           // chokidar instances
    this.watchedDirs = new Set() // dirs currently being watched (no duplicates)
    this.agentSources = []       // built in start()
    this.rescanTimer = null
  }

  start() {
    this.agentSources = this._buildAgentSources()

    // Initial scan: discover and parse sessions from all agents
    for (const source of this.agentSources) {
      const sessions = source.discover()
      for (const session of sessions) {
        this._parseFile(session.path, session.sessionId, source.adapter)
      }
    }

    // Watch all existing agent directories
    this._watchNewDirs()

    // Periodic rescan: pick up agent directories that appear after launch
    this.rescanTimer = setInterval(() => this._rescan(), this.rescanIntervalMs)
  }

  stop() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }
    for (const w of this.watchers) {
      w.close()
    }
    this.watchers = []
    this.watchedDirs.clear()
  }

  // ── Agent source registry ──────────────────────────────────────
  // New agents: add an entry here. Nothing else changes.

  _buildAgentSources() {
    return [
      {
        adapter: claude,
        dirs: [claude.getProjectsDir()],
        discover: () => claude.discoverSessions(claude.getProjectsDir()),
        skipFile: (basename) => !basename.endsWith('.jsonl'),
        makeSessionId: (fp) => path.basename(fp, '.jsonl'),
        watchDepth: 3,   // projects/<project>/<session>.jsonl  (also covers <project>/<uuid>/subagents/<agent>.jsonl)
      },
      {
        adapter: codex,
        dirs: codex.getSessionsDirs(),
        discover: () => codex.discoverSessions(codex.getSessionsDirs()),
        skipFile: (basename) => !basename.endsWith('.jsonl'),
        makeSessionId: (fp) => path.basename(fp, '.jsonl'),
        watchDepth: 5,   // sessions/YYYY/MM/DD/<session>.jsonl
      },
      {
        adapter: cursor,
        dirs: cursor.getSessionsDirs(),
        discover: () => cursor.discoverSessions(cursor.getSessionsDirs()),
        skipFile: (basename) => !basename.endsWith('.jsonl'),
        makeSessionId: (fp) => 'cursor:' + path.basename(fp, '.jsonl'),
        watchDepth: 4,   // <project>/agent-transcripts/<uuid>/<uuid>.jsonl
      },
      {
        adapter: aider,
        dirs: aider.getSessionsDirs(),
        discover: () => aider.discoverSessions(aider.getSessionsDirs()),
        skipFile: (basename) => basename !== aider.HISTORY_FILE,
        makeSessionId: (fp) => 'aider:' + path.basename(path.dirname(fp)),
        watchDepth: 4,   // <repo>/.aider.chat.history.md
      },
      {
        adapter: antigravity,
        dirs: antigravity.getSessionsDirs(),
        discover: () => antigravity.discoverSessions(antigravity.getSessionsDirs()),
        skipFile: (basename) => basename !== antigravity.TRANSCRIPT_FILE,
        makeSessionId: (fp) => {
          // transcript.jsonl lives at brain/<uuid>/.system_generated/logs/transcript.jsonl
          // Walk up to the UUID dir (4 levels: logs → .system_generated → <uuid>)
          const parts = fp.replace(/\\/g, '/').split('/')
          const logsIdx = parts.lastIndexOf('logs')
          if (logsIdx >= 3) {
            const uuid = parts[logsIdx - 2]  // brain/<uuid>/.system_generated/logs
            return antigravity.AGENT + ':' + uuid
          }
          return antigravity.AGENT + ':' + path.basename(fp, '.jsonl')
        },
        watchDepth: 5,   // brain/<uuid>/.system_generated/logs/transcript.jsonl
      },
    ]
  }

  // ── Internal ───────────────────────────────────────────────────

  /**
   * Start watching any agent directories that exist but aren't yet watched.
   * Safe to call repeatedly — skips dirs already in watchedDirs.
   */
  _watchNewDirs() {
    for (const source of this.agentSources) {
      for (const dir of source.dirs) {
        if (this.watchedDirs.has(dir)) continue
        try { fs.accessSync(dir) } catch { continue }

        const w = chokidar.watch(dir, {
          persistent: true,
          ignoreInitial: true,
          depth: source.watchDepth,
          awaitWriteFinish: false,   // we handle partial writes ourselves
          ignorePermissionErrors: true,
        })

        w.on('change', (filePath) => this._onFileChange(filePath, source))
        w.on('add', (filePath) => this._onFileChange(filePath, source))
        this.watchers.push(w)
        this.watchedDirs.add(dir)
      }
    }
  }

  /**
   * Periodic rescan: discover any newly-appeared agent directories and
   * session files. Handles agents installed/run after the app launched.
   * Safe against double-emission: _parseFile respects byteOffset, so
   * already-tracked files emit nothing.
   */
  _rescan() {
    const newEvents = []

    for (const source of this.agentSources) {
      // Discover sessions (includes dirs that may not have existed at launch)
      const sessions = source.discover()
      for (const session of sessions) {
        if (this.fileStates.has(session.path)) continue  // already tracked
        const events = this._parseFile(session.path, session.sessionId, source.adapter)
        newEvents.push(...events)
      }
    }

    // Watch any newly-appeared directories
    this._watchNewDirs()

    if (newEvents.length > 0) {
      this.onEvents(newEvents)
    }
  }

  _onFileChange(filePath, source) {
    if (source.skipFile(path.basename(filePath))) return
    this.pending.add(filePath)
    this._scheduleBatch()
  }

  _scheduleBatch() {
    if (this.batchTimer) return
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null
      this._dispatchBatch()
    }, this.batchDelayMs)
  }

  _dispatchBatch() {
    const batch = this.pending.take()
    if (!batch) return

    if (batch.fullSync) {
      // Overflow: rescan all agents
      const allEvents = []
      for (const source of this.agentSources) {
        const sessions = source.discover()
        for (const session of sessions) {
          const events = this._parseFile(session.path, session.sessionId, source.adapter)
          allEvents.push(...events)
        }
      }
      if (allEvents.length > 0) {
        this.onEvents(allEvents)
      }
      return
    }

    // Normal batch: parse only changed files
    const allEvents = []
    for (const filePath of batch.paths) {
      const existing = this.fileStates.get(filePath)
      if (existing) {
        const events = this._readNewEvents(filePath, existing)
        allEvents.push(...events)
      } else {
        // New file — find its adapter from the path
        const source = this._sourceForPath(filePath)
        if (source) {
          const sessionId = source.makeSessionId(filePath)
          const events = this._parseFile(filePath, sessionId, source.adapter)
          allEvents.push(...events)
        }
      }
    }
    if (allEvents.length > 0) {
      this.onEvents(allEvents)
    }
  }

  /**
   * Find which agent source owns a file path.
   * Normalizes slashes for cross-platform comparison.
   */
  _sourceForPath(filePath) {
    const norm = filePath.replace(/\\/g, '/')
    for (const source of this.agentSources) {
      for (const dir of source.dirs) {
        if (norm.startsWith(dir.replace(/\\/g, '/'))) return source
      }
    }
    return null
  }

  /**
   * Parse a file, emitting only new events since last read.
   * Returns the new events.
   */
  _parseFile(filePath, sessionId, adapter) {
    let state = this.fileStates.get(filePath)
    if (!state) {
      state = new FileState(sessionId, adapter)
      this.fileStates.set(filePath, state)
    }
    return this._readNewEvents(filePath, state)
  }

  /**
   * Read new bytes from a file, split into lines, parse each.
   * Handles partial-line holdback and truncation detection.
   * Routes each line to the FileState's adapter.
   */
  _readNewEvents(filePath, state) {
    let buf
    try {
      buf = fs.readFileSync(filePath)
    } catch {
      return []
    }

    // Nothing new
    if (buf.length <= state.byteOffset) return []

    // Read only new data, prepending any holdback from last read
    const newData = buf.slice(state.byteOffset)
    const text = state.holdback + newData.toString('utf-8')
    const rawLines = text.split('\n')

    // Hold back the last piece — it might be an incomplete line
    // if the file is still being written.
    // Correction C: if the file ends with '\n', the last element
    // is '' (complete). If not, the last element is a partial line.
    const endsWithNewline = newData[newData.length - 1] === 0x0A
    if (endsWithNewline) {
      state.holdback = ''
    } else {
      state.holdback = rawLines.pop() || ''
      // Safety cap: if a file is written without newlines the holdback grows
      // on every chokidar event. Discard it once it exceeds the limit so
      // memory usage stays bounded. The partial data is simply lost for that
      // read; the next complete line will parse normally.
      if (state.holdback.length > HOLDBACK_MAX_BYTES) {
        state.holdback = ''
      }
    }

    state.byteOffset = buf.length

    // Parse complete lines through the adapter
    const events = []
    let lastMsgId = null    // streaming dedup: track last message.id
    let lastMsgIdStart = 0  // index into events[] where that batch started
    let lastMsgIdSeq = 0    // seq at that point (to reset on replace)

    for (const rawLine of rawLines) {
      const line = rawLine.trim()
      if (!line) continue

      let result
      try {
        result = state.adapter.parseLine(line, state.sessionId, state.seq)
      } catch {
        continue
      }

      // Streaming dedup (Claude): consecutive lines sharing a message.id
      // are cumulative snapshots. Keep only the last batch.
      if (result.messageId) {
        if (result.messageId === lastMsgId) {
          // Replace previous batch — this snapshot supersedes it
          events.length = lastMsgIdStart
          state.seq = lastMsgIdSeq
        }
        lastMsgId = result.messageId
        lastMsgIdStart = events.length
        lastMsgIdSeq = state.seq
      } else if (result.events.length > 0) {
        lastMsgId = null
      }

      events.push(...result.events)
      state.seq = result.nextSeq
      // Codex's parseLine may return a new sessionId (from session_meta).
      // Claude's does not include sessionId in its result.
      if ('sessionId' in result) {
        state.sessionId = result.sessionId
      }
    }

    return events
  }
}

module.exports = { SessionWatcher }
