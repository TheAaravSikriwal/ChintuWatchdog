import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { computeSessionStatus, STATUS_LABELS, STATUS_COLORS } from '../utils/sessionStatus'
import { eventPreview } from '../utils/plainEnglish'
import { buildResultMap } from '../utils/resultPairing'
import { useDurationTick } from '../hooks/useDurationTick'
import { IconArrowDown } from '@tabler/icons-react'
import InputArea from './InputArea'
import MessageBubble from './MessageBubble'
import ActionCard from './ActionCard'
import DelegationBadge from './DelegationBadge'
import FindBar from './FindBar'
import AllAgentsView from './AllAgentsView'
import GlassDome from './GlassDome'
import BroadView from './BroadView'
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

// Status badge background colors (translucent, marigold-warm tints)
const STATUS_BG = {
  working: 'var(--bg-success)',
  waiting: 'var(--bg-accent)',
  idle: 'var(--fill-ghost-hover)',
  quiet: 'var(--fill-ghost-hover)',
  stale: 'var(--bg-warning)',
  unclean: 'var(--bg-danger)',
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
  const [isLockedToBottom, setIsLockedToBottom] = useState(true)
  const [showJumpButton, setShowJumpButton] = useState(false)

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
      setIsLockedToBottom(true)
      setShowJumpButton(false)
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
        // Check if the saved position was near the bottom
        const el = scrollRef.current
        const dist = el.scrollHeight - saved - el.clientHeight
        setIsLockedToBottom(dist < 80)
        setShowJumpButton(dist >= 80)
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        setIsLockedToBottom(true)
        setShowJumpButton(false)
      }
    }
  }, [session, getScrollPosition])

  // P0 FIX: Auto-scroll to bottom when new events arrive, but only if locked
  const prevEventCountRef = useRef(0)
  useEffect(() => {
    if (!session || !scrollRef.current) return
    const newCount = session.events.length
    if (newCount === prevEventCountRef.current) return
    prevEventCountRef.current = newCount

    if (isLockedToBottom) {
      // Use requestAnimationFrame to ensure DOM has painted the new content
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      })
    }
  }, [session, sessionsVersion, isLockedToBottom])

  // P0 FIX: Track scroll position to detect manual scroll-up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distFromBottom < 80

    setIsLockedToBottom(nearBottom)
    setShowJumpButton(!nearBottom)
  }, [])

  // Jump-to-bottom handler
  const jumpToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      setIsLockedToBottom(true)
      setShowJumpButton(false)
    }
  }, [])

  if (!session && !showAllAgents) {
    return (
      <div className="conversation-view">
        <div className="conversation-empty">
          Select a session or start a new one
        </div>
        <InputArea session={null} />
        <GlassDome
          session={session}
          sessionsRef={sessionsRef}
          sessionsVersion={sessionsVersion}
          onClick={() => onToggleBroadView(true)}
        />
        {showBroadView && (
          <BroadView
            session={session}
            sessionsRef={sessionsRef}
            sessionsVersion={sessionsVersion}
            onClose={() => onToggleBroadView(false)}
            onSelectSession={(id) => { onToggleBroadView(false); onSelectSession(id); }}
          />
        )}
      </div>
    )
  }

  if (!session) {
    // showAllAgents mode
    return (
      <div className="conversation-view">
        <AllAgentsView
          sessionsRef={sessionsRef}
          sessionsVersion={sessionsVersion}
          onSelectSession={onSelectSession}
        />
        <GlassDome
          session={session}
          sessionsRef={sessionsRef}
          sessionsVersion={sessionsVersion}
          onClick={() => onToggleBroadView(true)}
        />
        {showBroadView && (
          <BroadView
            session={session}
            sessionsRef={sessionsRef}
            sessionsVersion={sessionsVersion}
            onClose={() => onToggleBroadView(false)}
            onSelectSession={(id) => { onToggleBroadView(false); onSelectSession(id); }}
          />
        )}
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
      ? { outline: '1.5px solid rgba(234,140,29,0.8)', borderRadius: 8, background: 'rgba(234,140,29,0.10)' }
      : isHighlighted
      ? { outline: '1px solid rgba(234,140,29,0.35)', borderRadius: 8 }
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
      <div className="conversation-scroll" ref={scrollRef} onScroll={handleScroll}>
        {hiddenCount > 0 && (
          <button className="conversation-load-earlier" onClick={loadEarlier}>
            Load earlier messages ({hiddenCount} more)
          </button>
        )}
        {visibleEvents.map((ev, idx) => renderEvent(ev, idx))}
      </div>

      {/* Jump to bottom button */}
      {showJumpButton && (
        <button className="jump-to-bottom" onClick={jumpToBottom}>
          <IconArrowDown size={12} stroke={2} />
          Jump to latest
        </button>
      )}

      {/* Input area */}
      <InputArea session={session} />

      {/* Glass dome minimap — P0 FIX: pass session prop */}
      <GlassDome
        session={session}
        sessionsRef={sessionsRef}
        sessionsVersion={sessionsVersion}
        onClick={() => onToggleBroadView(true)}
      />

      {/* Broad view overlay — P0 FIX: pass session prop */}
      {showBroadView && (
        <BroadView
          session={session}
          sessionsRef={sessionsRef}
          sessionsVersion={sessionsVersion}
          onClose={() => onToggleBroadView(false)}
          onSelectSession={(id) => { onToggleBroadView(false); onSelectSession(id); }}
        />
      )}
    </div>
  )
}
