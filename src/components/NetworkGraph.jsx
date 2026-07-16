import { useRef, useEffect, useState, useMemo } from 'react'
import { computeNetworkLayout } from '../utils/networkLayout'
import { computeSessionStatus, STATUS_LABELS, STATUS_COLORS } from '../utils/sessionStatus'
import { eventPreview } from '../utils/plainEnglish'
import { AGENT_DISPLAY_NAMES } from '../utils/sessionName'

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

const ACTION_ICONS = {
  read_file: '📄',
  write_file: '✏️',
  edit_file: '✏️',
  run_command: '⚡',
  search: '🔍',
  task: '🔀',
  other: '🔧',
}

function getLastActionInfo(session) {
  const events = session.events || []
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.kind === 'action' || ev.kind === 'thinking' || (ev.kind === 'message' && ev.role === 'assistant')) {
      const icon = ev.kind === 'action' ? (ACTION_ICONS[ev.action] || ACTION_ICONS.other) : (ev.kind === 'thinking' ? '💭' : '💬')
      const label = eventPreview(ev)
      return { icon, label }
    }
  }
  return { icon: '💤', label: 'Idle' }
}

// Unique animation keyframe ID counter to avoid collisions
let uidCounter = 0
function nextUid() {
  return ++uidCounter
}

/**
 * NetworkGraph — renders a hierarchical network of agent session cards.
 *
 * Props:
 *   sessions        — array of Session objects (from sessionsRef)
 *   onSelectSession — called with sessionId when a node is clicked
 */
export default function NetworkGraph({ sessions, onSelectSession }) {
  const containerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height })
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDimensions({ width, height })
        }
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Build layout input from sessions
  const layoutInput = useMemo(() => {
    return sessions.map(sess => {
      const lastEv = sess.events?.length > 0 ? sess.events[sess.events.length - 1] : null
      return {
        sessionId: sess.sessionId,
        agent: sess.agent,
        parentSessionId: sess.parentSessionId || null,
        status: computeSessionStatus(sess),
        name: sess.name || sess.sessionId,
        lastEvent: eventPreview(lastEv),
      }
    })
  }, [sessions])

  const layout = useMemo(
    () => computeNetworkLayout(layoutInput, dimensions.width, dimensions.height),
    [layoutInput, dimensions]
  )

  // Map sessionId -> layout node for quick lookup
  const nodeById = useMemo(() => {
    const m = new Map()
    for (const n of layout.nodes) m.set(n.sessionId, n)
    return m
  }, [layout.nodes])

  // Determine if we should show the "add model" placeholder
  const activeAgents = useMemo(() => {
    const agents = new Set()
    for (const sess of sessions) {
      const status = computeSessionStatus(sess)
      if (status === 'working' || status === 'waiting' || status === 'idle') {
        agents.add(sess.agent)
      }
    }
    return agents
  }, [sessions])

  const showPlaceholder = activeAgents.size < 3

  // Build unique animation IDs for each line
  const lineAnimIds = useMemo(() => {
    return layout.lines.map(() => ({ uid1: nextUid(), uid2: nextUid() }))
  }, [layout.lines])

  return (
    <div className="network-graph" ref={containerRef}>
      {/* CSS animations for dots */}
      <style>{`
        .network-graph { position: relative; flex: 1; overflow: hidden; }
        .network-node {
          position: absolute;
          cursor: pointer;
          transition: transform 0.15s;
        }
        .network-node:hover { transform: scale(1.03); }
        .network-node-inner {
          width: 160px;
          background: var(--surface-1);
          border: 0.5px solid var(--border);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .network-node-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .network-node-avatar {
          width: 30px; height: 30px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600; color: #fff; flex-shrink: 0;
        }
        .network-node-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
        .network-node-model { font-size: 10px; color: var(--text-muted); }
        .network-node-action { font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .network-node-action-icon { margin-right: 3px; }
        .network-node-status { font-size: 10px; }
        .network-node-placeholder .network-node-inner {
          border: 1.5px dashed var(--border-strong);
          background: transparent;
          opacity: 0.2;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4px;
        }
        .network-node-placeholder-icon { font-size: 22px; color: var(--text-muted); }
        .network-node-placeholder-label { font-size: 11px; color: var(--text-muted); }
      `}</style>

      {/* SVG layer for lines and animated dots */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <defs>
          {layout.lines.map((line, i) => {
            const { uid1, uid2 } = lineAnimIds[i] || { uid1: i * 2, uid2: i * 2 + 1 }
            const fromNode = nodeById.get(line.fromId)
            const toNode = nodeById.get(line.toId)
            // Only animate if neither endpoint is a historical/done session
            const fromSess = sessions.find(s => s.sessionId === line.fromId)
            const toSess = sessions.find(s => s.sessionId === line.toId)
            const fromStatus = fromSess ? computeSessionStatus(fromSess) : 'quiet'
            const toStatus = toSess ? computeSessionStatus(toSess) : 'quiet'
            const animate = fromStatus !== 'quiet' && toStatus !== 'quiet'
            if (!animate) return null

            return (
              <style key={`anim-${i}`}>{`
                @keyframes dot-travel-${uid1} {
                  0%   { cx: ${line.x1}; cy: ${line.y1}; opacity: 0.9; }
                  10%  { opacity: 1; }
                  90%  { opacity: 1; }
                  100% { cx: ${line.x2}; cy: ${line.y2}; opacity: 0; }
                }
                @keyframes dot-travel-${uid2} {
                  0%   { cx: ${line.x1}; cy: ${line.y1}; opacity: 0; }
                  10%  { opacity: 0.9; }
                  90%  { opacity: 1; }
                  100% { cx: ${line.x2}; cy: ${line.y2}; opacity: 0; }
                }
              `}</style>
            )
          })}
        </defs>

        {/* Delegation lines */}
        {layout.lines.map((line, i) => (
          <line
            key={`line-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.color}
            strokeWidth={2}
            strokeOpacity={0.5}
          />
        ))}

        {/* Animated dots on lines */}
        {layout.lines.map((line, i) => {
          const { uid1, uid2 } = lineAnimIds[i] || { uid1: i * 2, uid2: i * 2 + 1 }
          const fromSess = sessions.find(s => s.sessionId === line.fromId)
          const toSess = sessions.find(s => s.sessionId === line.toId)
          const fromStatus = fromSess ? computeSessionStatus(fromSess) : 'quiet'
          const toStatus = toSess ? computeSessionStatus(toSess) : 'quiet'
          if (fromStatus === 'quiet' || toStatus === 'quiet') return null

          return (
            <g key={`dots-${i}`}>
              <circle
                r={4}
                fill={line.color}
                style={{
                  animation: `dot-travel-${uid1} 2s linear infinite`,
                }}
              />
              <circle
                r={4}
                fill={line.color}
                style={{
                  animation: `dot-travel-${uid2} 2s linear 1s infinite`,
                }}
              />
            </g>
          )
        })}
      </svg>

      {/* HTML node cards */}
      {layout.nodes.map(node => {
        const sess = sessions.find(s => s.sessionId === node.sessionId)
        if (!sess) return null

        const status = computeSessionStatus(sess)
        const agentColor = AGENT_COLORS[sess.agent] || '#64748B'
        const agentCode = AGENT_CODES[sess.agent] || '??'
        const displayName = AGENT_DISPLAY_NAMES[sess.agent] || sess.agent
        const { icon: actionIcon, label: lastActionLabel } = getLastActionInfo(sess)
        const isDone = status === 'quiet'

        return (
          <div
            key={node.sessionId}
            className="network-node"
            style={{
              left: node.x,
              top: node.y,
              opacity: isDone ? 0.3 : 1,
            }}
            onClick={() => onSelectSession(node.sessionId)}
          >
            <div
              className="network-node-inner"
              style={{ borderLeft: `3px solid ${agentColor}` }}
            >
              <div className="network-node-header">
                <div
                  className="network-node-avatar"
                  style={{ background: agentColor }}
                >
                  {agentCode}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    className="network-node-name"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 100,
                    }}
                  >
                    {sess.name || sess.sessionId}
                  </div>
                  <div className="network-node-model">{displayName}</div>
                </div>
              </div>
              <div className="network-node-action" title={lastActionLabel}>
                <span className="network-node-action-icon">{actionIcon}</span>
                {lastActionLabel.length > 22 ? lastActionLabel.slice(0, 22) + '…' : lastActionLabel}
              </div>
              <div
                className="network-node-status"
                style={{ color: STATUS_COLORS[status] }}
              >
                {STATUS_LABELS[status]}
              </div>
            </div>
          </div>
        )
      })}

      {/* "Add model" placeholder when fewer than 3 distinct active agent types */}
      {showPlaceholder && layout.nodes.length > 0 && (
        <div
          className="network-node network-node-placeholder"
          style={{
            left: PADDING_PLACEHOLDER(layout, dimensions),
            top: dimensions.height / 2 - 60,
          }}
        >
          <div className="network-node-inner" style={{ height: 120 }}>
            <div className="network-node-placeholder-icon">+</div>
            <div className="network-node-placeholder-label">Future agent</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper: position the placeholder to the right of all existing nodes
function PADDING_PLACEHOLDER(layout, dimensions) {
  if (layout.nodes.length === 0) return 40
  let maxX = 0
  for (const n of layout.nodes) {
    maxX = Math.max(maxX, n.x + 160)
  }
  return maxX + 60
}
