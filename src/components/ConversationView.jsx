import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { computeSessionStatus, STATUS_LABELS, STATUS_COLORS } from '../utils/sessionStatus'
import { eventPreview } from '../utils/plainEnglish'
import { buildResultMap } from '../utils/resultPairing'
import { useDurationTick } from '../hooks/useDurationTick'
import InputArea from './InputArea'
import MessageBubble from './MessageBubble'
import ActionCard from './ActionCard'
import DelegationBadge from './DelegationBadge'
import FindBar from './FindBar'
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
  showFindBar,
  onCloseFindBar,
}) {
  const scrollRef = useRef(null)
  const prevSessionIdRef = useRef(null)
  const [eventOffset, setEventOffset] = useState(0)
  const durationTick = useDurationTick()
  const [findMatches, setFindMatches] = useState({ matches: [], currentIndex: 0 })

  const handleMatchChange = useCallback(({ matches, currentIndex }) => {
    setFindMatches({ matches, currentIndex })
  }, [])

  const highlightedEventIndices = new Set(findMatches.matches)
  const currentMatchEventIndex = findMatches.matches[findMatches.currentIndex] ?? null

  // Derive visible events and result map at hook level (before early returns)
  const allEventsForMemo = session?.events ?? []
  const totalEventsForMemo = allEventsForMemo.length
  const startIdxForMemo = Math.max(0, totalEventsForMemo - RENDER_CAP - eventOffset)
  const visibleEventsForMemo = allEventsForMemo.slice(startIdxForMemo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resultMap = useMemo(
    () => buildResultMap(visibleEventsForMemo),
    [sessionsVersion, startIdxForMemo]
  )

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
  const agentColor = AGENT_COLORS[session.agent] || '#6B7280'

  // Last non-result event preview
  let lastNonResultEvent = null
  for (let i = session.events.length - 1; i >= 0; i--) {
    if (session.events[i].kind !== 'result') {
      lastNonResultEvent = session.events[i]
      break
    }
  }
  const headerPreview = eventPreview(lastNonResultEvent)

  // Render cap (aliases to the hook-level values computed above)
  const startIdx = startIdxForMemo
  const visibleEvents = visibleEventsForMemo
  const hiddenCount = startIdx

  function loadEarlier() {
    setEventOffset(prev => prev + RENDER_CAP)
  }

  function renderEvent(ev, idx) {
    const globalIdx = startIdx + idx
    const key = `${ev.sessionId ?? 'ev'}-${globalIdx}`
    const isHighlighted = highlightedEventIndices.has(globalIdx)
    const isCurrent = currentMatchEventIndex === globalIdx
    const highlightStyle = isCurrent
      ? { outline: '1.5px solid rgba(251,191,36,0.8)', borderRadius: 8, background: 'rgba(251,191,36,0.10)' }
      : isHighlighted
      ? { outline: '1px solid rgba(251,191,36,0.35)', borderRadius: 8 }
      : {}

    // Skip result events — handled by ActionCard
    if (ev.kind === 'result') return null

    // Skip system messages (non-session-start)
    if (ev.role === 'system' && ev.kind !== 'session_start') return null

    // Session start divider and message bubbles
    if (ev.kind === 'session_start' || ev.kind === 'message' || ev.kind === 'thinking') {
      return (
        <div key={key} style={highlightStyle}>
          <MessageBubble event={ev} agentColor={agentColor} />
        </div>
      )
    }

    // Delegation badge for task actions
    if (ev.kind === 'action' && ev.action === 'task') {
      return (
        <div key={key} style={highlightStyle}>
          <DelegationBadge
            event={ev}
            onSelectSession={onSelectSession}
            subagentLinks={session.subagentLinks}
          />
        </div>
      )
    }

    // Regular action card
    if (ev.kind === 'action') {
      return (
        <div key={key} style={highlightStyle}>
          <ActionCard
            event={ev}
            resultEvent={resultMap.get(ev.sourceSeq) || null}
            agentColor={agentColor}
            durationTick={durationTick}
          />
        </div>
      )
    }

    // Unknown event kinds — nothing rendered
    return null
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

      {/* Find bar */}
      <FindBar
        events={session.events}
        visible={showFindBar}
        onClose={onCloseFindBar}
        onMatchChange={handleMatchChange}
      />

      {/* Message scroll area */}
      <div className="conversation-scroll" ref={scrollRef}>
        {hiddenCount > 0 && (
          <button className="conversation-load-earlier" onClick={loadEarlier}>
            Load earlier messages ({hiddenCount} more)
          </button>
        )}
        {visibleEvents.map((ev, idx) => renderEvent(ev, idx))}
      </div>

      {/* Input area */}
      <InputArea session={session} />
    </div>
  )
}
