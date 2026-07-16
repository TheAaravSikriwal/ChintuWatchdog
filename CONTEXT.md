# Watch Dog — Project Context

Complete handoff for a new collaborator. Zero other context needed.

---

## 1. What this is and why it exists

Watch Dog is a desktop app that lets a non-technical person supervise AI coding agents. It watches agents' local session files, parses them mechanically, and shows what the agent is doing in a calm, structural display — role, action, target, the agent's own words.

**Who it's for:** People who are blocked from agentic coding not because tools are missing, but because tools are opaque and assume you speak engineer. The same audience as Chintu (its sibling product — Git without the terminal, at wearechintu.com).

**The core idea:** Every file-based coding agent (Claude Code, Codex, Cursor, Aider) writes local session logs. Those logs contain both the agent's reasoning ("the voice") and the actions it takes ("the hands"). Watch Dog reads those logs, normalizes them into one unified Event format, and renders them in one window — regardless of which agent produced them.

**The values line (non-negotiable):**
- No API, no LLM, no model, no subscription, no server — ever. Parsing and display are purely mechanical.
- Read-only. Never writes to agent session files.
- No network, no database. Watch -> parse -> hold events in memory -> render.
- This is a *value*, not a scoping decision. It's downstream of the Chintu ethos: no extraction from users.

**Watch Dog and Chintu are separate apps.** Watch Dog does NOT do version control. They may eventually dock visually (cosmetic only, no communication between them), but each works fully standalone.

---

## 2. Architecture overview

```
[Agent session files on disk]
        |
        | chokidar file watching (main process)
        v
[Per-tool adapters]  --->  [Normalized WatchdogEvent stream]
  main/adapters/              main/event.js defines the shape
  claude.js                   Adapters emit Events; nothing else touches raw formats
  codex.js
  (cursor.js, aider.js - not yet built)
        |
        | IPC bridge (electron.js -> preload.js)
        v
[Renderer / Display]
  src/App.jsx
  src/components/EventFeed.jsx
  Two-panel layout: left = all events, right = file-touching actions only
```

**Data flow in detail:**

1. **chokidar** watches agent session directories (e.g. `~/.claude/projects/`)
2. On file change, **`main/watcher.js`** reads new bytes from the changed file (offset tracking — only new data)
3. New bytes are split into lines. Partial last lines are held back (the file may still be mid-write)
4. Each complete line is passed to the appropriate **adapter** (`main/adapters/claude.js` or `codex.js`)
5. The adapter emits zero or more **`WatchdogEvent`** objects per line
6. Events are batched (300ms coalescing delay, 8192-path overflow -> full rescan) and sent via IPC
7. **`preload.js`** bridges main<->renderer with `contextIsolation: true`
8. **`src/App.jsx`** accumulates events in state, passes them to `EventFeed`
9. **`EventFeed.jsx`** renders two panels, reading ONLY the normalized Event shape

**The IPC boundary is the abstraction enforcement.** The renderer never sees raw formats. If `EventFeed.jsx` ever needs to check `event.agent` to render correctly, the format is wrong.

---

## 3. File map

### Root

| File | Purpose |
|---|---|
| `electron.js` | Electron main process entry. Creates `BrowserWindow`, starts `SessionWatcher`, bridges events via IPC (`watchdog:events`, `watchdog:get-initial-events`, `watchdog:get-projects-dir`). |
| `preload.js` | Context-isolated bridge. Exposes `window.watchdog` with `getInitialEvents()`, `getProjectsDir()`, `onEvents(callback)`. |
| `index.html` | Vite entry point with CSP headers. Loads `src/main.jsx`. |
| `package.json` | Electron + Vite + React. Dev port 5174. Matches Chintu's stack exactly. |
| `vite.config.js` | `@vitejs/plugin-react`, `base: './'`, port 5174, strict port. Matches Chintu's config. |
| `scripts/dev-electron.cjs` | Dev launcher. Spawns Electron with `NODE_ENV=development` after Vite is ready. |

### `main/` — Main process (Node.js, adapters, watcher)

| File | Purpose |
|---|---|
| `main/event.js` | **THE load-bearing file.** Defines `WatchdogEvent` typedef (JSDoc), `TOOL_ACTION_MAP` normalization table, `normalizeToolCall()`, `truncateResult()`, `isFileTouching()`, `compareEvents()` merge comparator. Every adapter imports from here. Display reads only this shape. |
| `main/watcher.js` | `SessionWatcher` class. chokidar-based file watching with `PendingBatch` (8192-entry limit, overflow -> `fullSync`), `FileState` (per-file byte offset + sequence counter + partial-line holdback). Currently only watches Claude's `projectsDir`. |
| `main/adapters/claude.js` | Claude Code adapter. Discovers sessions under `~/.claude/projects/` (env overrides: `CLAUDE_PROJECTS_DIR`, `CLAUDE_CONFIG_DIR`). `parseLine()` handles content polymorphism (bare string for user, array for assistant), all block types (text, thinking, tool_use, tool_result), system message detection, truncation detection. **Tested: 91 sessions, 22,025 events.** |
| `main/adapters/codex.js` | Codex adapter. Discovers sessions under `~/.codex/sessions/` and `~/.codex/archived_sessions/` (env: `CODEX_SESSIONS_DIR`). Handles `session_meta` -> `session_start`, `response_item` with role -> messages, `function_call`/`custom_tool_call` -> actions, `function_call_output`/`custom_tool_call_output` -> results. Handles `arguments` polymorphism (JSON-encoded string OR native object). **Written but NOT yet tested against fixtures.** |

### `src/` — Renderer (React)

| File | Purpose |
|---|---|
| `src/main.jsx` | React entry. Mounts `<App />` into `#root`. Loads Inter + JetBrains Mono fonts. |
| `src/App.jsx` | Top-level component. Loads initial events on mount via `window.watchdog.getInitialEvents()`, subscribes to live events via `window.watchdog.onEvents()`. Passes accumulated events to `EventFeed`. |
| `src/App.css` | Dark theme CSS variables (`--bg: #0f1117`, etc.), app layout, header, loading state. |
| `src/components/EventFeed.jsx` | Two-panel display. Left: "Process Feed" (all events, rendered by kind — message, thinking, action, result, session_start). Right: "File Actions" (filtered to `read_file`/`write_file`/`edit_file`). Has its own `isFileTouching()` (renderer can't import from main). Auto-scrolls to bottom on new events. |
| `src/components/EventFeed.css` | Event row styling. Kind-specific left borders (amber for action, dim for result, purple for thinking). Role badges (U/A/S with color). Two-panel grid layout. |

---

## 4. Event format spec

Defined in `main/event.js`. This is the normalized shape every adapter emits. Display reads ONLY this. The raw line shape is NEVER typed.

```
WatchdogEvent {
  agent:      'claude-code' | 'codex' | 'cursor' | 'aider'
  sessionId:  string
  timestamp:  string | null        (ISO 8601; null when source has none, e.g. Aider)
  sourceSeq:  number               (monotonic per emitted event, scoped per session file;
                                    resets to 0 for each file; one raw line may emit
                                    several — e.g. thinking+text+tool_use -> seq 42, 43, 44)
  role:       'user' | 'assistant' | 'system'
  kind:       'session_start' | 'message' | 'thinking' | 'action' | 'result'

  // kind=message or kind=thinking:
  text?:      string

  // kind=action:
  action?:    'read_file' | 'write_file' | 'edit_file' | 'run_command' | 'search' | 'task' | 'other'
  target?:    string               (file path or command string)
  rawTool?:   string               (original tool name: 'Bash', 'Edit', 'shell_command', etc.)

  // kind=action or kind=result:
  toolUseId?: string               (pairs action <-> result; Claude: block.id / block.tool_use_id;
                                    Codex: payload.call_id)

  // kind=result:
  result?:    string               (truncated to 2000 chars)

  // session_start always; other events when source provides it:
  cwd?:       string               (Claude: per-line, drifts mid-session; Codex: session_meta only)
}
```

### Three format-review fixes applied (from `format-review.md`)

**Fix 1 — Duplicate `cwd` declaration.** The original format declared `cwd` under `kind === 'session_start'` AND again under "available on any kind." Collapsed to one optional field with a comment explaining per-agent semantics. Minor, but proved the interface hadn't been typechecked.

**Fix 2 — `sourceSeq` scope undefined.** Originally described as "monotonic per-event counter" but examples showed both Claude and Codex resetting to 0 — it's per-file, not global. Per-file is correct (global is meaningless across concurrent sessions), but the merge comparator was `(timestamp, sourceSeq)`, which jitters when two concurrent sessions collide on same-second timestamps. Fixed to `(timestamp, agent, sessionId, sourceSeq)` — `sessionId` scope makes `sourceSeq` a real tiebreaker. Implemented in `compareEvents()`.

**Fix 3 — Thinking buried in text with `[Thinking]` markers.** Every other field is structural; `[Thinking]` markers are structure encoded as a string. Display would have to string-match to know what it's rendering — that's parsing a raw format in disguise. Made `kind: 'thinking'` a first-class event type. Claude adapter emits it from `block.type === 'thinking'` blocks. This is the most important distinction for a nervous non-technical watcher (deliberation vs. speech).

### Merge comparator

```js
// Sort key: (timestamp, agent, sessionId, sourceSeq)
// Null timestamps sort last.
function compareEvents(a, b) { ... }
```

### Tool normalization

`TOOL_ACTION_MAP` in `event.js` maps raw tool names to normalized verbs:
- Claude: `Read` -> `read_file`, `Write` -> `write_file`, `Edit` -> `edit_file`, `Bash` -> `run_command`, `Grep`/`Glob` -> `search`, `Agent`/`Task` -> `task`
- Codex: `shell_command`/`exec_command` -> `run_command`, `apply_patch` -> `edit_file`, `write_stdin` -> `other`
- Cursor (anticipated): `read_file`/`write_file`/`edit_file`/`run_command` -> themselves

`normalizeToolCall(rawName, input)` extracts `target` from input fields: `file_path`, `command`, `cmd`, `path`, `pattern`, `query`. Special case: `apply_patch` extracts target from `*** Update File: <path>` inside the patch string.

### Design note: `role: 'user'` on `kind: 'result'`

Results genuinely arrive on user lines in Claude's format. Semantically odd (the user didn't "do" that), but faithful to the source. Fine for v1 structural display. Flagged for revisit when translation lands.

---

## 5. Adapter status

### Claude Code adapter — DONE, TESTED

**File:** `main/adapters/claude.js` (290 lines)

**Tested against:** 91 real Claude Code sessions from `~/.claude/projects/` on the dev machine.

**Results:**
- 22,025 total events produced
- 8,242 actions, 8,231 results, 11 orphan actions (actions with no matching result — real, e.g. interrupted tool calls)
- `kind: 'thinking'` events correctly emitted from `block.type === 'thinking'` blocks
- Content polymorphism handled (bare string for user prompts, array for assistant)
- System messages correctly skipped (continuation markers, request interrupts, hook feedback, XML system envelopes)
- Truncation detection implemented per Correction C from PROMPT.md

**Key functions:**
- `getProjectsDir()` — resolves Claude projects dir with env overrides (`CLAUDE_PROJECTS_DIR`, `CLAUDE_CONFIG_DIR`)
- `discoverSessions(projectsDir)` — finds `.jsonl` files, skips `agent-*` subagent files
- `parseLine(line, sessionId, seq)` -> `{ events: WatchdogEvent[], nextSeq: number }`
- `isTruncatedWrite(lastLine, buf)` — Correction C: non-empty + invalid JSON + no trailing newline = truncated

### Codex adapter — WRITTEN, NOT TESTED

**File:** `main/adapters/codex.js` (253 lines)

**Written against:** Reference in `watchdog-reference/parser/codex.go` and 6 test fixtures in `watchdog-reference/parser/testdata/codex/`.

**Not yet tested against fixtures.** This is the immediate next step.

**Key differences from Claude handled:**
- Top-level `type` is always `session_meta`, `response_item`, or `event_msg` (not `user`/`assistant`)
- Role lives at `payload.role`, not top-level `type`
- Actions are `payload.type === 'function_call'` with `call_id` (not `tool_use` with `id`)
- Results are `payload.type === 'function_call_output'` with `call_id`
- `arguments` polymorphism: JSON-encoded string OR native object (both handled)
- No `uuid`/`parentUuid` — no DAG to resolve
- `session_meta` carries `cwd` + session `id` as a dedicated opening line -> `kind: 'session_start'`
- Also handles `custom_tool_call` / `custom_tool_call_output` payload types

**Key functions:**
- `getSessionsDirs()` — `~/.codex/sessions/` + `~/.codex/archived_sessions/` (env: `CODEX_SESSIONS_DIR`)
- `discoverSessions(sessionsDirs)` — walks YYYY/MM/DD directory structure + flat archived files
- `parseLine(line, sessionId, seq)` -> `{ events: WatchdogEvent[], nextSeq: number, sessionId: string }` (sessionId can be overridden by `session_meta`)

### Not yet built

- **Cursor** — `~/.cursor/projects/`, file-based. Reference: `cursor.go` + 3 related files. No test fixtures in reference — must verify against real machine.
- **Aider** — Markdown format (`.aider.chat.history.md`), not JSONL. No default discovery dir (env `AIDER_DIR` only). No per-event timestamps. The hardest Event-format test.
- **Antigravity** — v1.1, deferred. SQLite + AES decryption + undocumented protobuf. Multi-week port.

### Watcher integration status

`main/watcher.js` currently only watches Claude's `projectsDir`. The Codex adapter is **not yet wired into** `watcher.js` or `electron.js`. Both files currently hardcode Claude-only paths and imports.

---

## 6. Open threads / unresolved questions

### Pre-Codex checks (from `pre-codex-checks.md`)

Two suspicious numbers were flagged before the Codex adapter could be built:

**Check 1: "621 actions, 621 results is suspicious"**

The concern: if orphan tool calls exist (proven by `tool_call_pending.jsonl`), why do counts match exactly? Either no orphans appeared in this sample, or something is fabricating results to balance the ledger.

**Prior session's answer:** The 621/621 was from a single session. Across all 91 sessions the real numbers are **8,242 actions / 8,231 results** with **11 orphan actions** (actions with `toolUseId` that have no matching result). Zero orphan results (results with no matching action). The single session happened to have 0 orphans — genuine coincidence, not a bug.

*Status: Answered in the prior session. The code was not modified — no fabrication bug exists. However, these numbers were reported conversationally and are not persisted in a test or log file. Re-verification is cheap (re-run the validation script against live sessions) if confidence is needed.*

**Check 2: "1936 lines -> 1521 events, 415 skipped doesn't decompose"**

The concern: the earlier line-type census counted 238 non-user/assistant lines, leaving ~1698 user+assistant lines. But multi-block lines expand (one line can emit 3 events). So 1698 lines should produce *more* events, not fewer (1521).

**Prior session's answer:** The 415 decomposes as:
- 238 type skips (attachment, file-history-snapshot, system, queue-operation, permission-mode, last-prompt)
- 13 system message skips (user lines matching `isSystemMessage()` patterns)
- 1 empty user content skip
- 164 empty thinking block skips (`block.type === 'thinking'` with empty `thinking` field — Claude emits `thinking(len=0)` blocks)
- 1 empty line skip
- **Total: 417 non-event lines** (slight overcounting due to the multi-block expansion producing 1 extra event from 1520 event-producing lines)

*Status: Same as above — answered conversationally, not persisted. The decomposition makes mechanical sense.*

### The Codex validation test

Per `pre-codex-checks.md`, the real test is NOT "does the Codex adapter work." It is: **did building it force any change to `main/event.js`, `src/components/EventFeed.jsx`, or `preload.js`?**

Pre-Codex checksums were captured:
```
main/event.js:                ad57485d87716d6dbc84bddabd0cba7fb89aaa0580c2e4cd7e827e4b27f23981
src/components/EventFeed.jsx: 4ad5893792b6c62c7d9b4f944c64734a01fe90f0425ce3081d8ef70ee02e775a
preload.js:                   fde0888a5b61127279d0232b016418b7eb66a07c64101851da9aa26468ff5d66
```

**These have not yet been verified post-Codex.** The Codex adapter was written; the checksums were not compared. This is the single most important pending verification.

### Other open items

- **`role: 'user'` on `kind: 'result'`** — flagged in format-review.md as semantically odd. Leave for v1, revisit at translation phase.
- **Cursor has no test fixtures** in the reference — must be verified against a real Cursor installation.
- **Aider has no default discovery directory** and no per-event timestamps — hardest adapter to build correctly.

---

## 7. The watchdog-reference material

### What it is

A pruned extract of **AgentsView** (github.com/kenn-io/agentsview, MIT, (C) 2026 Kenn Software LLC). AgentsView is a Go + Svelte + SQLite analytics engine for session intelligence — 26MB, 50+ agents, full-text search, token-cost reports. We extracted ~500KB of the parts we need: per-agent parser source, test fixtures, and the file watcher pattern.

**It is a read-only answer key, not a dependency.** Never imported, never vendored. Read it to learn where each tool writes sessions and what those files contain, then write lean readers in our own stack (Electron + React + Node.js).

### What's in it

```
watchdog-reference/
  PROMPT.md                          Build prompt with 6 corrections to the handoff spec
  DESIGN.md                         Their design approach (context only)
  parser/
    types.go                         THE registry: every agent's paths, env overrides, flags
    claude.go + claude_provider.go   Claude Code parser (answer key for edge cases)
    codex.go + codex_provider.go     Codex parser
    codex_cursor.go                  Shared Codex/Cursor logic
    cursor.go + cursor_provider.go + cursor_paths.go + cursor_attribution.go
    aider.go + aider_provider.go
    content.go, discovery.go, capabilities.go
    antigravity-v1.1/                5 files — DO NOT OPEN in v1
    testdata/
      claude/valid_session.jsonl     Real Claude session fixture (4 lines)
      claude/truncated.jsonl         Truncation edge case
      claude/tool_call_pending.jsonl Orphan tool_use (in-flight tool call)
      codex/*.jsonl                  6 Codex fixtures (see below)
      aider/myrepo/.aider.chat.history.md   Real Aider sample (markdown)
  watch/sync_watcher.go              fsnotify + batching + overflow pattern
```

**Codex fixtures (6 files):**
- `standard_session.jsonl` — basic session with session_meta + messages
- `function_calls.jsonl` — function call + output pairs
- `fc_args_1.jsonl` — arguments as JSON-encoded string (`"{\"cmd\":\"rg --files\"}"`)
- `fc_stdin.jsonl` — arguments as native object (`{"chars":"yes\n"}`)
- `fc_args_2.jsonl` — apply_patch with native object arguments
- `blockquotes_session.jsonl` — event_msg + response_item mix

### Path discrepancy

Two copies exist in Downloads:

1. **Directory:** `C:\Users\aarav\Downloads\watchdog-reference\watchdog-reference\` — note the double nesting. Actual files are at `watchdog-reference\watchdog-reference\parser\...`.
2. **Zip:** `C:\Users\aarav\Downloads\watchdog-reference.zip` — the original archive.

The directory is the extracted zip. The double nesting (`watchdog-reference/watchdog-reference/`) is an artifact of extraction. Both contain the same content. Use the directory for reads; the zip is the canonical archive.

**Canonical fixture paths:**
```
C:\Users\aarav\Downloads\watchdog-reference\watchdog-reference\parser\testdata\codex\*.jsonl
C:\Users\aarav\Downloads\watchdog-reference\watchdog-reference\parser\testdata\claude\*.jsonl
```

---

## 8. Immediate next steps (priority order)

1. **Test the Codex adapter against all 6 fixtures.** Parse every line in each fixture through `codex.parseLine()`, verify events are correct (right kinds, roles, actions, targets, toolUseIds, sessionId override from session_meta, arguments polymorphism).

2. **Verify the 3 checksum files are byte-identical.** Compute SHA256 of `main/event.js`, `src/components/EventFeed.jsx`, and `preload.js` and compare against the pre-Codex checksums above. If they match, the Event format held. If they don't, that's the finding — more valuable than a working adapter.

3. **Wire Codex into `watcher.js` and `electron.js`.** Currently both files only import and use `main/adapters/claude.js`. The watcher needs to also watch `~/.codex/sessions/` and `~/.codex/archived_sessions/`, route `.jsonl` files from those dirs through the Codex adapter's `parseLine()`, and merge both agents' events into the single stream sent over IPC.

4. **Build the Cursor adapter** against `cursor.go` reference (no fixtures — must verify against a real Cursor installation if available).

5. **Build the Aider adapter** against `aider.go` reference (markdown format, no per-event timestamps, no default discovery dir).

6. *(v1.1, separate task)* Antigravity adapter.

---

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Desktop shell | Electron 41 | Matches Chintu exactly |
| Bundler | Vite 8 + `@vitejs/plugin-react` | Dev port 5174, `base: './'` |
| Frontend | React 18 | Plain JS, no TypeScript |
| File watching | chokidar 4 | Replaces fsnotify from Go reference |
| Fonts | Inter + JetBrains Mono | `@fontsource/*` packages |
| Packaging | electron-builder | NSIS (Win), DMG (Mac), AppImage/deb (Linux) |
| Dev tooling | concurrently + wait-on | Same as Chintu's dev script |

**No TypeScript.** Plain JS throughout, with JSDoc typedefs in `event.js`.

**Node version note:** Dev machine runs Node v20.20.1. `@electron/rebuild` and `node-abi` warn about requiring Node >= 22.12.0, but the build succeeds. These are non-blocking warnings.
