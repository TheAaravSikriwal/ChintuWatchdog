// plainEnglish.js — Human-readable event labels
// Narrative-first: labels tell a story for non-technical users.

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the last segment of a file path (cross-platform friendly).
 */
function fileBasename(filePath) {
  if (!filePath) return '';
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Convert a camelCase or snake_case tool name into a readable label.
 */
function humanizeRawTool(rawTool) {
  if (!rawTool) return 'tool';
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
 * Narrative voice: tells the user what's happening in plain language.
 */
function friendlyCommandLabel(target) {
  if (!target) return { present: 'Running a command', past: 'Ran a command' };

  const t = target.trim();

  if (/^npm\s+test(\s|$)/i.test(t) || t === 'npm test') {
    return { present: 'Checking if the tests pass', past: 'Checked the tests' };
  }
  if (/^npm\s+run\s+build(\s|$)/i.test(t)) {
    return { present: 'Building the project', past: 'Finished building' };
  }
  if (/^npm\s+install(\s|$)/i.test(t) || t === 'npm install' || /^npm\s+i(\s|$)/.test(t)) {
    return { present: 'Installing packages', past: 'Installed packages' };
  }
  if (/^npm\s+run\s+lint(\s|$)/i.test(t)) {
    return { present: 'Checking code style', past: 'Checked code style' };
  }
  if (/^npm\s+run\s+dev(\s|$)/i.test(t) || /^npm\s+start(\s|$)/i.test(t)) {
    return { present: 'Starting the dev server', past: 'Started the dev server' };
  }
  if (/^git\s+commit(\s|$)/i.test(t)) {
    return { present: 'Saving a checkpoint', past: 'Saved a checkpoint' };
  }
  if (/^git\s+push(\s|$)/i.test(t)) {
    return { present: 'Pushing changes upstream', past: 'Pushed changes upstream' };
  }
  if (/^git\s+pull(\s|$)/i.test(t)) {
    return { present: 'Pulling latest changes', past: 'Pulled latest changes' };
  }
  if (/^git\s+status(\s|$)/i.test(t)) {
    return { present: 'Checking what changed', past: 'Checked what changed' };
  }
  if (/^git\s+diff(\s|$)/i.test(t)) {
    return { present: 'Reviewing the diff', past: 'Reviewed the diff' };
  }
  if (/^git\s+log(\s|$)/i.test(t)) {
    return { present: 'Looking at recent history', past: 'Reviewed recent history' };
  }
  if (/^(rm|del)\s/i.test(t)) {
    return { present: 'Cleaning up files', past: 'Cleaned up files' };
  }
  if (/^mkdir\s/i.test(t)) {
    return { present: 'Creating a folder', past: 'Created a folder' };
  }
  if (/^(cat|type|head|tail)\s/i.test(t)) {
    return { present: 'Peeking at a file', past: 'Peeked at a file' };
  }
  if (/^(ls|dir)(\s|$)/i.test(t)) {
    return { present: 'Listing files', past: 'Listed files' };
  }

  // Generic fallback — truncate to 40 chars
  const truncated = t.length > 40 ? t.slice(0, 40) + '…' : t;
  return { present: `Running: ${truncated}`, past: `Ran: ${truncated}` };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Return a { verb, object } label for an action event.
 * Narrative voice: past tense tells what happened, present tense tells what's happening.
 */
export function actionLabel(action, target, rawTool, completed) {
  switch (action) {
    case 'read_file':
      return {
        verb: completed ? 'Looked at' : 'Looking at',
        object: fileBasename(target),
      };

    case 'write_file':
      return {
        verb: completed ? 'Wrote' : 'Writing',
        object: fileBasename(target),
      };

    case 'edit_file':
      return {
        verb: completed ? 'Updated' : 'Updating',
        object: fileBasename(target),
      };

    case 'run_command': {
      const { present, past } = friendlyCommandLabel(target);
      return { verb: '', object: completed ? past : present };
    }

    case 'search':
      return {
        verb: completed ? 'Searched' : 'Searching',
        object: target ? `for "${target}"` : 'the codebase',
      };

    case 'task':
      return {
        verb: completed ? 'Handed off' : 'Handing off',
        object: target || 'a task',
      };

    case 'other':
    default:
      return {
        verb: completed ? 'Used' : 'Using',
        object: humanizeRawTool(rawTool),
      };
  }
}

/**
 * Return a short string suitable for the session sidebar preview.
 */
export function eventPreview(event) {
  if (!event) return '';

  switch (event.kind) {
    case 'thinking':
      return 'thinking it through…';

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
 */
export function quantitativeContext(action, resultText) {
  if (!resultText) return null;

  switch (action) {
    case 'read_file':
    case 'write_file':
      return `~${Math.round(resultText.length / 40)} lines`;

    case 'edit_file':
      return null;

    case 'search': {
      const match = resultText.match(/^(\d+)/);
      if (match) return `${match[1]} matches`;
      return null;
    }

    case 'run_command': {
      const head = resultText.slice(0, 100);

      const passFailMatch = head.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i);
      if (passFailMatch) {
        const passed = passFailMatch[1];
        const failed = passFailMatch[2];
        return failed ? `${passed} passed, ${failed} failed` : `${passed} passed`;
      }

      const exitMatch = head.match(/exit\s+(\d+)/i);
      if (exitMatch) return `exit ${exitMatch[1]}`;

      return null;
    }

    default:
      return null;
  }
}
