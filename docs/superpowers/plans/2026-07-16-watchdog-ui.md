# Watch Dog UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the EventFeed debug UI with an iMessage-style chat interface for supervising AI coding agents, including a glass dome minimap and mission-control broad view.

**Architecture:** Two-panel layout (sidebar + conversation area). Sessions derived from WatchdogEvent stream via `useRef` + version counter pattern. 6-state status model computed from event recency and pairing. Glass dome SVG minimap overlays conversation area; broad view is a full overlay. All adapter changes in `main/adapters/claude.js` only — frozen files untouched.

**Tech Stack:** React 18 (plain JS, no TS), Electron 41, Vite 8, @tabler/icons-react, CSS custom properties for theming.

**Spec:** `docs/superpowers/specs/2026-07-16-watchdog-ui-design.md`

---

## File Structure

### New files (renderer)

| File | Responsibility |
|---|---|
| `src/styles/variables.css` | CSS custom properties for dark/light themes |
| `src/utils/plainEnglish.js` | Event → display text with tense switching, friendly commands |
| `src/utils/sessionName.js` | Session naming: prefix stripping, truncation, freeze logic |
| `src/utils/sessionStatus.js` | 6-state computation, `isWaitingForUser()`, `computeSessionStatus()` |
| `src/utils/resultPairing.js` | Action→result pairing by toolUseId or sequence |
| `src/utils/minimapLayout.js` | Dome tree layout: column assignment, Y distribution, parent-chain preservation |
| `src/utils/networkLayout.js` | Broad view node positioning (left-to-right hierarchical) |
| `src/hooks/useSessions.js` | Session state: ingestion, grouping, naming, error counting, status |
| `src/hooks/useSessionScroll.js` | Per-session scroll position memory via useRef Map |
| `src/hooks/useDurationTick.js` | Global 1-second interval counter for running action durations |
| `src/components/Sidebar.jsx` | Full sidebar: header, search, all-agents row, sections, footer |
| `src/components/Sidebar.css` | Sidebar styles |
| `src/components/ThreadRow.jsx` | Single session row: avatar, status dot, preview, badges |
| `src/components/ConversationView.jsx` | Thread header, message scroll area, find bar host |
| `src/components/ConversationView.css` | Conversation styles |
| `src/components/MessageBubble.jsx` | Bubble types A (agent), B (thinking), D (user), E (interrupt), F (btw) |
| `src/components/ActionCard.jsx` | Type C: icon, label, duration, quantitative context, result pill |
| `src/components/DelegationBadge.jsx` | Type G: delegation pill, clickable to sub-agent |
| `src/components/InputArea.jsx` | All input states: idle, busy, waiting, read-only |
| `src/components/NewSessionView.jsx` | Compose UI: model selector, prompt, CLI instruction |
| `src/components/FindBar.jsx` | In-session search bar |
| `src/components/AllAgentsView.jsx` | Interleaved event feed with session identifier rows |
| `src/components/GlassDome.jsx` | Dome pill with SVG tree interior |
| `src/components/BroadView.jsx` | Mission control overlay: header, network graph, status pills |
| `src/components/NetworkGraph.jsx` | SVG connection layer + HTML node cards |
| `src/components/StatusPills.jsx` | Bottom strip of clickable session pills |

### Modified files

| File | Change |
|---|---|
| `src/main.jsx` | Add `import './styles/variables.css'` before App.css |
| `src/App.jsx` | Replace EventFeed with new component tree, wire useSessions |
| `src/App.css` | Rewrite for 2-panel layout |
| `electron.js` | Return `{ events, sessionMeta }` from IPC; update minWidth/minHeight |
| `main/adapters/claude.js` | Remove agent-* skip, add parentSessionId extraction, add sub-agent linking sources 2&3 |

### Frozen (do not touch)

`main/event.js`, `preload.js`, `src/components/EventFeed.jsx`, `main/watcher.js`, `main/tool-map.js`, all other adapters.

---

## Task 1: Install dependency and create CSS variables

**Files:**
- Create: `src/styles/variables.css`
- Modify: `src/main.jsx`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install @tabler/icons-react**

```bash
cd C:/Users/aarav/OneDrive/Documents/VisualStudioCodeFile/ChintuWatchdog
npm install @tabler/icons-react
```

- [ ] **Step 2: Create `src/styles/variables.css`**

```css
/* Watch Dog — Design tokens
   Dark theme default. Light theme via data-theme="light" or prefers-color-scheme. */

:root {
  /* Surfaces */
  --surface-0: #0C1221;
  --surface-1: #111D35;
  --surface-2: #1A2540;
  --surface-3: #1E2D52;

  /* Text */
  --text-primary: #E8EAF0;
  --text-secondary: #8B92A8;
  --text-muted: #4A5270;

  /* Borders */
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.15);
  --border-danger: rgba(239,68,68,0.4);
  --border-accent: rgba(37,99,235,0.4);

  /* Accent (blue) */
  --fill-accent: #2563EB;
  --on-accent: #ffffff;
  --bg-accent: rgba(37,99,235,0.15);
  --text-accent: #60A5FA;

  /* Success */
  --bg-success: rgba(34,197,94,0.15);
  --text-success: #4ADE80;

  /* Danger */
  --bg-danger: rgba(239,68,68,0.15);
  --text-danger: #F87171;

  /* Warning */
  --bg-warning: rgba(251,191,36,0.15);
  --text-warning: #FCD34D;

  /* Pro (purple) */
  --bg-pro: rgba(124,58,237,0.15);
  --text-pro: #A78BFA;

  /* Interactive */
  --fill-ghost-hover: rgba(255,255,255,0.05);

  /* Layout */
  --radius: 8px;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace;
}

[data-theme="light"],
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --surface-0: #F0EAE0;
    --surface-1: #E8E0D4;
    --surface-2: #DEDAD0;
    --surface-3: #D4CFC4;
    --text-primary: #1A1A2E;
    --text-secondary: #4A4A6A;
    --text-muted: #8A8AA0;
    --border: rgba(0,0,0,0.1);
    --border-strong: rgba(0,0,0,0.18);
    --border-danger: rgba(239,68,68,0.3);
    --border-accent: rgba(37,99,235,0.3);
    --bg-accent: rgba(37,99,235,0.1);
    --text-accent: #1D4ED8;
    --fill-ghost-hover: rgba(0,0,0,0.04);
    --bg-success: rgba(34,197,94,0.1);
    --text-success: #16A34A;
    --bg-danger: rgba(239,68,68,0.1);
    --text-danger: #DC2626;
    --bg-warning: rgba(251,191,36,0.1);
    --text-warning: #D97706;
    --bg-pro: rgba(124,58,237,0.1);
    --text-pro: #7C3AED;
  }
}
```

- [ ] **Step 3: Update `src/main.jsx` to import variables.css**

Add `import './styles/variables.css'` as the first import after React, before App.css:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles/variables.css'
import App from './App'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 4: Verify format stability gate still passes**

```bash
node scripts/check-format-stability.js
```

Expected: `3/3 stable files match baseline. Gate passed.`

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite starts on port 5174 without errors. Electron window opens showing old EventFeed UI (no visual changes yet).

- [ ] **Step 6: Commit**

```bash
git add src/styles/variables.css src/main.jsx package.json package-lock.json
git commit -m "feat: add CSS design tokens and @tabler/icons-react dependency"
```

---

## Task 2: Core utilities — plainEnglish, sessionName, sessionStatus, resultPairing

**Files:**
- Create: `src/utils/plainEnglish.js`
- Create: `src/utils/sessionName.js`
- Create: `src/utils/sessionStatus.js`
- Create: `src/utils/resultPairing.js`

- [ ] **Step 1: Create `src/utils/sessionStatus.js`**

```js
// 6-state session status model.
// See spec §6 for state definitions and thresholds.

const ONE_MIN = 60 * 1000
const TEN_MIN = 10 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

export function isWaitingForUser(session) {
  if (!session.lastEventAt) return false
  const age = Date.now() - session.lastEventAt.getTime()
  if (age > TEN_MIN) return false
  const events = session.events
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.kind === 'thinking') return false
    if (ev.kind === 'action') return false
    if (ev.kind === 'message' && ev.role === 'assistant') return true
    if (ev.kind === 'message' && ev.role === 'user') return false
  }
  return false
}

export function computeSessionStatus(session) {
  if (!session.lastEventAt) return 'quiet'
  const age = Date.now() - session.lastEventAt.getTime()
  const hasUnpairedAction = session.inputState === 'busy'

  if (age > ONE_HOUR && hasUnpairedAction) return 'unclean'
  if (age > TEN_MIN && hasUnpairedAction) return 'stale'
  if (age > TEN_MIN) return 'quiet'
  if (isWaitingForUser(session)) return 'waiting'
  if (age > ONE_MIN) return 'idle'
  return 'working'
}

// Human-friendly display text for each status.
export const STATUS_LABELS = {
  working:  'working on it',
  waiting:  'waiting for you',
  idle:     'paused',
  quiet:    'done',
  stale:    'might be stuck',
  unclean:  'something went wrong',
}

// Dot color hex per status.
export const STATUS_COLORS = {
  working:  '#22C55E',
  waiting:  '#3B82F6',
  idle:     '#6B7280',
  quiet:    '#6B7280',
  stale:    '#F59E0B',
  unclean:  '#EF4444',
}
```

- [ ] **Step 2: Create `src/utils/plainEnglish.js`**

```js
// Translate WatchdogEvent actions into warm, human-readable labels.
// See spec §3 (tone guide) and §11 (action card labels).

const FRIENDLY_COMMANDS = [
  [/^npm\s+(run\s+)?test/,   ['Running tests',        'Ran tests']],
  [/^npm\s+run\s+build/,     ['Building the project',  'Built the project']],
  [/^npm\s+install/,         ['Installing packages',   'Installed packages']],
  [/^git\s+commit/,          ['Committing changes',    'Committed changes']],
  [/^git\s+push/,            ['Pushing to remote',     'Pushed to remote']],
]

function friendlyCommand(target, completed) {
  if (!target) return completed ? 'Ran a command' : 'Running a command'
  for (const [pattern, [running, done]] of FRIENDLY_COMMANDS) {
    if (pattern.test(target)) return completed ? done : running
  }
  const truncated = target.length > 40 ? target.slice(0, 40) + '...' : target
  return completed ? `Ran: ${truncated}` : `Running: ${truncated}`
}

function humanizeRawTool(rawTool) {
  if (!rawTool) return 'something'
  // Split camelCase and underscores, capitalise first word
  return rawTool
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase())
}

function baseName(filePath) {
  if (!filePath) return 'a file'
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

/**
 * Generate human-readable label for an action event.
 * @param {string} action - normalized action (read_file, edit_file, etc.)
 * @param {string} target - file path or command string
 * @param {string} rawTool - original tool name
 * @param {boolean} completed - true if result has arrived
 * @returns {{ verb: string, object: string }}
 */
export function actionLabel(action, target, rawTool, completed) {
  const file = baseName(target)
  const labels = {
    read_file:   { verb: completed ? 'Read'      : 'Reading',     object: file },
    write_file:  { verb: completed ? 'Wrote'     : 'Writing',     object: file },
    edit_file:   { verb: completed ? 'Edited'    : 'Editing',     object: file },
    run_command: { verb: '', object: friendlyCommand(target, completed) },
    search:      { verb: completed ? 'Searched'  : 'Searching',   object: `for ${target || 'something'}` },
    task:        { verb: completed ? 'Delegated' : 'Delegating',  object: target || 'a task' },
    other:       { verb: completed ? 'Ran'       : 'Running',     object: humanizeRawTool(rawTool) },
  }
  const entry = labels[action] || labels.other
  // run_command uses object as full label (verb is empty)
  if (action === 'run_command') return { verb: '', object: entry.object }
  return entry
}

/**
 * Generate preview text for the most recent event in a session.
 * Used in sidebar thread rows and thread header action phrase.
 */
export function eventPreview(event) {
  if (!event) return ''
  if (event.kind === 'session_start') return ''
  if (event.kind === 'thinking') return 'thinking it through...'
  if (event.kind === 'message' && event.role === 'assistant') {
    return (event.text || '').slice(0, 55)
  }
  if (event.kind === 'message' && event.role === 'user') {
    return (event.text || '').slice(0, 55)
  }
  if (event.kind === 'action') {
    const { verb, object } = actionLabel(event.action, event.target, event.rawTool, false)
    return verb ? `${verb} ${object}` : object
  }
  if (event.kind === 'result') return ''
  return ''
}

/**
 * Parse quantitative context from a result event.
 * Returns a short string like "· ~45 lines" or null if unparseable.
 */
export function quantitativeContext(action, resultText) {
  if (!resultText) return null
  try {
    if (action === 'read_file' || action === 'write_file') {
      const lineEst = Math.round(resultText.length / 40)
      if (lineEst > 0) return `~${lineEst} lines`
    }
    // edit line counts: deferred to Phase 2 when actionInput is wired
    if (action === 'edit_file') return null
    if (action === 'search') {
      const m = resultText.match(/^(\d+)\s/)
      if (m) return `${m[1]} matches`
    }
    if (action === 'run_command') {
      const first100 = resultText.slice(0, 100)
      const testMatch = first100.match(/(\d+)\s+passed.*?(\d+)\s+failed/i)
      if (testMatch) return `${testMatch[1]} passed, ${testMatch[2]} failed`
      const exitMatch = first100.match(/exit\s*(?:code\s*)?(\d+)/i)
      if (exitMatch) return `exit ${exitMatch[1]}`
    }
  } catch { /* best effort */ }
  return null
}
```

- [ ] **Step 3: Create `src/utils/sessionName.js`**

```js
// Session naming with warm prefix stripping.
// See spec §16 for priority order and processing rules.

const STRIP_PREFIXES = [
  /^can you\s+/i,
  /^could you\s+/i,
  /^please\s+/i,
  /^help me\s+/i,
  /^i need you to\s+/i,
  /^i want you to\s+/i,
  /^i'd like you to\s+/i,
]

const AGENT_DISPLAY_NAMES = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'cursor': 'Cursor',
  'antigravity': 'Antigravity',
  'aider': 'Aider',
}

/**
 * Clean a user message into a session name.
 * Strips question prefixes, trims punctuation, capitalises, truncates to 40.
 */
export function cleanSessionName(text) {
  if (!text || !text.trim()) return null
  let cleaned = text.trim()
  for (const re of STRIP_PREFIXES) {
    cleaned = cleaned.replace(re, '')
  }
  cleaned = cleaned.replace(/\?+$/, '').trim()
  if (!cleaned) return null
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  if (cleaned.length > 40) cleaned = cleaned.slice(0, 40)
  return cleaned
}

/**
 * Generate fallback name: "Claude Code · Jul 8, 6:47 PM"
 */
export function fallbackName(agent, date) {
  const display = AGENT_DISPLAY_NAMES[agent] || agent
  if (!date) return display
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  }) + ', ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
  return `${display} \u00b7 ${formatted}`
}

/**
 * Try to derive a name from an event. Returns null if this event
 * doesn't contribute to session naming.
 */
export function nameFromEvent(event) {
  if (event.kind === 'message' && event.role === 'user') {
    return cleanSessionName(event.text)
  }
  return null
}

export { AGENT_DISPLAY_NAMES }
```

- [ ] **Step 4: Create `src/utils/resultPairing.js`**

```js
// Pair action events with their result events.
// Uses toolUseId where available (Claude, Codex), falls back to sequence pairing (Cursor).
// See spec §11 result pairing rules.

/**
 * Build a map from action sourceSeq → result event for a session's events.
 * Returns Map<number, WatchdogEvent> keyed by the action's sourceSeq.
 */
export function buildResultMap(events) {
  const byToolUseId = new Map()  // toolUseId → result event
  const resultMap = new Map()     // action sourceSeq → result event

  // First pass: index all results by toolUseId
  for (const ev of events) {
    if (ev.kind === 'result' && ev.toolUseId) {
      byToolUseId.set(ev.toolUseId, ev)
    }
  }

  // Second pass: pair actions
  let lastUnpairedActionSeq = null
  for (const ev of events) {
    if (ev.kind === 'action') {
      // Try toolUseId pairing first
      if (ev.toolUseId && byToolUseId.has(ev.toolUseId)) {
        resultMap.set(ev.sourceSeq, byToolUseId.get(ev.toolUseId))
      } else {
        lastUnpairedActionSeq = ev.sourceSeq
      }
    } else if (ev.kind === 'result' && lastUnpairedActionSeq !== null) {
      // Sequence pairing fallback: first result after an unpaired action
      if (!ev.toolUseId || !byToolUseId.has(ev.toolUseId)) {
        // This result wasn't claimed by toolUseId, use sequence pairing
        resultMap.set(lastUnpairedActionSeq, ev)
        lastUnpairedActionSeq = null
      }
    }
  }

  return resultMap
}

/**
 * Check if an action event at the given sourceSeq has a paired result.
 */
export function hasResult(resultMap, actionSourceSeq) {
  return resultMap.has(actionSourceSeq)
}

/**
 * Check if result text contains error indicators (case-insensitive).
 */
export function resultHasError(resultText) {
  if (!resultText) return false
  const lower = resultText.toLowerCase()
  return lower.includes('error') || lower.includes('failed') || lower.includes('exception')
}

/**
 * Count errors in the last N events of a session.
 */
export function countRecentErrors(events, windowSize = 20) {
  const slice = events.slice(-windowSize)
  let count = 0
  for (const ev of slice) {
    if (ev.kind === 'result' && resultHasError(ev.result)) {
      count++
    }
  }
  return count
}
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/
git commit -m "feat: add core utilities — plainEnglish, sessionName, sessionStatus, resultPairing"
```

---

## Task 3: useSessions hook — session state management

**Files:**
- Create: `src/hooks/useSessions.js`
- Create: `src/hooks/useSessionScroll.js`
- Create: `src/hooks/useDurationTick.js`

- [ ] **Step 1: Create `src/hooks/useSessions.js`**

```js
import { useRef, useState, useEffect, useCallback } from 'react'
import { computeSessionStatus } from '../utils/sessionStatus'
import { nameFromEvent, fallbackName } from '../utils/sessionName'
import { countRecentErrors } from '../utils/resultPairing'

function createSession(event, meta) {
  return {
    sessionId: event.sessionId,
    agent: event.agent,
    name: fallbackName(event.agent, event.timestamp ? new Date(event.timestamp) : new Date()),
    nameIsFrozen: false,
    parentSessionId: meta?.parentSessionId || null,
    subagentLinks: meta?.subagentLinks ? new Map(Object.entries(meta.subagentLinks)) : new Map(),
    continuationOf: meta?.continuationOf || null,
    events: [],
    inputState: 'idle',
    isOwned: false,
    startedAt: event.timestamp ? new Date(event.timestamp) : null,
    lastEventAt: new Date(),
    lastViewedEventCount: 0,
    errorCount: 0,
  }
}

function updateInputState(session) {
  const events = session.events
  if (events.length === 0) { session.inputState = 'idle'; return }

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.kind === 'action') { session.inputState = 'busy'; return }
    if (ev.kind === 'thinking') { session.inputState = 'busy'; return }
    if (ev.kind === 'result') { session.inputState = 'idle'; return }
    if (ev.kind === 'message') { session.inputState = 'idle'; return }
  }
  session.inputState = 'idle'
}

function updateSessionName(session, event) {
  if (session.nameIsFrozen) return
  const candidate = nameFromEvent(event)
  if (candidate) {
    session.name = candidate
    session.nameIsFrozen = true
  }
}

/**
 * Core session state hook. Returns sessionsRef, version counter, and helpers.
 */
export function useSessions() {
  const sessionsRef = useRef(new Map())
  const [sessionsVersion, setSessionsVersion] = useState(0)
  const [lastEventReceivedAt, setLastEventReceivedAt] = useState(null)
  const [loading, setLoading] = useState(true)

  const ingestEvents = useCallback((events, sessionMeta, isInitialLoad = false) => {
    const sessions = sessionsRef.current
    for (const event of events) {
      let sess = sessions.get(event.sessionId)
      if (!sess) {
        const meta = sessionMeta?.[event.sessionId]
        sess = createSession(event, meta)
        if (isInitialLoad) {
          // On initial load, don't mark pre-existing events as unread
          sess.lastViewedEventCount = 0 // will be set after all events ingested
        }
        sessions.set(event.sessionId, sess)
      }
      sess.events.push(event)
      sess.lastEventAt = new Date()
      if (!sess.startedAt && event.timestamp) {
        sess.startedAt = new Date(event.timestamp)
      }
      updateSessionName(sess, event)
      updateInputState(sess)
      sess.errorCount = countRecentErrors(sess.events, 20)

      // Apply metadata if available and not yet set
      if (sessionMeta?.[event.sessionId] && !sess.parentSessionId) {
        const meta = sessionMeta[event.sessionId]
        if (meta.parentSessionId) sess.parentSessionId = meta.parentSessionId
        if (meta.renamedTo && !sess.nameIsFrozen) {
          sess.name = meta.renamedTo
          sess.nameIsFrozen = true
        }
        if (meta.subagentLinks) {
          for (const [k, v] of Object.entries(meta.subagentLinks)) {
            sess.subagentLinks.set(k, v)
          }
        }
        if (meta.continuationOf) sess.continuationOf = meta.continuationOf
      }
    }

    if (isInitialLoad) {
      // After initial load, set lastViewedEventCount so existing events aren't "unread"
      for (const sess of sessions.values()) {
        sess.lastViewedEventCount = sess.events.length
      }
    }

    setSessionsVersion(v => v + 1)
    setLastEventReceivedAt(new Date())
  }, [])

  // Load initial events
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const response = await window.watchdog.getInitialEvents()
        if (cancelled) return
        // Handle both old format (array) and new format ({ events, sessionMeta })
        const events = Array.isArray(response) ? response : response.events
        const sessionMeta = Array.isArray(response) ? null : response.sessionMeta
        ingestEvents(events, sessionMeta, true)
      } catch (err) {
        console.error('Failed to load initial events:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [ingestEvents])

  // Subscribe to live events
  useEffect(() => {
    const cleanup = window.watchdog.onEvents((newEvents) => {
      ingestEvents(newEvents, null, false)
    })
    return cleanup
  }, [ingestEvents])

  // Re-evaluate status every 30 seconds (sessions age out of states)
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionsVersion(v => v + 1)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const markSessionViewed = useCallback((sessionId) => {
    const sess = sessionsRef.current.get(sessionId)
    if (sess) {
      sess.lastViewedEventCount = sess.events.length
      setSessionsVersion(v => v + 1)
    }
  }, [])

  /**
   * Get sessions grouped for sidebar display.
   * Returns { active: Map<model, Session[]>, today: Session[], yesterday: Session[], thisWeek: Session[], older: Session[] }
   */
  const getGroupedSessions = useCallback(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7)

    const active = new Map() // model → Session[]
    const today = []
    const yesterday = []
    const thisWeek = []
    const older = []

    for (const sess of sessionsRef.current.values()) {
      // Skip sub-agents and continuations from top-level grouping
      // (they appear indented under their parent)
      const status = computeSessionStatus(sess)

      if (status !== 'quiet' && status !== 'unclean' &&
          sess.lastEventAt && (Date.now() - sess.lastEventAt.getTime()) < 10 * 60 * 1000) {
        // Active
        const model = sess.agent
        if (!active.has(model)) active.set(model, [])
        active.get(model).push(sess)
      } else {
        // Historical — group by date
        const lastAt = sess.lastEventAt || sess.startedAt || new Date(0)
        if (lastAt >= todayStart) today.push(sess)
        else if (lastAt >= yesterdayStart) yesterday.push(sess)
        else if (lastAt >= weekStart) thisWeek.push(sess)
        else older.push(sess)
      }
    }

    // Sort each group by most recent first
    const byRecent = (a, b) => (b.lastEventAt || 0) - (a.lastEventAt || 0)
    for (const arr of active.values()) arr.sort(byRecent)
    today.sort(byRecent)
    yesterday.sort(byRecent)
    thisWeek.sort(byRecent)
    older.sort(byRecent)

    return { active, today, yesterday, thisWeek, older }
  }, [sessionsVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    sessionsRef,
    sessionsVersion,
    loading,
    lastEventReceivedAt,
    ingestEvents,
    markSessionViewed,
    getGroupedSessions,
  }
}
```

- [ ] **Step 2: Create `src/hooks/useSessionScroll.js`**

```js
import { useRef, useCallback } from 'react'

/**
 * Manages per-session scroll position memory.
 * Stores scroll positions in a Map ref — changes don't trigger re-renders.
 */
export function useSessionScroll() {
  const scrollPositions = useRef(new Map())

  const saveScrollPosition = useCallback((sessionId, scrollTop) => {
    scrollPositions.current.set(sessionId, scrollTop)
  }, [])

  const getScrollPosition = useCallback((sessionId) => {
    return scrollPositions.current.get(sessionId) ?? null
  }, [])

  return { saveScrollPosition, getScrollPosition }
}
```

- [ ] **Step 3: Create `src/hooks/useDurationTick.js`**

```js
import { useState, useEffect } from 'react'

/**
 * Global 1-second interval counter for running action durations.
 * Components consuming this value re-render every second, but only
 * when the conversation view is mounted.
 */
export function useDurationTick() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return tick
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/
git commit -m "feat: add session state hooks — useSessions, useSessionScroll, useDurationTick"
```

---

## Task 4: Claude adapter changes — sub-agent support + IPC shape

**Files:**
- Modify: `main/adapters/claude.js`
- Modify: `electron.js`

- [ ] **Step 1: Update `main/adapters/claude.js` — remove agent-* skip, add parentSessionId extraction**

In `discoverSessions()`, remove the `agent-*` skip filter and add recursive subagent directory scanning plus `getParentSessionId` helper:

```js
// Replace the discoverSessions function and add getParentSessionId above it:

/**
 * Extract parent session ID from a sub-agent file path.
 * Sub-agents live at: <projectsDir>/<project>/subagents/<parentSessionId>/<agent-file>.jsonl
 */
function getParentSessionId(filePath, sessionId) {
  if (!sessionId.startsWith('agent-')) return null
  const parts = filePath.split(/[/\\]/)
  const idx = parts.indexOf('subagents')
  if (idx > 0 && idx < parts.length - 1) return parts[idx + 1]
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

function _scanDir(dir, project, sessions, depth = 0) {
  if (depth > 4) return // safety cap
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      // Recurse into subagents/ directories
      if (entry.name === 'subagents' || depth > 0) {
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
```

- [ ] **Step 2: Add sub-agent linking sources 2 & 3 to `parseLine()`**

At the top of `parseLine()`, after the `type` check that returns early for non-user/non-assistant, add detection for queue-operation and progress events:

```js
  // ── Sub-agent linking sources 2 & 3 ────────────────────────────
  // These line types are not user/assistant but carry sub-agent metadata.
  // Return them as metadata (no WatchdogEvents emitted).

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
```

- [ ] **Step 3: Update `electron.js` — new IPC response shape and session metadata collection**

Replace the `watchdog:get-initial-events` handler to collect session metadata and return the new shape:

```js
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
    {
      adapter: claude,
      sessions: claude.discoverSessions(claude.getProjectsDir()),
    },
    {
      adapter: codex,
      sessions: codex.discoverSessions(codex.getSessionsDirs()),
    },
    {
      adapter: cursor,
      sessions: cursor.discoverSessions(cursor.getSessionsDirs()),
    },
    {
      adapter: aider,
      sessions: aider.discoverSessions(aider.getSessionsDirs()),
    },
    {
      adapter: antigravity,
      sessions: antigravity.discoverSessions(antigravity.getSessionsDirs()),
    },
  ]

  const allEvents = []
  const sessionMeta = {} // sessionId → { parentSessionId, subagentLinks, renamedTo, continuationOf }

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

      // Initialize session metadata from discovery
      if (!sessionMeta[sessionId]) {
        sessionMeta[sessionId] = {
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

      // Merge collected subagent links into session metadata
      if (Object.keys(subagentLinks).length > 0) {
        sessionMeta[sessionId] = sessionMeta[sessionId] || {
          parentSessionId: session.parentSessionId || null,
          subagentLinks: {},
          renamedTo: null,
          continuationOf: null,
        }
        Object.assign(sessionMeta[sessionId].subagentLinks, subagentLinks)
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
```

- [ ] **Step 4: Update `electron.js` — set minimum window size to 900x620**

Change the `createWindow()` function:

```js
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 620,
    // ... rest unchanged
```

- [ ] **Step 5: Verify format stability gate**

```bash
node scripts/check-format-stability.js
```

Expected: `Gate passed.` (we didn't touch any frozen files)

- [ ] **Step 6: Commit**

```bash
git add main/adapters/claude.js electron.js
git commit -m "feat: add sub-agent discovery and session metadata to IPC response"
```

---

## Task 5: App shell — 2-panel layout, Sidebar skeleton, ConversationView skeleton

**Files:**
- Rewrite: `src/App.jsx`
- Rewrite: `src/App.css`
- Create: `src/components/Sidebar.jsx`
- Create: `src/components/Sidebar.css`
- Create: `src/components/ConversationView.jsx`
- Create: `src/components/ConversationView.css`
- Create: `src/components/ThreadRow.jsx`
- Create: `src/components/InputArea.jsx`

This is a large task. It creates the foundational shell — sidebar with real session data, conversation view that renders events, and the input area. All subsequent tasks (dome, broad view, find bar, etc.) plug into this shell.

- [ ] **Step 1: Rewrite `src/App.css` for 2-panel layout**

Complete replacement of the file. See spec §7 for layout. Remove all old styles. The new CSS uses the design tokens from variables.css.

```css
/* Watch Dog — App shell layout */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: var(--font-sans);
  background: var(--surface-0);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--surface-0);
  color: var(--text-muted);
  font-size: 14px;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
```

- [ ] **Step 2: Rewrite `src/App.jsx` — wire useSessions into 2-panel layout**

```jsx
import { useState, useCallback } from 'react'
import { useSessions } from './hooks/useSessions'
import { useSessionScroll } from './hooks/useSessionScroll'
import Sidebar from './components/Sidebar'
import ConversationView from './components/ConversationView'
import NewSessionView from './components/NewSessionView'

function App() {
  const {
    sessionsRef, sessionsVersion, loading, lastEventReceivedAt,
    markSessionViewed, getGroupedSessions,
  } = useSessions()

  const { saveScrollPosition, getScrollPosition } = useSessionScroll()

  const [activeSessionId, setActiveSessionId] = useState(null)
  const [showAllAgents, setShowAllAgents] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [showBroadView, setShowBroadView] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleSelectSession = useCallback((sessionId) => {
    setActiveSessionId(sessionId)
    setShowAllAgents(false)
    setShowNewSession(false)
    markSessionViewed(sessionId)
  }, [markSessionViewed])

  const handleShowAllAgents = useCallback(() => {
    setShowAllAgents(true)
    setActiveSessionId(null)
    setShowNewSession(false)
  }, [])

  const handleNewSession = useCallback(() => {
    setShowNewSession(true)
    setShowAllAgents(false)
  }, [])

  const handleCloseNewSession = useCallback(() => {
    setShowNewSession(false)
  }, [])

  const activeSession = activeSessionId
    ? sessionsRef.current.get(activeSessionId) || null
    : null

  if (loading) {
    return (
      <div className="app-loading">
        Catching up on what happened...
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        sessionsRef={sessionsRef}
        sessionsVersion={sessionsVersion}
        activeSessionId={activeSessionId}
        showAllAgents={showAllAgents}
        searchQuery={searchQuery}
        lastEventReceivedAt={lastEventReceivedAt}
        onSelectSession={handleSelectSession}
        onShowAllAgents={handleShowAllAgents}
        onNewSession={handleNewSession}
        onSearchChange={setSearchQuery}
        getGroupedSessions={getGroupedSessions}
      />
      <div className="conversation-area" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {showNewSession ? (
          <NewSessionView onClose={handleCloseNewSession} />
        ) : (
          <ConversationView
            session={activeSession}
            showAllAgents={showAllAgents}
            sessionsRef={sessionsRef}
            sessionsVersion={sessionsVersion}
            showBroadView={showBroadView}
            onToggleBroadView={setShowBroadView}
            onSelectSession={handleSelectSession}
            saveScrollPosition={saveScrollPosition}
            getScrollPosition={getScrollPosition}
          />
        )}
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 3: Create `src/components/Sidebar.jsx` and `src/components/Sidebar.css`**

Build the full sidebar with header, search, all-agents row, grouped thread list, and footer. This is the largest single component. Follow spec §8 exactly for layout, sizing, and copy.

The sidebar component receives `sessionsRef`, `sessionsVersion`, and callbacks. It computes the grouped session list via `getGroupedSessions()` and renders sections.

Key sub-elements:
- Header with title "Watch Dog", active count subtitle, compose button (IconEdit)
- Search bar with Cmd+K focus, X clear button
- "All agents" row with IconUsers
- ACTIVE section with model sub-labels
- TODAY/YESTERDAY/THIS WEEK/OLDER sections with "Show N more" collapse
- ThreadRow for each session (import from ThreadRow.jsx)
- Footer with "synced N ago" and green dot

- [ ] **Step 4: Create `src/components/ThreadRow.jsx`**

A single session row component. Receives `session`, `isSelected`, `onClick`. Renders:
- Avatar circle with agent colour and model code
- Status dot (per 6-state model)
- Session name
- Preview text (from plainEnglish.eventPreview)
- Relative time
- Error badge (amber `⚠ N` when errorCount >= 1)
- Unread dot (blue 5px when events.length > lastViewedEventCount)
- Sub-agent/continuation indent styling

- [ ] **Step 5: Create `src/components/ConversationView.jsx` and `src/components/ConversationView.css`**

The conversation view shell. Renders:
- Thread header with avatar, session name, status badge, action phrase, dots + buttons when busy
- Message scroll area with auto-scroll logic (within 50px of bottom)
- Render cap of 500 events with "Load earlier messages" button
- InputArea at bottom
- GlassDome positioned absolute bottom-right (placeholder for now — just an empty div)

Events rendered via MessageBubble and ActionCard components (created in Task 6).

- [ ] **Step 6: Create `src/components/InputArea.jsx`**

Renders different states:
- Idle: text input with "Message [agent name]..." placeholder + Send button
- Busy: "Send a note for when it's free..." + Queue button
- Waiting: "Claude is waiting for your response" in blue
- Read-only: "This session wrapped up [time]. Start a new one →"
- Phase 1 tooltip on Send/Queue: "This is coming soon — for now, keep an eye on what it's doing"

- [ ] **Step 7: Create `src/components/NewSessionView.jsx`**

Model selector pills, prompt textarea, Start button. Phase 1: shows CLI instruction block or Cursor instruction. Copy button for CLI command.

- [ ] **Step 8: Verify app launches with `npm run dev`**

The app should show the sidebar with real sessions (from `~/.claude/projects/`) and clicking a session should show its events in the conversation area. The old EventFeed is no longer imported.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/App.css src/components/Sidebar.jsx src/components/Sidebar.css src/components/ThreadRow.jsx src/components/ConversationView.jsx src/components/ConversationView.css src/components/InputArea.jsx src/components/NewSessionView.jsx
git commit -m "feat: replace EventFeed with 2-panel chat layout — sidebar, conversation, input area"
```

---

## Task 6: Message rendering — bubbles, action cards, delegation badges

**Files:**
- Create: `src/components/MessageBubble.jsx`
- Create: `src/components/ActionCard.jsx`
- Create: `src/components/DelegationBadge.jsx`

- [ ] **Step 1: Create `src/components/MessageBubble.jsx`**

Renders bubble types A (agent message), B (thinking), D (user message), E (interrupt marker), F (BTW delivered). Each type has distinct styling per spec §10.5.

Session dividers (from `kind: 'session_start'`) rendered as centered text with flanking lines. System messages (`role: 'system'`, not `session_start`) silently dropped.

- [ ] **Step 2: Create `src/components/ActionCard.jsx`**

Renders type C: icon square with action-type tint, label in present/past tense (via `actionLabel()`), target path as subtext, duration (for Claude/Codex with timestamps), quantitative context, result pill below. Clicking expands result text as monospace code block.

Uses `useDurationTick()` for running actions to update "running Xm Ys+" every second.

Result pill states:
- Success: IconCheck green, "N chars" or "done"
- Error: IconAlertTriangle warning, "ran into a problem · expand to see"
- Empty: IconMinus muted, "no output"

- [ ] **Step 3: Create `src/components/DelegationBadge.jsx`**

Type G: inline pill for `action: 'task'` events. Shows "Delegated [task name] to a new agent". Clickable — if subagentLinks has a matching entry, navigates to that sub-agent's thread via `onSelectSession`.

- [ ] **Step 4: Verify all bubble types render in a real session**

Open the app, select a session that has messages, thinking, actions, and results. Verify:
- Agent messages left-aligned with coloured border
- Thinking bubbles italic with dashed border
- User messages right-aligned in blue
- Action cards with icons and labels
- Result pills below action cards

- [ ] **Step 5: Commit**

```bash
git add src/components/MessageBubble.jsx src/components/ActionCard.jsx src/components/DelegationBadge.jsx
git commit -m "feat: add message bubbles, action cards with duration and context, delegation badges"
```

---

## Task 7: Keyboard navigation and find bar

**Files:**
- Create: `src/components/FindBar.jsx`
- Modify: `src/App.jsx` (add keyboard handlers)
- Modify: `src/components/Sidebar.jsx` (add arrow key navigation)

- [ ] **Step 1: Create `src/components/FindBar.jsx`**

Between header and messages. Cmd+F toggles visibility. Searches all events (not just rendered 500). Shows match count "N of M", up/down navigation, escape closes. Highlighted matches get amber background.

If match is outside rendered 500, triggers load-earlier and scrolls with "Found in earlier messages, loading..." inline message.

- [ ] **Step 2: Add keyboard shortcuts to `src/App.jsx`**

Add a `useEffect` with `keydown` listener:
- `Cmd+K` / `Ctrl+K`: focus sidebar search
- `Cmd+N` / `Ctrl+N`: open new session view
- `Cmd+F` / `Ctrl+F`: toggle find bar (when conversation view active)
- `Escape`: close broad view > close find bar > clear search

- [ ] **Step 3: Add arrow key navigation to Sidebar**

`Up/Down` moves selection. `Enter` opens. Track a `focusedIndex` state in Sidebar. Arrow keys update it, Enter calls `onSelectSession`.

- [ ] **Step 4: Verify keyboard shortcuts work**

Test: Cmd+K focuses search, Cmd+N opens compose, arrow keys navigate sidebar, Cmd+F opens find bar, Escape closes things in priority order.

- [ ] **Step 5: Commit**

```bash
git add src/components/FindBar.jsx src/App.jsx src/components/Sidebar.jsx
git commit -m "feat: add find bar and keyboard navigation"
```

---

## Task 8: All agents view

**Files:**
- Create: `src/components/AllAgentsView.jsx`
- Modify: `src/components/ConversationView.jsx` (conditionally render AllAgentsView)

- [ ] **Step 1: Create `src/components/AllAgentsView.jsx`**

Shows all events from all sessions interleaved chronologically. Session identifier row (small avatar + session name + model + time) before each contiguous block from the same session. Don't repeat identifier for back-to-back same-session messages. Read-only input area: "Select a session to send a message".

- [ ] **Step 2: Wire into ConversationView**

When `showAllAgents` is true, render AllAgentsView instead of the session-specific conversation.

- [ ] **Step 3: Commit**

```bash
git add src/components/AllAgentsView.jsx src/components/ConversationView.jsx
git commit -m "feat: add all-agents interleaved view"
```

---

## Task 9: Glass dome minimap

**Files:**
- Create: `src/utils/minimapLayout.js`
- Create: `src/components/GlassDome.jsx`

- [ ] **Step 1: Create `src/utils/minimapLayout.js`**

Implements the dome tree layout algorithm:
- Select up to 14 sessions: parent chains first (walk ancestry), then fill with most-recent-active standalones
- Assign columns by hierarchy depth (roots=0, sub-agents=1, etc.), max 4 columns
- Distribute nodes vertically within columns, centering children around parent Y
- Returns `{ nodes: [{sessionId, x, y, radius, color, status}], lines: [{x1,y1,x2,y2,color}] }`

- [ ] **Step 2: Create `src/components/GlassDome.jsx`**

Dark translucent pill (210x70px, border-radius 35px) positioned absolute bottom-right. SVG interior with left-to-right tree. Status rings on nodes (static, no animation). Connection lines parent→child. "+N" overflow indicator. "N active" label below dome. Click opens broad view. Hover tooltip "See what everyone's up to".

Recalculates only when sessionsVersion changes AND session list or status actually changed (memoize with useMemo).

- [ ] **Step 3: Verify dome renders with real sessions**

Open app, verify dome shows in bottom-right corner with coloured dots for active sessions.

- [ ] **Step 4: Commit**

```bash
git add src/utils/minimapLayout.js src/components/GlassDome.jsx
git commit -m "feat: add glass dome minimap with left-to-right tree layout"
```

---

## Task 10: Broad view — mission control overlay

**Files:**
- Create: `src/utils/networkLayout.js`
- Create: `src/components/BroadView.jsx`
- Create: `src/components/NetworkGraph.jsx`
- Create: `src/components/StatusPills.jsx`

- [ ] **Step 1: Create `src/utils/networkLayout.js`**

Left-to-right hierarchical layout for the broad view. Same direction as the dome but at full scale. Roots in leftmost column, sub-agents right. Calculate positions via `getBoundingClientRect()` on mount. Returns `{ nodes: [{sessionId, x, y, width, height}], lines: [{from, to, x1, y1, x2, y2, color}] }`.

- [ ] **Step 2: Create `src/components/NetworkGraph.jsx`**

SVG connection layer (delegation lines with animated flowing dots) + HTML node cards. Each card shows avatar, session name, model, current action, status phrase. Done nodes at 0.3 opacity. "Add model" placeholder when <3 agent types active.

- [ ] **Step 3: Create `src/components/StatusPills.jsx`**

Bottom strip: 48px, flex row of clickable session pills. Each pill: status dot + agent code + session name (<=20 chars) + action (<=22 chars). Only working/waiting/idle/stale sessions. Empty: "all agents idle".

- [ ] **Step 4: Create `src/components/BroadView.jsx`**

Full overlay (position absolute inset 0, z-index 20). Header: "What's everyone working on", sub-header with active count and project name (when shared cwd). NetworkGraph in flex:1 area. StatusPills at bottom. Escape or Close button closes. Clicking node closes and navigates to session.

- [ ] **Step 5: Wire dome click → broad view open in ConversationView**

GlassDome's onClick calls `onToggleBroadView(true)`. BroadView renders when `showBroadView` is true.

- [ ] **Step 6: Verify full flow**

Click dome → broad view opens with node cards and pills. Click a node → broad view closes, session opens. Escape → broad view closes. Status pills clickable.

- [ ] **Step 7: Commit**

```bash
git add src/utils/networkLayout.js src/components/BroadView.jsx src/components/NetworkGraph.jsx src/components/StatusPills.jsx src/components/ConversationView.jsx src/components/GlassDome.jsx
git commit -m "feat: add broad view mission control with network graph and status pills"
```

---

## Task 11: Light/dark theme toggle and final polish

**Files:**
- Modify: `src/App.jsx` (add theme detection)
- Various CSS tweaks across components

- [ ] **Step 1: Add system theme detection**

In App.jsx, add a `useEffect` that reads `prefers-color-scheme` and sets `data-theme` on `document.documentElement`. This makes the CSS variables respond to system preference automatically.

```js
useEffect(() => {
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const handler = (e) => {
    document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark')
  }
  handler(mq)
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}, [])
```

- [ ] **Step 2: Verify both themes**

Switch system theme (or manually set `data-theme="light"` on `<html>`). All surfaces, text, borders, badges should switch correctly.

- [ ] **Step 3: Run full format stability check**

```bash
node scripts/check-format-stability.js
```

Expected: `Gate passed.`

- [ ] **Step 4: Run required test scripts**

```bash
node scripts/test-codex-fixtures.js
node scripts/test-antigravity.js
node scripts/test-discovery-hardening.js
node scripts/test-watcher-newdir.js
```

All should pass. The Claude adapter changes (Task 4) only ADD functionality — existing tests should still pass.

- [ ] **Step 5: Verify `npm run dev` starts cleanly, no console errors**

Launch the app. Open DevTools console. No errors should appear.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add theme detection and final polish for Watch Dog UI v2"
```

---

## Task 12: [INVESTIGATE] items — /rename and /resume formats

**Files:**
- Modify: `main/adapters/claude.js` (after investigation confirms format)

- [ ] **Step 1: [INVESTIGATE A] — Find /rename format in real JSONL**

```bash
# Search for rename-related entries in real Claude session files
grep -r "rename" ~/.claude/projects/ --include="*.jsonl" -l | head -5
```

Open the found file, search for the rename record. Document the JSON structure as a comment in `main/adapters/claude.js`.

- [ ] **Step 2: [INVESTIGATE B] — Find /resume continuation format**

```bash
# Search for resume/continuation-related entries
grep -r "resume\|sourceSession\|continue" ~/.claude/projects/ --include="*.jsonl" -l | head -5
```

Open the found file, identify the field linking to the prior session. Document inline.

- [ ] **Step 3: Implement rename extraction if format confirmed**

Add detection in `parseLine()` or in the discovery loop in `electron.js`. Set `sessionMeta[id].renamedTo`.

- [ ] **Step 4: Implement continuation detection if format confirmed**

Add detection and set `sessionMeta[id].continuationOf`.

- [ ] **Step 5: Commit**

```bash
git add main/adapters/claude.js electron.js
git commit -m "feat: extract /rename and /resume metadata from Claude session files"
```

---

## Summary

| Task | What it builds | Depends on |
|---|---|---|
| 1 | CSS variables + dependency | — |
| 2 | Core utilities (plainEnglish, naming, status, pairing) | — |
| 3 | useSessions hook (state management) | 2 |
| 4 | Claude adapter + IPC shape | — |
| 5 | App shell (sidebar + conversation + input) | 1, 2, 3, 4 |
| 6 | Message bubbles + action cards | 2, 5 |
| 7 | Keyboard nav + find bar | 5 |
| 8 | All agents view | 5, 6 |
| 9 | Glass dome minimap | 2, 5 |
| 10 | Broad view mission control | 9 |
| 11 | Theme toggle + final polish | all |
| 12 | [INVESTIGATE] /rename + /resume | 4 |

Tasks 1, 2, and 4 can run in parallel (no dependencies between them). Task 5 is the critical path. Tasks 6-10 can partially parallelize after Task 5.
