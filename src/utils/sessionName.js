// sessionName.js — Session naming with prefix stripping

export const AGENT_DISPLAY_NAMES = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'cursor': 'Cursor',
  'antigravity': 'Antigravity',
  'aider': 'Aider',
};

// Prefixes to strip (case-insensitive), ordered from longest to shortest so
// greedy matching works correctly (e.g. "i'd like you to" before "i'd").
const STRIP_PREFIXES = [
  "i'd like you to",
  "i need you to",
  "i want you to",
  "could you",
  "can you",
  "help me",
  "please",
];

/**
 * Strip known filler prefixes from the start of text, then:
 *  - trim leading/trailing whitespace
 *  - remove a trailing question mark
 *  - capitalize the first character
 *  - truncate to 40 characters
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanSessionName(text) {
  if (!text) return '';

  let s = text.trim();

  // Strip prefixes (case-insensitive), repeat until none match
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of STRIP_PREFIXES) {
      const re = new RegExp(`^${prefix}\\s*`, 'i');
      if (re.test(s)) {
        s = s.replace(re, '');
        changed = true;
        break; // restart loop after any match
      }
    }
  }

  // Remove trailing question mark and re-trim
  s = s.replace(/\?+$/, '').trim();

  if (!s) return '';

  // Capitalize first character
  s = s.charAt(0).toUpperCase() + s.slice(1);

  // Truncate to 40 characters
  if (s.length > 40) s = s.slice(0, 40);

  return s;
}

/**
 * Return a formatted fallback name like "Claude Code · Jul 8, 6:47 PM".
 *
 * @param {string} agent - agent key
 * @param {Date}   date  - session date
 * @returns {string}
 */
export function fallbackName(agent, date) {
  const displayAgent = AGENT_DISPLAY_NAMES[agent] || agent;

  const formatted = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${displayAgent} · ${formatted}`;
}

/**
 * Derive a session name from a single event.
 * Only processes kind==='message' with role==='user'.
 *
 * @param {object} event - WatchdogEvent
 * @returns {string|null}
 */
export function nameFromEvent(event) {
  if (!event) return null;
  if (event.kind !== 'message' || event.role !== 'user') return null;
  if (!event.text) return null;

  // Skip injected XML-envelope "messages" — these are system/IDE context,
  // not real user prompts, and make terrible session names. Covers command
  // envelopes (/model, /rename, …), system reminders, task notifications, and
  // IDE context (<ide_opened_file>, <ide_selection>, …).
  const trimmed = event.text.trim();
  if (/^<(command-|local-command|system-reminder|task-notification|ide_)/.test(trimmed)) {
    return null;
  }

  const name = cleanSessionName(event.text);
  return name || null;
}
