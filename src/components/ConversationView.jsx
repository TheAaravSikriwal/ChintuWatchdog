import { useRef, useEffect, useState, useCallback } from 'react'
import { computeSessionStatus, STATUS_LABELS, STATUS_COLORS } from '../utils/sessionStatus'
import { eventPreview } from '../utils/plainEnglish'
import InputArea from './InputArea'
import './ConversationView.css'

const AGENT_COLORS = {
  'claude-code': '#EA8C1D',
  'cursor': '#2563EB',
  'codex': '#16A34A',
  'antigravity': '#7C3AED',
  'aider': '#0891B2',
}

const AGENT_CODES = {
  'claude-code': 'CL',
  'cursor': 'CX',
  'codex': 'CO',
  'antigravity': 'AG',
  'aider': 'AI',
}

const RENDER_CAP = 500

// Status badge background colors (translucent)
const STATUS_BG = {
  working: 'rgba(34,197,94,0.15)',
  waiting: 'rgba(59,130,246,0.15)',
  idle: 'rgba(107,114,128,0.15)',
  quiet: 'rgba(107,114,128,0.12)',
  stale: 'rgba(245,158,11,0.15)',
  unclean: 'rgba(239,68,68,0.15)',
}

function EventPlaceholder({ event }) {
  const parts = []
  parts.push(`[${event.kind}]`)
  if (event.role) parts.push(`[${event.role}]`)
  if (event.action) parts.push(`action:${event.action}`)
  if (event.target) parts.push(`target:${event.target}`)
  if (event.text) parts.push(event.text.slice(0, 80) + (event.text.length > 80 ? '…' : ''))
  if (event.rawTool) parts.push(`tool:${event.rawTool}`)

  return (
    <div className={`event-placeholder kind-${event.kind}`}>
      {parts.join(' ')}
    </div>
  )
}

export default function ConversationView({
  session,
  showAllAgents,
  sessionsRef,
  sessionsVersion,
  showBroadView,
  onToggleBroadView,
  onSelectSession,
  saveScrollPosition,
  getScrollPosition,
}) {
  const scrollRef = useRef(null)
  const prevSessionIdRef = useRef(null)
  const [eventOffset, setEventOffset] = useState(0)

  // Reset offset when session changes
  useEffect(() => {
    if (session?.sessionId !== prevSessionIdRef.current) {
      setEventOffset(0)
    }
  }, [session?.sessionId])

  // Save scroll when session changes or unmounts
  useEffect(() => {
    const prevId = prevSessionIdRef.current
    return () => {
      if (prevId && scrollRef.current) {
        saveScrollPosition(prevId, scrollRef.current.scrollTop)
      }
    }
  }, [session?.sessionId, saveScrollPosition])

  // Restore scroll or jump to bottom on session change
  useEffect(() => {
    if (!scrollRef.current || !session) return
    const prevId = prevSessionIdRef.current

    if (session.sessionId !== prevId) {
      prevSessionIdRef.current = session.sessionId
      const saved = getScrollPosition(session.sessionId)
      if (saved !== null) {
        scrollRef.current.scrollTop = saved
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
  }, [session, getScrollPosition])

  // Auto-scroll to bottom when new events arrive, only if near bottom
  const prevEventCountRef = useRef(0)
  useEffect(() => {
    if (!session || !scrollRef.current) return
    const newCount = session.events.length
    if (newCount === prevEventCountRef.current) return
    prevEventCountRef.current = newCount

    const el = scrollRef.current
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 50) {
      el.scrollTop = el.scrollHeight
    }
  }, [session, sessionsVersion])

  if (!session && !showAllAgents) {
    return (
      <div className="conversation-view">
        <div className="conversation-empty">
          Select a session or start a new one
        </div>
        <InputArea session={null} />
      </div>
    )
  }

  if (!session) {
    // showAllAgents mode — placeholder for now
    return (
      <div className="conversation-view">
        <div className="conversation-empty">
          All agents view — coming soon
        </div>
      </div>
    )
  }

  const status = computeSessionStatus(session)
  const statusLabel = STATUS_LABELS[status]
  const statusColor = STATUS_COLORS[status]
  const statusBg = STATUS_BG[status]
  const avatarColor = AGENT_COLORS[session.agent] || '#64748B'
  const agentCode = AGENT_CODES[session.agent] || '??'

  // Last non-result event preview
  let lastNonResultEvent = null
  for (let i = session.events.length - 1; i >= 0; i--) {
    if (session.events[i].kind !== 'result') {
      lastNonResultEvent = session.events[i]
      break
    }
  }
  const headerPreview = eventPreview(lastNonResultEvent)

  // Render cap
  const allEvents = session.events
  const totalEvents = allEvents.length
  const startIdx = Math.max(0, totalEvents - RENDER_CAP - eventOffset)
  const visibleEvents = allEvents.slice(startIdx)
  const hiddenCount = startIdx

  function loadEarlier() {
    setEventOffset(prev => prev + RENDER_CAP)
  }

  return (
    <div className="conversation-view">
      {/* Thread header */}
      <div className="conversation-header">
        <div
          className="conversation-header-avatar"
          style={{ background: avatarColor }}
        >
          <span>{agentCode}</span>
        </div>
        <div className="conversation-header-info">
          <div className="conversation-header-name">{session.name}</div>
          <div className="conversation-header-meta">
            <span
              className="conversation-status-badge"
              style={{ background: statusBg, color: statusColor }}
            >
              {statusLabel}
            </span>
            {headerPreview && (
              <span className="conversation-header-preview">{headerPreview}</span>
            )}
          </div>
        </div>
      </div>

      {/* Message scroll area */}
      <div className="conversation-scroll" ref={scrollRef}>
        {hiddenCount > 0 && (
          <button className="conversation-load-earlier" onClick={loadEarlier}>
            Load earlier messages ({hiddenCount} more)
          </button>
        )}
        {visibleEvents.map((event, idx) => (
          <EventPlaceholder key={`${event.sessionId}-${startIdx + idx}`} event={event} />
        ))}
      </div>

      {/* Input area */}
      <InputArea session={session} />
    </div>
  )
}
