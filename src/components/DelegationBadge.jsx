export default function DelegationBadge({ event, onSelectSession, subagentLinks }) {
  function handleClick() {
    if (subagentLinks && event.toolUseId && subagentLinks.has(event.toolUseId)) {
      onSelectSession(subagentLinks.get(event.toolUseId))
    }
  }

  const taskLabel = event.target || 'a task'

  return (
    <div className="delegation-badge" onClick={handleClick}>
      <span>↓</span>
      <span>Delegated "{taskLabel}" to a new agent</span>
    </div>
  )
}
