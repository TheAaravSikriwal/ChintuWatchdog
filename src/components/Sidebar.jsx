import { useState, useEffect } from 'react'
import { IconEdit, IconUsers, IconSearch, IconX } from '@tabler/icons-react'
import ThreadRow from './ThreadRow'
import './Sidebar.css'

const HISTORY_SECTION_LIMIT = 5

function SyncedAgo({ lastEventReceivedAt }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!lastEventReceivedAt) return <span className="sidebar-footer-text">waiting for events</span>

  const seconds = Math.floor((Date.now() - lastEventReceivedAt.getTime()) / 1000)
  let label
  if (seconds < 5) label = 'just now'
  else if (seconds < 60) label = `${seconds}s ago`
  else label = `${Math.floor(seconds / 60)}m ago`

  return <span className="sidebar-footer-text">synced {label}</span>
}

function HighlightMatch({ text, query }) {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <strong>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  )
}

function HistorySection({ label, sessions, activeSessionId, focusedSessionId, onSelectSession, searchQuery }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? sessions : sessions.slice(0, HISTORY_SECTION_LIMIT)
  const hiddenCount = sessions.length - HISTORY_SECTION_LIMIT

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-label">{label}</div>
      {visible.map(sess => (
        <ThreadRow
          key={sess.sessionId}
          session={sess}
          isSelected={sess.sessionId === activeSessionId}
          isFocused={sess.sessionId === focusedSessionId}
          isSubAgent={false}
          isContinuation={false}
          onClick={() => onSelectSession(sess.sessionId)}
          searchQuery={searchQuery}
        />
      ))}
      {!expanded && hiddenCount > 0 && (
        <button className="sidebar-show-more" onClick={() => setExpanded(true)}>
          Show {hiddenCount} more
        </button>
      )}
    </div>
  )
}

export default function Sidebar({
  sessionsRef,
  sessionsVersion,
  getGroupedSessions,
  lastEventReceivedAt,
  activeSessionId,
  showAllAgents,
  searchQuery,
  onSearchChange,
  onSelectSession,
  onShowAllAgents,
  onNewSession,
  searchRef,
}) {
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const grouped = getGroupedSessions()

  // Count stats
  let activeCount = 0
  for (const arr of grouped.active.values()) activeCount += arr.length
  const totalCount = sessionsRef.current.size

  // Search filtering
  const searchActive = searchQuery.trim().length > 0
  let searchResults = []
  if (searchActive) {
    const q = searchQuery.trim().toLowerCase()
    for (const sess of sessionsRef.current.values()) {
      if (sess.name.toLowerCase().includes(q)) {
        searchResults.push(sess)
      }
    }
    searchResults.sort((a, b) => b.lastEventAt - a.lastEventAt)
  }

  // Build flat session list for arrow-key navigation
  const flatSessionList = (() => {
    if (searchActive) {
      return searchResults.map(s => s.sessionId)
    }
    const ids = []
    for (const sessions of grouped.active.values()) {
      for (const sess of sessions) ids.push(sess.sessionId)
    }
    for (const sess of grouped.today) ids.push(sess.sessionId)
    for (const sess of grouped.yesterday) ids.push(sess.sessionId)
    for (const sess of grouped.thisWeek) ids.push(sess.sessionId)
    for (const sess of grouped.older) ids.push(sess.sessionId)
    return ids
  })()

  const focusedSessionId = flatSessionList[focusedIndex] ?? null

  function handleSidebarKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex(i => Math.min(i + 1, flatSessionList.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && flatSessionList[focusedIndex]) {
      onSelectSession(flatSessionList[focusedIndex])
    }
  }

  return (
    <aside className="sidebar" tabIndex={0} onKeyDown={handleSidebarKeyDown}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-text">
          <div className="sidebar-title">Watch Dog</div>
          <div className="sidebar-subtitle">
            {activeCount} active · {totalCount} sessions total
          </div>
        </div>
        <button className="sidebar-compose-btn" onClick={onNewSession} title="New session">
          <IconEdit size={16} stroke={1.5} />
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <IconSearch
          size={13}
          stroke={1.5}
          className="sidebar-search-icon"
          style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%) translateY(-4px)', color: 'var(--text-muted)', pointerEvents: 'none' }}
        />
        <input
          ref={searchRef}
          className="sidebar-search-input"
          type="text"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button className="sidebar-search-clear" onClick={() => onSearchChange('')}>
            <IconX size={12} stroke={2} />
          </button>
        )}
      </div>

      {/* All agents row */}
      <div
        className={`sidebar-all-agents-row${showAllAgents ? ' selected' : ''}`}
        onClick={onShowAllAgents}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onShowAllAgents()}
      >
        <div className="sidebar-all-agents-avatar">
          <IconUsers size={14} stroke={1.5} />
        </div>
        <span className="sidebar-all-agents-label">All agents</span>
      </div>

      {/* Thread list */}
      <div className="sidebar-thread-list">
        {searchActive ? (
          <div className="sidebar-search-results">
            {searchResults.length === 0 ? (
              <div className="sidebar-empty-state">No sessions match "{searchQuery}"</div>
            ) : (
              searchResults.map(sess => (
                <ThreadRow
                  key={sess.sessionId}
                  session={sess}
                  isSelected={sess.sessionId === activeSessionId}
                  isFocused={sess.sessionId === focusedSessionId}
                  isSubAgent={false}
                  isContinuation={false}
                  onClick={() => onSelectSession(sess.sessionId)}
                  searchQuery={searchQuery}
                />
              ))
            )}
          </div>
        ) : (
          <>
            {/* Active section — grouped by agent */}
            {grouped.active.size > 0 && (
              <div className="sidebar-section">
                <div className="sidebar-section-label">Active</div>
                {Array.from(grouped.active.entries()).map(([agent, sessions]) => (
                  <div key={agent}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '4px 14px 2px 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {agent === 'claude-code' ? 'Claude Code'
                        : agent === 'cursor' ? 'Cursor'
                        : agent === 'codex' ? 'Codex'
                        : agent === 'antigravity' ? 'Antigravity'
                        : agent === 'aider' ? 'Aider'
                        : agent}
                    </div>
                    {sessions.map(sess => (
                      <ThreadRow
                        key={sess.sessionId}
                        session={sess}
                        isSelected={sess.sessionId === activeSessionId}
                        isFocused={sess.sessionId === focusedSessionId}
                        isSubAgent={!!sess.parentSessionId}
                        isContinuation={!!sess.continuationOf}
                        onClick={() => onSelectSession(sess.sessionId)}
                        searchQuery=""
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {grouped.today.length > 0 && (
              <HistorySection
                label="Today"
                sessions={grouped.today}
                activeSessionId={activeSessionId}
                focusedSessionId={focusedSessionId}
                onSelectSession={onSelectSession}
                searchQuery=""
              />
            )}

            {grouped.yesterday.length > 0 && (
              <HistorySection
                label="Yesterday"
                sessions={grouped.yesterday}
                activeSessionId={activeSessionId}
                focusedSessionId={focusedSessionId}
                onSelectSession={onSelectSession}
                searchQuery=""
              />
            )}

            {grouped.thisWeek.length > 0 && (
              <HistorySection
                label="This Week"
                sessions={grouped.thisWeek}
                activeSessionId={activeSessionId}
                focusedSessionId={focusedSessionId}
                onSelectSession={onSelectSession}
                searchQuery=""
              />
            )}

            {grouped.older.length > 0 && (
              <HistorySection
                label="Older"
                sessions={grouped.older}
                activeSessionId={activeSessionId}
                focusedSessionId={focusedSessionId}
                onSelectSession={onSelectSession}
                searchQuery=""
              />
            )}

            {totalCount === 0 && (
              <div className="sidebar-empty-state">
                No sessions yet — start one above
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-dot" />
        <SyncedAgo lastEventReceivedAt={lastEventReceivedAt} />
      </div>
    </aside>
  )
}
