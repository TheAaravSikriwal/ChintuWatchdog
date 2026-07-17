import { useMemo } from 'react'
import { computeSessionStatus, STATUS_LABELS } from '../utils/sessionStatus'
import NetworkGraph from './NetworkGraph'
import StatusPills from './StatusPills'

/**
 * BroadView — per-session overlay showing this session and its sub-agents.
 * Opens when clicking the glass dome on a conversation.
 */
export default function BroadView({ session, sessionsRef, sessionsVersion, onClose, onSelectSession }) {
  // Build the session tree: this session + its sub-agents (and their sub-agents)
  const treeSessions = useMemo(() => {
    if (!session) return []
    const all = Array.from(sessionsRef.current.values())
    const selected = new Set([session.sessionId])

    // Walk down: find all descendants
    let changed = true
    while (changed) {
      changed = false
      for (const s of all) {
        if (s.parentSessionId && selected.has(s.parentSessionId) && !selected.has(s.sessionId)) {
          selected.add(s.sessionId)
          changed = true
        }
      }
    }

    // Walk up: include parent chain
    let current = session
    const byId = new Map(all.map(s => [s.sessionId, s]))
    while (current?.parentSessionId && byId.has(current.parentSessionId)) {
      selected.add(current.parentSessionId)
      current = byId.get(current.parentSessionId)
    }

    return all.filter(s => selected.has(s.sessionId))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsVersion, session?.sessionId])

  const status = session ? computeSessionStatus(session) : 'quiet'

  // Project name from cwd
  const projectName = useMemo(() => {
    if (!session) return null
    const startEv = session.events?.find(ev => ev.kind === 'session_start')
    const cwd = startEv?.cwd
    if (!cwd) return null
    const parts = cwd.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || null
  }, [session])

  function handleSelectSession(sessionId) {
    onSelectSession(sessionId)
    onClose()
  }

  if (!session) return null

  const subAgentCount = treeSessions.length - 1
  const statusDotColor = status === 'working' ? 'var(--text-success)'
    : status === 'waiting' ? 'var(--fill-accent)'
    : 'var(--text-muted)'

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
          gap: var(--space-3);
          padding: var(--space-3) var(--space-5);
          border-bottom: 0.5px solid var(--border);
          background: var(--surface-1);
          flex-shrink: 0;
        }
        .broad-view-header-text { flex: 1; min-width: 0; }
        .broad-view-title {
          font-size: var(--fs-md); font-weight: 500; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .broad-view-subtitle {
          font-size: var(--fs-xs); color: var(--text-muted); margin-top: 2px;
        }
        .broad-view-status {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: var(--fs-xs); color: var(--text-muted); flex-shrink: 0;
        }
        .broad-view-status-dot {
          width: 6px; height: 6px; border-radius: 50%;
        }
        .broad-view-close {
          background: none; border: none; cursor: pointer;
          color: var(--text-muted); padding: var(--space-1); border-radius: var(--radius-md);
          display: flex; align-items: center; justify-content: center;
          transition: background var(--transition-fast), color var(--transition-fast); flex-shrink: 0;
        }
        .broad-view-close:hover {
          background: var(--fill-ghost-hover); color: var(--text-primary);
        }
        .broad-view-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .broad-view-solo {
          flex: 1; display: flex; align-items: center; justify-content: center;
          color: var(--text-muted); font-size: var(--fs-sm);
        }
      `}</style>

      {/* Header */}
      <div className="broad-view-header">
        <div className="broad-view-header-text">
          <div className="broad-view-title">{session.name}</div>
          <div className="broad-view-subtitle">
            {subAgentCount > 0
              ? `${subAgentCount} sub-agent${subAgentCount !== 1 ? 's' : ''}${projectName ? ` · ${projectName}` : ''}`
              : projectName || STATUS_LABELS[status]
            }
          </div>
        </div>

        <div className="broad-view-status">
          <div className="broad-view-status-dot" style={{ background: statusDotColor }} />
          {STATUS_LABELS[status]}
        </div>

        <button className="broad-view-close" onClick={onClose} title="Close (Esc)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="broad-view-body">
        {treeSessions.length > 1 ? (
          <NetworkGraph
            sessions={treeSessions}
            onSelectSession={handleSelectSession}
          />
        ) : (
          <div className="broad-view-solo">
            No sub-agents for this session
          </div>
        )}
      </div>

      {/* Footer — status pills for sub-agents only */}
      {treeSessions.length > 1 && (
        <StatusPills
          sessions={treeSessions}
          onSelectSession={handleSelectSession}
        />
      )}
    </div>
  )
}
