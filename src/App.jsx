import { useState, useEffect, useRef } from 'react'
import EventFeed from './components/EventFeed'

function App() {
  const [events, setEvents] = useState([])
  const [projectsDir, setProjectsDir] = useState('')
  const [loading, setLoading] = useState(true)
  const eventsRef = useRef([])

  // Load initial events on mount
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const dir = await window.watchdog.getProjectsDir()
        if (!cancelled) setProjectsDir(dir)

        const initial = await window.watchdog.getInitialEvents()
        if (!cancelled) {
          eventsRef.current = initial
          setEvents(initial)
        }
      } catch (err) {
        console.error('Failed to load initial events:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  // Subscribe to live events
  useEffect(() => {
    const cleanup = window.watchdog.onEvents((newEvents) => {
      eventsRef.current = [...eventsRef.current, ...newEvents]
      setEvents([...eventsRef.current])
    })
    return cleanup
  }, [])

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-text">Scanning for agent sessions...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Watch Dog</h1>
        <span className="app-status">
          {events.length} events
          {projectsDir && <span className="app-dir" title={projectsDir}> &middot; {projectsDir}</span>}
        </span>
      </header>
      <main className="app-main">
        <EventFeed events={events} />
      </main>
    </div>
  )
}

export default App
