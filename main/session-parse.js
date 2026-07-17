// Shared line processing for adapters.
//
// Both the initial full-file loader (electron.js) and the incremental
// watcher (watcher.js) need the exact same logic: run each raw line through
// an adapter, apply Claude streaming-dedup, and accumulate session metadata
// (/rename, sub-agent links, /resume continuation). This used to be copy-
// pasted in two places and had already drifted — the watcher path silently
// dropped all metadata, so a live /rename or delegation never took effect
// until restart. Keeping it here means there is exactly one implementation.

/**
 * Fresh, mutable metadata accumulator.
 * @returns {{ subagentLinks: Object, renamedTo: string|null,
 *             continuationOf: string|null, foundSourceSession: boolean }}
 */
function newMeta() {
  return {
    subagentLinks: {},
    renamedTo: null,
    continuationOf: null,
    foundSourceSession: false,
  }
}

/**
 * Process a batch of raw JSONL lines through an adapter.
 *
 * Streaming-dedup is scoped to this call: consecutive lines sharing a
 * message.id are cumulative snapshots, so only the last is kept. (Snapshots
 * that straddle two separate calls cannot be de-duplicated — a known limit
 * of the incremental watcher path.)
 *
 * The cursor and meta objects are mutated in place so callers that process a
 * file incrementally (the watcher) can carry seq / sessionId / accumulated
 * metadata across successive reads.
 *
 * @param {string[]} rawLines - raw lines (blanks/whitespace tolerated)
 * @param {{ parseLine: Function }} adapter
 * @param {{ sessionId: string, seq: number }} cursor - mutated in place
 * @param {object} meta - accumulator from newMeta(); mutated in place
 * @param {string} fileSessionId - the discovery-derived session id, used as
 *                                 the stable baseline for continuation detection
 * @returns {{ events: object[] }}
 */
function processLines(rawLines, adapter, cursor, meta, fileSessionId) {
  const events = []
  let lastMsgId = null
  let lastMsgIdStart = 0
  let lastMsgIdSeq = 0

  for (const rawLine of rawLines) {
    const line = rawLine.trim()
    if (!line) continue

    let result
    try {
      result = adapter.parseLine(line, cursor.sessionId, cursor.seq)
    } catch {
      continue
    }

    // ── Metadata accumulation ──────────────────────────────────────
    // Sub-agent links (from queue-operation / progress lines)
    if (result.subagentLink) {
      const { toolUseId, subagentSessionId } = result.subagentLink
      meta.subagentLinks[toolUseId] = subagentSessionId
    }
    // /rename display name — last one wins
    if (result.renamedTo !== undefined && result.renamedTo !== null) {
      meta.renamedTo = result.renamedTo
    }
    // /resume continuation: the first inner sessionId that differs from the
    // file-derived id means this file continues that (parent) session.
    if (!meta.foundSourceSession && result.sourceSessionId) {
      meta.foundSourceSession = true
      if (result.sourceSessionId !== fileSessionId) {
        meta.continuationOf = result.sourceSessionId
      }
    }

    // ── Streaming dedup (Claude) ───────────────────────────────────
    if (result.messageId) {
      if (result.messageId === lastMsgId) {
        // This snapshot supersedes the previous one in this batch.
        events.length = lastMsgIdStart
        cursor.seq = lastMsgIdSeq
      }
      lastMsgId = result.messageId
      lastMsgIdStart = events.length
      lastMsgIdSeq = cursor.seq
    } else if (result.events.length > 0) {
      lastMsgId = null
    }

    events.push(...result.events)
    cursor.seq = result.nextSeq
    // Codex's parseLine may return a new sessionId (from session_meta).
    if ('sessionId' in result) {
      cursor.sessionId = result.sessionId
    }
  }

  return { events }
}

/**
 * Reduce a mutable meta accumulator to the patch shape the renderer's
 * session store consumes. Returns null when there is nothing to apply.
 *
 * @param {object} meta - accumulator from newMeta()
 * @returns {{ subagentLinks?: Object, renamedTo?: string, continuationOf?: string }|null}
 */
function metaToPatch(meta) {
  if (!meta) return null
  const patch = {}
  if (meta.subagentLinks && Object.keys(meta.subagentLinks).length > 0) {
    patch.subagentLinks = meta.subagentLinks
  }
  if (meta.renamedTo) patch.renamedTo = meta.renamedTo
  if (meta.continuationOf) patch.continuationOf = meta.continuationOf
  return Object.keys(patch).length > 0 ? patch : null
}

module.exports = { newMeta, processLines, metaToPatch }
