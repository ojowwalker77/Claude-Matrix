import { $ } from 'bun';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';
import { getDb } from '../db/index.js';
import { set } from '../config/index.js';
import { bold, cyan, dim, green, yellow, red, success, error, info, warn } from './utils/output.js';

const MATRIX_DIR = process.env['MATRIX_DIR'] || join(process.env['HOME'] || '~', '.claude', 'matrix');
const REPO_URL = 'https://github.com/ojowwalker77/Claude-Matrix.git';

// Claude Code paths
const CLAUDE_MD_PATH = join(process.env['HOME'] || '~', '.claude', 'CLAUDE.md');
const CLAUDE_TEMPLATE_PATH = join(MATRIX_DIR, 'templates', 'CLAUDE.md');

// Cursor paths
const CURSOR_DIR = join(process.env['HOME'] || '~', '.cursor');
const CURSOR_MCP_PATH = join(CURSOR_DIR, 'mcp.json');
const CURSOR_RULES_PATH = join(process.env['HOME'] || '~', '.cursorrules');
const CURSOR_MCP_TEMPLATE = join(MATRIX_DIR, 'templates', 'cursor-mcp.json');
const CURSOR_RULES_TEMPLATE = join(MATRIX_DIR, 'templates', '.cursorrules');

type EditorChoice = 'claude' | 'cursor' | 'both';

interface InitOptions {
  force: boolean;
  skipMcp: boolean;
  skipPath: boolean;
  skipRules: boolean;
  skipHooks: boolean;
  editor?: EditorChoice;
}

// Hooks configuration
const CLAUDE_SETTINGS_PATH = join(process.env['HOME'] || homedir(), '.claude', 'settings.json');

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

function parseArgs(args: string[]): InitOptions {
  return {
    force: args.includes('--force') || args.includes('-f'),
    skipMcp: args.includes('--skip-mcp'),
    skipPath: args.includes('--skip-path'),
    skipRules: args.includes('--skip-rules') || args.includes('--skip-claude-md'),
    skipHooks: args.includes('--skip-hooks'),
    editor: undefined,
  };
}

async function promptEditor(): Promise<EditorChoice> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\n${bold('Select your editor:')}\n`);
  console.log(`  ${cyan('1.')} Claude Code ${dim('(official Anthropic CLI)')}`);
  console.log(`  ${cyan('2.')} Cursor ${dim('(AI-powered IDE)')}`);
  console.log(`  ${cyan('3.')} Both ${dim('(configure for both editors)')}`);
  console.log('');

  return new Promise((resolve) => {
    const askQuestion = () => {
      rl.question(`${bold('Enter choice')} ${dim('[1/2/3]')}: `, (answer) => {
        // Handle EOF (null answer when user presses CTRL+D)
        if (answer === null) {
          console.log('\nAborted.');
          rl.close();
          process.exit(0);
        }
        
        const choice = answer.trim().toLowerCase();
        if (choice === '1' || choice === 'claude') {
          rl.close();
          resolve('claude');
        } else if (choice === '2' || choice === 'cursor') {
          rl.close();
          resolve('cursor');
        } else if (choice === '3' || choice === 'both') {
          rl.close();
          resolve('both');
        } else {
          console.log(yellow('Please enter 1, 2, or 3'));
          askQuestion();
        }
      });
    };
    askQuestion();
  });
}

async function checkBun(): Promise<boolean> {
  try {
    const result = await $`bun --version`.quiet();
    const version = result.text().trim();
    const major = Number(version.split('.')[0]) || 0;

    if (major < 1) {
      error(`Bun version ${version} is too old. Required: >= 1.0.0`);
      console.log(dim('Update with: bun upgrade'));
      return false;
    }

    success(`Bun ${version} detected`);
    return true;
  } catch {
    error('Bun is not installed');
    console.log(dim('Install with: curl -fsSL https://bun.sh/install | bash'));
    return false;
  }
}

async function checkClaudeCli(): Promise<boolean> {
  try {
    await $`claude --version`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function setupDirectory(): Promise<boolean> {
  if (existsSync(MATRIX_DIR)) {
    if (existsSync(join(MATRIX_DIR, 'package.json'))) {
      success(`Matrix directory exists at ${dim(MATRIX_DIR)}`);
      return true;
    }
  }

  info('Cloning Matrix repository...');
  try {
    await $`git clone ${REPO_URL} ${MATRIX_DIR}`;
    success('Repository cloned');
    return true;
  } catch (err: any) {
    error('Failed to clone repository');
    if (err.stderr) {
      console.log(dim(err.stderr.toString().trim()));
    }
    return false;
  }
}

async function installDeps(): Promise<boolean> {
  info('Installing dependencies...');
  try {
    await $`cd ${MATRIX_DIR} && bun install`.quiet();
    success('Dependencies installed');
    return true;
  } catch (err) {
    error(`Failed to install dependencies: ${err}`);
    return false;
  }
}

function initDatabase(): boolean {
  info('Initializing database...');
  try {
    const db = getDb();
    success('Database initialized');
    return true;
  } catch (err) {
    error(`Failed to initialize database: ${err}`);
    return false;
  }
}

// Claude Code specific functions
async function registerMcpClaude(): Promise<boolean> {
  info('Registering MCP server with Claude Code...');

  const hasClaudeCli = await checkClaudeCli();
  if (!hasClaudeCli) {
    warn('Claude CLI not found - skipping MCP registration');
    console.log(dim('Install Claude Code and run manually:'));
    console.log(dim(`  claude mcp add matrix -s user -- bun run ${MATRIX_DIR}/src/index.ts`));
    return true;
  }

  try {
    const listResult = await $`claude mcp list`.quiet();
    if (listResult.text().includes('matrix')) {
      success('MCP server already registered');
      return true;
    }

    await $`claude mcp add matrix -s user -- bun run ${MATRIX_DIR}/src/index.ts`.quiet();
    success('MCP server registered');
    return true;
  } catch (err) {
    warn(`MCP registration had issues: ${err}`);
    console.log(dim('You may need to register manually:'));
    console.log(dim(`  claude mcp add matrix -s user -- bun run ${MATRIX_DIR}/src/index.ts`));
    return true;
  }
}

async function setupClaudeMd(): Promise<boolean> {
  info('Setting up CLAUDE.md template...');

  if (!existsSync(CLAUDE_TEMPLATE_PATH)) {
    warn('Template file not found, skipping');
    return true;
  }

  const template = await Bun.file(CLAUDE_TEMPLATE_PATH).text();

  if (existsSync(CLAUDE_MD_PATH)) {
    const existing = await Bun.file(CLAUDE_MD_PATH).text();

    if (existing.includes('Claude Matrix - Tooling System')) {
      success('CLAUDE.md already contains Matrix instructions');
      return true;
    }

    const updated = existing + '\n\n' + template;
    await Bun.write(CLAUDE_MD_PATH, updated);
    success('Matrix instructions appended to CLAUDE.md');
  } else {
    await Bun.write(CLAUDE_MD_PATH, template);
    success('CLAUDE.md created with Matrix instructions');
  }

  return true;
}

// Cursor specific functions
async function registerMcpCursor(): Promise<boolean> {
  info('Configuring MCP server for Cursor...');

  try {
    // Create .cursor directory if it doesn't exist
    if (!existsSync(CURSOR_DIR)) {
      mkdirSync(CURSOR_DIR, { recursive: true });
      success(`Created ${dim(CURSOR_DIR)}`);
    }

    // Read template
    if (!existsSync(CURSOR_MCP_TEMPLATE)) {
      warn('Cursor MCP template not found');
      console.log(dim('Create manually at ~/.cursor/mcp.json'));
      return true;
    }

    const templateContent = await Bun.file(CURSOR_MCP_TEMPLATE).text();
    const template = JSON.parse(templateContent);

    // Replace ${userHome} placeholder with actual home directory
    const home = process.env['HOME'] || homedir();
    const mcpConfig = JSON.parse(
      JSON.stringify(template).replace(/\$\{userHome\}/g, home)
    );

    // Check if mcp.json already exists
    if (existsSync(CURSOR_MCP_PATH)) {
      const existing = await Bun.file(CURSOR_MCP_PATH).text();
      const existingConfig = JSON.parse(existing);

      // Check if matrix is already configured
      if (existingConfig.mcpServers?.matrix) {
        success('MCP server already configured in Cursor');
        return true;
      }

      // Merge with existing config
      existingConfig.mcpServers = existingConfig.mcpServers || {};
      existingConfig.mcpServers.matrix = mcpConfig.mcpServers.matrix;
      await Bun.write(CURSOR_MCP_PATH, JSON.stringify(existingConfig, null, 2) + '\n');
      success('Matrix MCP added to existing Cursor config');
    } else {
      // Write new config
      await Bun.write(CURSOR_MCP_PATH, JSON.stringify(mcpConfig, null, 2) + '\n');
      success(`MCP config created at ${dim(CURSOR_MCP_PATH)}`);
    }

    return true;
  } catch (err) {
    error(`Failed to configure Cursor MCP: ${err}`);
    console.log(dim('You may need to configure manually at ~/.cursor/mcp.json'));
    return false;
  }
}

async function setupCursorRules(): Promise<boolean> {
  info('Setting up Cursor rules...');

  if (!existsSync(CURSOR_RULES_TEMPLATE)) {
    warn('Cursor rules template not found, skipping');
    return true;
  }

  const template = await Bun.file(CURSOR_RULES_TEMPLATE).text();

  if (existsSync(CURSOR_RULES_PATH)) {
    const existing = await Bun.file(CURSOR_RULES_PATH).text();

    if (existing.includes('Claude Matrix - Tooling System')) {
      success('.cursorrules already contains Matrix instructions');
      return true;
    }

    const updated = existing + '\n\n' + template;
    await Bun.write(CURSOR_RULES_PATH, updated);
    success('Matrix instructions appended to .cursorrules');
  } else {
    await Bun.write(CURSOR_RULES_PATH, template);
    success('.cursorrules created with Matrix instructions');
  }

  return true;
}

async function setupPath(): Promise<boolean> {
  info('Setting up PATH for CLI access...');

  const home = process.env['HOME'] || homedir();
  if (!home || home === '~') {
    warn('Could not determine home directory');
    console.log(dim('Add manually: export PATH="$HOME/.claude/matrix/bin:$PATH"'));
    return true;
  }

  const pathLine = `export PATH="$HOME/.claude/matrix/bin:$PATH"`;
  const pathPattern = /^[^#]*export\s+PATH=.*\.claude\/matrix\/bin/m;
  const shellConfigs = [
    { file: join(home, '.zshrc'), name: 'zsh' },
    { file: join(home, '.bashrc'), name: 'bash' },
    { file: join(home, '.bash_profile'), name: 'bash_profile' },
  ];

  let configured = false;

  for (const config of shellConfigs) {
    if (!existsSync(config.file)) continue;

    try {
      const content = await Bun.file(config.file).text();

      if (pathPattern.test(content)) {
        success(`PATH already configured in ${dim(config.file)}`);
        configured = true;
        break;
      }

      const updated = content + '\n\n# Claude Matrix CLI\n' + pathLine + '\n';
      await Bun.write(config.file, updated);
      success(`PATH added to ${dim(config.file)}`);
      console.log(dim(`  Run: source ${config.file}`));
      configured = true;
      break;
    } catch (err) {
      warn(`Could not modify ${config.file}: ${err}`);
      continue;
    }
  }

  if (!configured) {
    warn('No shell config found (.zshrc, .bashrc, .bash_profile)');
    console.log(dim(`Add manually: ${pathLine}`));
  }

  return true;
}

// Hooks setup functions
async function promptHooksSetup(): Promise<{ enableHooks: boolean; enableCache: boolean }> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        if (answer === null) {
          console.log('\nAborted.');
          rl.close();
          process.exit(0);
        }
        resolve(answer.toLowerCase().trim());
      });
    });
  };

  console.log(`\n${bold('Matrix Hooks Setup')}\n`);
  console.log(dim('  Hooks provide automatic context injection, package auditing,'));
  console.log(dim('  file warnings, and solution storage prompts.\n'));

  const enableHooks = await askQuestion(`${bold('Enable Matrix hooks?')} ${dim('[y/n]')}: `);

  if (enableHooks !== 'y' && enableHooks !== 'yes') {
    rl.close();
    return { enableHooks: false, enableCache: false };
  }

  console.log();
  console.log(dim('  API caching stores OSV/Bundlephobia responses for 24 hours'));
  console.log(dim('  to reduce latency on repeated package checks.\n'));

  const enableCache = await askQuestion(`${bold('Enable 24h API cache?')} ${dim('[y/n]')}: `);

  rl.close();
  return {
    enableHooks: true,
    enableCache: enableCache === 'y' || enableCache === 'yes'
  };
}

function isMatrixHook(config: HookConfig): boolean {
  return config.hooks?.some(h => h.command?.includes('matrix')) ?? false;
}

async function registerHooks(): Promise<boolean> {
  info('Registering Matrix hooks with Claude Code...');

  try {
    let settings: ClaudeSettings = {};

    if (existsSync(CLAUDE_SETTINGS_PATH)) {
      const content = await Bun.file(CLAUDE_SETTINGS_PATH).text();
      settings = JSON.parse(content);
    }

    settings.hooks = settings.hooks || {};

    // UserPromptSubmit
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
    const existingUPS = settings.hooks.UserPromptSubmit.filter(h => !isMatrixHook(h));
    settings.hooks.UserPromptSubmit = [
      ...existingUPS,
      {
        hooks: [{
          type: 'command',
          command: `bun run ${MATRIX_DIR}/src/hooks/user-prompt-submit.ts`,
          timeout: 60,
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
          command: `bun run ${MATRIX_DIR}/src/hooks/pre-tool-bash.ts`,
          timeout: 30,
        }],
      },
      {
        matcher: 'Edit|Write',
        hooks: [{
          type: 'command',
          command: `bun run ${MATRIX_DIR}/src/hooks/pre-tool-edit.ts`,
          timeout: 10,
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
          command: `bun run ${MATRIX_DIR}/src/hooks/post-tool-bash.ts`,
          timeout: 10,
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
          command: `bun run ${MATRIX_DIR}/src/hooks/stop-session.ts`,
          timeout: 30,
        }],
      },
    ];

    await Bun.write(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
    success('Matrix hooks registered in settings.json');
    return true;
  } catch (err) {
    error(`Failed to register hooks: ${err}`);
    console.log(dim('You can register manually: matrix hooks install'));
    return false;
  }
}

export async function init(args: string[]): Promise<void> {
  const options = parseArgs(args);

  console.log(`\n${bold('Claude Matrix - Tooling System')} ${dim('- Setup')}\n`);

  // Prompt for editor choice
  const editor = await promptEditor();
  console.log('');

  if (editor === 'claude') {
    console.log(dim('Configuring Matrix for Claude Code...\n'));
  } else if (editor === 'cursor') {
    console.log(dim('Configuring Matrix for Cursor...\n'));
  } else {
    console.log(dim('Configuring Matrix for both Claude Code and Cursor...\n'));
  }

  // Common steps
  const commonSteps: Array<{ name: string; fn: () => Promise<boolean> | boolean; skip?: boolean }> = [
    { name: 'Check Bun installation', fn: checkBun },
    { name: 'Setup Matrix directory', fn: setupDirectory },
    { name: 'Install dependencies', fn: installDeps },
    { name: 'Initialize database', fn: initDatabase },
    { name: 'Setup PATH for CLI', fn: setupPath, skip: options.skipPath },
  ];

  // Claude Code steps
  const claudeSteps: Array<{ name: string; fn: () => Promise<boolean> | boolean; skip?: boolean }> = [
    { name: 'Register MCP server (Claude Code)', fn: registerMcpClaude, skip: options.skipMcp },
    { name: 'Setup CLAUDE.md template', fn: setupClaudeMd, skip: options.skipRules },
  ];

  // Cursor steps
  const cursorSteps: Array<{ name: string; fn: () => Promise<boolean> | boolean; skip?: boolean }> = [
    { name: 'Configure Cursor MCP', fn: registerMcpCursor, skip: options.skipMcp },
    { name: 'Setup .cursorrules', fn: setupCursorRules, skip: options.skipRules },
  ];

  // Build steps based on editor choice
  let editorSteps: Array<{ name: string; fn: () => Promise<boolean> | boolean; skip?: boolean }>;
  if (editor === 'claude') {
    editorSteps = claudeSteps;
  } else if (editor === 'cursor') {
    editorSteps = cursorSteps;
  } else {
    editorSteps = [...claudeSteps, ...cursorSteps];
  }

  const steps = [...commonSteps, ...editorSteps];

  let failed = false;

  for (const step of steps) {
    if (step.skip) {
      console.log(dim(`  Skipping: ${step.name}`));
      continue;
    }

    const result = await step.fn();
    if (!result) {
      failed = true;
      if (!options.force) {
        error('\nSetup failed. Use --force to continue despite errors.');
        process.exit(1);
      }
    }
  }

  // Hooks setup (Claude Code only)
  let hooksInstalled = false;
  if ((editor === 'claude' || editor === 'both') && !options.skipHooks) {
    const hooksChoice = await promptHooksSetup();

    if (hooksChoice.enableHooks) {
      // Update config with cache preference
      set('hooks.enabled', true);
      set('hooks.enableApiCache', hooksChoice.enableCache);

      // Register hooks
      const hooksResult = await registerHooks();
      if (!hooksResult && !options.force) {
        failed = true;
      } else {
        hooksInstalled = true;
      }
    } else {
      set('hooks.enabled', false);
      console.log(dim('\n  Hooks disabled. Enable later with: matrix hooks install'));
    }
  }

  if (failed) {
    console.log(yellow('\nSetup completed with warnings.'));
  } else {
    console.log(green('\n✓ Matrix initialized successfully!\n'));
  }

  console.log(bold('Next steps:'));
  if (editor === 'claude') {
    console.log(`  ${cyan('1.')} Restart Claude Code (or open a new terminal)`);
    if (hooksInstalled) {
      console.log(`  ${cyan('2.')} Hooks will auto-inject context for complex prompts`);
      console.log(`  ${cyan('3.')} Package installs will be audited for CVEs`);
      console.log(`  ${cyan('4.')} Ask Claude to solve a complex problem`);
    } else {
      console.log(`  ${cyan('2.')} Ask Claude to solve a complex problem`);
      console.log(`  ${cyan('3.')} Watch Matrix learn from your solutions`);
    }
  } else if (editor === 'cursor') {
    console.log(`  ${cyan('1.')} Restart Cursor to load MCP configuration`);
    console.log(`  ${cyan('2.')} Enable MCP in Cursor settings if not already enabled`);
    console.log(`  ${cyan('3.')} Use Cursor Agent to solve complex problems`);
    console.log(`  ${cyan('4.')} Matrix will learn from your solutions`);
  } else {
    console.log(`  ${cyan('1.')} Restart Claude Code and/or Cursor`);
    console.log(`  ${cyan('2.')} For Cursor: Enable MCP in settings if not already enabled`);
    if (hooksInstalled) {
      console.log(`  ${cyan('3.')} Claude Code: Hooks are active for context injection`);
      console.log(`  ${cyan('4.')} Solve complex problems in either editor`);
    } else {
      console.log(`  ${cyan('3.')} Solve complex problems in either editor`);
      console.log(`  ${cyan('4.')} Matrix shares memory across both editors`);
    }
  }

  console.log(`\n${bold('Quick test:')}`);
  console.log(dim('  matrix stats'));
  console.log(dim('  matrix search "authentication"'));
  if (hooksInstalled) {
    console.log(dim('  matrix hooks status'));
  }
  console.log();
}
