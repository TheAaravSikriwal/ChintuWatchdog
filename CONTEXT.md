# Watch Dog — Project Context & Handoff

Complete handoff for continuing/planning work. Written 2026-07-17. Supersedes
the earlier pre-UI handoff.

---

## 1. What this is (and the product vision)

**Watch Dog** is a desktop app that lets a **non-technical person supervise AI
coding agents** (Claude Code, Codex, Cursor, Aider, Antigravity). It watches the
agents' local session log files, parses them mechanically, and shows what each
agent is doing.

**The vision, in one line:** *a calm window into everything an agent is doing,
shown as simple plain-English text messages — like the agent is texting you
updates — with the real technical detail always one tap away.*

Concretely, three kinds of activity are all narrated as chat messages:
- **The agent's own work** — "Looked at App.jsx", "Ran the tests", "Updated config.json"
- **Background tasks** — async commands the *same* agent kicked off ("Started the dev server in the background"). NOT a separate agent.
- **Sub-agents** — jobs the agent delegates via the Agent/Task tool ("A helper finished: Review the frontend"). These get their own thread.

"Glass into everything": every message is plain English on the surface, but
tapping it reveals the raw detail (tool name, full command/path, timing, output).

**Values (non-negotiable):**
- No API, no LLM, no model, no subscription, no server, no network, no database. Parsing + display are purely mechanical.
- Read-only. Never writes to agent session files.
- Downstream of the Chintu ethos (wearechintu.com — Git without the terminal): no extraction from users.

**Sibling product:** Chintu (separate app; may dock visually someday, no comms between them).

---

## 2. Current status (2026-07-17)

Watch Dog is a **working Electron app**. On the dev machine it loads **~22 real
Claude Code sessions (~5,000+ events)** with no errors. The UI is a chat-style
supervision surface.

**Recent redesign direction (this is the active thread):** the feed is being
turned into an **iMessage-style chat** where *every* action is a plain-English
bubble with detail-on-demand. This is largely built but there's a clear runway
of polish/decisions left (see §7).

All recent work lives on branch **`fix/result-pairing-and-agent-identity`**
(6 commits, **not pushed**, branched off `main` @ `5b42611`).

---

## 3. Architecture

```
[Agent session files on disk]  (~/.claude/projects, ~/.codex/sessions, …)
        |  chokidar file watching (main process)
        v
[Per-tool adapters]  --->  [Normalized WatchdogEvent stream]
  main/adapters/*.js          main/event.js defines the shape
        |  main/session-parse.js (shared parse + dedup + metadata)
        v
[watcher.js]  --IPC-->  [preload.js]  -->  [React renderer]
                                            src/ (App, hooks, components)
```

**The IPC boundary enforces the abstraction:** the renderer only ever sees the
normalized `WatchdogEvent` shape, never raw agent formats.

### Main process (`main/` + root)

| File | Purpose |
|---|---|
| `electron.js` | BrowserWindow + IPC. `watchdog:get-initial-events` returns `{ events, sessionMeta }`; live channel sends `{ events, sessionMeta }`. Uses `session-parse.js`. |
| `preload.js` | Context-isolated bridge (`window.watchdog`). **Checksum-gated — keep byte-stable.** |
| `main/event.js` | `WatchdogEvent` typedef, `normalizeToolCall`, `truncateResult`, `isFileTouching`, `compareEvents`. **Checksum-gated.** |
| `main/tool-map.js` | raw tool name → normalized action. Grows per adapter (not gated). |
| `main/session-parse.js` | **Shared** `processLines()` + metadata accumulator. Used by BOTH `watcher.js` (live) and `electron.js` (initial load) — single source of the parse/dedup/metadata logic. |
| `main/watcher.js` | `SessionWatcher`: chokidar over all 5 agent dirs, coalesced batches, 8192-overflow→fullSync, per-file byte offset + partial-line holdback, periodic rescan for late-appearing agents. Threads `sessionMeta` up through `onEvents`. |
| `main/adapters/claude.js` | Claude Code. **Done, tested against real data.** Discovers sessions + sub-agent files; parses content polymorphism, thinking blocks, system-message skips, `/rename`, `/resume` continuation, and sub-agent linking (see §5). |
| `main/adapters/{codex,cursor,aider,antigravity}.js` | Written + wired into the watcher, with fixture test scripts, but **NOT verified against real installs** (only Claude is installed on the dev machine). |

### Renderer (`src/`)

| File | Purpose |
|---|---|
| `App.jsx` | Top-level state: `activeSessionId`, `showAllAgents`, `allAgentsDay`, `showNewSession`, `showBroadView`, search, find bar. Keyboard shortcuts. |
| `hooks/useSessions.js` | The session store: `Map<sessionId, Session>`, `ingestEvents` (idempotent via per-session `seenSeqs`), grouping by active/day, naming, live metadata application. |
| `hooks/useSessionScroll.js`, `hooks/useDurationTick.js` | Per-session scroll memory; 1s tick for running durations. |
| `components/Sidebar.jsx` | Header, search, **All-Agents day list** (Today/Yesterday/…), session sections (Active grouped by agent; historical by date), footer. |
| `components/ConversationView.jsx` | Single-session thread: header, session dividers, message scroll, find bar, input area. Hosts the dome + broad view + All-Agents view. |
| `components/AllAgentsView.jsx` | **Per-day** interleaved feed across all sessions, with a day navigator (prev/next, "live" badge). |
| `components/ActionCard.jsx` | **An action rendered as a plain-English iMessage bubble** with a background/helper tag, running/done status, and an expandable detail drawer (tool/command/timing/output). Handles foreground, background, and delegation. |
| `components/MessageBubble.jsx` | Message (agent/user), thinking, and session-divider bubbles. iMessage radii. |
| `components/GlassDome.jsx`, `BroadView.jsx`, `NetworkGraph.jsx`, `StatusPills.jsx` | The corner "dome" + mission-control overlay showing a session and its sub-agents (built from `parentSessionId`). |
| `components/{InputArea,FindBar,NewSessionView}.jsx` | Phase-1 input (copy CLI command), Cmd+F search, new-session helper. |
| `utils/plainEnglish.js` | `actionLabel`, **`narrateAction`** (foreground/background/delegation → line + tag), command friendly-naming, quantitative context. |
| `utils/actionClassify.js` | `classifyAction(event, subagentLinks, sessionsRef)` → `foreground | background | delegation`. |
| `utils/agentIdentity.js` | **Single source** of `AGENT_COLORS` / `AGENT_CODES` (theme-independent). |
| `utils/dayGrouping.js` | Day keys/labels + `getActivityDays()` for the All-Agents day list. |
| `utils/{sessionName,sessionStatus,resultPairing,minimapLayout,networkLayout}.js` | Naming, 6-state status, action↔result pairing, dome/graph layout. |

---

## 4. Event format (the stable contract)

`main/event.js`. Display reads ONLY this shape.

```
WatchdogEvent {
  agent:      'claude-code'|'codex'|'cursor'|'aider'|'antigravity'
  sessionId:  string
  timestamp:  string | null          (ISO 8601; null e.g. Aider)
  sourceSeq:  number                 (monotonic PER FILE, resets to 0 per file;
                                      one raw line may emit several)
  role:       'user'|'assistant'|'system'
  kind:       'session_start'|'message'|'thinking'|'action'|'result'
  text?:      string                 (message/thinking)
  action?:    'read_file'|'write_file'|'edit_file'|'run_command'|'search'|'task'|'other'
  target?:    string                 (file path / command / task description)
  rawTool?:   string                 (original tool name)
  toolUseId?: string                 (pairs action <-> result)
  result?:    string                 (truncated to 2000 chars)
  cwd?:       string
}
```

**`sourceSeq` gotcha:** it resets per file, so it is unique only WITHIN a
session. Anything keying across sessions must use `sessionId + sourceSeq`
(learned the hard way — see the All-Agents fix in §6).

---

## 5. Sub-agents, background tasks, and delegation (important — was the main confusion)

Claude emits a **`queue-operation` line with `operation: 'enqueue'`** whenever it
launches an async job. The linking info is **XML embedded inside the `content`
string** (NOT top-level fields):

```
<task-notification><task-id>a0a1…</task-id><tool-use-id>toolu_…</tool-use-id>…
```

- `claude.js` parses this → `subagentLinks[toolUseId] = 'agent-' + taskId`.
- If a session file **`agent-<taskId>.jsonl`** exists (under `<parent>/subagents/`) → it's a **real sub-agent** (own thread, own `parentSessionId`).
- If it does **not** exist → it's a **background task** (async shell command; same agent, no thread).

`classifyAction()` uses exactly this: linked + session exists → delegation;
linked + no session → background; else → foreground.

**On the dev machine right now:** 5 real sub-agents across 2 parents —
`1642612b…` ("reviw the code in this folder", 2 helpers) and `c836d5ad…`
("hello hello", 3 helpers). Everything else's "tasks" are background shell jobs.

The BroadView/dome builds its sub-agent tree from **`parentSessionId`** (reverse
link from the file path), independent of `subagentLinks` (the forward link used
by the delegation bubble).

---

## 6. What was done this session (branch `fix/result-pairing-and-agent-identity`)

1. **`0591474` fix:** All-Agents result **mispairing** (keyed by `sourceSeq`
   alone across sessions → collisions) + **live session metadata** was silently
   dropped. Extracted `main/session-parse.js` so the watcher and initial-load
   share one parse/dedup/metadata implementation; `/rename`, sub-agent links,
   and continuation now apply live. `/rename` is now authoritative over the
   auto-derived name.
2. **`c943d4e` refactor:** consolidated `AGENT_COLORS`/`AGENT_CODES` (were
   copy-pasted in 8 files) into `utils/agentIdentity.js`. Added `dev:vite` npm
   script + `.claude/launch.json`.
3. **`ed72dcf` fix:** **sub-agent detection** (parse the `<task-notification>`
   XML — previously read non-existent top-level fields, so 0 links; now 34
   links / 10 sessions) + **All-Agents "extremely buggy"** root cause =
   duplicate React keys from **double-ingestion** (StrictMode double-loads;
   ingest had no dedup). Fixed with idempotent ingest (`seenSeqs`); also fixed
   chats showing duplicated messages. Filter to renderable events before
   slicing so headers don't duplicate/vanish. `DelegationBadge` (and later all
   delegations) only navigate when the target session exists.
4. **`d094f68` feat:** **All-Agents = per-day chat + history.** Sidebar lists
   days under "All agents" (Today is live). Feed shows one day at a time with
   prev/next navigation. Also skip `<ide_*>` envelopes in session naming.
5. **`6122c3e` feat:** **plain-English narration of every action** +
   **detail-on-demand**. `actionClassify.js` + `narrateAction()`. `ActionCard`
   became an expandable message. `DelegationBadge` retired (unified into
   ActionCard). `claude.js` derives the delegation description so the helper
   line says what was handed off.
6. **`faa4deb` style:** action messages rendered as **iMessage-style bubbles**;
   unified all bubbles on Apple radii (incoming tail bottom-left; outgoing =
   solid marigold, white text, tail bottom-right).

Every change verified against the real-data snapshot in a browser; builds clean.

---

## 7. Open threads / next steps (for planning)

**Product / UX (the active design conversation):**
- **Within-day header density:** even scoped to one day, concurrent sessions
  still interleave event-by-event → many session headers on a busy day. Decision
  offered but not made: keep strict chronological vs. **group each session's run
  together**. This is the top open UX question.
- **Tone pass** on message/thinking copy so the whole feed reads in one warm voice.
- **"N sub-agents" marker** on a parent session's header/sidebar row, so sessions
  with helpers are findable without opening the dome.
- Consider surfacing a sub-agent's *own* progress inline in the parent thread
  (currently you must click into the helper thread).

**Engineering:**
- **Other adapters unverified** against real installs (codex/cursor/aider/
  antigravity) — only Claude is installed on the dev machine.
- **Efficiency** (from the initial code review, still open): watcher re-reads the
  whole file on each change; startup double-parses every file (watcher priming +
  get-initial-events). Fine at current scale.
- **`scripts/check-format-stability.js` baselines are STALE** (were already red
  before this session; not maintained). `event.js`/`preload.js`/`EventFeed.jsx`
  are byte-identical to their committed HEAD, but don't match the gate's old
  hashes. Decide whether to rebaseline or retire the gate.
- **Branch not pushed**; no PR yet.

---

## 8. How to run it

**Real app (Electron, live data):**
```
npm install
npm run dev          # Vite on :5174 + Electron window with real ~/.claude data
```

**Browser review mode (snapshot, no Electron):** there is currently
**uncommitted dev-only scaffolding** used to review the UI in a plain browser
(a browser can't read `~/.claude`, so it loads a captured snapshot):
- `src/devMock.js` — installs a mock `window.watchdog` from `public/__devdata.json`
- a guarded block in `src/main.jsx` (`import.meta.env.DEV && !window.watchdog`)
- `public/__devdata.json` — snapshot generated by a scratch script that runs the
  Claude adapter over `~/.claude` and writes `{ events, sessionMeta }`
```
npm run dev:vite     # Vite only, on :5174 → open http://localhost:5174
```
This scaffolding is **not committed** and is **snapshot-only (not live)**. It
should be removed (or promoted to a proper dev fixture) before the branch is
finalized. The real product path is Electron.

**Stack:** Electron 41, Vite 8 + React 18 (plain JS, JSDoc typedefs), chokidar 4,
@tabler/icons-react, Inter/JetBrains Mono/Fraunces fonts. Node v20 on dev machine
(some non-blocking engine warnings). No TypeScript.

---

## 9. Conventions & gotchas

- **Plain JS + JSDoc**, no TypeScript.
- **Agent identity colors/codes** are fixed & theme-independent → `utils/agentIdentity.js` only. Everything else themes via CSS variables in `src/styles/variables.css` (warm "marigold" dark + light).
- **Warm, plain, non-technical voice** everywhere. Relative time. Lowercase status labels. Never show raw field names (toolUseId, sessionId, kind) in the UI.
- `sourceSeq` is per-file — key cross-session things by `sessionId + sourceSeq`.
- StrictMode double-invokes effects in dev — ingest must stay idempotent.
- The old CONTEXT said "watcher is Claude-only / Codex untested" — that's stale; the watcher wires all 5 adapters.
