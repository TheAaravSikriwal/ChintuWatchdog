export default function DelegationBadge({ event, onSelectSession, subagentLinks, sessionsRef }) {
  // Resolve the linked sub-agent session, if any. The link map can contain
  // targets that are NOT real sub-agent transcripts (Claude emits the same
  // <task-notification> envelope for background tasks, which have no session
  // file). Only treat the delegation as navigable when the target session
  // actually exists — this is format-agnostic and hides dead links.
  const targetId = subagentLinks && event.toolUseId
    ? subagentLinks.get(event.toolUseId)
    : null
  const targetExists = !!(targetId && sessionsRef?.current?.has(targetId))

  function handleClick() {
    if (targetExists) onSelectSession(targetId)
  }

  const taskLabel = event.target || 'a task'

  return (
    <div
      className="delegation-badge"
      onClick={handleClick}
      role={targetExists ? 'button' : undefined}
      title={targetExists ? "Open this agent's thread" : undefined}
      style={{ cursor: targetExists ? 'pointer' : 'default' }}
    >
      <span>↓</span>
      <span>
        Delegated "{taskLabel}" to a new agent{targetExists ? ' →' : ''}
      </span>
    </div>
  )
}
