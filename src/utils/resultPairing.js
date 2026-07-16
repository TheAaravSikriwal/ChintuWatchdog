// resultPairing.js — Action→result pairing utilities

/**
 * Build a Map from actionSourceSeq → resultEvent.
 *
 * Two pairing strategies (in priority order):
 *  1. toolUseId match  — reliable when both action and result carry the same toolUseId
 *  2. Sequence fallback — the result following an unpaired action is assigned to it
 *
 * @param {Array} events - array of WatchdogEvent
 * @returns {Map<number, object>} Map<actionSourceSeq, resultEvent>
 */
export function buildResultMap(events) {
  // First pass: index every result event by its toolUseId (when present)
  const resultsByToolUseId = new Map(); // toolUseId → resultEvent
  for (const ev of events) {
    if (ev.kind === 'result' && ev.toolUseId) {
      resultsByToolUseId.set(ev.toolUseId, ev);
    }
  }

  const resultMap = new Map(); // actionSourceSeq → resultEvent
  // Track claimed results so they aren't double-assigned
  const claimedResultIds = new Set(); // toolUseId of results already matched

  // Track which action was last seen without a toolUseId result
  let lastUnpairedActionSeq = null;

  // Second pass: walk events in order and pair actions with results
  for (const ev of events) {
    if (ev.kind === 'action') {
      if (ev.toolUseId && resultsByToolUseId.has(ev.toolUseId)) {
        // toolUseId match available — pair immediately
        const result = resultsByToolUseId.get(ev.toolUseId);
        resultMap.set(ev.sourceSeq, result);
        claimedResultIds.add(ev.toolUseId);
        // This action is paired; don't track as unpaired
      } else {
        // No toolUseId match — remember for sequence fallback
        lastUnpairedActionSeq = ev.sourceSeq;
      }
    } else if (ev.kind === 'result') {
      if (ev.toolUseId && claimedResultIds.has(ev.toolUseId)) {
        // Already paired via toolUseId — skip
        continue;
      }
      // Assign to the last unpaired action (sequence fallback)
      if (lastUnpairedActionSeq !== null) {
        resultMap.set(lastUnpairedActionSeq, ev);
        lastUnpairedActionSeq = null;
      }
    }
  }

  return resultMap;
}

/**
 * Return true if an action (by sourceSeq) has a paired result.
 *
 * @param {Map<number, object>} resultMap
 * @param {number} actionSourceSeq
 * @returns {boolean}
 */
export function hasResult(resultMap, actionSourceSeq) {
  return resultMap.has(actionSourceSeq);
}

/**
 * Return true if the result text contains error-like keywords (case-insensitive).
 *
 * @param {string|null|undefined} resultText
 * @returns {boolean}
 */
export function resultHasError(resultText) {
  if (!resultText) return false;
  return /error|failed|exception/i.test(resultText);
}

/**
 * Count the number of result events in the last `windowSize` events that
 * contain error-like text.
 *
 * @param {Array}  events     - array of WatchdogEvent
 * @param {number} windowSize - how many recent events to inspect (default 20)
 * @returns {number}
 */
export function countRecentErrors(events, windowSize = 20) {
  const window = events.slice(-windowSize);
  let count = 0;
  for (const ev of window) {
    if (ev.kind === 'result' && resultHasError(ev.result)) {
      count++;
    }
  }
  return count;
}
