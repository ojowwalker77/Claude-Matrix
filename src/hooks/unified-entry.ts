#!/usr/bin/env bun
import { run as sessionStart } from './session-start.js';
import { run as permissionRequest } from './permission-request.js';
import { run as preToolBash } from './pre-tool-bash.js';
import { run as preToolRead } from './pre-tool-read.js';
import { run as postToolBash } from './post-tool-bash.js';
import { run as preToolEdit } from './pre-tool-edit.js';
import { run as preToolWeb } from './pre-tool-web.js';
import { run as subagentStart } from './subagent-start.js';
import { run as taskCompleted } from './task-completed.js';

const hooks: Record<string, () => Promise<void>> = {
  'session-start': sessionStart,
  'permission-request': permissionRequest,
  'pre-tool-bash': preToolBash,
  'pre-tool-read': preToolRead,
  'post-tool-bash': postToolBash,
  'pre-tool-edit': preToolEdit,
  'pre-tool-web': preToolWeb,
  'subagent-start': subagentStart,
  'task-completed': taskCompleted,
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
