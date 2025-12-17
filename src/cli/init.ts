import { $ } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/index.js';
import { bold, cyan, dim, green, yellow, red, success, error, info, warn } from './utils/output.js';

const MATRIX_DIR = process.env['MATRIX_DIR'] || join(process.env['HOME'] || '~', '.claude', 'matrix');
const CLAUDE_MD_PATH = join(process.env['HOME'] || '~', '.claude', 'CLAUDE.md');
const TEMPLATE_PATH = join(MATRIX_DIR, 'templates', 'CLAUDE.md');
const REPO_URL = 'https://github.com/ojowwalker77/Claude-Matrix.git';

interface InitOptions {
  force: boolean;
  skipMcp: boolean;
  skipClaudeMd: boolean;
}

function parseArgs(args: string[]): InitOptions {
  return {
    force: args.includes('--force') || args.includes('-f'),
    skipMcp: args.includes('--skip-mcp'),
    skipClaudeMd: args.includes('--skip-claude-md'),
  };
}

async function checkBun(): Promise<boolean> {
  try {
    const result = await $`bun --version`.quiet();
    const version = result.text().trim();
    const [major] = version.split('.').map(Number);

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
  // Check if matrix directory exists
  if (existsSync(MATRIX_DIR)) {
    if (existsSync(join(MATRIX_DIR, 'package.json'))) {
      success(`Matrix directory exists at ${dim(MATRIX_DIR)}`);
      return true;
    }
  }

  // Clone repository
  info('Cloning Matrix repository...');
  try {
    await $`git clone ${REPO_URL} ${MATRIX_DIR}`.quiet();
    success('Repository cloned');
    return true;
  } catch (err) {
    error(`Failed to clone repository: ${err}`);
    return false;
  }
}

async function installDeps(): Promise<boolean> {
  info('Installing dependencies...');
  try {
    const result = await $`cd ${MATRIX_DIR} && bun install`.quiet();
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
    // This will create the database and run schema
    const db = getDb();
    success('Database initialized');
    return true;
  } catch (err) {
    error(`Failed to initialize database: ${err}`);
    return false;
  }
}

async function registerMcp(): Promise<boolean> {
  info('Registering MCP server with Claude Code...');

  const hasClaudeCli = await checkClaudeCli();
  if (!hasClaudeCli) {
    warn('Claude CLI not found - skipping MCP registration');
    console.log(dim('Install Claude Code and run manually:'));
    console.log(dim(`  claude mcp add matrix -s user -- bun run ${MATRIX_DIR}/src/index.ts`));
    return true; // Not a failure, just skip
  }

  try {
    // Check if already registered
    const listResult = await $`claude mcp list`.quiet();
    if (listResult.text().includes('matrix')) {
      success('MCP server already registered');
      return true;
    }

    // Register
    await $`claude mcp add matrix -s user -- bun run ${MATRIX_DIR}/src/index.ts`.quiet();
    success('MCP server registered');
    return true;
  } catch (err) {
    warn(`MCP registration had issues: ${err}`);
    console.log(dim('You may need to register manually:'));
    console.log(dim(`  claude mcp add matrix -s user -- bun run ${MATRIX_DIR}/src/index.ts`));
    return true; // Continue anyway
  }
}

async function setupClaudeMd(): Promise<boolean> {
  info('Setting up CLAUDE.md template...');

  if (!existsSync(TEMPLATE_PATH)) {
    warn('Template file not found, skipping');
    return true;
  }

  const template = await Bun.file(TEMPLATE_PATH).text();

  // Check if CLAUDE.md exists
  if (existsSync(CLAUDE_MD_PATH)) {
    const existing = await Bun.file(CLAUDE_MD_PATH).text();

    // Check if Matrix section already exists
    if (existing.includes('Matrix Memory System')) {
      success('CLAUDE.md already contains Matrix instructions');
      return true;
    }

    // Append to existing file
    const updated = existing + '\n\n' + template;
    await Bun.write(CLAUDE_MD_PATH, updated);
    success('Matrix instructions appended to CLAUDE.md');
  } else {
    // Create new file
    await Bun.write(CLAUDE_MD_PATH, template);
    success('CLAUDE.md created with Matrix instructions');
  }

  return true;
}

export async function init(args: string[]): Promise<void> {
  const options = parseArgs(args);

  console.log(`\n${bold('Matrix Memory System')} ${dim('- Setup')}\n`);
  console.log(dim('This will configure Matrix for Claude Code.\n'));

  const steps: Array<{ name: string; fn: () => Promise<boolean> | boolean; skip?: boolean }> = [
    { name: 'Check Bun installation', fn: checkBun },
    { name: 'Setup Matrix directory', fn: setupDirectory },
    { name: 'Install dependencies', fn: installDeps },
    { name: 'Initialize database', fn: initDatabase },
    { name: 'Register MCP server', fn: registerMcp, skip: options.skipMcp },
    { name: 'Setup CLAUDE.md template', fn: setupClaudeMd, skip: options.skipClaudeMd },
  ];

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

  if (failed) {
    console.log(yellow('\nSetup completed with warnings.'));
  } else {
    console.log(green('\n✓ Matrix initialized successfully!\n'));
  }

  console.log(bold('Next steps:'));
  console.log(`  ${cyan('1.')} Restart Claude Code (or open a new terminal)`);
  console.log(`  ${cyan('2.')} Ask Claude to solve a complex problem`);
  console.log(`  ${cyan('3.')} Watch Matrix learn from your solutions`);

  console.log(`\n${bold('Quick test:')}`);
  console.log(dim('  matrix stats'));
  console.log(dim('  matrix search "authentication"\n'));
}
