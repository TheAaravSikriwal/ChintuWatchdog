// sessionStatus.js — 6-state session status model

export const STATUS_LABELS = {
  working: 'working on it',
  waiting: 'waiting for you',
  idle: 'paused',
  quiet: 'done',
  stale: 'might be stuck',
  unclean: 'something went wrong',
};

export const STATUS_COLORS = {
  working: '#22C55E',
  waiting: '#3B82F6',
  idle: '#6B7280',
  quiet: '#6B7280',
  stale: '#F59E0B',
  unclean: '#EF4444',
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
  const { lastEventAt, inputState } = session;
  const ageMs = Date.now() - lastEventAt.getTime();

  const MIN1 = 60 * 1000;
  const MIN10 = 10 * 60 * 1000;
  const MIN60 = 60 * 60 * 1000;

  if (ageMs > MIN60 && inputState === 'busy') return 'unclean';
  if (ageMs > MIN10 && inputState === 'busy') return 'stale';
  if (ageMs > MIN10) return 'quiet';
  if (isWaitingForUser(session)) return 'waiting';
  if (ageMs > MIN1) return 'idle';
  return 'working';
}
