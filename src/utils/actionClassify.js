// actionClassify.js — decide what kind of activity an action event represents,
// so it can be narrated in plain English.
//
// Three kinds, from the watcher's <task-notification> linkage:
//   - delegation: the agent handed a job to a sub-agent (a real, separate
//     session exists). Navigable.
//   - background: the agent kicked off an async command (e.g. a background
//     shell task). Linked in the notification, but no session file — it's the
//     SAME agent, just not waiting on it.
//   - foreground: the agent did it directly and (usually) waited.

/**
 * @param {object} event - a kind==='action' WatchdogEvent
 * @param {Map|undefined} subagentLinks - session.subagentLinks (toolUseId → sessionId)
 * @param {object|undefined} sessionsRef - useRef holding Map<sessionId, Session>
 * @returns {{ kind: 'delegation'|'background'|'foreground', targetId: string|null }}
 */
export function classifyAction(event, subagentLinks, sessionsRef) {
  const linkedId = event && event.toolUseId && subagentLinks && subagentLinks.get
    ? subagentLinks.get(event.toolUseId)
    : null

  if (linkedId) {
    const exists = !!(sessionsRef && sessionsRef.current && sessionsRef.current.has(linkedId))
    if (exists) return { kind: 'delegation', targetId: linkedId }
    // Linked via a task-notification but no transcript → async background job.
    return { kind: 'background', targetId: null }
  }

  // The Agent/Task tool is a delegation even if we couldn't resolve the link.
  if (event && event.action === 'task') return { kind: 'delegation', targetId: null }

  return { kind: 'foreground', targetId: null }
}
