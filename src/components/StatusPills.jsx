import { useMemo } from 'react'
import { computeSessionStatus, STATUS_COLORS } from '../utils/sessionStatus'
import { eventPreview } from '../utils/plainEnglish'
import { AGENT_COLORS, AGENT_CODES } from '../utils/agentIdentity'

const ACTIVE_STATUSES = new Set(['working', 'waiting', 'idle', 'stale'])

/**
 * StatusPills — a horizontal strip showing active sessions as pills.
 *
 * Props:
 *   sessions        — array of Session objects
 *   onSelectSession — called with sessionId when pill is clicked
 */
export default function StatusPills({ sessions, onSelectSession }) {
  const pills = useMemo(() => {
    return sessions
      .map(sess => {
        const status = computeSessionStatus(sess)
        if (!ACTIVE_STATUSES.has(status)) return null

        // Last non-result action event for current action label
        let lastActionLabel = ''
        const events = sess.events || []
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i]
          if (ev.kind !== 'result') {
            lastActionLabel = eventPreview(ev)
            break
          }
        }

        return {
          sessionId: sess.sessionId,
          agent: sess.agent,
          name: sess.name || sess.sessionId,
          status,
          lastActionLabel,
        }
      })
      .filter(Boolean)
  }, [sessions])

  return (
    <div className="status-pills">
      <style>{`
        .status-pills {
          height: 48px;
          border-top: 0.5px solid var(--border);
          background: var(--surface-1);
          display: flex;
          align-items: center;
          padding: 0 16px;
          gap: 8px;
          overflow-x: auto;
          flex-shrink: 0;
        }
        .status-pills::-webkit-scrollbar { height: 4px; }
        .status-pills-empty {
          flex: 1;
          text-align: center;
          font-size: 12px;
          color: var(--text-muted);
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          background: var(--surface-2);
          border: 0.5px solid var(--border);
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 0.12s;
        }
        .status-pill:hover { background: var(--surface-3); }
        .status-pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-pill-code {
          font-weight: 600;
          font-size: 10px;
        }
        .status-pill-name {
          color: var(--text-primary);
        }
        .status-pill-action {
          color: var(--text-muted);
        }
      `}</style>

      {pills.length === 0 ? (
        <div className="status-pills-empty">all agents idle</div>
      ) : (
        pills.map(pill => {
          const agentColor = AGENT_COLORS[pill.agent] || '#6B7280'
          const agentCode = AGENT_CODES[pill.agent] || '??'
          const statusColor = STATUS_COLORS[pill.status] || '#6B7280'
          const name = pill.name.length > 20 ? pill.name.slice(0, 20) + '…' : pill.name
          const action = pill.lastActionLabel.length > 22
            ? pill.lastActionLabel.slice(0, 22) + '…'
            : pill.lastActionLabel

          return (
            <button
              key={pill.sessionId}
              className="status-pill"
              onClick={() => onSelectSession(pill.sessionId)}
            >
              <span
                className="status-pill-dot"
                style={{ background: statusColor }}
              />
              <span
                className="status-pill-code"
                style={{ color: agentColor }}
              >
                {agentCode}
              </span>
              <span className="status-pill-name">{name}</span>
              {action && (
                <span className="status-pill-action">{action}</span>
              )}
            </button>
          )
        })
      )}
    </div>
  )
}
