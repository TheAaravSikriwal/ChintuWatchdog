// useSessionScroll.js — Per-session scroll position memory
import { useRef, useCallback } from 'react'

export function useSessionScroll() {
  const scrollPositions = useRef(new Map())

  const saveScrollPosition = useCallback((sessionId, scrollTop) => {
    scrollPositions.current.set(sessionId, scrollTop)
  }, [])

  const getScrollPosition = useCallback((sessionId) => {
    return scrollPositions.current.get(sessionId) ?? null
  }, [])

  return { saveScrollPosition, getScrollPosition }
}
