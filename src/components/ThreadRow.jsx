import { computeSessionStatus, STATUS_COLORS } from '../utils/sessionStatus'
import { eventPreview } from '../utils/plainEnglish'
import { AGENT_COLORS, AGENT_CODES } from '../utils/agentIdentity'

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
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

export default function ThreadRow({ session, isSelected, isFocused, isSubAgent, isContinuation, onClick, searchQuery }) {
  const status = computeSessionStatus(session)
  const isHistorical = status === 'quiet'
  const avatarColor = AGENT_COLORS[session.agent] || '#64748B'
  const agentCode = AGENT_CODES[session.agent] || '??'
  const avatarSize = isSubAgent ? 28 : 34

  // Status dot visibility
  const showStatusDot = ['working', 'waiting', 'stale', 'unclean'].includes(status)
  const statusDotColor = STATUS_COLORS[status]

  // Last event for preview
  const lastEvent = session.events.length > 0 ? session.events[session.events.length - 1] : null
  const preview = eventPreview(lastEvent)

  // Unread indicator — now marigold instead of blue
  const hasUnread = !isSelected && session.events.length > session.lastViewedEventCount

  // Name with optional prefix
  const displayName = isContinuation ? `↩ ${session.name}` : session.name

  // Highlight search match
  function renderName() {
    if (!searchQuery) return displayName
    const q = searchQuery.toLowerCase()
    const lower = displayName.toLowerCase()
    const idx = lower.indexOf(q)
    if (idx === -1) return displayName
    return (
      <>
        {displayName.slice(0, idx)}
        <strong style={{ color: 'var(--text-primary)' }}>{displayName.slice(idx, idx + q.length)}</strong>
        {displayName.slice(idx + q.length)}
      </>
    )
  }

  const indentStyle = isSubAgent || isContinuation
    ? { paddingLeft: 32, borderLeft: '1.5px solid var(--border)', marginLeft: 12 }
    : {}

  return (
    <div
      className="thread-row"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        cursor: 'pointer',
        borderRadius: 'var(--radius-md)',
        margin: '0 var(--space-1)',
        transition: 'background var(--transition-fast)',
        background: isSelected ? 'var(--bg-accent)' : 'transparent',
        outline: isFocused && !isSelected ? '1.5px solid var(--border-accent)' : 'none',
        outlineOffset: -2,
        ...indentStyle,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--fill-ghost-hover)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          background: avatarColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isHistorical ? 0.55 : 1,
        }}>
          <span style={{
            color: '#fff',
            fontSize: avatarSize === 28 ? 9 : 10,
            fontWeight: 700,
            letterSpacing: '0.02em',
            fontFamily: 'var(--font-mono)',
          }}>
            {agentCode}
          </span>
        </div>
        {/* Status dot */}
        {showStatusDot && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusDotColor,
            border: '1.5px solid var(--surface-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 5,
          }}>
            {status === 'unclean' && <span style={{ lineHeight: 1 }}>⚠</span>}
          </div>
        )}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-1)' }}>
          {/* Name */}
          <span style={{
            fontSize: 'var(--fs-sm)',
            fontWeight: 500,
            color: isHistorical ? 'var(--text-secondary)' : 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}>
            {renderName()}
          </span>
          {/* Relative time */}
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}>
            {relativeTime(session.lastEventAt)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-1)' }}>
          {/* Preview */}
          <span style={{
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}>
            {preview}
          </span>
          {/* Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }}>
            {session.errorCount >= 1 && (
              <span style={{
                fontSize: 10,
                color: 'var(--text-warning)',
                background: 'var(--bg-warning)',
                padding: '1px 5px',
                borderRadius: 'var(--radius-sm)',
                whiteSpace: 'nowrap',
              }}>
                ⚠ {session.errorCount}
              </span>
            )}
            {hasUnread && (
              <div style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--fill-accent)',
                flexShrink: 0,
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
