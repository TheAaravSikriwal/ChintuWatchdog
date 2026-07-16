// plainEnglish.js — Human-readable event labels

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the last segment of a file path (cross-platform friendly).
 * Handles both forward and back slashes.
 */
function fileBasename(filePath) {
  if (!filePath) return '';
  // Replace backslashes so split works uniformly
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Convert a camelCase or snake_case tool name into a readable label.
 * e.g. "applyPatch" → "Apply patch"
 *      "read_file"  → "Read file"
 */
function humanizeRawTool(rawTool) {
  if (!rawTool) return 'tool';
  // Split on underscores and camelCase boundaries
  const words = rawTool
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return rawTool;
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

/**
 * Map a run_command target to a friendly present/past-tense label pair.
 * Returns { present, past } strings (verb + object combined).
 */
function friendlyCommandLabel(target) {
  if (!target) return { present: 'Running command', past: 'Ran command' };

  const t = target.trim();

  if (/^npm\s+test(\s|$)/i.test(t) || t === 'npm test') {
    return { present: 'Running tests', past: 'Ran tests' };
  }
  if (/^npm\s+run\s+build(\s|$)/i.test(t)) {
    return { present: 'Building the project', past: 'Built the project' };
  }
  if (/^npm\s+install(\s|$)/i.test(t) || t === 'npm install' || /^npm\s+i(\s|$)/.test(t)) {
    return { present: 'Installing packages', past: 'Installed packages' };
  }
  if (/^git\s+commit(\s|$)/i.test(t)) {
    return { present: 'Committing changes', past: 'Committed changes' };
  }
  if (/^git\s+push(\s|$)/i.test(t)) {
    return { present: 'Pushing to remote', past: 'Pushed to remote' };
  }

  // Generic fallback — truncate to 40 chars
  const truncated = t.length > 40 ? t.slice(0, 40) : t;
  return { present: `Running: ${truncated}`, past: `Ran: ${truncated}` };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Return a { verb, object } label for an action event.
 *
 * For run_command: verb is '' and object is the full friendly label string.
 *
 * @param {string} action      - action type
 * @param {string|undefined} target    - file path or command
 * @param {string|undefined} rawTool   - original tool name
 * @param {boolean} completed  - true = past tense, false = present tense
 * @returns {{ verb: string, object: string }}
 */
export function actionLabel(action, target, rawTool, completed) {
  switch (action) {
    case 'read_file':
      return {
        verb: completed ? 'Read' : 'Reading',
        object: fileBasename(target),
      };

    case 'write_file':
      return {
        verb: completed ? 'Wrote' : 'Writing',
        object: fileBasename(target),
      };

    case 'edit_file':
      return {
        verb: completed ? 'Edited' : 'Editing',
        object: fileBasename(target),
      };

    case 'run_command': {
      const { present, past } = friendlyCommandLabel(target);
      return { verb: '', object: completed ? past : present };
    }

    case 'search':
      return {
        verb: completed ? 'Searched' : 'Searching',
        object: target ? `for ${target}` : '',
      };

    case 'task':
      return {
        verb: completed ? 'Delegated' : 'Delegating',
        object: target || '',
      };

    case 'other':
    default:
      return {
        verb: completed ? 'Ran' : 'Running',
        object: humanizeRawTool(rawTool),
      };
  }
}

/**
 * Return a short string suitable for the session sidebar preview.
 *
 * @param {object} event - WatchdogEvent
 * @returns {string}
 */
export function eventPreview(event) {
  if (!event) return '';

  switch (event.kind) {
    case 'thinking':
      return 'thinking it through...';

    case 'message':
      if (event.role === 'assistant' && event.text) {
        return event.text.slice(0, 55);
      }
      return '';

    case 'action': {
      const { verb, object } = actionLabel(event.action, event.target, event.rawTool, false);
      return verb ? `${verb} ${object}`.trim() : object;
    }

    case 'result':
      return '';

    default:
      return '';
  }
}

/**
 * Return a short quantitative context string extracted from result text,
 * or null if one cannot be determined.
 *
 * @param {string} action      - action type
 * @param {string|null} resultText - result text
 * @returns {string|null}
 */
export function quantitativeContext(action, resultText) {
  if (!resultText) return null;

  switch (action) {
    case 'read_file':
    case 'write_file':
      return `~${Math.round(resultText.length / 40)} lines`;

    case 'edit_file':
      // edit line counts: deferred to Phase 2 when actionInput is wired
      return null;

    case 'search': {
      // Extract a leading digit group from the result text
      const match = resultText.match(/^(\d+)/);
      if (match) return `${match[1]} matches`;
      return null;
    }

    case 'run_command': {
      const head = resultText.slice(0, 100);

      // Look for "N passed, M failed" pattern
      const passFailMatch = head.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i);
      if (passFailMatch) {
        const passed = passFailMatch[1];
        const failed = passFailMatch[2];
        return failed ? `${passed} passed, ${failed} failed` : `${passed} passed`;
      }

      // Look for "exit N"
      const exitMatch = head.match(/exit\s+(\d+)/i);
      if (exitMatch) return `exit ${exitMatch[1]}`;

      return null;
    }

    default:
      return null;
  }
}
