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
  watcher = new SessionWatcher((events, sessionMeta) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('watchdog:events', { events, sessionMeta: sessionMeta || {} })
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
  const { newMeta, processLines, metaToPatch } = require('./main/session-parse')

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
      const lines = buf.toString('utf-8').split('\n')

      // Parse the whole file through the shared processor.
      const cursor = { sessionId: session.sessionId, seq: 0 }
      const meta = newMeta()
      const { events } = processLines(lines, adapter, cursor, meta, session.sessionId)
      allEvents.push(...events)

      // Key metadata by the effective session id (Codex may override it).
      const metaKey = cursor.sessionId
      const base = sessionMeta[metaKey] || {
        parentSessionId: session.parentSessionId || null,
        subagentLinks: {},
        renamedTo: null,
        continuationOf: null,
      }
      const patch = metaToPatch(meta)
      if (patch) {
        if (patch.subagentLinks) Object.assign(base.subagentLinks, patch.subagentLinks)
        if (patch.renamedTo) base.renamedTo = patch.renamedTo
        if (patch.continuationOf) base.continuationOf = patch.continuationOf
      }
      sessionMeta[metaKey] = base
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
