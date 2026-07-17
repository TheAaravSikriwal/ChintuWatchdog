// minimapLayout.js — compute node + line positions for the GlassDome minimap

import { AGENT_COLORS } from './agentIdentity'

const SVG_W = 210
const SVG_H = 70
const PADDING = 10
const INNER_W = SVG_W - PADDING * 2  // 190
const INNER_H = SVG_H - PADDING * 2  // 50
const MAX_SESSIONS = 14
const MAX_DEPTH = 3  // columns 0–3

/**
 * Walk the parent chain of a session and return all ancestor sessionIds.
 * @param {string} sessionId
 * @param {Map<string, object>} byId
 * @returns {string[]} ancestor ids, not including sessionId itself
 */
function ancestorIds(sessionId, byId) {
  const ancestors = []
  let current = byId.get(sessionId)
  while (current && current.parentSessionId) {
    ancestors.push(current.parentSessionId)
    current = byId.get(current.parentSessionId)
  }
  return ancestors
}

/**
 * Compute the layout for the glass dome minimap.
 *
 * @param {Array<{ sessionId: string, agent: string, parentSessionId: string|null, status: string, lastEventAt: Date }>} sessions
 * @returns {{ nodes: Array, lines: Array, overflow: number }}
 */
export function computeDomeLayout(sessions) {
  if (!sessions || sessions.length === 0) {
    return { nodes: [], lines: [], overflow: 0 }
  }

  const total = sessions.length
  const byId = new Map(sessions.map(s => [s.sessionId, s]))

  // --- Step 1: Select up to MAX_SESSIONS with parent-chain preservation ---

  // Find child sessions (those with a parentSessionId that exists in the set)
  const childIds = new Set(
    sessions
      .filter(s => s.parentSessionId && byId.has(s.parentSessionId))
      .map(s => s.sessionId)
  )
  // Sessions that have children
  const parentIds = new Set(
    sessions
      .filter(s => s.parentSessionId && byId.has(s.parentSessionId))
      .map(s => s.parentSessionId)
  )

  // Sessions that are part of a chain (either have a parent or have children)
  const chainedIds = new Set([...childIds, ...parentIds])

  // Walk all chained sessions and collect their full ancestry
  const required = new Set()
  for (const sess of sessions) {
    if (chainedIds.has(sess.sessionId)) {
      required.add(sess.sessionId)
      for (const anc of ancestorIds(sess.sessionId, byId)) {
        required.add(anc)
      }
    }
  }

  // Standalone sessions — no parent, no children in the set
  const standalones = sessions
    .filter(s => !required.has(s.sessionId))
    .sort((a, b) => {
      // Sort by lastEventAt descending (most recent first)
      const ta = a.lastEventAt ? new Date(a.lastEventAt).getTime() : 0
      const tb = b.lastEventAt ? new Date(b.lastEventAt).getTime() : 0
      return tb - ta
    })

  const selected = new Set(required)
  for (const s of standalones) {
    if (selected.size >= MAX_SESSIONS) break
    selected.add(s.sessionId)
  }

  const overflow = total - selected.size

  // Ordered selected sessions (preserve original order)
  const selectedSessions = sessions.filter(s => selected.has(s.sessionId))

  // --- Step 2: Assign depth (column) ---
  const depth = new Map()
  function getDepth(sessionId) {
    if (depth.has(sessionId)) return depth.get(sessionId)
    const sess = byId.get(sessionId)
    if (!sess || !sess.parentSessionId || !selected.has(sess.parentSessionId)) {
      depth.set(sessionId, 0)
      return 0
    }
    const d = Math.min(getDepth(sess.parentSessionId) + 1, MAX_DEPTH)
    depth.set(sessionId, d)
    return d
  }
  for (const sess of selectedSessions) {
    getDepth(sess.sessionId)
  }

  // Group sessions by column
  const byColumn = new Map()
  for (let c = 0; c <= MAX_DEPTH; c++) byColumn.set(c, [])
  for (const sess of selectedSessions) {
    const col = depth.get(sess.sessionId)
    byColumn.get(col).push(sess)
  }

  // Determine which columns are actually used
  const usedColumns = []
  for (let c = 0; c <= MAX_DEPTH; c++) {
    if (byColumn.get(c).length > 0) usedColumns.push(c)
  }

  // At least 2 columns in the layout for spacing
  const numCols = Math.max(2, usedColumns.length > 0 ? usedColumns[usedColumns.length - 1] + 1 : 2)
  const colWidth = INNER_W / numCols

  // --- Step 3: Calculate positions ---
  // First pass: assign naive Y positions per column
  const posMap = new Map() // sessionId → {x, y}

  for (let c = 0; c < numCols; c++) {
    const colSessions = byColumn.get(c) || []
    const n = colSessions.length
    const x = PADDING + (c + 0.5) * colWidth
    for (let i = 0; i < n; i++) {
      const y = n === 1
        ? PADDING + INNER_H / 2
        : PADDING + (i + 0.5) * (INNER_H / n)
      posMap.set(colSessions[i].sessionId, { x, y })
    }
  }

  // Second pass: center children around parent Y
  // Process columns from shallowest to deepest
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

    // For each parent group, center its children around the parent's Y
    for (const [pid, children] of childrenByParent) {
      if (children.length === 1) {
        // Single child: place at parent Y
        const parentPos = posMap.get(pid)
        if (parentPos) {
          posMap.set(children[0].sessionId, {
            x: posMap.get(children[0].sessionId).x,
            y: parentPos.y,
          })
        }
      } else {
        // Multiple children: distribute evenly, centered on parent Y
        const parentPos = posMap.get(pid)
        if (!parentPos) continue
        const spacing = Math.min(INNER_H / (colSessions.length + 1), INNER_H / children.length)
        const totalSpan = spacing * (children.length - 1)
        const startY = parentPos.y - totalSpan / 2
        for (let i = 0; i < children.length; i++) {
          const y = Math.max(PADDING, Math.min(SVG_H - PADDING, startY + i * spacing))
          posMap.set(children[i].sessionId, {
            x: posMap.get(children[i].sessionId).x,
            y,
          })
        }
      }
    }
  }

  // --- Step 4: Build nodes ---
  const nodes = selectedSessions.map(sess => {
    const col = depth.get(sess.sessionId)
    const radius = col === 0 ? 4 : col === 1 ? 3 : 2.5
    const pos = posMap.get(sess.sessionId) || { x: PADDING, y: PADDING + INNER_H / 2 }
    return {
      sessionId: sess.sessionId,
      x: pos.x,
      y: pos.y,
      radius,
      color: AGENT_COLORS[sess.agent] || '#6B7280',
      status: sess.status,
    }
  })

  // --- Step 5: Build lines ---
  const lines = []
  for (const sess of selectedSessions) {
    if (!sess.parentSessionId || !selected.has(sess.parentSessionId)) continue
    const parentSess = byId.get(sess.parentSessionId)
    if (!parentSess) continue
    const p1 = posMap.get(sess.parentSessionId)
    const p2 = posMap.get(sess.sessionId)
    if (!p1 || !p2) continue
    lines.push({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      color: AGENT_COLORS[parentSess.agent] || '#6B7280',
    })
  }

  return { nodes, lines, overflow }
}
