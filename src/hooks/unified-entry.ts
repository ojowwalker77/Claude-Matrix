#!/usr/bin/env bun
import { run as sessionStart } from './session-start.js';
import { run as userPromptSubmit } from './user-prompt-submit.js';
import { run as permissionRequest } from './permission-request.js';
import { run as preToolBash } from './pre-tool-bash.js';
import { run as preToolRead } from './pre-tool-read.js';
import { run as postToolBash } from './post-tool-bash.js';
import { run as postToolMatrix } from './post-tool-matrix.js';
import { run as preToolEdit } from './pre-tool-edit.js';
import { run as preToolWeb } from './pre-tool-web.js';
import { run as preCompact } from './pre-compact.js';
import { run as stopSession } from './stop-session.js';
import { run as subagentStart } from './subagent-start.js';
import { run as subagentStop } from './subagent-stop.js';

const hooks: Record<string, () => Promise<void>> = {
  'session-start': sessionStart,
  'user-prompt-submit': userPromptSubmit,
  'permission-request': permissionRequest,
  'pre-tool-bash': preToolBash,
  'pre-tool-read': preToolRead,
  'post-tool-bash': postToolBash,
  'post-tool-matrix': postToolMatrix,
  'pre-tool-edit': preToolEdit,
  'pre-tool-web': preToolWeb,
  'pre-compact': preCompact,
  'stop-session': stopSession,
  'subagent-start': subagentStart,
  'subagent-stop': subagentStop,
};

const hookType = process.argv[2];

if (!hookType || !hooks[hookType]) {
  console.error('Usage: matrix-hooks <hook-type>');
  console.error('Hook types: ' + Object.keys(hooks).join(', '));
  process.exit(1);
}

hooks[hookType]().catch((err) => {
  console.error(`Hook ${hookType} failed:`, err);
  process.exit(1);
});
