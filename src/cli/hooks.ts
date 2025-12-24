import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  header,
  muted,
  printBox,
  success,
  error,
  warn,
  info,
  cyan,
  green,
  yellow,
  red,
  dim,
  bold,
} from './utils/output.js';
import { get, set } from '../config/index.js';
import { getMatrixPaths } from '../paths.js';

type Subcommand = 'status' | 'enable' | 'disable' | 'test' | 'install' | 'uninstall';

// Get paths dynamically
function getPaths() {
  const paths = getMatrixPaths();
  const home = process.env['HOME'] || homedir();
  return {
    MATRIX_DIR: paths.root,
    CLAUDE_SETTINGS_PATH: join(home, '.claude', 'settings.json'),
    hooksDir: paths.hooks,
  };
}

interface HookConfig {
  matcher?: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout?: number;
  }>;
}

interface ClaudeSettings {
  hooks?: {
    UserPromptSubmit?: HookConfig[];
    PreToolUse?: HookConfig[];
    PostToolUse?: HookConfig[];
    Stop?: HookConfig[];
    [key: string]: HookConfig[] | undefined;
  };
  [key: string]: unknown;
}

// Generate hook definitions with current paths
function getMatrixHooks() {
  const { hooksDir } = getPaths();
  return {
    UserPromptSubmit: {
      command: `bun run ${hooksDir}/user-prompt-submit.ts`,
      timeout: 60,
      description: 'Injects Matrix memory context for complex prompts',
    },
    'PreToolUse:Bash': {
      matcher: 'Bash',
      command: `bun run ${hooksDir}/pre-tool-bash.ts`,
      timeout: 30,
      description: 'Audits package installations for CVEs and warnings',
    },
    'PreToolUse:Edit': {
      matcher: 'Edit|Write',
      command: `bun run ${hooksDir}/pre-tool-edit.ts`,
      timeout: 10,
      description: 'Checks for file warnings before editing',
    },
    'PostToolUse:Bash': {
      matcher: 'Bash',
      command: `bun run ${hooksDir}/post-tool-bash.ts`,
      timeout: 10,
      description: 'Logs successful package installations',
    },
    Stop: {
      command: `bun run ${hooksDir}/stop-session.ts`,
      timeout: 30,
      description: 'Prompts to store significant sessions in Matrix',
    },
  };
}

async function readClaudeSettings(): Promise<ClaudeSettings> {
  const { CLAUDE_SETTINGS_PATH } = getPaths();
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return {};
  }
  try {
    const content = await Bun.file(CLAUDE_SETTINGS_PATH).text();
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeClaudeSettings(settings: ClaudeSettings): Promise<void> {
  const { CLAUDE_SETTINGS_PATH } = getPaths();
  await Bun.write(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

function isMatrixHook(config: HookConfig): boolean {
  return config.hooks?.some(h => h.command?.includes('matrix')) ?? false;
}

function getHookStatus(settings: ClaudeSettings): Map<string, 'installed' | 'missing'> {
  const status = new Map<string, 'installed' | 'missing'>();
  const MATRIX_HOOKS = getMatrixHooks();

  for (const [name, hookDef] of Object.entries(MATRIX_HOOKS)) {
    let eventName: string;
    let matcher: string | undefined;

    if (name.includes(':')) {
      const [event] = name.split(':');
      eventName = event!;
      matcher = 'matcher' in hookDef ? hookDef.matcher : undefined;
    } else {
      eventName = name;
    }

    const eventHooks = settings.hooks?.[eventName] || [];
    const found = eventHooks.some(h => {
      if (matcher && h.matcher !== matcher) return false;
      return isMatrixHook(h);
    });

    status.set(name, found ? 'installed' : 'missing');
  }

  return status;
}

async function showStatus(): Promise<void> {
  const { CLAUDE_SETTINGS_PATH } = getPaths();
  const MATRIX_HOOKS = getMatrixHooks();
  const settings = await readClaudeSettings();
  const status = getHookStatus(settings);
  const configEnabled = get<boolean>('hooks.enabled') !== false;

  console.log();
  printBox('Matrix Hooks Status', [], 70);
  console.log();

  // Overall status
  const allInstalled = Array.from(status.values()).every(s => s === 'installed');
  const noneInstalled = Array.from(status.values()).every(s => s === 'missing');

  if (!configEnabled) {
    console.log(`  Config: ${red('disabled')}`);
    console.log(muted('    Run: matrix hooks enable'));
  } else {
    console.log(`  Config: ${green('enabled')}`);
  }

  if (allInstalled) {
    console.log(`  Hooks:  ${green('all installed')}`);
  } else if (noneInstalled) {
    console.log(`  Hooks:  ${yellow('not installed')}`);
    console.log(muted('    Run: matrix hooks install'));
  } else {
    console.log(`  Hooks:  ${yellow('partially installed')}`);
  }

  console.log();
  console.log('  Hook Details:');
  console.log();

  for (const [name, hookDef] of Object.entries(MATRIX_HOOKS)) {
    const hookStatus = status.get(name);
    const statusIcon = hookStatus === 'installed' ? green('✓') : yellow('○');
    const statusText = hookStatus === 'installed' ? green('installed') : muted('missing');

    console.log(`    ${statusIcon} ${cyan(name.padEnd(20))} ${statusText}`);
    console.log(`      ${muted(hookDef.description)}`);
  }

  console.log();
  console.log(muted(`  Settings file: ${CLAUDE_SETTINGS_PATH}`));
  console.log();
}

async function enableHooks(): Promise<void> {
  set('hooks.enabled', true);
  success('Matrix hooks enabled in config');
  console.log(muted('  Hooks will run on next Claude Code session'));
}

async function disableHooks(): Promise<void> {
  set('hooks.enabled', false);
  success('Matrix hooks disabled in config');
  console.log(muted('  Hooks are still registered but will skip execution'));
}

async function installHooks(): Promise<void> {
  const MATRIX_HOOKS = getMatrixHooks();
  info('Installing Matrix hooks in Claude Code settings...');

  const settings = await readClaudeSettings();
  settings.hooks = settings.hooks || {};

  // UserPromptSubmit
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
  const existingUPS = settings.hooks.UserPromptSubmit.filter(h => !isMatrixHook(h));
  settings.hooks.UserPromptSubmit = [
    ...existingUPS,
    {
      hooks: [{
        type: 'command',
        command: MATRIX_HOOKS.UserPromptSubmit.command,
        timeout: MATRIX_HOOKS.UserPromptSubmit.timeout,
      }],
    },
  ];

  // PreToolUse
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  const existingPTU = settings.hooks.PreToolUse.filter(h => !isMatrixHook(h));
  settings.hooks.PreToolUse = [
    ...existingPTU,
    {
      matcher: 'Bash',
      hooks: [{
        type: 'command',
        command: MATRIX_HOOKS['PreToolUse:Bash'].command,
        timeout: MATRIX_HOOKS['PreToolUse:Bash'].timeout,
      }],
    },
    {
      matcher: 'Edit|Write',
      hooks: [{
        type: 'command',
        command: MATRIX_HOOKS['PreToolUse:Edit'].command,
        timeout: MATRIX_HOOKS['PreToolUse:Edit'].timeout,
      }],
    },
  ];

  // PostToolUse
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
  const existingPOTU = settings.hooks.PostToolUse.filter(h => !isMatrixHook(h));
  settings.hooks.PostToolUse = [
    ...existingPOTU,
    {
      matcher: 'Bash',
      hooks: [{
        type: 'command',
        command: MATRIX_HOOKS['PostToolUse:Bash'].command,
        timeout: MATRIX_HOOKS['PostToolUse:Bash'].timeout,
      }],
    },
  ];

  // Stop
  settings.hooks.Stop = settings.hooks.Stop || [];
  const existingStop = settings.hooks.Stop.filter(h => !isMatrixHook(h));
  settings.hooks.Stop = [
    ...existingStop,
    {
      hooks: [{
        type: 'command',
        command: MATRIX_HOOKS.Stop.command,
        timeout: MATRIX_HOOKS.Stop.timeout,
      }],
    },
  ];

  await writeClaudeSettings(settings);

  success('Matrix hooks installed');
  console.log(muted('  Restart Claude Code for changes to take effect'));
}

async function uninstallHooks(): Promise<void> {
  info('Removing Matrix hooks from Claude Code settings...');

  const settings = await readClaudeSettings();

  if (!settings.hooks) {
    warn('No hooks configured');
    return;
  }

  // Remove Matrix hooks from each event
  for (const eventName of Object.keys(settings.hooks)) {
    const eventHooks = settings.hooks[eventName];
    if (Array.isArray(eventHooks)) {
      settings.hooks[eventName] = eventHooks.filter(h => !isMatrixHook(h));
      // Remove empty arrays
      if (settings.hooks[eventName]!.length === 0) {
        delete settings.hooks[eventName];
      }
    }
  }

  // Remove hooks object if empty
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await writeClaudeSettings(settings);

  success('Matrix hooks removed');
  console.log(muted('  Restart Claude Code for changes to take effect'));
}

async function testHook(args: string[]): Promise<void> {
  const { MATRIX_DIR } = getPaths();
  const MATRIX_HOOKS = getMatrixHooks();
  const hookName = args[0];

  if (!hookName) {
    error('Usage: matrix hooks test <hook-name> [--input <json>]');
    console.log();
    console.log('  Available hooks:');
    for (const name of Object.keys(MATRIX_HOOKS)) {
      console.log(`    - ${name}`);
    }
    return;
  }

  // Find the hook
  const hookDef = MATRIX_HOOKS[hookName as keyof typeof MATRIX_HOOKS];
  if (!hookDef) {
    error(`Unknown hook: ${hookName}`);
    console.log();
    console.log('  Available hooks:');
    for (const name of Object.keys(MATRIX_HOOKS)) {
      console.log(`    - ${name}`);
    }
    return;
  }

  // Parse input JSON
  let inputJson = '{}';
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') {
      inputJson = args[++i] || '{}';
    }
  }

  info(`Testing hook: ${hookName}`);
  console.log(muted(`  Command: ${hookDef.command}`));
  console.log(muted(`  Input: ${inputJson.slice(0, 100)}${inputJson.length > 100 ? '...' : ''}`));
  console.log();

  try {
    const proc = Bun.spawn(['bash', '-c', hookDef.command], {
      stdin: new Response(inputJson).body,
      cwd: process.cwd(),
      env: { ...process.env, MATRIX_DIR },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    console.log(`Exit code: ${exitCode === 0 ? green('0') : red(String(exitCode))}`);

    if (stdout.trim()) {
      console.log();
      console.log(bold('stdout:'));
      console.log(stdout);
    }

    if (stderr.trim()) {
      console.log();
      console.log(bold('stderr:'));
      console.log(stderr);
    }
  } catch (err) {
    error(`Failed to run hook: ${err}`);
  }
}

function showHelp(): void {
  const MATRIX_HOOKS = getMatrixHooks();
  console.log();
  printBox('Matrix Hooks - Manage Claude Code hooks', [], 70);
  console.log();
  console.log('  Commands:');
  console.log();
  console.log('    matrix hooks status');
  console.log(muted('      Show current hooks status'));
  console.log();
  console.log('    matrix hooks install');
  console.log(muted('      Register Matrix hooks in Claude Code settings'));
  console.log();
  console.log('    matrix hooks uninstall');
  console.log(muted('      Remove Matrix hooks from Claude Code settings'));
  console.log();
  console.log('    matrix hooks enable');
  console.log(muted('      Enable hook execution in Matrix config'));
  console.log();
  console.log('    matrix hooks disable');
  console.log(muted('      Disable hook execution (keeps them registered)'));
  console.log();
  console.log('    matrix hooks test <hook-name> [--input <json>]');
  console.log(muted('      Test a specific hook with mock input'));
  console.log();
  console.log('  Available Hooks:');
  console.log();
  for (const [name, hookDef] of Object.entries(MATRIX_HOOKS)) {
    console.log(`    ${cyan(name)}`);
    console.log(`      ${muted(hookDef.description)}`);
  }
  console.log();
}

export async function hooks(args: string[]): Promise<void> {
  const subcommand = args[0] as Subcommand | undefined;

  switch (subcommand) {
    case 'status':
      return showStatus();

    case 'enable':
      return enableHooks();

    case 'disable':
      return disableHooks();

    case 'install':
      return installHooks();

    case 'uninstall':
      return uninstallHooks();

    case 'test':
      return testHook(args.slice(1));

    case undefined:
      return showStatus();

    default:
      if (args.includes('--help') || args.includes('-h')) {
        return showHelp();
      }
      return showHelp();
  }
}
