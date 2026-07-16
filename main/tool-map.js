// Tool name → normalized action mapping.
//
// This file is expected to grow with each new adapter.
// The stable contract (typedef, core functions) lives in event.js.

const TOOL_ACTION_MAP = {
  // Claude Code tools
  Read:       'read_file',
  Write:      'write_file',
  Edit:       'edit_file',
  Bash:       'run_command',
  Grep:       'search',
  Glob:       'search',
  Agent:      'task',
  Task:       'task',
  Skill:      'other',
  TaskCreate: 'other',
  TaskUpdate: 'other',
  TaskList:   'other',
  TaskGet:    'other',
  NotebookEdit: 'edit_file',

  // Codex tools
  shell_command: 'run_command',
  exec_command:  'run_command',
  shell:         'run_command',
  apply_patch:   'edit_file',
  write_stdin:   'other',
  spawn_agent:   'task',

  // Cursor tools (verified against real sessions)
  ReadFile:    'read_file',
  WriteFile:   'write_file',
  EditFile:    'edit_file',
  ApplyPatch:  'edit_file',
  rg:          'search',
  create_file: 'write_file',
  read_file:   'read_file',
  write_file:  'write_file',
  edit_file:   'edit_file',
  run_command: 'run_command',

  // Antigravity (Gemini Code Assist) tools
  // From knownAntigravityToolNames in antigravity.go + verified against real data
  list_permissions:             'other',
  view_file:                  'read_file',
  read_url_content:           'other',
  replace_file_content:       'edit_file',
  multi_replace_file_content: 'edit_file',
  write_to_file:              'write_file',
  define_subagent:            'task',
  invoke_subagent:            'task',
  manage_subagents:           'task',
  send_message:               'other',
  manage_task:                'task',
  ask_permission:             'other',
  ask_question:               'other',
  schedule:                   'other',
  search_web:                 'search',
  generate_image:             'other',
  execute_command:             'run_command',
  run_shell_command:           'run_command',
  grep_search:                'search',
  search_files:               'search',
  list_directory:             'search',
}

module.exports = TOOL_ACTION_MAP
