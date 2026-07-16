const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { SessionWatcher } = require('./main/watcher')

let mainWindow = null
let watcher = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 620,
    title: 'Watch Dog',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Dev: load from Vite dev server. Prod: load built files.
  // app.isPackaged is false when running via `electron .` and true in packaged builds.
  // Do not use NODE_ENV here — it is an ambient env var that a user could set in their
  // shell, which would make a packaged app try to load from the dev server.
  if (!app.isPackaged) {
    mainWindow.loadURL('http://127.0.0.1:5174')
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Watcher → Renderer bridge ──────────────────────────────────────
// Events flow: chokidar → adapter → watcher → IPC → renderer.
// The watcher runs in main, display runs in renderer.
// This boundary enforces the adapter abstraction for free.

function startWatcher() {
  watcher = new SessionWatcher((events) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('watchdog:events', events)
    }
  })
  watcher.start()
}

// ── IPC handlers ───────────────────────────────────────────────────

// Renderer requests initial state on mount — re-parse all sessions
// from all agents into one merged, time-ordered stream.
ipcMain.handle('watchdog:get-initial-events', () => {
  if (!watcher) return { events: [], sessionMeta: {} }

  const fs = require('fs')
  const claude = require('./main/adapters/claude')
  const codex = require('./main/adapters/codex')
  const cursor = require('./main/adapters/cursor')
  const aider = require('./main/adapters/aider')
  const antigravity = require('./main/adapters/antigravity')
  const { compareEvents } = require('./main/event')

  console.log('[watchdog] Loading initial events from all agents...')
  const sources = [
    { adapter: claude, sessions: claude.discoverSessions(claude.getProjectsDir()) },
    { adapter: codex, sessions: codex.discoverSessions(codex.getSessionsDirs()) },
    { adapter: cursor, sessions: cursor.discoverSessions(cursor.getSessionsDirs()) },
    { adapter: aider, sessions: aider.discoverSessions(aider.getSessionsDirs()) },
    { adapter: antigravity, sessions: antigravity.discoverSessions(antigravity.getSessionsDirs()) },
  ]

  const allEvents = []
  const sessionMeta = {}

  for (const { adapter, sessions } of sources) {
    for (const session of sessions) {
      let buf
      try { buf = fs.readFileSync(session.path) } catch { continue }
      const text = buf.toString('utf-8')
      const lines = text.split('\n')
      let seq = 0
      let sessionId = session.sessionId
      let lastMsgId = null
      let lastMsgIdStart = 0
      let lastMsgIdSeq = 0
      const subagentLinks = {}
      let renamedTo = null
      let continuationOf = null
      let foundSourceSession = false

      // Initialize metadata from discovery
      if (!sessionMeta[session.sessionId]) {
        sessionMeta[session.sessionId] = {
          parentSessionId: session.parentSessionId || null,
          subagentLinks: {},
          renamedTo: null,
          continuationOf: null,
        }
      }

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        let result
        try {
          result = adapter.parseLine(line, sessionId, seq)
        } catch {
          continue
        }

        // Collect sub-agent links from queue-operation and progress events
        if (result.subagentLink) {
          const { toolUseId, subagentSessionId } = result.subagentLink
          subagentLinks[toolUseId] = subagentSessionId
        }

        // Collect /rename display name (last rename wins)
        if (result.renamedTo !== undefined && result.renamedTo !== null) {
          renamedTo = result.renamedTo
        }

        // Continuation detection: if the inner sessionId differs from
        // the file-derived sessionId, this file continues that session.
        if (!foundSourceSession && result.sourceSessionId) {
          foundSourceSession = true
          if (result.sourceSessionId !== session.sessionId) {
            continuationOf = result.sourceSessionId
          }
        }

        // Streaming dedup (Claude)
        if (result.messageId) {
          if (result.messageId === lastMsgId) {
            allEvents.length = lastMsgIdStart
            seq = lastMsgIdSeq
          }
          lastMsgId = result.messageId
          lastMsgIdStart = allEvents.length
          lastMsgIdSeq = seq
        } else if (result.events.length > 0) {
          lastMsgId = null
        }
        allEvents.push(...result.events)
        seq = result.nextSeq
        if ('sessionId' in result) {
          sessionId = result.sessionId
        }
      }

      // Merge collected metadata into session meta
      const metaKey = sessionId
      if (!sessionMeta[metaKey]) {
        sessionMeta[metaKey] = {
          parentSessionId: session.parentSessionId || null,
          subagentLinks: {},
          renamedTo: null,
          continuationOf: null,
        }
      }
      if (Object.keys(subagentLinks).length > 0) {
        Object.assign(sessionMeta[metaKey].subagentLinks, subagentLinks)
      }
      if (renamedTo) {
        sessionMeta[metaKey].renamedTo = renamedTo
      }
      if (continuationOf) {
        sessionMeta[metaKey].continuationOf = continuationOf
      }
    }
  }

  const agentCounts = {}
  for (const ev of allEvents) {
    agentCounts[ev.agent] = (agentCounts[ev.agent] || 0) + 1
  }
  console.log('[watchdog] Initial events by agent:', agentCounts)
  console.log('[watchdog] Total initial events:', allEvents.length)
  console.log('[watchdog] Sessions with metadata:', Object.keys(sessionMeta).length)

  allEvents.sort(compareEvents)
  return { events: allEvents, sessionMeta }
})

ipcMain.handle('watchdog:get-projects-dir', () => {
  const claude = require('./main/adapters/claude')
  const codex = require('./main/adapters/codex')
  const cursor = require('./main/adapters/cursor')
  const aider = require('./main/adapters/aider')
  const antigravity = require('./main/adapters/antigravity')
  const fs = require('fs')

  const dirs = []
  const claudeDir = claude.getProjectsDir()
  try { fs.accessSync(claudeDir); dirs.push('Claude: ' + claudeDir) } catch {}
  for (const d of codex.getSessionsDirs()) {
    try { fs.accessSync(d); dirs.push('Codex: ' + d) } catch {}
  }
  for (const d of cursor.getSessionsDirs()) {
    try { fs.accessSync(d); dirs.push('Cursor: ' + d) } catch {}
  }
  for (const d of aider.getSessionsDirs()) {
    try { fs.accessSync(d); dirs.push('Aider: ' + d) } catch {}
  }
  for (const d of antigravity.getSessionsDirs()) {
    try { fs.accessSync(d); dirs.push('Antigravity: ' + d) } catch {}
  }
  return dirs.length > 0 ? dirs.join('  |  ') : claudeDir
})

// ── App lifecycle ──────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  startWatcher()
})

app.on('window-all-closed', () => {
  if (watcher) watcher.stop()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
