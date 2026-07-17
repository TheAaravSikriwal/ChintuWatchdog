// Agent identity — colours and short codes.
//
// These are FIXED and theme-independent by design (see the UI spec §5:
// "Agent identity colours (fixed, theme-independent)"). They must NOT become
// CSS variables. Previously this map was copy-pasted into 8 files; it now
// lives here so a new agent or a colour change is a one-line edit.

export const AGENT_COLORS = {
  'claude-code': '#EA8C1D',
  'cursor': '#2563EB',
  'codex': '#16A34A',
  'antigravity': '#7C3AED',
  'aider': '#0891B2',
}

export const AGENT_CODES = {
  'claude-code': 'CL',
  'cursor': 'CX',
  'codex': 'CO',
  'antigravity': 'AG',
  'aider': 'AI',
}

// Fallback for an unknown/"all agents" identity (spec §5: All agents #64748B).
export const UNKNOWN_AGENT_COLOR = '#64748B'
export const UNKNOWN_AGENT_CODE = '??'

/** Agent identity colour, with the neutral fallback for unknown agents. */
export function agentColor(agent) {
  return AGENT_COLORS[agent] || UNKNOWN_AGENT_COLOR
}

/** Two-letter agent code, with a neutral fallback for unknown agents. */
export function agentCode(agent) {
  return AGENT_CODES[agent] || UNKNOWN_AGENT_CODE
}
