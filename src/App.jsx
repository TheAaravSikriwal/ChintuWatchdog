import { useState, useCallback } from 'react'
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
          />
        )}
      </div>
    </div>
  )
}

export default App
