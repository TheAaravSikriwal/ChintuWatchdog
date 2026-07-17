import { useState } from 'react'
import {
  IconFileText,
  IconFilePencil,
  IconEdit,
  IconTerminal,
  IconSearch,
  IconSubtask,
  IconBolt,
  IconCheck,
  IconAlertTriangle,
  IconMinus,
} from '@tabler/icons-react'
import { actionLabel, quantitativeContext } from '../utils/plainEnglish'
import { resultHasError } from '../utils/resultPairing'

// ── Icon config — warm marigold-aligned palette ─────────────────────────────

const ACTION_ICON_CONFIG = {
  read_file:   { bg: 'rgba(234,140,29,0.12)', color: 'var(--fill-accent)', Icon: IconFileText },
  write_file:  { bg: 'rgba(34,197,94,0.10)',  color: 'var(--text-success)', Icon: IconFilePencil },
  edit_file:   { bg: 'rgba(34,197,94,0.10)',  color: 'var(--text-success)', Icon: IconEdit },
  run_command: { bg: 'rgba(234,140,29,0.12)', color: 'var(--fill-accent)', Icon: IconTerminal },
  search:      { bg: null,                    color: null,                  Icon: IconSearch },
  task:        { bg: null,                    color: null,                  Icon: IconSubtask },
}

function getIconConfig(action) {
  return ACTION_ICON_CONFIG[action] || { bg: null, color: null, Icon: IconBolt }
}

// ── Duration formatting ──────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}m ${s}s`
  }
  return `${seconds.toFixed(1)}s`
}

function formatRunningDuration(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}m ${s}s+`
  }
  return `${seconds.toFixed(0)}s+`
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ActionCard({ event, resultEvent, agentColor, durationTick }) {
  const [expanded, setExpanded] = useState(false)

  const { verb, object } = actionLabel(event.action, event.target, event.rawTool, !!resultEvent)
  const labelText = verb ? `${verb} ${object}`.trim() : object

  const { bg: iconBg, color: iconColor, Icon } = getIconConfig(event.action)
  const resolvedIconBg    = iconBg    || 'var(--surface-2)'
  const resolvedIconColor = iconColor || 'var(--text-secondary)'

  // Duration
  let durationEl = null
  if (event.timestamp) {
    if (resultEvent && resultEvent.timestamp) {
      const secs = (new Date(resultEvent.timestamp) - new Date(event.timestamp)) / 1000
      durationEl = (
        <span className="action-duration">· {formatDuration(secs)}</span>
      )
    } else if (!resultEvent) {
      // Still running — durationTick drives re-renders
      void durationTick
      const secs = (Date.now() - new Date(event.timestamp).getTime()) / 1000
      durationEl = (
        <span className="action-duration action-duration-running">
          · running {formatRunningDuration(secs)}
        </span>
      )
    }
  }

  // Quantitative context
  const qctx = quantitativeContext(event.action, resultEvent?.result)
  const qctxEl = qctx ? (
    <span className="action-qctx">· {qctx}</span>
  ) : null

  // Result pill
  let pillEl = null
  if (resultEvent) {
    const text = resultEvent.result || ''
    const hasError = resultHasError(text)
    const isEmpty = !text.trim()

    if (hasError) {
      pillEl = (
        <div className="action-pill action-pill-error">
          <IconAlertTriangle size={12} />
          <span>ran into a problem · expand to see</span>
        </div>
      )
    } else if (isEmpty) {
      pillEl = (
        <div className="action-pill action-pill-muted">
          <IconMinus size={12} />
          <span>no output</span>
        </div>
      )
    } else {
      const charCount = text.length
      pillEl = (
        <div className="action-pill action-pill-ok">
          <IconCheck size={12} />
          <span>{charCount > 0 ? `${charCount} chars` : 'done'}</span>
        </div>
      )
    }
  }

  function handleToggle(e) {
    e.stopPropagation()
    if (resultEvent) setExpanded(prev => !prev)
  }

  return (
    <div className="action-card-wrapper">
      <div
        className={`action-card${resultEvent ? ' action-card-clickable' : ''}`}
        onClick={handleToggle}
      >
        {/* Icon square */}
        <div
          className="action-icon-square"
          style={{ background: resolvedIconBg }}
        >
          <Icon size={15} color={resolvedIconColor} />
        </div>

        {/* Middle: label + target */}
        <div className="action-card-body">
          <div className="action-card-top">
            <span className="action-label">{labelText}</span>
            <span className="action-card-meta">
              {durationEl}
              {qctxEl}
            </span>
          </div>
          {event.target && (
            <div className="action-target">{event.target}</div>
          )}
        </div>
      </div>

      {/* Result pill */}
      {pillEl && (
        <div className="action-pill-row" onClick={handleToggle}>
          {pillEl}
        </div>
      )}

      {/* Expanded result */}
      {expanded && resultEvent?.result && (
        <div className="action-result-expanded">
          {resultEvent.result}
        </div>
      )}
    </div>
  )
}
