// useSessions.js — Core session state hook
import { useRef, useState, useEffect, useCallback } from 'react'
import { computeSessionStatus } from '../utils/sessionStatus'
import { nameFromEvent, fallbackName } from '../utils/sessionName'
import { countRecentErrors } from '../utils/resultPairing'

// ─── Internal helpers ────────────────────────────────────────────────────────

function createSession(event, meta) {
  return {
    sessionId: event.sessionId,
    agent: event.agent,
    name: fallbackName(event.agent, event.timestamp ? new Date(event.timestamp) : new Date()),
    nameIsFrozen: false,
    parentSessionId: meta?.parentSessionId || null,
    subagentLinks: meta?.subagentLinks
      ? new Map(Object.entries(meta.subagentLinks))
      : new Map(),
    continuationOf: meta?.continuationOf || null,
    events: [],
    inputState: 'idle',
    isOwned: false,
    startedAt: event.timestamp ? new Date(event.timestamp) : null,
    lastEventAt: new Date(),
    lastViewedEventCount: 0,
    errorCount: 0,
  }
}

function updateInputState(session) {
  for (let i = session.events.length - 1; i >= 0; i--) {
    const ev = session.events[i]
    if (ev.kind === 'action') return 'busy'
    if (ev.kind === 'thinking') return 'busy'
    if (ev.kind === 'result') return 'idle'
    if (ev.kind === 'message') return 'idle'
  }
  return 'idle'
}

function updateSessionName(session, event) {
  if (session.nameIsFrozen) return
  const name = nameFromEvent(event)
  if (name != null) {
    session.name = name
    session.nameIsFrozen = true
  }
}

// ─── Exported hook ────────────────────────────────────────────────────────────

export function useSessions() {
  const sessionsRef = useRef(new Map())
  const [sessionsVersion, setSessionsVersion] = useState(0)
  const [lastEventReceivedAt, setLastEventReceivedAt] = useState(null)
  const [loading, setLoading] = useState(true)

  // ── ingestEvents ────────────────────────────────────────────────────────────
  const ingestEvents = useCallback((events, sessionMeta, isInitialLoad) => {
    const sessions = sessionsRef.current

    for (const event of events) {
      const { sessionId } = event
      if (!sessionId) continue

      const meta = sessionMeta?.[sessionId] ?? null

      // Get or create session
      let sess = sessions.get(sessionId)
      if (!sess) {
        sess = createSession(event, meta)
        sessions.set(sessionId, sess)
      }

      // Push event and update timestamps
      sess.events.push(event)
      sess.lastEventAt = event.timestamp ? new Date(event.timestamp) : new Date()

      // Update derived fields
      updateSessionName(sess, event)
      sess.inputState = updateInputState(sess)
      sess.errorCount = countRecentErrors(sess.events, 20)

      // Apply metadata fields if not already set
      if (meta) {
        if (!sess.parentSessionId && meta.parentSessionId) {
          sess.parentSessionId = meta.parentSessionId
        }
        if (meta.subagentLinks && Object.keys(meta.subagentLinks).length > 0) {
          // Merge in new links rather than only seeding an empty map, so
          // sub-agent links discovered live (after the session exists) apply.
          for (const [k, v] of Object.entries(meta.subagentLinks)) {
            sess.subagentLinks.set(k, v)
          }
        }
        if (!sess.continuationOf && meta.continuationOf) {
          sess.continuationOf = meta.continuationOf
        }
        // An explicit /rename is authoritative — it overrides the auto-derived
        // name even after it was frozen from the first user message.
        if (meta.renamedTo) {
          sess.name = meta.renamedTo
          sess.nameIsFrozen = true
        }
      }
    }

    // On initial load, mark all existing events as already viewed
    if (isInitialLoad) {
      for (const sess of sessions.values()) {
        sess.lastViewedEventCount = sess.events.length
      }
    }

    setSessionsVersion(v => v + 1)
    setLastEventReceivedAt(new Date())
  }, [])

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const raw = await window.watchdog.getInitialEvents()

        // Handle both old format (plain array) and new format ({ events, sessionMeta })
        let events, sessionMeta
        if (Array.isArray(raw)) {
          events = raw
          sessionMeta = null
        } else {
          events = raw?.events ?? []
          sessionMeta = raw?.sessionMeta ?? null
        }

        ingestEvents(events, sessionMeta, true)
      } catch (err) {
        console.error('[useSessions] Failed to load initial events:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [ingestEvents])

  // ── Live event stream ─────────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = window.watchdog.onEvents((payload) => {
      // Payload is { events, sessionMeta }; tolerate a bare array (old shape).
      const newEvents = Array.isArray(payload) ? payload : (payload?.events ?? [])
      const sessionMeta = Array.isArray(payload) ? null : (payload?.sessionMeta ?? null)
      ingestEvents(newEvents, sessionMeta, false)
    })

    // onEvents may return a cleanup/unsubscribe function — call it if so
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [ingestEvents])

  // ── 30-second status re-evaluation tick ───────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionsVersion(v => v + 1)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // ── markSessionViewed ─────────────────────────────────────────────────────
  const markSessionViewed = useCallback((sessionId) => {
    const sess = sessionsRef.current.get(sessionId)
    if (!sess) return
    sess.lastViewedEventCount = sess.events.length
    setSessionsVersion(v => v + 1)
  }, [])

  // ── getGroupedSessions ────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getGroupedSessions = useCallback(() => {
    const sessions = sessionsRef.current
    const now = Date.now()
    const TEN_MIN = 10 * 60 * 1000

    // Date boundaries
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)

    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000)

    // Partition into active vs historical
    const active = new Map()      // Map<agent, Session[]>
    const today = []
    const yesterday = []
    const thisWeek = []
    const older = []

    for (const sess of sessions.values()) {
      const age = now - sess.lastEventAt.getTime()

      if (age < TEN_MIN) {
        // Active — group by agent
        if (!active.has(sess.agent)) active.set(sess.agent, [])
        active.get(sess.agent).push(sess)
      } else {
        // Historical — bucket by date
        if (sess.lastEventAt >= todayStart) {
          today.push(sess)
        } else if (sess.lastEventAt >= yesterdayStart) {
          yesterday.push(sess)
        } else if (sess.lastEventAt >= weekStart) {
          thisWeek.push(sess)
        } else {
          older.push(sess)
        }
      }
    }

    // Sort all arrays: most recent first
    const byRecent = (a, b) => b.lastEventAt - a.lastEventAt
    for (const arr of active.values()) arr.sort(byRecent)
    today.sort(byRecent)
    yesterday.sort(byRecent)
    thisWeek.sort(byRecent)
    older.sort(byRecent)

    return { active, today, yesterday, thisWeek, older }
  }, [sessionsVersion]) // intentional: reads sessionsRef but re-runs on version bump

  return {
    sessionsRef,
    sessionsVersion,
    loading,
    lastEventReceivedAt,
    markSessionViewed,
    getGroupedSessions,
  }
}
