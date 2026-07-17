import { useState } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import { narrateAction, quantitativeContext } from '../utils/plainEnglish'
import { resultHasError } from '../utils/resultPairing'
import { classifyAction } from '../utils/actionClassify'

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
    return `${m}m ${s}s`
  }
  return `${seconds.toFixed(0)}s`
}

// ── Action message ───────────────────────────────────────────────────────────
// Every action is narrated in plain English "from the agent". The technical
// detail (command, path, tool, raw output) is always one click away.

export default function ActionCard({
  event, resultEvent, durationTick,
  subagentLinks, sessionsRef, onSelectSession,
}) {
  const [expanded, setExpanded] = useState(false)

  const completed = !!resultEvent
  const { kind, targetId } = classifyAction(event, subagentLinks, sessionsRef)
  const { line, tag } = narrateAction(event, kind, completed)

  // Duration (only when we have timestamps)
  let durationText = null
  let running = false
  if (event.timestamp) {
    if (resultEvent && resultEvent.timestamp) {
      durationText = formatDuration((new Date(resultEvent.timestamp) - new Date(event.timestamp)) / 1000)
    } else if (!resultEvent) {
      void durationTick // re-render tick
      running = true
      durationText = formatRunningDuration((Date.now() - new Date(event.timestamp).getTime()) / 1000)
    }
  }

  const resultText = resultEvent?.result || ''
  const hasError = completed && resultHasError(resultText)
  const qctx = quantitativeContext(event.action, resultText)

  // Status suffix — plain words, not a heavy pill.
  let status = null
  if (running) status = <span className="msg-status msg-status-run">· working{durationText ? ` ${durationText}` : ''}…</span>
  else if (hasError) status = <span className="msg-status msg-status-err">· ran into a problem</span>
  else if (completed && qctx) status = <span className="msg-status">· {qctx}</span>
  else if (completed && durationText) status = <span className="msg-status">· {durationText}</span>

  const canOpenHelper = kind === 'delegation' && targetId
  const hasDetail = !!(event.target || resultText || event.rawTool)

  function toggle() {
    if (hasDetail) setExpanded(v => !v)
  }

  return (
    <div className={`msg-action msg-action-${kind}`}>
      <div className={`msg-action-line${hasDetail ? ' clickable' : ''}`} onClick={toggle}>
        {hasDetail && (
          <IconChevronRight
            size={13} stroke={2}
            className={`msg-action-caret${expanded ? ' open' : ''}`}
          />
        )}
        <span className="msg-action-text">{line}</span>
        {tag && <span className={`msg-tag msg-tag-${tag}`}>{tag}</span>}
        {status}
      </div>

      {canOpenHelper && (
        <button
          className="msg-open-helper"
          onClick={(e) => { e.stopPropagation(); onSelectSession && onSelectSession(targetId) }}
        >
          open the helper's thread →
        </button>
      )}

      {expanded && hasDetail && (
        <div className="msg-detail">
          {event.rawTool && (
            <div className="msg-detail-row">
              <span className="msg-detail-key">tool</span>
              <span className="msg-detail-val mono">{event.rawTool}</span>
            </div>
          )}
          {event.target && (
            <div className="msg-detail-row">
              <span className="msg-detail-key">{event.action === 'run_command' ? 'command' : 'target'}</span>
              <span className="msg-detail-val mono">{event.target}</span>
            </div>
          )}
          {durationText && (
            <div className="msg-detail-row">
              <span className="msg-detail-key">time</span>
              <span className="msg-detail-val">{running ? `running ${durationText}` : durationText}</span>
            </div>
          )}
          {completed && (
            <div className="msg-detail-row msg-detail-output">
              <span className="msg-detail-key">output</span>
              <pre className={`msg-detail-pre${hasError ? ' err' : ''}`}>
                {resultText.trim() ? resultText : '(no output)'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
