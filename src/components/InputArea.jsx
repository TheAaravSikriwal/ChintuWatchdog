import { useState, useRef } from 'react'
import { computeSessionStatus, isWaitingForUser } from '../utils/sessionStatus'

const COMING_SOON_MSG = "This is coming soon — for now, keep an eye on what it's doing"

function relativeTime(date) {
  if (!date) return ''
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function InputArea({ session, onNewSession }) {
  const [text, setText] = useState('')
  const [tooltip, setTooltip] = useState(false)
  const tooltipTimeoutRef = useRef(null)

  if (!session) return null

  const status = computeSessionStatus(session)

  // Determine mode
  let mode
  if (status === 'quiet' || status === 'unclean' || session.inputState === 'read-only') {
    mode = 'read-only'
  } else if (isWaitingForUser(session)) {
    mode = 'waiting'
  } else if (session.inputState === 'busy') {
    mode = 'busy'
  } else {
    mode = 'idle'
  }

  function handleActionClick() {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    setTooltip(true)
    tooltipTimeoutRef.current = setTimeout(() => setTooltip(false), 3500)
  }

  if (mode === 'read-only') {
    return (
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--fs-sm)',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}>
        <span>This session wrapped up {relativeTime(session.lastEventAt)}.</span>
        <button
          onClick={onNewSession}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-accent)',
            cursor: 'pointer',
            fontSize: 'var(--fs-sm)',
            fontFamily: 'var(--font-ui)',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          Start a new one →
        </button>
      </div>
    )
  }

  const placeholder = mode === 'busy'
    ? 'Send a note for when it\'s free...'
    : 'Message Claude...'

  const buttonLabel = mode === 'busy' ? 'Queue →' : 'Send →'

  return (
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface-1)',
      flexShrink: 0,
    }}>
      {mode === 'waiting' && (
        <div style={{
          fontSize: 'var(--fs-sm)',
          color: 'var(--text-accent)',
          marginBottom: 'var(--space-1)',
        }}>
          Claude is waiting for your response
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', position: 'relative' }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            height: 34,
            padding: '0 var(--space-3)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            outline: 'none',
            transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'var(--border-accent)'
            e.currentTarget.style.boxShadow = 'var(--shadow-focus)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && text.trim()) handleActionClick()
          }}
        />
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleActionClick}
            style={{
              height: 34,
              padding: '0 var(--space-4)',
              background: 'var(--fill-accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 999,
              fontSize: 'var(--fs-sm)',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-ui)',
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--fill-accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--fill-accent)'}
          >
            {buttonLabel}
          </button>
          {tooltip && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 'var(--space-2)',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--fs-sm)',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              zIndex: 'var(--z-overlay)',
              boxShadow: 'var(--shadow-md)',
            }}>
              {COMING_SOON_MSG}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
