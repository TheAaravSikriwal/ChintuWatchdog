#!/usr/bin/env node
// Discovery hardening tests — Part B
//
// Exercises: root-not-found, empty root, env override, glob-based discovery
// at non-standard depth (Antigravity), structural pattern filtering,
// walk budget cap, and symlink skip.
//
// Usage: node scripts/test-discovery-hardening.js

const fs   = require('fs')
const path = require('path')
const os   = require('os')

let pass = 0, fail = 0

function check(cond, label) {
  if (cond) { pass++ }
  else { console.error(`  FAIL  ${label}`); fail++ }
}
function assertEqual(actual, expected, label) {
  if (actual === expected) { pass++ }
  else {
    fail++
    console.error(`  FAIL  ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
  }
}

// Each test block sets env overrides and re-requires adapters fresh via a
// helper so we don't cache stale module state.
function freshAdapter(name) {
  const key = require.resolve('../main/adapters/' + name)
  delete require.cache[key]
  return require('../main/adapters/' + name)
}

const TMP = path.join(os.tmpdir(), 'watchdog-hardening-' + Date.now())
fs.mkdirSync(TMP, { recursive: true })

// ── Helpers ───────────────────────────────────────────────────────

function makeTmp(rel) {
  const full = path.join(TMP, rel)
  fs.mkdirSync(full, { recursive: true })
  return full
}
function writeFile(rel, content = '{}') {
  const full = path.join(TMP, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content + '\n')
  return full
}

// ── 1. Root not found — all adapters ─────────────────────────────

console.log('--- 1. Root not found → [] for all adapters ---')

;['claude', 'cursor', 'codex', 'aider', 'antigravity'].forEach(name => {
  delete process.env.CLAUDE_PROJECTS_DIR
  delete process.env.CURSOR_PROJECTS_DIR
  delete process.env.CODEX_SESSIONS_DIR
  delete process.env.AIDER_DIR
  delete process.env.ANTIGRAVITY_DIR

  const nonexistent = path.join(TMP, 'nonexistent-' + name)
  let sessions
  try {
    if (name === 'aider') {
      process.env.AIDER_DIR = nonexistent
      const adapter = freshAdapter(name)
      sessions = adapter.discoverSessions(adapter.getSessionsDirs())
    } else if (name === 'claude') {
      const adapter = freshAdapter(name)
      sessions = adapter.discoverSessions(nonexistent)
    } else {
      const adapter = freshAdapter(name)
      sessions = adapter.discoverSessions([nonexistent])
    }
  } catch (err) {
    sessions = null
    console.error(`  FAIL  ${name}: threw exception: ${err.message}`)
    fail++
    return
  }
  check(Array.isArray(sessions) && sessions.length === 0, `${name}: root-not-found → []`)
})
console.log()

// ── 2. Empty root → [] ────────────────────────────────────────────

console.log('--- 2. Empty root → [] ---')
const emptyRoot = makeTmp('empty-root')

;['claude', 'cursor', 'codex', 'antigravity'].forEach(name => {
  const adapter = freshAdapter(name)
  let sessions
  try {
    sessions = name === 'claude'
      ? adapter.discoverSessions(emptyRoot)
      : adapter.discoverSessions([emptyRoot])
  } catch { sessions = null }
  check(Array.isArray(sessions) && sessions.length === 0, `${name}: empty-root → []`)
})
console.log()

// ── 3. Env override — adapters that have one ──────────────────────

console.log('--- 3. Env override routes to custom dir ---')

// Claude: CLAUDE_PROJECTS_DIR
{
  const claudeRoot = makeTmp('claude-override')
  const projDir = path.join(claudeRoot, 'my-project')
  fs.mkdirSync(projDir, { recursive: true })
  writeFile('claude-override/my-project/aabbcc.jsonl', '{"type":"user","message":{"content":"hi"}}')

  process.env.CLAUDE_PROJECTS_DIR = claudeRoot
  const adapter = freshAdapter('claude')
  const sessions = adapter.discoverSessions(adapter.getProjectsDir())
  assertEqual(sessions.length, 1, 'claude: CLAUDE_PROJECTS_DIR override finds 1 session')
  delete process.env.CLAUDE_PROJECTS_DIR
}

// Cursor: CURSOR_PROJECTS_DIR
{
  const cursorRoot = makeTmp('cursor-override')
  const transcriptDir = path.join(cursorRoot, 'proj', 'agent-transcripts', 'abc123')
  fs.mkdirSync(transcriptDir, { recursive: true })
  fs.writeFileSync(path.join(transcriptDir, 'abc123.jsonl'), '{"role":"user","message":{"content":[{"type":"text","text":"hi"}]}}\n')

  process.env.CURSOR_PROJECTS_DIR = cursorRoot
  const adapter = freshAdapter('cursor')
  const sessions = adapter.discoverSessions(adapter.getSessionsDirs())
  assertEqual(sessions.length, 1, 'cursor: CURSOR_PROJECTS_DIR override finds 1 session')
  delete process.env.CURSOR_PROJECTS_DIR
}

// Antigravity: ANTIGRAVITY_DIR
{
  const agRoot = makeTmp('ag-override')
  const logsDir = path.join(agRoot, 'brain', '11111111-0000-0000-0000-000000000001', '.system_generated', 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  fs.writeFileSync(path.join(logsDir, 'transcript.jsonl'), '{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","content":"<USER_REQUEST>hi</USER_REQUEST>","created_at":"2026-01-01T00:00:00Z"}\n')

  process.env.ANTIGRAVITY_DIR = agRoot
  const adapter = freshAdapter('antigravity')
  const sessions = adapter.discoverSessions(adapter.getSessionsDirs())
  assertEqual(sessions.length, 1, 'antigravity: ANTIGRAVITY_DIR override finds 1 session')
  delete process.env.ANTIGRAVITY_DIR
}
console.log()

// ── 4. Antigravity: glob finds transcript at non-standard depth ───

console.log('--- 4. Antigravity: glob finds transcript at non-standard depth ---')
{
  // Put transcript under sessions/<id>/.system_generated/logs/ instead of brain/<id>/
  const agRoot = makeTmp('ag-nonstandard')
  const logsDir = path.join(agRoot, 'sessions', 'custom-session-key', '.system_generated', 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  fs.writeFileSync(path.join(logsDir, 'transcript.jsonl'), '{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","content":"<USER_REQUEST>hello</USER_REQUEST>","created_at":"2026-01-01T00:00:00Z"}\n')

  process.env.ANTIGRAVITY_DIR = agRoot
  const adapter = freshAdapter('antigravity')
  const sessions = adapter.discoverSessions(adapter.getSessionsDirs())
  assertEqual(sessions.length, 1, 'antigravity: transcript found at non-standard depth (sessions/ not brain/)')
  check(sessions[0]?.sessionId.includes('custom-session-key'), 'session key extracted from dir above .system_generated')
  delete process.env.ANTIGRAVITY_DIR
}
console.log()

// ── 5. Antigravity: transcript outside .system_generated/logs/ skipped ──

console.log('--- 5. Antigravity: wrong parent structure skipped ---')
{
  const agRoot = makeTmp('ag-wrong-structure')
  // Valid transcript
  const goodLogs = path.join(agRoot, 'brain', 'valid-uuid', '.system_generated', 'logs')
  fs.mkdirSync(goodLogs, { recursive: true })
  fs.writeFileSync(path.join(goodLogs, 'transcript.jsonl'), '{"step_index":0}\n')

  // Invalid: transcript.jsonl in wrong-parent/logs/ (not .system_generated)
  const badLogs = path.join(agRoot, 'brain', 'other-uuid', 'wrong-parent', 'logs')
  fs.mkdirSync(badLogs, { recursive: true })
  fs.writeFileSync(path.join(badLogs, 'transcript.jsonl'), '{"step_index":0}\n')

  // Invalid: transcript.jsonl at root of some dir (not in logs/)
  const badFlat = path.join(agRoot, 'brain', 'flat-uuid')
  fs.mkdirSync(badFlat, { recursive: true })
  fs.writeFileSync(path.join(badFlat, 'transcript.jsonl'), '{"step_index":0}\n')

  process.env.ANTIGRAVITY_DIR = agRoot
  const adapter = freshAdapter('antigravity')
  const sessions = adapter.discoverSessions(adapter.getSessionsDirs())
  assertEqual(sessions.length, 1, 'antigravity: only .system_generated/logs/ transcript found (got ' + sessions.length + ')')
  check(sessions[0]?.sessionId.includes('valid-uuid'), 'only valid-uuid session found')
  delete process.env.ANTIGRAVITY_DIR
}
console.log()

// ── 6. Cursor: nightly candidate ──────────────────────────────────

console.log('--- 6. Cursor: nightly candidate included in discovery dirs ---')
{
  // getSessionsDirs() should include both stable and nightly paths
  // (we just check the dirs list, not actual file discovery)
  delete process.env.CURSOR_PROJECTS_DIR
  const adapter = freshAdapter('cursor')
  const dirs = adapter.getSessionsDirs()
  const hasStable  = dirs.some(d => d.includes('.cursor') && !d.includes('nightly'))
  const hasNightly = dirs.some(d => d.includes('.cursor-nightly'))
  check(hasStable,  'cursor: stable .cursor/projects in candidate dirs')
  check(hasNightly, 'cursor: .cursor-nightly/projects in candidate dirs')
  check(dirs.length >= 2, 'cursor: at least 2 candidate dirs')
}
console.log()

// ── 7. Antigravity: walk budget prevents runaway ──────────────────

console.log('--- 7. Antigravity: walk budget caps discovery ---')
{
  // Create a directory tree wide enough to hit the budget.
  // We just verify discovery returns without hanging and finds what exists.
  const agRoot = makeTmp('ag-budget')
  // Create many sibling dirs at top level (won't have transcripts)
  for (let i = 0; i < 20; i++) {
    fs.mkdirSync(path.join(agRoot, 'dir-' + i), { recursive: true })
  }
  // One real transcript
  const logsDir = path.join(agRoot, 'brain', 'budget-uuid', '.system_generated', 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  fs.writeFileSync(path.join(logsDir, 'transcript.jsonl'), '{"step_index":0}\n')

  process.env.ANTIGRAVITY_DIR = agRoot
  const adapter = freshAdapter('antigravity')
  let sessions
  let threw = false
  try {
    sessions = adapter.discoverSessions(adapter.getSessionsDirs())
  } catch {
    threw = true
  }
  check(!threw, 'antigravity: discovery with many dirs does not throw')
  check(Array.isArray(sessions), 'antigravity: discovery with many dirs returns array')
  delete process.env.ANTIGRAVITY_DIR
}
console.log()

// ── 8. Aider: symlink skip doesn't crash ──────────────────────────

console.log('--- 8. Aider: symlink in search dir handled gracefully ---')
{
  const aiderRoot = makeTmp('aider-symlinks')
  // Real repo with history file
  const realRepo = path.join(aiderRoot, 'my-repo')
  fs.mkdirSync(realRepo, { recursive: true })
  fs.writeFileSync(path.join(realRepo, '.aider.chat.history.md'),
    '# aider chat started at 2026-01-01 00:00:00\n#### hello\nhi\n')

  // Symlink inside the root (we only create it if the platform supports it)
  try {
    fs.symlinkSync(realRepo, path.join(aiderRoot, 'link-to-repo'), 'junction')
  } catch {
    // Windows symlinks may need elevated perms — skip silently
  }

  process.env.AIDER_DIR = aiderRoot
  const adapter = freshAdapter('aider')
  let sessions
  let threw = false
  try {
    sessions = adapter.discoverSessions(adapter.getSessionsDirs())
  } catch {
    threw = true
  }
  check(!threw, 'aider: symlink in search path does not throw')
  check(Array.isArray(sessions), 'aider: returns array despite symlinks')
  // Should find at least the real repo's file
  check(sessions.length >= 1, `aider: real history file found (got ${sessions.length})`)
  delete process.env.AIDER_DIR
}
console.log()

// ── Cleanup ───────────────────────────────────────────────────────

fs.rmSync(TMP, { recursive: true, force: true })

// ── Summary ───────────────────────────────────────────────────────

console.log('========================================')
console.log(`Total: ${pass + fail} tests`)
console.log(`Passed: ${pass}`)
console.log(`Failed: ${fail}`)
console.log(fail === 0 ? 'PASS' : 'FAIL')
console.log('========================================')
process.exit(fail > 0 ? 1 : 0)
