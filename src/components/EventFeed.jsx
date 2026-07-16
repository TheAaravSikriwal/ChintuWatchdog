import { useRef, useEffect, useMemo } from 'react'
import './EventFeed.css'

// ── Helpers (renderer-side, no access to main/event.js) ────────

function isFileTouching(event) {
  if (event.kind !== 'action') return false
  return event.action === 'read_file'
    || event.action === 'write_file'
    || event.action === 'edit_file'
}

function roleBadge(event) {
  if (event.role === 'user') return 'U'
  if (event.role === 'assistant') return 'A'
  return 'S'
}

function roleClass(event) {
  return `role-${event.role}`
}

function kindLabel(event) {
  switch (event.kind) {
    case 'session_start': return 'SESSION'
    case 'message':       return 'MSG'
    case 'thinking':      return 'THINK'
    case 'action':        return event.rawTool || event.action || 'ACTION'
    case 'result':        return 'RESULT'
    default:              return event.kind
  }
}

function kindClass(event) {
  return `kind-${event.kind}`
}

function actionLabel(event) {
  if (event.kind === 'action' && event.action) {
    return event.action.replace(/_/g, ' ')
  }
  return null
}

function formatTimestamp(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

function truncateText(text, maxLen = 300) {
  if (!text || text.length <= maxLen) return text || ''
  return text.slice(0, maxLen) + '...'
}

function sessionLabel(sessionId) {
  if (!sessionId) return ''
  // Show first 8 chars of UUID
  return sessionId.slice(0, 8)
}

function agentTag(agent) {
  switch (agent) {
    case 'claude-code':   return 'CL'
    case 'codex':         return 'CX'
    case 'cursor':        return 'CU'
    case 'aider':         return 'AI'
    case 'antigravity':   return 'AG'
    default:              return agent ? agent.slice(0, 2).toUpperCase() : '??'
  }
}

// ── Event row ──────────────────────────────────────────────────

function EventRow({ event }) {
  return (
    <div className={`event-row ${roleClass(event)} ${kindClass(event)}`}>
      <span className={`agent-tag agent-${event.agent || 'unknown'}`}>{agentTag(event.agent)}</span>
      <span className={`event-badge ${roleClass(event)}`}>{roleBadge(event)}</span>
      <span className="event-kind">{kindLabel(event)}</span>
      <span className="event-time">{formatTimestamp(event.timestamp)}</span>
      <span className="event-content">
        <EventContent event={event} />
      </span>
    </div>
  )
}

function EventContent({ event }) {
  switch (event.kind) {
    case 'session_start':
      return <span className="event-cwd">{event.cwd || 'unknown'}</span>

    case 'message':
      return <span className="event-text">{truncateText(event.text)}</span>

    case 'thinking':
      return <span className="event-thinking">{truncateText(event.text, 150)}</span>

    case 'action': {
      const label = actionLabel(event)
      return (
        <span className="event-action-detail">
          {label && <span className="event-action-type">{label}</span>}
          {event.target && <span className="event-target">{event.target}</span>}
        </span>
      )
    }

    case 'result':
      return (
        <span className="event-result">
          {event.result
            ? <span className="event-result-text">{truncateText(event.result, 120)}</span>
            : <span className="event-result-empty">(no output)</span>
          }
        </span>
      )

    default:
      return null
  }
}

// ── File action row (right panel) ──────────────────────────────

function FileActionRow({ event }) {
  return (
    <div className={`file-action-row action-${event.action}`}>
      <span className={`agent-tag agent-${event.agent || 'unknown'}`}>{agentTag(event.agent)}</span>
      <span className="file-action-verb">{event.action?.replace(/_/g, ' ') || 'action'}</span>
      <span className="file-action-target">{event.target || '(unknown)'}</span>
      <span className="file-action-tool">{event.rawTool}</span>
      <span className="file-action-time">{formatTimestamp(event.timestamp)}</span>
      <span className="file-action-session">{sessionLabel(event.sessionId)}</span>
    </div>
  )
}

// ── Panels ─────────────────────────────────────────────────────

function EventFeed({ events }) {
  const feedRef = useRef(null)
  const filesRef = useRef(null)

  const fileEvents = useMemo(
    () => events.filter(isFileTouching),
    [events]
  )

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [events])

  useEffect(() => {
    if (filesRef.current) {
      filesRef.current.scrollTop = filesRef.current.scrollHeight
    }
  }, [fileEvents])

  return (
    <div className="event-feed">
      <div className="feed-panel">
        <div className="panel-header">
          <span className="panel-title">Process Feed</span>
          <span className="panel-count">{events.length}</span>
        </div>
        <div className="panel-body" ref={feedRef}>
          {events.length === 0 ? (
            <div className="panel-empty">No agent activity detected</div>
          ) : (
            events.map((event, i) => (
              <EventRow key={`${event.sessionId}-${event.sourceSeq}-${i}`} event={event} />
            ))
          )}
        </div>
      </div>

      <div className="files-panel">
        <div className="panel-header">
          <span className="panel-title">File Actions</span>
          <span className="panel-count">{fileEvents.length}</span>
        </div>
        <div className="panel-body" ref={filesRef}>
          {fileEvents.length === 0 ? (
            <div className="panel-empty">No file changes yet</div>
          ) : (
            fileEvents.map((event, i) => (
              <FileActionRow key={`${event.sessionId}-${event.sourceSeq}-${i}`} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default EventFeed
