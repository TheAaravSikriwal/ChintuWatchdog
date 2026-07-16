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
        padding: '10px 16px',
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
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
            fontSize: 12,
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
      padding: '10px 14px',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface-1)',
      flexShrink: 0,
    }}>
      {mode === 'waiting' && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-accent)',
          marginBottom: 6,
        }}>
          Claude is waiting for your response
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            height: 34,
            padding: '0 12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
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
              padding: '0 14px',
              background: 'var(--fill-accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {buttonLabel}
          </button>
          {tooltip && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 8,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              zIndex: 100,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}>
              {COMING_SOON_MSG}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
