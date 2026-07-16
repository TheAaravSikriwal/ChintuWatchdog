import { useMemo, useState } from 'react'
import { computeSessionStatus } from '../utils/sessionStatus'
import { computeDomeLayout } from '../utils/minimapLayout'

/**
 * GlassDome — a dark translucent pill minimap in the bottom-right of the
 * conversation area, showing a live left-to-right branching tree of all
 * agent sessions.
 *
 * Props:
 *   sessionsRef     — React ref holding a Map<sessionId, Session>
 *   sessionsVersion — number that bumps whenever sessions change
 *   onClick         — called when the dome is clicked (toggles broad view)
 */
export default function GlassDome({ sessionsRef, sessionsVersion, onClick }) {
  const [hovered, setHovered] = useState(false)

  // Build layout input from sessionsRef (recomputed when sessionsVersion changes)
  const layoutInput = useMemo(() => {
    const sessions = []
    for (const sess of sessionsRef.current.values()) {
      sessions.push({
        sessionId: sess.sessionId,
        agent: sess.agent,
        parentSessionId: sess.parentSessionId,
        status: computeSessionStatus(sess),
        lastEventAt: sess.lastEventAt,
      })
    }
    return sessions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsVersion])

  const layout = useMemo(() => computeDomeLayout(layoutInput), [layoutInput])

  // Don't render when there are no sessions
  if (layoutInput.length === 0) return null

  // Count active sessions (working or waiting)
  const activeCount = layoutInput.filter(
    s => s.status === 'working' || s.status === 'waiting'
  ).length

  return (
    <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 10 }}>
      {/* Glass dome pill */}
      <div
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="See what everyone's up to"
        style={{
          position: 'relative',
          width: 210,
          height: 70,
          borderRadius: 35,
          cursor: 'pointer',
          overflow: 'hidden',
          background: 'rgba(8, 16, 30, 0.9)',
          border: `1px solid ${hovered ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.12)'}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
          transition: 'border-color 0.15s ease',
        }}
      >
        <svg width="210" height="70" style={{ display: 'block' }}>
          {/* Connection lines */}
          {layout.lines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.color}
              strokeWidth={0.8}
              strokeOpacity={0.3}
            />
          ))}

          {/* Status rings + nodes */}
          {layout.nodes.map(node => {
            const ring = getRingProps(node)
            return (
              <g key={node.sessionId}>
                {/* Status ring (behind the node) */}
                {ring && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius + 3}
                    fill={ring.fill}
                    fillOpacity={ring.opacity}
                  />
                )}
                {/* Node */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={node.color}
                  fillOpacity={node.status === 'quiet' ? 0.22 : 1}
                />
              </g>
            )
          })}

          {/* Overflow indicator */}
          {layout.overflow > 0 && (
            <text
              x={200}
              y={63}
              textAnchor="end"
              fontSize={7}
              fill="rgba(255,255,255,0.28)"
            >
              +{layout.overflow}
            </text>
          )}
        </svg>
      </div>

      {/* Active count line below dome */}
      {activeCount > 0 && (
        <div
          style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textAlign: 'right',
            marginTop: 4,
          }}
        >
          {activeCount} active
        </div>
      )}
    </div>
  )
}

/**
 * Returns ring fill/opacity props for a node's status, or null for no ring.
 */
function getRingProps(node) {
  switch (node.status) {
    case 'working':
      return { fill: node.color, opacity: 0.28 }
    case 'waiting':
      return { fill: 'rgb(59,130,246)', opacity: 0.45 }
    case 'stale':
      return { fill: 'rgb(245,158,11)', opacity: 0.4 }
    case 'unclean':
      return { fill: 'rgb(239,68,68)', opacity: 0.4 }
    case 'quiet':
    case 'idle':
    default:
      return null
  }
}
