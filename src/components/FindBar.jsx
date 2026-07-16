import { useEffect, useRef, useState } from 'react'
import { IconSearch, IconChevronUp, IconChevronDown, IconX } from '@tabler/icons-react'

export default function FindBar({ events, visible, onClose, onMatchChange }) {
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Auto-focus when visible becomes true
  useEffect(() => {
    if (visible) {
      inputRef.current?.focus()
    } else {
      setQuery('')
    }
  }, [visible])

  // Compute matches whenever query or events change
  const matches = (() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    const result = []
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      const text = [ev.text, ev.result, ev.target]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (text.includes(q)) result.push(i)
    }
    return result
  })()

  // Clamp currentMatchIndex when matches changes
  const clampedIndex = matches.length === 0 ? 0 : Math.min(currentMatchIndex, matches.length - 1)

  // Notify parent of match changes
  useEffect(() => {
    if (onMatchChange) {
      onMatchChange({ matches, currentIndex: clampedIndex })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, events, clampedIndex])

  function goNext() {
    if (matches.length === 0) return
    setCurrentMatchIndex(i => (i + 1) % matches.length)
  }

  function goPrev() {
    if (matches.length === 0) return
    setCurrentMatchIndex(i => (i - 1 + matches.length) % matches.length)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        goPrev()
      } else {
        goNext()
      }
    }
  }

  if (!visible) return null

  const countLabel = matches.length === 0
    ? '0 results'
    : `${clampedIndex + 1} of ${matches.length}`

  return (
    <div className="find-bar">
      <IconSearch size={14} stroke={1.5} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        type="text"
        placeholder="Find in conversation..."
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setCurrentMatchIndex(0)
        }}
        onKeyDown={handleKeyDown}
      />
      <span className="find-bar-count">{countLabel}</span>
      <button
        className="find-bar-btn"
        onClick={goPrev}
        title="Previous match (Shift+Enter)"
        disabled={matches.length === 0}
      >
        <IconChevronUp size={14} stroke={2} />
      </button>
      <button
        className="find-bar-btn"
        onClick={goNext}
        title="Next match (Enter)"
        disabled={matches.length === 0}
      >
        <IconChevronDown size={14} stroke={2} />
      </button>
      <button
        className="find-bar-btn"
        onClick={onClose}
        title="Close (Escape)"
      >
        <IconX size={14} stroke={2} />
      </button>
    </div>
  )
}
