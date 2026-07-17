// networkLayout.js — compute node + line positions for the BroadView network graph

import { AGENT_COLORS } from './agentIdentity'

const CARD_WIDTH = 160
const CARD_HEIGHT = 120
const COL_GAP = 60
const PADDING = 40
const Y_PADDING = 30
const MAX_DEPTH = 4

/**
 * Compute the layout for the BroadView network graph.
 *
 * @param {Array<{ sessionId: string, agent: string, parentSessionId: string|null, status: string, name: string, lastEvent: string }>} sessions
 * @param {number} containerWidth
 * @param {number} containerHeight
 * @returns {{ nodes: Array, lines: Array }}
 */
export function computeNetworkLayout(sessions, containerWidth, containerHeight) {
  if (!sessions || sessions.length === 0) {
    return { nodes: [], lines: [] }
  }

  const byId = new Map(sessions.map(s => [s.sessionId, s]))

  // --- Step 1: Assign depth (column) via BFS ---
  const depth = new Map()

  function getDepth(sessionId) {
    if (depth.has(sessionId)) return depth.get(sessionId)
    const sess = byId.get(sessionId)
    if (!sess || !sess.parentSessionId || !byId.has(sess.parentSessionId)) {
      depth.set(sessionId, 0)
      return 0
    }
    const d = Math.min(getDepth(sess.parentSessionId) + 1, MAX_DEPTH)
    depth.set(sessionId, d)
    return d
  }

  for (const sess of sessions) {
    getDepth(sess.sessionId)
  }

  // --- Step 2: Group sessions by column ---
  const byColumn = new Map()
  for (const sess of sessions) {
    const col = depth.get(sess.sessionId) ?? 0
    if (!byColumn.has(col)) byColumn.set(col, [])
    byColumn.get(col).push(sess)
  }

  // Determine which columns are actually used
  const usedCols = Array.from(byColumn.keys()).sort((a, b) => a - b)
  const numCols = usedCols.length === 0 ? 1 : usedCols[usedCols.length - 1] + 1

  // --- Step 3: Calculate X positions per column ---
  // colX = padding + columnIndex * (cardWidth + colGap)
  function colX(col) {
    return PADDING + col * (CARD_WIDTH + COL_GAP)
  }

  // --- Step 4: Calculate Y positions ---
  // First pass: distribute all nodes in each column evenly
  const posMap = new Map()
  const innerH = containerHeight - Y_PADDING * 2

  for (const [col, colSessions] of byColumn) {
    const n = colSessions.length
    const x = colX(col)
    for (let i = 0; i < n; i++) {
      const y = n === 1
        ? Y_PADDING + innerH / 2 - CARD_HEIGHT / 2
        : Y_PADDING + i * (innerH / n)
      posMap.set(colSessions[i].sessionId, { x, y })
    }
  }

  // Second pass: center children around parent Y
  for (let c = 1; c <= MAX_DEPTH; c++) {
    const colSessions = byColumn.get(c) || []
    if (colSessions.length === 0) continue

    // Group children by parent
    const childrenByParent = new Map()
    for (const sess of colSessions) {
      const pid = sess.parentSessionId
      if (!pid || !posMap.has(pid)) continue
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, [])
      childrenByParent.get(pid).push(sess)
    }

    // Center each group of children around their parent's Y
    for (const [pid, children] of childrenByParent) {
      const parentPos = posMap.get(pid)
      if (!parentPos) continue

      if (children.length === 1) {
        // Single child: center at parent Y
        posMap.set(children[0].sessionId, {
          x: posMap.get(children[0].sessionId).x,
          y: parentPos.y,
        })
      } else {
        // Multiple children: distribute evenly, centered on parent Y
        const spacing = Math.max(CARD_HEIGHT + 12, innerH / colSessions.length)
        const totalSpan = spacing * (children.length - 1)
        const startY = parentPos.y - totalSpan / 2
        for (let i = 0; i < children.length; i++) {
          const y = Math.max(Y_PADDING, Math.min(containerHeight - Y_PADDING - CARD_HEIGHT, startY + i * spacing))
          posMap.set(children[i].sessionId, {
            x: posMap.get(children[i].sessionId).x,
            y,
          })
        }
      }
    }
  }

  // --- Step 5: Build nodes ---
  const nodes = sessions.map(sess => {
    const pos = posMap.get(sess.sessionId) || { x: PADDING, y: Y_PADDING }
    return {
      sessionId: sess.sessionId,
      x: pos.x,
      y: pos.y,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    }
  })

  // --- Step 6: Build lines ---
  const lines = []
  for (const sess of sessions) {
    if (!sess.parentSessionId || !byId.has(sess.parentSessionId)) continue
    const parentSess = byId.get(sess.parentSessionId)
    if (!parentSess) continue

    const parentPos = posMap.get(sess.parentSessionId)
    const childPos = posMap.get(sess.sessionId)
    if (!parentPos || !childPos) continue

    // x1/y1 = right edge center of parent card
    // x2/y2 = left edge center of child card
    lines.push({
      fromId: sess.parentSessionId,
      toId: sess.sessionId,
      x1: parentPos.x + CARD_WIDTH,
      y1: parentPos.y + CARD_HEIGHT / 2,
      x2: childPos.x,
      y2: childPos.y + CARD_HEIGHT / 2,
      color: AGENT_COLORS[parentSess.agent] || '#6B7280',
    })
  }

  return { nodes, lines }
}
