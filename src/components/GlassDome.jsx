import { useMemo, useState } from 'react'
import { computeSessionStatus, STATUS_COLORS } from '../utils/sessionStatus'

const AGENT_COLORS = {
  'claude-code': '#EA8C1D',
  'cursor': '#2563EB',
  'codex': '#16A34A',
  'antigravity': '#7C3AED',
  'aider': '#0891B2',
}

/**
 * GlassDome — a dark translucent circle in the bottom-right of the
 * conversation area. Shows per-session sub-agent dots when viewing a
 * specific session, or a global summary when no session is selected.
 *
 * Props:
 *   session         — the currently selected Session object (or null)
 *   sessionsRef     — React ref holding Map<sessionId, Session>
 *   sessionsVersion — number that bumps whenever sessions change
 *   onClick         — toggles the broad view
 */
export default function GlassDome({ session, sessionsRef, sessionsVersion, onClick }) {
  const [hovered, setHovered] = useState(false)

  // Compute dots to show inside the dome
  const { dots, activeCount } = useMemo(() => {
    const allSessions = Array.from(sessionsRef.current.values())
    const result = []
    let active = 0

    if (session) {
      // Per-session mode: show this session + its sub-agents
      const status = computeSessionStatus(session)
      const color = AGENT_COLORS[session.agent] || '#6B7280'
      result.push({ color, status, isRoot: true })
      if (status === 'working' || status === 'waiting') active++

      // Find sub-agents of this session
      for (const s of allSessions) {
        if (s.parentSessionId === session.sessionId) {
          const childStatus = computeSessionStatus(s)
          const childColor = AGENT_COLORS[s.agent] || '#6B7280'
          result.push({ color: childColor, status: childStatus, isRoot: false })
          if (childStatus === 'working' || childStatus === 'waiting') active++
        }
      }
    } else {
      // Global mode: show all active sessions as dots
      for (const s of allSessions) {
        const status = computeSessionStatus(s)
        if (status === 'quiet') continue // skip done sessions in global
        const color = AGENT_COLORS[s.agent] || '#6B7280'
        result.push({ color, status, isRoot: false })
        if (status === 'working' || status === 'waiting') active++
      }
    }

    return { dots: result.slice(0, 8), activeCount: active }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsVersion, session?.sessionId])

  if (dots.length === 0) return null

  // Position dots in a circle pattern inside the dome
  const SIZE = 56
  const CENTER = SIZE / 2
  const DOT_RING_R = 14 // radius of the ring dots sit on

  return (
    <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10 }}>
      <div
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="See what everyone's up to"
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          cursor: 'pointer',
          overflow: 'hidden',
          background: 'rgba(8, 16, 30, 0.92)',
          border: `1.5px solid ${hovered ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.4)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          position: 'relative',
        }}
      >
        <svg width={SIZE} height={SIZE} style={{ display: 'block' }}>
          {/* Subtle concentric ring for depth */}
          <circle
            cx={CENTER} cy={CENTER} r={DOT_RING_R + 4}
            fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={0.5}
          />

          {/* Dots arranged in a circle */}
          {dots.map((dot, i) => {
            let x, y, r

            if (dots.length === 1) {
              // Single session: center dot
              x = CENTER
              y = CENTER
              r = dot.isRoot ? 5 : 3.5
            } else if (dot.isRoot && dots.length > 1) {
              // Root session in center
              x = CENTER
              y = CENTER
              r = 4.5
            } else {
              // Arrange non-root dots around the ring
              const nonRootIndex = dots.filter((d, j) => j < i && !d.isRoot).length
              const nonRootTotal = dots.filter(d => !d.isRoot).length
              const angle = (nonRootIndex / nonRootTotal) * Math.PI * 2 - Math.PI / 2
              x = CENTER + Math.cos(angle) * DOT_RING_R
              y = CENTER + Math.sin(angle) * DOT_RING_R
              r = 3
            }

            const statusColor = STATUS_COLORS[dot.status]
            const showRing = dot.status === 'working' || dot.status === 'waiting' ||
                             dot.status === 'stale' || dot.status === 'unclean'
            const opacity = dot.status === 'quiet' ? 0.25 : 1

            return (
              <g key={i}>
                {showRing && (
                  <circle
                    cx={x} cy={y} r={r + 3}
                    fill={statusColor}
                    fillOpacity={0.2}
                  />
                )}
                <circle
                  cx={x} cy={y} r={r}
                  fill={dot.color}
                  fillOpacity={opacity}
                />
              </g>
            )
          })}
        </svg>
      </div>

      {/* Active count below */}
      {activeCount > 0 && (
        <div style={{
          fontSize: 9,
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          textAlign: 'center',
          marginTop: 4,
        }}>
          {activeCount} active
        </div>
      )}
    </div>
  )
}
