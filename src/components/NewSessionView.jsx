import { useState, useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'

const AGENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codex', label: 'Codex' },
  { id: 'antigravity', label: 'Antigravity' },
]

function getCliCommand(agentId, prompt) {
  switch (agentId) {
    case 'claude-code': return `claude "${prompt}"`
    case 'codex': return `codex "${prompt}"`
    case 'antigravity': return `gemini "${prompt}"`
    default: return ''
  }
}

export default function NewSessionView({ onClose }) {
  const [selectedAgent, setSelectedAgent] = useState('claude-code')
  const [taskText, setTaskText] = useState('')
  const [started, setStarted] = useState(false)
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef(null)

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleStart() {
    if (!taskText.trim()) return
    setStarted(true)
  }

  function handleCopy() {
    const cmd = getCliCommand(selectedAgent, taskText)
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const cliCommand = getCliCommand(selectedAgent, taskText)
  const isCursor = selectedAgent === 'cursor'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      background: 'var(--surface-0)',
      padding: 'var(--space-6)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 'var(--space-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <IconX size={16} stroke={1.5} />
        </button>

        {/* Title */}
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-xl)',
            fontWeight: 600,
            fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 600',
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-1)',
            letterSpacing: '-0.01em',
          }}>
            Start a new session
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
            Who do you want to work on this?
          </div>
        </div>

        {/* Agent selector — marigold accent for selected */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {AGENTS.map(agent => (
            <button
              key={agent.id}
              onClick={() => { setSelectedAgent(agent.id); setStarted(false) }}
              style={{
                padding: 'var(--space-1) var(--space-4)',
                borderRadius: 999,
                border: '1px solid',
                borderColor: selectedAgent === agent.id ? 'var(--fill-accent)' : 'var(--border)',
                background: selectedAgent === agent.id ? 'var(--fill-accent)' : 'transparent',
                color: selectedAgent === agent.id ? 'var(--on-accent)' : 'var(--text-secondary)',
                fontSize: 'var(--fs-sm)',
                fontWeight: selectedAgent === agent.id ? 500 : 400,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                transition: 'background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
              }}
            >
              {agent.label}
            </button>
          ))}
        </div>

        {/* Task label */}
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
          Describe the task — what do you want them to do?
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={taskText}
          onChange={e => { setTaskText(e.target.value); setStarted(false) }}
          rows={4}
          placeholder="e.g. Refactor the data pipeline to add retry logic"
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--fs-md)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            resize: 'vertical',
            outline: 'none',
            lineHeight: 1.5,
            minHeight: 80,
            transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'var(--border-accent)'
            e.currentTarget.style.boxShadow = 'var(--shadow-focus)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!taskText.trim()}
          style={{
            alignSelf: 'flex-start',
            padding: 'var(--space-2) var(--space-5)',
            background: taskText.trim() ? 'var(--fill-accent)' : 'var(--surface-2)',
            color: taskText.trim() ? 'var(--on-accent)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--fs-sm)',
            fontWeight: 500,
            cursor: taskText.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-ui)',
            transition: 'background var(--transition-fast), color var(--transition-fast)',
          }}
        >
          Start session →
        </button>

        {/* Instruction block after start */}
        {started && (
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            {isCursor ? (
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Open Cursor and start an AI conversation in the editor. Watch Dog will notice it and add it here automatically.
              </p>
            ) : (
              <>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginBottom: 2 }}>
                  Run this in your terminal:
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-2) var(--space-3)',
                  border: '1px solid var(--border)',
                }}>
                  <code style={{
                    flex: 1,
                    fontSize: 'var(--fs-sm)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                    userSelect: 'text',
                  }}>
                    {cliCommand}
                  </code>
                  <button
                    onClick={handleCopy}
                    style={{
                      flexShrink: 0,
                      padding: 'var(--space-1) var(--space-3)',
                      background: copied ? 'var(--bg-success)' : 'var(--surface-3)',
                      color: copied ? 'var(--text-success)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--fs-xs)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-ui)',
                      transition: 'background var(--transition-fast), color var(--transition-fast)',
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </>
            )}
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
              Watch Dog will pick it up automatically once it starts.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
