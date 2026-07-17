import { useRef, useEffect, useState, useMemo } from 'react'
import { buildResultMap } from '../utils/resultPairing'
import { useDurationTick } from '../hooks/useDurationTick'
import { AGENT_COLORS, AGENT_CODES } from '../utils/agentIdentity'
import MessageBubble from './MessageBubble'
import ActionCard from './ActionCard'
import DelegationBadge from './DelegationBadge'

const RENDER_CAP = 500

function relativeTime(date) {
  if (!date) return ''
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

// compareEvents mirrors the sort order in main/event.js:
// sort by timestamp (nulls last), then agent, sessionId, sourceSeq
function compareEvents(a, b) {
  const aTs = a.timestamp ? new Date(a.timestamp).getTime() : null
  const bTs = b.timestamp ? new Date(b.timestamp).getTime() : null

  if (aTs === null && bTs === null) {
    // both null — tiebreak by agent, sessionId, sourceSeq
  } else if (aTs === null) {
    return 1
  } else if (bTs === null) {
    return -1
  } else if (aTs !== bTs) {
    return aTs - bTs
  }

  if (a.agent !== b.agent) {
    return (a.agent || '').localeCompare(b.agent || '')
  }
  if (a.sessionId !== b.sessionId) {
    return (a.sessionId || '').localeCompare(b.sessionId || '')
  }
  return (a.sourceSeq ?? 0) - (b.sourceSeq ?? 0)
}

export default function AllAgentsView({ sessionsRef, sessionsVersion, onSelectSession }) {
  const scrollRef = useRef(null)
  const prevTotalRef = useRef(0)
  const [eventOffset, setEventOffset] = useState(0)
  const durationTick = useDurationTick()

  // Collect and sort all events across all sessions
  const { allTaggedEvents, resultMap } = useMemo(() => {
    const sessions = sessionsRef.current
    if (!sessions || sessions.size === 0) return { allTaggedEvents: [], resultMap: new Map() }

    // Tag each event with its session metadata for rendering
    const tagged = []
    for (const session of sessions.values()) {
      for (const ev of session.events) {
        // Only keep events that actually render as a row. Results are shown
        // inside their action's card, and system messages (except
        // session_start dividers) are never rendered. Filtering here — rather
        // than returning null mid-render — keeps the render cap counting real
        // rows and the "session changed" header logic correct (otherwise a
        // block starting with a skipped event loses its header, and skipped
        // events between two rows of the same session spawn stray headers).
        if (ev.kind === 'result') continue
        if (ev.role === 'system' && ev.kind !== 'session_start') continue
        if (ev.kind !== 'session_start' && ev.kind !== 'message'
            && ev.kind !== 'thinking' && ev.kind !== 'action') continue
        tagged.push({ ev, session })
      }
    }

    // Sort interleaved by timestamp + tiebreakers
    tagged.sort((a, b) => compareEvents(a.ev, b.ev))

    // Build the result map PER SESSION, then key globally by
    // `${sessionId}:${sourceSeq}`. buildResultMap keys by sourceSeq alone,
    // which resets to 0 per session file — so pairing across a flat
    // multi-session list would collide (and its sequence fallback would
    // pair an action in one session with a result from another, since the
    // flat list is interleaved by timestamp). Pairing within each session
    // keeps both the toolUseId match and the sequence fallback correct.
    const rm = new Map()
    for (const session of sessions.values()) {
      const sessionMap = buildResultMap(session.events)
      for (const [seq, result] of sessionMap) {
        rm.set(`${session.sessionId}:${seq}`, result)
      }
    }

    return { allTaggedEvents: tagged, resultMap: rm }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsVersion])

  const totalEvents = allTaggedEvents.length
  const startIdx = Math.max(0, totalEvents - RENDER_CAP - eventOffset)
  const visibleTagged = allTaggedEvents.slice(startIdx)
  const hiddenCount = startIdx

  // Auto-scroll to bottom when new events arrive (50px threshold)
  useEffect(() => {
    const newTotal = totalEvents
    if (newTotal === prevTotalRef.current) return
    prevTotalRef.current = newTotal

    if (!scrollRef.current) return
    const el = scrollRef.current
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 50) {
      el.scrollTop = el.scrollHeight
    }
  }, [totalEvents, sessionsVersion])

  // Scroll to bottom on initial mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  function loadEarlier() {
    setEventOffset(prev => prev + RENDER_CAP)
  }

  function renderTagged(tagged, idx) {
    const { ev, session } = tagged
    const prevTagged = idx > 0 ? visibleTagged[idx - 1] : null
    const sessionChanged = !prevTagged || prevTagged.session.sessionId !== session.sessionId

    const agentColor = AGENT_COLORS[session.agent] || '#64748B'
    const agentCode = AGENT_CODES[session.agent] || '??'

    // Skip result events — handled by ActionCard
    if (ev.kind === 'result') return null

    // Skip system messages (non-session-start)
    if (ev.role === 'system' && ev.kind !== 'session_start') return null

    const key = `${session.sessionId}-${ev.sourceSeq ?? idx}`

    // Session identifier header row — only when session changes
    const headerRow = sessionChanged ? (
      <div className="all-agents-header" key={`header-${key}`}>
        <div
          className="all-agents-avatar"
          style={{ background: agentColor }}
        >
          {agentCode}
        </div>
        <span>
          {session.name}
          {session.model ? ` · ${session.model}` : ''}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {relativeTime(ev.timestamp ? new Date(ev.timestamp) : null)}
        </span>
      </div>
    ) : null

    // Render the event itself
    let eventNode = null

    if (ev.kind === 'session_start' || ev.kind === 'message' || ev.kind === 'thinking') {
      eventNode = (
        <div key={key}>
          <MessageBubble event={ev} agentColor={agentColor} />
        </div>
      )
    } else if (ev.kind === 'action' && ev.action === 'task') {
      eventNode = (
        <div key={key}>
          <DelegationBadge
            event={ev}
            onSelectSession={onSelectSession}
            subagentLinks={session.subagentLinks}
            sessionsRef={sessionsRef}
          />
        </div>
      )
    } else if (ev.kind === 'action') {
      eventNode = (
        <div key={key}>
          <ActionCard
            event={ev}
            resultEvent={resultMap.get(`${session.sessionId}:${ev.sourceSeq}`) || null}
            agentColor={agentColor}
            durationTick={durationTick}
          />
        </div>
      )
    }

    if (!eventNode) return null

    // Wrap header + event in a fragment; use header key as React fragment key
    return (
      <div key={`group-${key}`}>
        {headerRow}
        {eventNode}
      </div>
    )
  }

  return (
    <>
      <div className="conversation-scroll" ref={scrollRef}>
        {hiddenCount > 0 && (
          <button className="conversation-load-earlier" onClick={loadEarlier}>
            Load earlier messages ({hiddenCount} more)
          </button>
        )}
        {visibleTagged.length === 0 && (
          <div className="conversation-empty">
            No events yet across any sessions
          </div>
        )}
        {visibleTagged.map((tagged, idx) => renderTagged(tagged, idx))}
      </div>

      <div className="all-agents-input">
        Select a session to send a message
      </div>
    </>
  )
}
