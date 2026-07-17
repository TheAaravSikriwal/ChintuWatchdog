// sessionStatus.js — 6-state session status model
// Warm, human-readable labels + marigold-aligned color palette.

export const STATUS_LABELS = {
  working: 'working on it',
  waiting: 'waiting for you',
  idle: 'taking a breather',
  quiet: 'wrapped up',
  stale: 'might be stuck',
  unclean: 'something went wrong',
};

export const STATUS_COLORS = {
  working: '#4ADE80',   // warm green
  waiting: '#F5A623',   // marigold (matches brand)
  idle: '#9C9488',      // warm gray (matches --text-secondary)
  quiet: '#9C9488',     // warm gray
  stale: '#FCD34D',     // warm amber
  unclean: '#F87171',   // soft red
};

/**
 * Walk events backward to determine if the session is waiting for user input.
 * Returns true if the last meaningful event is an assistant message.
 *
 * @param {{ lastEventAt: Date, events: Array }} session
 * @returns {boolean}
 */
export function isWaitingForUser(session) {
  const { lastEventAt, events } = session;
  const ageMs = Date.now() - lastEventAt.getTime();

  // If the session is older than 10 minutes it's no longer actively waiting
  if (ageMs > 10 * 60 * 1000) return false;

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];

    if (ev.kind === 'thinking') return false;
    if (ev.kind === 'action') return false;
    if (ev.kind === 'message' && ev.role === 'assistant') return true;
    if (ev.kind === 'message' && ev.role === 'user') return false;
  }

  return false;
}

/**
 * Compute one of 6 status strings for a session.
 *
 * @param {{ lastEventAt: Date, inputState: string, events: Array }} session
 * @returns {'working'|'waiting'|'idle'|'quiet'|'stale'|'unclean'}
 */
export function computeSessionStatus(session) {
  const { lastEventAt, inputState, errorCount = 0 } = session;
  const ageMs = Date.now() - lastEventAt.getTime();

  const MIN1 = 60 * 1000;
  const MIN10 = 10 * 60 * 1000;
  const MIN60 = 60 * 60 * 1000;

  // Not recently active (older than 10 min).
  if (ageMs > MIN10) {
    // "Something went wrong" is reserved for sessions that actually hit errors.
    // A session that merely stopped with an unfinished action isn't an alarm —
    // if it happened a while ago it just wrapped up.
    if (inputState === 'busy') {
      if (errorCount > 0) return 'unclean';
      return ageMs > MIN60 ? 'quiet' : 'stale';
    }
    return 'quiet';
  }

  // Recently active.
  if (isWaitingForUser(session)) return 'waiting';
  if (ageMs > MIN1) return 'idle';
  return 'working';
}
