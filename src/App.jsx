import { useState, useCallback, useEffect, useRef } from 'react'
import { useSessions } from './hooks/useSessions'
import { useSessionScroll } from './hooks/useSessionScroll'
import Sidebar from './components/Sidebar'
import ConversationView from './components/ConversationView'
import NewSessionView from './components/NewSessionView'
import './styles/variables.css'
import './App.css'

function App() {
  const { sessionsRef, sessionsVersion, loading, lastEventReceivedAt, markSessionViewed, getGroupedSessions } = useSessions()
  const { saveScrollPosition, getScrollPosition } = useSessionScroll()

  const [activeSessionId, setActiveSessionId] = useState(null)
  const [showAllAgents, setShowAllAgents] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [showBroadView, setShowBroadView] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFindBar, setShowFindBar] = useState(false)

  const sidebarSearchRef = useRef(null)

  const handleSelectSession = useCallback((sessionId) => {
    setActiveSessionId(sessionId)
    setShowAllAgents(false)
    setShowNewSession(false)
    if (sessionId) markSessionViewed(sessionId)
  }, [markSessionViewed])

  const handleShowAllAgents = useCallback(() => {
    setShowAllAgents(true)
    setActiveSessionId(null)
    setShowNewSession(false)
  }, [])

  const handleNewSession = useCallback(() => {
    setShowNewSession(true)
    setActiveSessionId(null)
    setShowAllAgents(false)
  }, [])

  const handleCloseNewSession = useCallback(() => {
    setShowNewSession(false)
  }, [])

  const handleToggleBroadView = useCallback(() => {
    setShowBroadView(v => !v)
  }, [])

  // System theme detection
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = (e) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark')
    }
    handler(mq) // set initial theme
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      const isMod = e.metaKey || e.ctrlKey

      // Cmd+K / Ctrl+K — focus sidebar search
      if (isMod && e.key === 'k') {
        e.preventDefault()
        sidebarSearchRef.current?.focus()
      }

      // Cmd+N / Ctrl+N — new session
      if (isMod && e.key === 'n') {
        e.preventDefault()
        handleNewSession()
      }

      // Cmd+F / Ctrl+F — toggle find bar
      if (isMod && e.key === 'f') {
        e.preventDefault()
        setShowFindBar(prev => !prev)
      }

      // Escape — close in priority order: broad view > find bar > search > new session
      if (e.key === 'Escape') {
        if (showBroadView) { setShowBroadView(false); return }
        if (showFindBar) { setShowFindBar(false); return }
        if (searchQuery) { setSearchQuery(''); return }
        if (showNewSession) { setShowNewSession(false); return }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showBroadView, showFindBar, searchQuery, showNewSession, handleNewSession])

  if (loading) {
    return (
      <div className="app-loading">
        Catching up on what happened...
      </div>
    )
  }

  const activeSession = activeSessionId ? sessionsRef.current.get(activeSessionId) : null

  return (
    <div className="app">
      <Sidebar
        sessionsRef={sessionsRef}
        sessionsVersion={sessionsVersion}
        getGroupedSessions={getGroupedSessions}
        lastEventReceivedAt={lastEventReceivedAt}
        activeSessionId={activeSessionId}
        showAllAgents={showAllAgents}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectSession={handleSelectSession}
        onShowAllAgents={handleShowAllAgents}
        onNewSession={handleNewSession}
        searchRef={sidebarSearchRef}
      />
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {showNewSession ? (
          <NewSessionView onClose={handleCloseNewSession} />
        ) : (
          <ConversationView
            session={activeSession}
            showAllAgents={showAllAgents}
            sessionsRef={sessionsRef}
            sessionsVersion={sessionsVersion}
            showBroadView={showBroadView}
            onToggleBroadView={handleToggleBroadView}
            onSelectSession={handleSelectSession}
            saveScrollPosition={saveScrollPosition}
            getScrollPosition={getScrollPosition}
            showFindBar={showFindBar}
            onCloseFindBar={() => setShowFindBar(false)}
          />
        )}
      </div>
    </div>
  )
}

export default App
