# Watch Dog — UI Implementation Spec (Consolidated)

**Date:** 2026-07-16
**Status:** Approved — ready for implementation
**Sources:** Merges watchdog-ui-spec-v2.md, watchdog-spec-qa.md, watchdog-spec-addendum-v1.md, watchdog-final-answers.md, watchdog-final-r1-r6.md. All overrides pre-applied. This is the single source of truth.

---

## 1. What this builds

Watch Dog is an iMessage-style desktop app where AI agents are your employees. Each agent session is a chat thread. You message them, they update you, you can interrupt and redirect. The app shows a live glass dome — a dark translucent pill in the corner that expands into a mission-control network view showing every agent, what they're doing, and how they're connected.

**Target user:** Non-technical people supervising AI coding agents. The app should feel like a calm, friendly colleague giving updates — not a developer tool displaying logs.

**Values line (non-negotiable):** No API, no LLM, no model, no subscription, no server — ever. Parsing and display are purely mechanical. Read-only. Never writes to agent session files.

---

## 2. Frozen files — do not touch

- `main/event.js` (checksum gated)
- `preload.js` (checksum gated)
- `src/components/EventFeed.jsx` (checksum gated — leave on disk, stop importing)

Run `node scripts/check-format-stability.js` before and after implementation. Both must be green.

---

## 3. Tone and language

**Voice:** Warm, plain, self-aware, and a little human. Never robotic, never technical, never cold.

**Status labels (lowercase everywhere):**

| Status | Display text | Tooltip/context |
|---|---|---|
| `working` | working on it | — |
| `waiting` | waiting for you | — |
| `idle` | paused | taking a breather |
| `quiet` | done | finished |
| `stale` | might be stuck | stopped mid-action |
| `unclean` | something went wrong | ran into a problem |

**Action card tense:** Present continuous while happening → past tense after result arrives.
- `Editing config.json` → `Edited config.json`
- `Running tests` → `Ran tests`
- `Reading AuthProvider.jsx` → `Read AuthProvider.jsx`

**Error badge:** `hiccups` not `errors`. Show `⚠ N` on badge, tooltip: "hit a few problems — still going"

**Empty states:**
- No agents: "No agents running yet. Start a Claude Code or Cursor session and Watch Dog will pick it up automatically."
- Loading: "Catching up on what happened..."
- Session ended: "This session wrapped up [relative time]. Start a new one →"
- Broad view header: "What's everyone working on"

**General rules:**
1. Present continuous while happening. Past tense after result.
2. Never show internal field names (toolUseId, sessionId, kind).
3. Never show error codes/stack traces as first thing — user can expand to see raw output.
4. Relative time everywhere. "2 minutes ago", "just now".
5. Lowercase labels unless proper noun.
6. Would a thoughtful person say this out loud? If it sounds like a log file, rewrite it.

---

## 4. CSS variables and theming

Create `src/styles/variables.css`. Import at the top of `src/main.jsx`.

```css
:root {
  --surface-0: #0C1221;
  --surface-1: #111D35;
  --surface-2: #1A2540;
  --surface-3: #1E2D52;
  --text-primary: #E8EAF0;
  --text-secondary: #8B92A8;
  --text-muted: #4A5270;
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.15);
  --border-danger: rgba(239,68,68,0.4);
  --fill-accent: #2563EB;
  --on-accent: #ffffff;
  --bg-accent: rgba(37,99,235,0.15);
  --text-accent: #60A5FA;
  --border-accent: rgba(37,99,235,0.4);
  --bg-success: rgba(34,197,94,0.15);
  --text-success: #4ADE80;
  --bg-danger: rgba(239,68,68,0.15);
  --text-danger: #F87171;
  --bg-warning: rgba(251,191,36,0.15);
  --text-warning: #FCD34D;
  --bg-pro: rgba(124,58,237,0.15);
  --text-pro: #A78BFA;
  --fill-ghost-hover: rgba(255,255,255,0.05);
  --radius: 8px;
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
    --bg-accent: rgba(37,99,235,0.1);
    --text-accent: #1D4ED8;
    --fill-ghost-hover: rgba(0,0,0,0.04);
    --bg-success: rgba(34,197,94,0.1);
    --text-success: #16A34A;
    --bg-danger: rgba(239,68,68,0.1);
    --text-danger: #DC2626;
    --border-danger: rgba(239,68,68,0.3);
    --bg-warning: rgba(251,191,36,0.1);
    --text-warning: #D97706;
    --bg-pro: rgba(124,58,237,0.1);
    --text-pro: #7C3AED;
    --border-accent: rgba(37,99,235,0.3);
  }
}
```

---

## 5. Agent identity colours (fixed, theme-independent)

| Model | Avatar bg | Code | Bubble border |
|---|---|---|---|
| Claude Code | `#EA8C1D` | CL | `#EA8C1D` |
| Cursor | `#2563EB` | CX | `#2563EB` |
| Codex | `#16A34A` | CO | `#16A34A` |
| Antigravity | `#7C3AED` | AG | `#7C3AED` |
| All agents | `#64748B` | — | — |

Text on all backgrounds: `#ffffff`.

Action card icon backgrounds use action-type tints (not agent colour):
- Read/Run (amber): `#FFF0DC`
- Edit (green): `#E8F5E9`
- Write (blue): `#EFF6FF`
- Search/Other: `var(--surface-2)`
- Task/delegate: `var(--bg-pro)`

---

## 6. Session status — 6-state model

| State | Color | Hex | Condition |
|---|---|---|---|
| `working` | Green | `#22C55E` | Last event <1 min ago AND not waiting |
| `waiting` | Blue | `#3B82F6` | `isWaitingForUser()` true AND <10 min |
| `idle` | Gray | `#6B7280` | 1-10 min, no unpaired action |
| `quiet` | Gray 40% | `#6B7280` 40% | >10 min, no unpaired action |
| `stale` | Amber | `#F59E0B` | 10-60 min, has unpaired action |
| `unclean` | Red | `#EF4444` | >60 min, has unpaired action |

```js
function computeSessionStatus(session) {
  const age = Date.now() - session.lastEventAt.getTime()
  const hasUnpairedAction = session.inputState === 'busy'
  if (age > 60 * 60 * 1000 && hasUnpairedAction) return 'unclean'
  if (age > 10 * 60 * 1000 && hasUnpairedAction) return 'stale'
  if (age > 10 * 60 * 1000) return 'quiet'
  if (isWaitingForUser(session)) return 'waiting'
  if (age > 60 * 1000) return 'idle'
  return 'working'
}

function isWaitingForUser(session) {
  const age = Date.now() - session.lastEventAt.getTime()
  if (age > 10 * 60 * 1000) return false
  const events = session.events
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === 'thinking') return false
    if (events[i].kind === 'action') return false
    if (events[i].kind === 'message' && events[i].role === 'assistant') return true
    if (events[i].kind === 'message' && events[i].role === 'user') return false
  }
  return false
}
```

Re-evaluate all sessions every 30 seconds via `setInterval`.

---

## 7. Layout

Two panels. No third panel. Minimap dome and broad view overlay on the conversation area.

```
+-- sidebar 265px ------+-- conversation area (flex:1, position:relative) --+
|                        |                                                   |
|  [header + compose]    |  [thread header]                                  |
|  [search bar]          |  [find bar — when Cmd+F active]                   |
|  [all agents row]      |  [message scroll area]                            |
|  [active section]      |  [input area]                                     |
|  [history sections]    |                                                   |
|  [footer]              |  [glass dome] <-- bottom-right corner             |
|                        |  [broad view overlay -- position:absolute inset:0] |
+------------------------+---------------------------------------------------+
```

Window minimum size: 900 x 620px.
Sidebar: fixed 265px, not resizable.

---

## 8. Sidebar

### 8.1 Header

```
Watch Dog                                              [compose btn]
3 active · 24 sessions total
```

- Title: 15px/500, `var(--text-primary)`
- Subtitle: 11px, `var(--text-secondary)` — live count of sessions with status `working` or `waiting` + total
- Compose button `[compose]`: 28x28px, `border-radius: var(--radius)`, `background: var(--surface-2)`, `border: 0.5px solid var(--border)`. Icon: `IconEdit` at 15px. Opens New Session view.
- Border bottom: `0.5px solid var(--border)`. Padding: 14px 13px 11px.

### 8.2 Search bar

Always visible below header.

```
[ magnifier  Search sessions...                        ]
```

- Full width minus padding. `border-radius: var(--radius)`. `background: var(--surface-0)`. `border: 0.5px solid var(--border)`. Padding: 7px 11px. Font-size 12px.
- Filters ALL sessions in real time by session name. Case-insensitive substring.
- When searching: flat list, no section headers, matching substring bolded, small X to clear.
- `Cmd+K` / `Ctrl+K`: focuses search from anywhere.

### 8.3 All agents row

Between search bar and first section header. Always visible. Uses thread row anatomy with `IconUsers` and gray `#64748B` avatar circle. Clicking shows All Agents view. Shows interleaved events from all sessions.

### 8.4 Thread list structure

Scrollable. Fixed section order:

```
ACTIVE                    <-- sessions with lastEventAt within 10 min
  -- Claude Code --       <-- 9px muted model sub-label
    [thread rows]
  -- Antigravity --
    [thread rows]

TODAY                     <-- ended today
  [thread rows, first 5 visible]

YESTERDAY
  [thread rows, first 5 visible]

THIS WEEK
  [thread rows, first 5 visible, rest collapsed]

OLDER
  [thread rows, collapsed]
```

Section labels: `font-size: 10px; font-weight: 500; color: var(--text-muted); padding: 9px 12px 3px; letter-spacing: 0.08em; text-transform: uppercase`.

ACTIVE section: grouped by model, model sub-labels 9px/500 muted, ordered by most recent lastEventAt model first.

Historical sections: flat by most-recent-first, no model grouping. First 5 visible, rest behind "Show N more" link.

### 8.5 Thread row — active session

```
[avatar 34x34]  [session name 12px/500]     [timestamp 10px]
                [preview 11px muted]         [badges area]
```

**Avatar:** Coloured circle with model code (CL/CX/CO/AG).

**Status dot (bottom-right of avatar):**
- `working`/`waiting`/`stale`: 8px filled dot in status color, `border: 2px solid var(--surface-1)`
- `unclean`: red dot + small `⚠` top-right of avatar
- `idle`/`quiet`: no dot

**Preview text:** Most recent event in plain English (present continuous or past tense per §3).

**Badges area (right side):**
- Error badge: amber `⚠ N` when session has >= 1 errors in last 20 events
- Unread dot: 5px filled blue circle when `events.length > lastViewedEventCount` and not selected

**Row:** Padding 8px 12px. Hover: `var(--fill-ghost-hover)`. Selected: `var(--bg-accent)`.

**Sub-agent rows:** Indented 20px, `border-left: 1.5px solid var(--border)`, avatar 28x28px.

**Continuation rows:** Indented same as sub-agents, `↩` prefix on session name, same styling.

**Continuation badge on root:** `xN` badge (far right) where N = total continuations in chain.

### 8.6 Thread row — historical session

Same anatomy but:
- Avatar at 65% opacity. No dot.
- Session name: `var(--text-secondary)`.
- Preview: last message content or "finished".
- Model badge (8px pill, e.g. "CL") far right + relative date ("2h", "3d").

### 8.7 Keyboard navigation

- `Up/Down`: move selection between rows
- `Enter`: open selected thread
- `Cmd+N` / `Ctrl+N`: new session
- `Cmd+K` / `Ctrl+K`: focus search
- `Escape` (search focused): clear and blur
- `Escape` (broad view open): close broad view

### 8.8 Sidebar footer

```
synced 3s ago
```

Green dot (5px) + text 11px `var(--text-muted)`. Border top `0.5px solid var(--border)`. Padding 9px 12px. Updates every second showing time since last event received by renderer. Track `lastEventReceivedAt` in React state.

---

## 9. New session view

Shown in main conversation area when compose button clicked or `Cmd+N` pressed. Replaces active conversation temporarily.

```
                    Start a new session

  Who do you want to work on this?

  [* Claude Code]  [ Cursor]  [ Codex]  [ Antigravity]

  Describe the task -- what do you want them to do?

  +----------------------------------------------------------+
  |                                                          |
  |  e.g. Refactor the data pipeline to add retry logic      |
  |                                                          |
  +----------------------------------------------------------+

                                              [Start session ->]
```

- Model selector: pill toggles, single select, default Claude Code.
- Text area: 4 rows min, expands. Font-size 14px. `border: 0.5px solid var(--border)`.
- Start button: `background: var(--fill-accent); color: var(--on-accent)`. Disabled until text.
- `Escape` or X cancels.

**Phase 1 behaviour:** On click, show instruction block:

For CLI agents (Claude, Codex, Antigravity):
```
Open a terminal and run:

  claude "Refactor the data pipeline..."     [copy]

Watch Dog will pick it up automatically once it starts.
```

For Cursor (no CLI):
```
Open Cursor and start an AI conversation in the editor.
Watch Dog will notice it and add it here automatically.
```

---

## 10. Conversation view

### 10.1 Thread header

```
[avatar 36x36]  [session name 14px/500]                 [status badge]
                [action phrase 11px muted]    [dots] [/btw] [Interrupt]
```

- Background: `var(--surface-1)`. Border bottom `0.5px solid var(--border)`. Padding 13px 18px.
- Status badge: pill with 6 variants per §6 (see R2 badge mapping below)
- Action phrase (second line): present-tense from most recent event. E.g., "editing files right now", "running your tests", "thinking it through"
- When busy: animated dots (3 dots, 5px, staggered pulse in agent colour) + action label + `/btw` + `Interrupt` buttons

**Badge mapping:**

| Status | Text | Background | Text color |
|---|---|---|---|
| `working` | working on it | `var(--bg-success)` | `var(--text-success)` |
| `waiting` | waiting for you | `var(--bg-accent)` | `var(--text-accent)` |
| `idle` | paused | `var(--surface-2)` | `var(--text-muted)` |
| `quiet` | done | `var(--surface-2)` | `var(--text-muted)` |
| `stale` | might be stuck | `var(--bg-warning)` | `var(--text-warning)` |
| `unclean` | something went wrong | `var(--bg-danger)` | `var(--text-danger)` |

For historical sessions: "This session wrapped up [relative time]" in status line. "Start a new one →" button.

### 10.2 Find bar (Cmd+F)

Between header and messages. Height 36px. `background: var(--surface-2)`. `border-bottom: 0.5px solid var(--border)`.

Layout: `[magnifier input flex:1]  [N of M]  [up]  [down]  [X]`

- Case-insensitive substring across event.text, event.result, event.target for ALL events (not just rendered 500)
- Matching bubbles: `background: rgba(251, 191, 36, 0.2)`
- If match outside rendered window: auto-load earlier messages, scroll to match, show "Found in earlier messages, loading..."
- Escape closes and removes highlights

### 10.3 Message scroll area

`flex: 1; overflow-y: auto; padding: 14px 18px 8px; min-height: 0`.
Auto-scroll to bottom on new events only if user is within 50px of bottom.

**Render cap:** Most recent 500 events. "Load earlier messages" button at top.

### 10.4 Session divider

```
---------- Session started · Today, 6:47 PM ----------
                   ~/projects/myapp
```

Derived from `kind: 'session_start'` events (consumed as dividers, never rendered as bubbles). `cwd` shown in 10px muted text.

Sub-agent:
```
---------- Write unit tests · joined 6:44 PM ----------
           Sub-agent spawned by Refactor pipeline
```

Continuation:
```
---- Continued from "Refactor pipeline" · Today, 4:12 PM ----
```

### 10.5 Bubble types

**A — Agent message** (`kind: 'message'`, `role: 'assistant'`):
- `background: var(--surface-1); border-left: 3px solid [agent-colour]; border-radius: 0 12px 12px 12px; padding: 10px 14px; max-width: 82%; font-size: 14px; line-height: 1.55`

**B — Thinking** (`kind: 'thinking'`):
- `background: var(--surface-1); border: 0.5px dashed var(--border-strong); border-radius: 12px 12px 12px 4px; padding: 9px 13px; max-width: 82%; font-size: 13px; font-style: italic; color: var(--text-secondary)`
- Label "thinking" in 11px muted above bubble.

**C — Action card** (`kind: 'action'`):
- Icon square (30x30px, 7px radius) + action label (11px/500 muted) + target (12px mono)
- Label uses present continuous or past tense based on whether result exists
- Duration appended to subtext for Claude/Codex (non-null timestamps only):
  - < 60s: `· 3.2s` in muted
  - > 60s still running: `· running 1m 28s+` in `var(--text-warning)`, update every second
  - After result: final duration, stop timer
- Result pill below (see §11)
- Clicking expands result text as code block (Phase 1 fallback — no input JSON diff)

**D — User message** (`kind: 'message'`, `role: 'user'`):
- Right-aligned. `background: var(--bg-accent); border-radius: 12px 0 12px 12px; padding: 10px 14px; max-width: 82%; color: var(--text-accent)`

**E — Interrupt marker:**
- Centred divider, `var(--border-danger)` at 50%, text "Interrupted" in `var(--text-danger)`

**F — BTW delivered:**
- User bubble (type D) with "/btw" label above in 11px muted.

**G — Delegation badge** (replaces action card for `action: 'task'`):
- `display: inline-flex; gap: 4px; padding: 3px 8px; border-radius: 20px; background: var(--bg-pro); color: var(--text-pro); font-size: 10px`
- Content: `Delegated "[task name]" to a new agent`
- Clickable — navigates to sub-agent thread if linked via subagentLinks

**H — System messages** (`role: 'system'`, NOT `session_start`): not rendered.

---

## 11. Action card labels, icons, and result pills

### Labels and icons

| `action` | Running label | Completed label | Icon | Icon bg | Icon color |
|---|---|---|---|---|---|
| `read_file` | Reading [file] | Read [file] | `IconFileText` | `#FFF0DC` | `#EA8C1D` |
| `write_file` | Writing [file] | Wrote [file] | `IconFilePencil` | `#EFF6FF` | `#2563EB` |
| `edit_file` | Editing [file] | Edited [file] | `IconEdit` | `#E8F5E9` | `#16A34A` |
| `run_command` | [friendly] | [friendly past] | `IconTerminal` | `#FFF0DC` | `#EA8C1D` |
| `search` | Searching for [target] | Searched for [target] | `IconSearch` | `var(--surface-2)` | `var(--text-secondary)` |
| `task` | Delegating [task] | Delegated [task] | `IconSubtask` | `var(--bg-pro)` | `var(--text-pro)` |
| `other` | Running [humanized] | Ran [humanized] | `IconBolt` | `var(--surface-2)` | `var(--text-secondary)` |

`[file]`: base filename in label, full path as subtext.

**Friendly command labels:**
- `npm test` / `npm run test` → Running tests / Ran tests
- `npm run build` → Building project / Built project
- `npm install` → Installing packages / Installed packages
- `git commit` → Committing changes / Committed changes
- `git push` → Pushing to remote / Pushed to remote
- Others → Running: [cmd 40 chars] / Ran: [cmd 40 chars]

**Humanising rawTool for `other`:** split camelCase/underscores, capitalise first word.

### Quantitative context (subtext, 11px muted, best-effort)

| Action | Source | Display |
|---|---|---|
| `read_file` | result char count / 40 | `· ~45 lines` |
| `write_file` | result char count / 40 | `· ~89 lines` |
| `edit_file` | — | omitted in Phase 1 (deferred) |
| `run_command` | parse first 100 chars of result | `· 47 passed, 3 failed` or `· exit 0` |
| `search` | match count from result | `· 12 matches` |

Comment in code: `// edit line counts: deferred to Phase 2 when actionInput is wired`

### Result pills

| Condition | Icon | Text |
|---|---|---|
| Result present, no error | `IconCheck` success | "[N] chars" or "done" |
| Result has error (case-insensitive: `error`, `failed`, `exception`) | `IconAlertTriangle` warning | "ran into a problem · expand to see" |
| Empty result | `IconMinus` muted | "no output" |

### Result pairing

- **Claude/Codex (toolUseId exists):** pair by toolUseId
- **Cursor (no toolUseId):** pair by sequence — first result after an action is that action's result
- **Orphan results:** silently dropped
- **Unpaired actions:** render card with no result pill; pill appears when result arrives

---

## 12. Input area

### 12.1 Idle state

```
+------------------------------------------------------------------+
|  Message Claude...                                    [Send ->]   |
+------------------------------------------------------------------+
```

- `border-radius: 20px; background: var(--surface-0); border: 0.5px solid var(--border); padding: 8px 14px; font-size: 13px`
- Placeholder uses agent's display name: "Message Claude...", "Message Antigravity..."
- **Phase 1:** Send shows tooltip "This is coming soon — for now, keep an eye on what it's doing"

### 12.2 Busy state

Header shows dots + action + buttons. Bottom bar available for BTW:

```
+------------------------------------------------------------------+
|  Send a note for when it's free...                  [Queue ->]    |
+------------------------------------------------------------------+
```

**Phase 1:** Queue shows tooltip same as Send.

### 12.3 Waiting state

Input footer shows: "Claude is waiting for your response" in `var(--text-accent)` (blue).

### 12.4 Read-only (historical)

```
+------------------------------------------------------------------+
|  This session wrapped up 18 minutes ago.     [Start a new one ->] |
+------------------------------------------------------------------+
```

### 12.5 Interrupt button

Phase 1: visible but tooltip "Interrupt available when session is managed by Watch Dog". Shows type E marker in conversation regardless.

---

## 13. Glass dome minimap

### 13.1 Shape and position

```css
position: absolute;
bottom: 14px;
right: 14px;
width: 210px;
height: 70px;
border-radius: 35px;
z-index: 10;
cursor: pointer;
overflow: hidden;
background: rgba(8, 16, 30, 0.9);
border: 1px solid rgba(255, 255, 255, 0.12);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
```

Hover: `border-color: rgba(255, 255, 255, 0.26)`. Tooltip: "See what everyone's up to".

No text inside the dome.

Status line below dome (outside): `9px; var(--text-muted); letter-spacing: 0.08em; text-align: right; margin-top: 4px`. Content: "N active" where N = count of `working` or `waiting` sessions. Omit when N = 0.

### 13.2 Interior — left-to-right branching tree (SVG)

SVG fills dome with 10px padding. `pointer-events: none; overflow: hidden`.

**Direction:** left → right. Oldest roots at left, newest spawns at right. Max 4 columns.

**Nodes (one per session):**
- Root: radius 4px
- Sub-agent (depth 1): radius 3px
- Deeper: radius 2.5px
- Fill: agent identity colour. `quiet`/done: 22% opacity, no ring.

**Status rings (static, no animation):**
- `working`: agent colour at 28% opacity, radius = node + 3px
- `waiting`: `rgba(59,130,246,0.45)`, radius = node + 3px
- `stale`: `rgba(245,158,11,0.4)`, radius = node + 3px
- `unclean`: `rgba(239,68,68,0.4)`, radius = node + 3px
- `idle`/`quiet`: no ring

**Connection lines:** `stroke-width: 0.8`, parent's agent colour at 30% opacity, straight lines.

**Column X:** Divide SVG width equally across columns present (min 2, max 4).
**Node Y:** Distribute evenly in column. Multiple children centered around parent Y.

**Max 14 nodes.** Selection: include parent chains first (walk up ancestry), then fill with most-recently-active standalone sessions. If chains alone exceed 14, drop least-recent standalones. Show `+N` in `7px rgba(255,255,255,0.28)` at bottom-right when truncated.

**Depth >4:** Truncate at column 4, faint `...` dot at right edge.

### 13.3 Update triggers

Recalculate only when: session added, session status changes, session ends. NOT on every event.

### 13.4 Click

Opens broad view (§14). Escape or Close returns.

---

## 14. Broad view — mission control

### 14.1 Opening/closing

Click dome → broad view appears over conversation area. `position: absolute; inset: 0; z-index: 20; background: var(--surface-0)`. Fade in 0.15s. Escape or Close button closes. Clicking agent node closes and switches to that session.

### 14.2 Header

```
What's everyone working on                       * Live   [Close]
3 agents active · all working on ChintuWatchdog
```

- 14px/500. `background: var(--surface-1)`. Padding 13px 18px.
- Sub-header: show project name only when ALL active sessions share same cwd. Otherwise just "N agents active".
- Project name from cwd in monospace.

### 14.3 Network graph — left-to-right layout (matches dome direction)

`flex: 1; position: relative; overflow: hidden`.

**SVG connection layer** (`position: absolute; inset: 0; pointer-events: none`):
- **Delegation lines** (parent → sub-agent): solid, parent's agent colour, `stroke-width: 2`. Two animated dots flowing along path (4px radius, agent colour).
- **Future placeholder connector:** dotted `rgba(255,255,255,0.08)`, "future agent" label at midpoint.
- No coordination lines (Phase 2). No awareness lines (cut).

**HTML node cards** (`position: absolute`):
- ~150x110px. `background: var(--surface-1)`. `border: 0.5px solid var(--border)` + coloured left border (3px, agent colour — solid for parent, dashed for sub-agent). `border-radius: 10px`. Padding 10px 12px.

```
[avatar 30x30]  Session name
                Model name

  [icon] Current action
  working on it / waiting for you / etc.

  [Delegated -> task name]     <-- only if delegation exists
```

Done/historical nodes: `opacity: 0.3`. No animated dots.

"Add model" placeholder: dashed border, `+` icon, "Future agent" label, `opacity: 0.2`. Only shown when <3 distinct agent models have active sessions.

**Node positioning:** Hierarchical left-to-right. Roots in leftmost column, sub-agents in next column. Siblings distributed vertically. Calculate positions once on open via `getBoundingClientRect()`, keep fixed while open.

### 14.4 Status pills strip (replaces scrolling ticker)

```css
height: 48px;
border-top: 0.5px solid var(--border);
background: var(--surface-1);
display: flex;
align-items: center;
padding: 0 16px;
gap: 8px;
overflow-x: auto;
```

Each pill: `inline-flex; gap: 6px; padding: 4px 10px; border-radius: 20px; background: var(--surface-2); border: 0.5px solid var(--border); font-size: 11px; cursor: pointer; white-space: nowrap`

Content: `[6px status dot] [agent code bold] [session name <=20 chars] [action <=22 chars]`

Only `working`, `waiting`, `idle`, `stale` sessions shown. Clicking navigates to session.

Empty state: centered muted "all agents idle".

---

## 15. All agents view

When "All agents" selected: conversation area shows all events interleaved chronologically.

Session identifier row before each contiguous block from same session:
```
[22px avatar]  [Session name · Model name]     [time]
```
10px muted. Don't repeat for back-to-back messages from same session.

Input area: read-only "Select a session to send a message".

---

## 16. Session naming

Priority order: `renamedTo` → first user message → fallback `[Model · date]`

**First user message processing:**
1. Find first `kind: 'message'`, `role: 'user'` event
2. Strip prefixes (case-insensitive): `can you`, `could you`, `please`, `help me`, `i need you to`, `i want you to`, `i'd like you to`
3. Trim leading whitespace, trailing `?`
4. Capitalize first character
5. Truncate to 40 chars

**Sub-agent naming:** from parent's `action: 'task'` event `target` field.

**Fallback:** `[Model name] · [MMM D, h:mm a]`

Name freezes once set from a user message or rename. Computed lazily as events arrive.

**[INVESTIGATE A] — /rename:** Find real JSONL with `/rename` usage, document format before implementing.

---

## 17. State management

Plain React `useState` and `useRef`. No Redux, no Zustand.

**Root shape:**
```js
const sessionsRef = useRef(new Map()) // Map<sessionId, Session>
const [sessionsVersion, setSessionsVersion] = useState(0)
const [activeSessionId, setActiveSessionId] = useState(null)
const [showAllAgents, setShowAllAgents] = useState(false)
const [showNewSession, setShowNewSession] = useState(false)
const [showBroadView, setShowBroadView] = useState(false)
const [searchQuery, setSearchQuery] = useState('')
const scrollPositions = useRef(new Map()) // Map<sessionId, scrollTop>
const [lastEventReceivedAt, setLastEventReceivedAt] = useState(null)
```

**Session shape:**
```js
{
  sessionId: string,
  agent: string,
  name: string,
  nameIsFrozen: boolean,
  parentSessionId: string | null,
  subagentLinks: Map<toolUseId, subagentSessionId>,
  continuationOf: string | null,       // needs [INVESTIGATE B]
  events: WatchdogEvent[],
  inputState: 'idle' | 'busy' | 'read-only',
  isOwned: false,                      // always false Phase 1
  startedAt: Date | null,
  lastEventAt: Date | null,
  lastViewedEventCount: number,        // initialized to events.length on first load
  errorCount: number,                  // sliding window of last 20 events
}
```

**Event ingestion:**
```js
function ingestEvents(events) {
  for (const event of events) {
    const sess = sessionsRef.current.get(event.sessionId) ?? createSession(event)
    sess.events.push(event)
    sess.lastEventAt = new Date()
    updateSessionName(sess, event)
    updateSessionInputState(sess, event)
    updateErrorCount(sess)  // recount over last 20 events
    sessionsRef.current.set(event.sessionId, sess)
  }
  setSessionsVersion(v => v + 1)
  setLastEventReceivedAt(new Date())
}
```

**Duration timer:** One global `setInterval` in conversation view, incrementing `durationTick` counter. Unpaired action cards use it to recompute running time.

---

## 18. IPC response shape

`watchdog:get-initial-events` returns:
```js
{
  events: WatchdogEvent[],
  sessionMeta: Record<sessionId, {
    parentSessionId: string | null,
    subagentLinks: Record<toolUseId, subagentSessionId>,
    renamedTo: string | null,
    continuationOf: string | null,
  }>
}
```

`preload.js` is a passthrough — no changes needed. Checksum gate passes.

---

## 19. Adapter changes (main/adapters/claude.js)

### 19.1 Remove agent-* skip filter

In `discoverSessions()`, remove the filter that skips files with `agent-` prefix. Sub-agent files are valid JSONL.

### 19.2 Add parentSessionId extraction

```js
function getParentSessionId(filePath, sessionId) {
  if (!sessionId.startsWith('agent-')) return null
  const parts = filePath.split(/[/\\]/)
  const idx = parts.indexOf('subagents')
  if (idx > 0) return parts[idx - 1]
  return null
}
```

### 19.3 Add sub-agent linking (sources 2 & 3)

During `parseLine()`, detect additional line types:

**Source 2 — queue-operation:** When `type === 'queue-operation'` and `operation === 'enqueue'`, extract `taskId` and `toolUseId`. Map `subagentLinks[toolUseId] = 'agent-' + taskId`.

**Source 3 — agent_progress:** When `type === 'progress'` and `data.type === 'agent_progress'`, extract `parentToolUseID` and `data.agentId`. Map `subagentLinks[parentToolUseID] = 'agent-' + agentId`.

### 19.4 [INVESTIGATE A] — /rename extraction

Find real JSONL, document format, then extract `renamedTo`.

### 19.5 [INVESTIGATE B] — /resume continuation

Find real JSONL, document format, then extract `continuationOf`.

---

## 20. Performance constraints

1. Only the active session's conversation is mounted. Others unmounted.
2. Render cap: 500 events per session view. Load-earlier button at top.
3. Auto-scroll only when within 50px of bottom.
4. Search filtering is synchronous.
5. Dome layout recalculated only on session state changes.
6. Network graph positions calculated once on broad view open.
7. Status pills rebuilt only on session list change.
8. Status re-evaluation: 30-second interval.
9. Duration timer: 1-second interval in conversation view only.
10. Error count: recount over last 20 events on each sessionsVersion increment.

---

## 21. Files to create/modify

### New files

| File | Purpose |
|---|---|
| `src/styles/variables.css` | CSS custom properties, light/dark themes |
| `src/components/Sidebar.jsx` + `.css` | Header, search, sections, thread rows |
| `src/components/ConversationView.jsx` | Header, scroll area, session divider |
| `src/components/MessageBubble.jsx` | Types A, B, D, E, F, G |
| `src/components/ActionCard.jsx` | Type C with result pill, duration, quantitative context |
| `src/components/InputArea.jsx` | All input states |
| `src/components/NewSessionView.jsx` | Compose UI |
| `src/components/FindBar.jsx` | In-session search |
| `src/components/AllAgentsView.jsx` | Interleaved feed |
| `src/components/GlassDome.jsx` | Dome SVG minimap |
| `src/components/BroadView.jsx` | Mission control overlay |
| `src/components/NetworkGraph.jsx` | Node cards + SVG connections |
| `src/components/StatusPills.jsx` | Bottom strip |
| `src/hooks/useSessions.js` | Session grouping, naming, state, error counting |
| `src/hooks/useSessionScroll.js` | Per-session scroll position memory |
| `src/hooks/useDurationTick.js` | Global 1s timer for running durations |
| `src/utils/plainEnglish.js` | Event → display text with tense switching |
| `src/utils/sessionName.js` | Session naming logic with prefix stripping |
| `src/utils/sessionStatus.js` | 6-state computation + isWaitingForUser |
| `src/utils/minimapLayout.js` | Dome tree layout with parent-chain preservation |
| `src/utils/networkLayout.js` | Broad view node positioning (left-to-right) |
| `src/utils/resultPairing.js` | toolUseId and sequence-based action/result pairing |

### Modified files

| File | Change |
|---|---|
| `src/App.jsx` | Replace EventFeed with new component tree, keyboard shortcuts, session state |
| `src/App.css` | Update for 2-panel layout, remove old styles |
| `src/main.jsx` | Import `variables.css` |
| `electron.js` | Return `{ events, sessionMeta }` from IPC, pass parentSessionId/subagentLinks/renamedTo |
| `main/adapters/claude.js` | Remove agent-* skip, add parentSessionId extraction, add sub-agent linking sources 2&3 |

### Do not modify

`main/event.js`, `preload.js`, `src/components/EventFeed.jsx`, `main/watcher.js`, `main/tool-map.js`, `main/adapters/codex.js`, `main/adapters/cursor.js`, `main/adapters/antigravity.js`.

---

## 22. Dependencies to install

```
npm install @tabler/icons-react
```

Import only used icons via named imports.

---

## 23. Phase 2 deferrals (do not implement)

- Coordination lines in broad view
- Parallel tool call grouping
- Diff panel with input JSON data (Phase 1: show result text as code block)
- Awareness lines
- Edit line counts (+N -M) in quantitative context
- Aider adapter
- Process spawning (Phase 2 manages agent processes)
- BTW queue delivery
- Send message delivery

---

## 24. Deliverable checklist

- [ ] `node scripts/check-format-stability.js` green (start AND end)
- [ ] All required test scripts pass
- [ ] All [INVESTIGATE] items answered and documented inline
- [ ] CSS variables defined for both dark and light themes
- [ ] Sidebar: active sessions grouped by model, historical by date
- [ ] Sidebar: 6-state status dots render correctly
- [ ] Sidebar: unread indicators appear for new events, disappear on open
- [ ] Sidebar: error `⚠ N` badges (sliding window last 20 events)
- [ ] Sidebar: sub-agent rows indented under parent
- [ ] Sidebar: continuation rows with `↩` prefix and `xN` badge on root
- [ ] Search filters all sessions in real time
- [ ] Cmd+K focuses search, Cmd+N opens new session, Escape clears/closes
- [ ] Arrow keys navigate thread list
- [ ] New session view: model selector + prompt + CLI instruction block
- [ ] Switching sessions restores scroll position
- [ ] All bubble types render correctly with warm tone copy
- [ ] Action cards: present continuous while running, past tense after result
- [ ] Action cards: duration for Claude/Codex, running timer updates per second
- [ ] Action cards: quantitative context (line estimates, match counts, test results)
- [ ] Delegation badges clickable → navigate to sub-agent thread
- [ ] Result pills with error detection
- [ ] Input area: correct state per session (idle/busy/waiting/read-only)
- [ ] Phase 1 tooltips on Send/Queue
- [ ] Cmd+F: find bar searches all events, auto-loads earlier if needed
- [ ] Status re-evaluates every 30 seconds
- [ ] Glass dome renders with left-to-right tree, status rings, parent-chain preservation
- [ ] Dome click opens broad view
- [ ] Broad view: left-to-right layout matching dome
- [ ] Broad view: delegation lines with animated dots
- [ ] Broad view: node cards with status phrases
- [ ] Broad view: status pills strip (not ticker)
- [ ] All agents view: interleaved events with session headers
- [ ] Light and dark theme both work
- [ ] No console errors on launch
- [ ] `npm run dev` starts without errors
- [ ] All tone guide rules followed (no internal field names, relative time, warm copy)
