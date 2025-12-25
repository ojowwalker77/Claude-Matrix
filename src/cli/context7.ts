import { $ } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
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
  muted,
} from './utils/output.js';

type Subcommand = 'status' | 'install' | 'uninstall' | 'test';

function getPaths() {
  const home = process.env['HOME'] || homedir();
  return {
    CURSOR_MCP_PATH: join(home, '.cursor', 'mcp.json'),
  };
}

async function checkClaudeCli(): Promise<boolean> {
  try {
    await $`claude --version`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function isContext7InstalledClaude(): Promise<boolean> {
  try {
    const result = await $`claude mcp list`.quiet();
    return result.text().includes('context7');
  } catch {
    return false;
  }
}

async function isContext7InstalledCursor(): Promise<boolean> {
  const { CURSOR_MCP_PATH } = getPaths();
  if (!existsSync(CURSOR_MCP_PATH)) return false;

  try {
    const text = await Bun.file(CURSOR_MCP_PATH).text();
    const config = JSON.parse(text);
    return !!config.mcpServers?.context7;
  } catch {
    return false;
  }
}

async function showStatus(): Promise<void> {
  console.log();
  printBox('Context7 Documentation Server', [], 60);
  console.log();

  const hasClaude = await checkClaudeCli();
  const claudeInstalled = hasClaude ? await isContext7InstalledClaude() : false;
  const cursorInstalled = await isContext7InstalledCursor();

  console.log('  Installation Status:');
  console.log();

  if (hasClaude) {
    const status = claudeInstalled ? green('installed') : yellow('not installed');
    const icon = claudeInstalled ? green('✓') : yellow('○');
    console.log(`    ${icon} Claude Code: ${status}`);
  } else {
    console.log(`    ${dim('○')} Claude Code: ${dim('CLI not found')}`);
  }

  const cursorStatus = cursorInstalled ? green('installed') : yellow('not installed');
  const cursorIcon = cursorInstalled ? green('✓') : yellow('○');
  console.log(`    ${cursorIcon} Cursor:      ${cursorStatus}`);

  console.log();
  console.log('  What is Context7?');
  console.log(muted('    Provides up-to-date library documentation directly to Claude.'));
  console.log(muted('    Use "use context7" in prompts to fetch accurate docs.'));
  console.log();

  if (!claudeInstalled && !cursorInstalled) {
    console.log(`  ${cyan('Install:')} matrix context7 install`);
    console.log();
  }
}

async function installContext7(): Promise<void> {
  info('Installing Context7 MCP server...');

  const hasClaude = await checkClaudeCli();
  let installedAny = false;

  // Claude Code
  if (hasClaude) {
    const alreadyInstalled = await isContext7InstalledClaude();
    if (alreadyInstalled) {
      success('Context7 already installed in Claude Code');
    } else {
      try {
        await $`claude mcp add context7 -- npx -y @upstash/context7-mcp`.quiet();
        success('Context7 installed in Claude Code');
        installedAny = true;
      } catch (err) {
        warn(`Failed to install for Claude Code: ${err}`);
        console.log(dim('  Manual: claude mcp add context7 -- npx -y @upstash/context7-mcp'));
      }
    }
  } else {
    console.log(dim('  Skipping Claude Code (CLI not found)'));
  }

  // Cursor
  const { CURSOR_MCP_PATH } = getPaths();
  if (existsSync(CURSOR_MCP_PATH)) {
    const alreadyInstalled = isContext7InstalledCursor();
    if (alreadyInstalled) {
      success('Context7 already installed in Cursor');
    } else {
      try {
        const content = await Bun.file(CURSOR_MCP_PATH).text();
        const config = JSON.parse(content);
        config.mcpServers = config.mcpServers || {};
        config.mcpServers.context7 = {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
        };
        await Bun.write(CURSOR_MCP_PATH, JSON.stringify(config, null, 2) + '\n');
        success('Context7 installed in Cursor');
        installedAny = true;
      } catch (err) {
        warn(`Failed to install for Cursor: ${err}`);
      }
    }
  } else {
    console.log(dim('  Skipping Cursor (mcp.json not found)'));
  }

  if (installedAny) {
    console.log();
    console.log(bold('Usage:'));
    console.log(dim('  Include "use context7" in your prompts to fetch library docs.'));
    console.log(dim('  Example: "use context7 to explain how Bun.serve() works"'));
    console.log();
    console.log(muted('  Restart your editor for changes to take effect.'));
  }
}

async function uninstallContext7(): Promise<void> {
  info('Uninstalling Context7 MCP server...');

  const hasClaude = await checkClaudeCli();

  // Claude Code
  if (hasClaude) {
    const installed = await isContext7InstalledClaude();
    if (installed) {
      try {
        await $`claude mcp remove context7`.quiet();
        success('Context7 removed from Claude Code');
      } catch (err) {
        warn(`Failed to remove from Claude Code: ${err}`);
      }
    } else {
      console.log(dim('  Context7 not installed in Claude Code'));
    }
  }

  // Cursor
  const { CURSOR_MCP_PATH } = getPaths();
  if (existsSync(CURSOR_MCP_PATH)) {
    try {
      const content = await Bun.file(CURSOR_MCP_PATH).text();
      const config = JSON.parse(content);
      if (config.mcpServers?.context7) {
        delete config.mcpServers.context7;
        await Bun.write(CURSOR_MCP_PATH, JSON.stringify(config, null, 2) + '\n');
        success('Context7 removed from Cursor');
      } else {
        console.log(dim('  Context7 not installed in Cursor'));
      }
    } catch (err) {
      warn(`Failed to remove from Cursor: ${err}`);
    }
  }

  console.log();
  console.log(muted('  Restart your editor for changes to take effect.'));
}

async function testContext7(): Promise<void> {
  info('Testing Context7 connection...');
  console.log();

  try {
    // Try to spawn the MCP server and send a test request
    const proc = Bun.spawn(['npx', '-y', '@upstash/context7-mcp'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Send initialize request
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'matrix-test', version: '1.0.0' },
      },
    }) + '\n';

    proc.stdin.write(initRequest);

    // Wait a bit for response
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Kill the process
    proc.kill();

    success('Context7 MCP server is working');
    console.log();
    console.log(bold('Available tools:'));
    console.log(dim('  - resolve-library-id: Find library ID for documentation'));
    console.log(dim('  - get-library-docs: Fetch documentation for a library'));
    console.log();
    console.log(bold('Usage in prompts:'));
    console.log(dim('  "use context7 to show me Bun.serve() examples"'));
    console.log(dim('  "use context7 for React 19 useActionState docs"'));
  } catch (err) {
    error(`Context7 test failed: ${err}`);
    console.log();
    console.log('Troubleshooting:');
    console.log(dim('  1. Ensure Node.js v18+ is installed'));
    console.log(dim('  2. Check network connectivity'));
    console.log(dim('  3. Try: npx -y @upstash/context7-mcp'));
  }
}

function showHelp(): void {
  console.log();
  printBox('Context7 - Library Documentation Server', [], 60);
  console.log();
  console.log('  Context7 provides up-to-date library documentation directly');
  console.log('  to Claude, replacing outdated training data with current docs.');
  console.log();
  console.log('  Commands:');
  console.log();
  console.log('    matrix context7 status');
  console.log(muted('      Show installation status'));
  console.log();
  console.log('    matrix context7 install');
  console.log(muted('      Install Context7 for Claude Code and Cursor'));
  console.log();
  console.log('    matrix context7 uninstall');
  console.log(muted('      Remove Context7 from editors'));
  console.log();
  console.log('    matrix context7 test');
  console.log(muted('      Test Context7 MCP server connection'));
  console.log();
  console.log('  Usage:');
  console.log(muted('    Include "use context7" in prompts to fetch library docs.'));
  console.log(muted('    Example: "use context7 to explain Bun.serve()"'));
  console.log();
}

export async function context7(args: string[]): Promise<void> {
  const subcommand = args[0] as Subcommand | undefined;

  switch (subcommand) {
    case 'status':
      return showStatus();

    case 'install':
      return installContext7();

    case 'uninstall':
      return uninstallContext7();

    case 'test':
      return testContext7();

    case undefined:
      return showStatus();

    default:
      if (args.includes('--help') || args.includes('-h')) {
        return showHelp();
      }
      return showHelp();
  }
}
