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
      padding: 24,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
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
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <IconX size={16} stroke={1.5} />
        </button>

        {/* Title */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
            Start a new session
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Who do you want to work on this?
          </div>
        </div>

        {/* Agent selector */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {AGENTS.map(agent => (
            <button
              key={agent.id}
              onClick={() => { setSelectedAgent(agent.id); setStarted(false) }}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid',
                borderColor: selectedAgent === agent.id ? 'var(--fill-accent)' : 'var(--border)',
                background: selectedAgent === agent.id ? 'var(--fill-accent)' : 'transparent',
                color: selectedAgent === agent.id ? 'var(--on-accent)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: selectedAgent === agent.id ? 500 : 400,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
            >
              {agent.label}
            </button>
          ))}
        </div>

        {/* Task label */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
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
            padding: '10px 12px',
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 14,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            resize: 'vertical',
            outline: 'none',
            lineHeight: 1.5,
            minHeight: 80,
            transition: 'border-color 0.12s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!taskText.trim()}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 18px',
            background: taskText.trim() ? 'var(--fill-accent)' : 'var(--surface-2)',
            color: taskText.trim() ? 'var(--on-accent)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: taskText.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-sans)',
            transition: 'background 0.12s, color 0.12s',
          }}
        >
          Start session →
        </button>

        {/* Instruction block after start */}
        {started && (
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {isCursor ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Open Cursor and start an AI conversation in the editor. Watch Dog will notice it and add it here automatically.
              </p>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                  Run this in your terminal:
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--surface-2)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                }}>
                  <code style={{
                    flex: 1,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                  }}>
                    {cliCommand}
                  </code>
                  <button
                    onClick={handleCopy}
                    style={{
                      flexShrink: 0,
                      padding: '4px 10px',
                      background: copied ? 'var(--bg-success)' : 'var(--surface-3)',
                      color: copied ? 'var(--text-success)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 5,
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Watch Dog will pick it up automatically once it starts.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
