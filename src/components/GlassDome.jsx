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
 * GlassDome — a warm translucent glass orb in the bottom-right corner.
 * Shows per-session sub-agent dots when viewing a specific session,
 * or a global summary when no session is selected.
 *
 * Redesigned: actual glass appearance — marigold-tinted translucency,
 * soft inner glow, frosted depth, warm ring.
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
        if (status === 'quiet') continue
        const color = AGENT_COLORS[s.agent] || '#6B7280'
        result.push({ color, status, isRoot: false })
        if (status === 'working' || status === 'waiting') active++
      }
    }

    return { dots: result.slice(0, 8), activeCount: active }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsVersion, session?.sessionId])

  if (dots.length === 0) return null

  const SIZE = 56
  const CENTER = SIZE / 2
  const DOT_RING_R = 14

  const hasActive = activeCount > 0

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
          position: 'relative',
          /* Glass effect: translucent with warm marigold tint */
          background: hovered
            ? 'rgba(30, 22, 12, 0.78)'
            : 'rgba(20, 15, 8, 0.82)',
          backdropFilter: 'blur(12px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
          border: `1.5px solid ${hovered
            ? 'rgba(234, 140, 29, 0.55)'
            : hasActive
              ? 'rgba(234, 140, 29, 0.25)'
              : 'rgba(255, 240, 220, 0.12)'
          }`,
          boxShadow: [
            /* Inner glow — warm glass refraction */
            'inset 0 1px 0 rgba(255, 220, 160, 0.15)',
            'inset 0 -1px 0 rgba(0, 0, 0, 0.2)',
            /* Outer shadow */
            '0 2px 12px rgba(0, 0, 0, 0.4)',
            /* Marigold halo when active */
            hasActive ? '0 0 20px rgba(234, 140, 29, 0.15)' : '',
          ].filter(Boolean).join(', '),
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
        }}
      >
        {/* Glass highlight arc — top-left refraction */}
        <div style={{
          position: 'absolute',
          top: 3,
          left: 6,
          width: 24,
          height: 12,
          borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(255,240,220,0.18) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        <svg width={SIZE} height={SIZE} style={{ display: 'block', position: 'relative', zIndex: 1 }}>
          {/* Subtle glass ring for depth */}
          <circle
            cx={CENTER} cy={CENTER} r={DOT_RING_R + 5}
            fill="none"
            stroke="rgba(234, 140, 29, 0.06)"
            strokeWidth={0.5}
          />
          <circle
            cx={CENTER} cy={CENTER} r={DOT_RING_R + 1}
            fill="none"
            stroke="rgba(255, 240, 220, 0.04)"
            strokeWidth={0.5}
          />

          {/* Dots arranged in a circle */}
          {dots.map((dot, i) => {
            let x, y, r

            if (dots.length === 1) {
              x = CENTER
              y = CENTER
              r = dot.isRoot ? 5 : 3.5
            } else if (dot.isRoot && dots.length > 1) {
              x = CENTER
              y = CENTER
              r = 4.5
            } else {
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
