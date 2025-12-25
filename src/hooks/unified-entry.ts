#!/usr/bin/env bun
import { run as sessionStart } from './session-start.js';
import { run as userPromptSubmit } from './user-prompt-submit.js';
import { run as preToolBash } from './pre-tool-bash.js';
import { run as postToolBash } from './post-tool-bash.js';
import { run as preToolEdit } from './pre-tool-edit.js';
import { run as stopSession } from './stop-session.js';

const hooks: Record<string, () => Promise<void>> = {
  'session-start': sessionStart,
  'user-prompt-submit': userPromptSubmit,
  'pre-tool-bash': preToolBash,
  'post-tool-bash': postToolBash,
  'pre-tool-edit': preToolEdit,
  'stop-session': stopSession,
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
