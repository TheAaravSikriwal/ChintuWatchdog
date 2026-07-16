# Known Omissions

Features present in the AgentsView Go reference but deliberately omitted from
Watch Dog. These are analytics-engine capabilities that serve measurement,
search, and developer tooling — not session supervision for a non-technical
watcher. Recorded here so future work doesn't rediscover them as bugs.

## All adapters

- **Token usage / model name / cost / stop_reason extraction.** AgentsView
  tracks per-message token counts, model identifiers, and cost metrics.
  Watch Dog has no analytics surface and no reason to extract these.

- **Termination status classification.** AgentsView classifies how a session
  ended (awaiting user, tool call pending, interrupted). Watch Dog shows
  live events, not session summaries.

## Claude

- **DAG fork detection and session splitting.** AgentsView builds a
  uuid/parentUuid DAG and splits forked conversations into separate
  sessions (claude.go:294-307, 877-1045). Watch Dog processes lines
  linearly. Forked sessions may appear merged.

- **Subagent graph mapping.** AgentsView links `queue-operation` and
  `agent_progress` events to subagent session files (claude.go:146-180).
  Watch Dog skips subagent files (`agent-*` prefix) entirely.

- **Persisted tool result resolution.** AgentsView reads tool results from
  external files when content references `persisted-output`
  (claude.go:1463-1601). Watch Dog shows the truncated inline content only.

- **Command envelope normalization.** AgentsView converts XML command
  envelopes into readable `/command args` text (claude.go:1942-2002).

- **`isCompactSummary` boundaries.** AgentsView detects compact summary
  entries as system boundary markers (claude.go:700-719).

- **`isSidechain` flag propagation.** AgentsView tracks sidechain status
  on parsed messages (claude.go:717, 768, 795).

- **Version / sourceSessionID / gitBranch metadata.** AgentsView extracts
  source version, session parent detection, and git branch
  (claude.go:128-130, 215-229).

- **Usage probe session filtering.** AgentsView drops content-free `/usage`
  probe sessions (claude.go:338-347, 2070-2082).

## Codex

- **Fork gate / replay dedup.** AgentsView has `codexForkGate` suppressing
  replayed parent history in forked rollouts and `observeUserPrompt`
  digest-based dedup of re-emitted first prompts (codex.go:77-158,
  codex_cursor.go:44-59).

- **`agent_message` dispatch.** AgentsView processes inbound multi-agent
  messages via `handleAgentMessage` (codex.go:288-289, 347-372). Requires
  subagent path resolution infrastructure.

- **`event_msg` lifecycle subtypes.** AgentsView processes `task_started`,
  `task_complete`, `turn_aborted`, `token_count`, `collab_agent_spawn_end`,
  `sub_agent_activity` events for termination classification and subagent
  graphs (codex.go:374-386). These are metadata signals, not visible
  content.

- **`session_index.jsonl` thread-name lookup.** AgentsView resolves
  human-readable session names from a sidecar index file
  (codex.go:1571-1665).

## Cursor

- **Plain-text transcript parsing.** AgentsView parses `.txt` transcripts
  via `parseCursorMessages()` with `user:`/`assistant:` line markers
  (cursor.go:66-69, 120-285). Watch Dog handles JSONL only (v1).

- **Attribution DB.** AgentsView reads `~/.cursor/ai-tracking/
  ai-code-tracking.db` for AI-authored line percentages
  (cursor_attribution.go).

- **`DecodeCursorProjectDir` project name extraction.** AgentsView has a
  two-tier marker scan to decode hyphenated project paths
  (cursor.go:544-594).

- **codex_cursor shared state.** AgentsView implements first-user-prompt
  replay detection, turn-abort dedup, and LRU tail-parse cache
  (codex_cursor.go).

## Aider

- **Accumulate-then-flush turn reconstruction.** AgentsView accumulates
  multi-line turns into single messages (aider.go:284-365). Watch Dog
  emits one event per line. This is a presentation decision deferred to
  the humanization/UI phase.

- **Stable session IDs via SHA-256.** AgentsView hashes
  `absPath + rawHeader + ordinal` (aider.go:425-434). Watch Dog uses
  `'aider:' + project`, which is simpler but not unique across
  same-named directories.

- **Multi-run splitting.** AgentsView splits files with multiple
  `# aider chat started at` headers into separate sessions with virtual
  paths (aider.go:170-204). Watch Dog treats the whole file as one stream
  (emits multiple `session_start` events but under one session ID).

## Antigravity

- **Protobuf wire-format walker.** AgentsView's `antigravity_proto.go`
  (~340 lines) decodes `step_payload` directly from SQLite binary fields.
  Watch Dog Phase A uses trajectory JSON sidecar only; protobuf decode
  is deferred to Phase B.

- **Encryption / crypto.** AgentsView's `antigravity_crypto.go` handles
  AES-encrypted legacy CLI `.pb` files. Not needed for IDE sessions.

- **Schema versioning / fingerprinting.** AgentsView's
  `antigravity_version.go` fingerprints `sqlite_master` + `user_version`
  to detect schema changes.

## Security hardening (all adapters)

- **openNoFollow, symlink rejection, LimitReader, Fstat.** AgentsView has
  extensive path-safety measures. Watch Dog trusts the local filesystem
  (the user's own machine). Reconsider at packaging time for robustness
  on untrusted machines.

- **Walk budget / safety caps (Aider).** AgentsView has 2s walk budget,
  5000 file cap, 50000 dir cap, macOS protected-dir pruning
  (aider.go:57-106, 672-765). Watch Dog's walk has no caps.
