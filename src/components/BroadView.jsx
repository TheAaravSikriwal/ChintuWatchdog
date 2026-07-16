import { useMemo } from 'react'
import { computeSessionStatus } from '../utils/sessionStatus'
import NetworkGraph from './NetworkGraph'
import StatusPills from './StatusPills'

/**
 * BroadView — full-screen mission control overlay.
 *
 * Props:
 *   sessionsRef     — React ref holding a Map<sessionId, Session>
 *   sessionsVersion — number that bumps whenever sessions change
 *   onClose         — called to dismiss the overlay
 *   onSelectSession — called with sessionId when a session is selected
 */
export default function BroadView({ sessionsRef, sessionsVersion, onClose, onSelectSession }) {
  // Build sessions array from sessionsRef
  const sessions = useMemo(() => {
    return Array.from(sessionsRef.current.values())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsVersion])

  // Count active sessions
  const activeCount = useMemo(() => {
    return sessions.filter(sess => {
      const status = computeSessionStatus(sess)
      return status === 'working' || status === 'waiting'
    }).length
  }, [sessions])

  // Try to derive a shared project name from cwd of first session_start events
  const projectName = useMemo(() => {
    const cwds = sessions.map(sess => {
      const startEv = sess.events?.find(ev => ev.kind === 'session_start')
      return startEv?.cwd || null
    }).filter(Boolean)

    if (cwds.length === 0 || cwds.length !== sessions.length) return null

    const first = cwds[0]
    const allSame = cwds.every(cwd => cwd === first)
    if (!allSame) return null

    // Return the last path segment as the project name
    const parts = first.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || first
  }, [sessions])

  // Handlers: select a session + close the overlay
  function handleSelectSession(sessionId) {
    onSelectSession(sessionId)
    onClose()
  }

  return (
    <div className="broad-view">
      <style>{`
        .broad-view {
          position: absolute;
          inset: 0;
          z-index: 20;
          background: var(--surface-0);
          display: flex;
          flex-direction: column;
          animation: bv-fadeIn 0.15s ease;
        }
        @keyframes bv-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .broad-view-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 18px;
          border-bottom: 0.5px solid var(--border);
          background: var(--surface-1);
          flex-shrink: 0;
        }
        .broad-view-header-text {
          flex: 1;
          min-width: 0;
        }
        .broad-view-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }
        .broad-view-subtitle {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .broad-view-live {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .broad-view-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22C55E;
          animation: bv-pulse 2s ease-in-out infinite;
        }
        @keyframes bv-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .broad-view-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.12s, color 0.12s;
          flex-shrink: 0;
        }
        .broad-view-close:hover {
          background: var(--fill-ghost-hover);
          color: var(--text-primary);
        }
        .broad-view-body {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
      `}</style>

      {/* Header */}
      <div className="broad-view-header">
        <div className="broad-view-header-text">
          <div className="broad-view-title">What's everyone working on</div>
          <div className="broad-view-subtitle">
            {sessions.length} agent{sessions.length !== 1 ? 's' : ''} active
            {projectName ? ` · all working on ${projectName}` : ''}
          </div>
        </div>

        {/* Live indicator */}
        <div className="broad-view-live">
          <div className="broad-view-live-dot" />
          live
        </div>

        {/* Close button */}
        <button
          className="broad-view-close"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close broad view"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 4L4 12M4 4L12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Body — NetworkGraph */}
      <div className="broad-view-body">
        <NetworkGraph
          sessions={sessions}
          onSelectSession={handleSelectSession}
        />
      </div>

      {/* Footer — StatusPills */}
      <StatusPills
        sessions={sessions}
        onSelectSession={handleSelectSession}
      />
    </div>
  )
}
