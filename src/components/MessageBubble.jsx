import { formatDistanceToNow } from 'date-fns'

// ── Session divider ──────────────────────────────────────────────────────────

function SessionDivider({ event }) {
  let relativeTime = ''
  if (event.timestamp) {
    try {
      relativeTime = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })
    } catch {
      relativeTime = ''
    }
  }

  return (
    <div>
      <div className="session-divider">
        <span className="divider-line" />
        <span className="divider-text">
          Session started{relativeTime ? ` · ${relativeTime}` : ''}
        </span>
        <span className="divider-line" />
      </div>
      {event.cwd && (
        <div className="divider-cwd">{event.cwd}</div>
      )}
    </div>
  )
}

// ── Interrupt marker (exported separately) ───────────────────────────────────

export function InterruptMarker() {
  return (
    <div className="interrupt-marker">
      <span className="interrupt-line" />
      <span className="interrupt-text">Interrupted</span>
      <span className="interrupt-line" />
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MessageBubble({ event, agentColor }) {
  // Skip result events — rendered by ActionCard
  if (event.kind === 'result') return null

  // Session divider
  if (event.kind === 'session_start') {
    return <SessionDivider event={event} />
  }

  // Skip system messages (non-session-start)
  if (event.role === 'system') return null

  // Thinking bubble
  if (event.kind === 'thinking') {
    return (
      <div>
        <div className="bubble-thinking-label">thinking</div>
        <div className="bubble-thinking">
          {event.text || ''}
        </div>
      </div>
    )
  }

  // User message
  if (event.kind === 'message' && event.role === 'user') {
    return (
      <div className="bubble-row bubble-row-user">
        <div className="bubble-user">
          {event.text || ''}
        </div>
      </div>
    )
  }

  // Agent message
  if (event.kind === 'message' && event.role === 'assistant') {
    return (
      <div className="bubble-row bubble-row-agent">
        <div
          className="bubble-agent"
          style={{ borderLeftColor: agentColor }}
        >
          {event.text || ''}
        </div>
      </div>
    )
  }

  // Fallback: nothing
  return null
}
