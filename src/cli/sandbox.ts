/**
 * Matrix Sandbox - Test installations in Daytona sandboxes
 *
 * Uses Daytona's isolated environments to test Matrix installation
 * without affecting local system.
 */

import { Daytona } from '@daytonaio/sdk';
import { get, set } from '../config/index.js';
import {
  success, error, warn, info, dim, cyan, green, yellow, red, bold, muted,
  printBox
} from './utils/output.js';

const INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/main/install.sh';
const INSTALL_SCRIPT_BRANCH_URL = (branch: string) =>
  `https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/${branch}/install.sh`;

interface SandboxResult {
  success: boolean;
  logs: string[];
  installOutput: string;
  verifyOutput: string;
  errors: string[];
}

function getApiKey(): string | null {
  // Priority: env var > config
  return process.env['DAYTONA_API_KEY'] || get<string>('daytona.apiKey') || null;
}

async function createDaytona(): Promise<Daytona | null> {
  const apiKey = getApiKey();

  if (!apiKey) {
    error('Daytona API key not configured');
    console.log();
    console.log('  Set it via:');
    console.log(`    ${cyan('matrix config set daytona.apiKey <your-key>')}`);
    console.log('  Or environment variable:');
    console.log(`    ${cyan('export DAYTONA_API_KEY=<your-key>')}`);
    console.log();
    return null;
  }

  return new Daytona({
    apiKey,
    apiUrl: 'https://app.daytona.io/api',
    target: 'us'
  });
}

async function testInstallation(branch?: string): Promise<SandboxResult> {
  const result: SandboxResult = {
    success: false,
    logs: [],
    installOutput: '',
    verifyOutput: '',
    errors: []
  };

  const daytona = await createDaytona();
  if (!daytona) {
    result.errors.push('Failed to initialize Daytona client');
    return result;
  }

  let sandbox;

  try {
    info('Creating sandbox...');
    result.logs.push('Creating Daytona sandbox');

    sandbox = await daytona.create({
      language: 'typescript',
      envVars: {
        MATRIX_SKIP_INIT: '0',
        HOME: '/home/daytona'
      }
    });

    result.logs.push(`Sandbox created: ${sandbox.id}`);
    success(`Sandbox ready (${sandbox.id})`);

    // Install dependencies (curl, git, nodejs, npm)
    info('Installing system dependencies...');
    const depsResult = await sandbox.process.executeCommand(
      'apt-get update && apt-get install -y curl git nodejs npm wget',
      undefined, {}, 120
    );
    result.logs.push('Installed curl, git, nodejs, npm, wget');

    // Install bun - try multiple methods
    info('Installing Bun...');

    // Method 1: Try npm (most reliable in containers)
    let bunResult = await sandbox.process.executeCommand(
      'npm install -g bun && bun --version',
      undefined, {}, 60
    );

    // Method 2: If npm fails, try curl
    if (bunResult.exitCode !== 0) {
      result.logs.push('npm install failed, trying curl...');
      bunResult = await sandbox.process.executeCommand(
        'curl -fsSL https://bun.sh/install | bash && export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH" && bun --version',
        undefined, {}, 60
      );
    }

    // Method 3: Try wget if curl failed
    if (bunResult.exitCode !== 0) {
      result.logs.push('curl failed, trying wget...');
      bunResult = await sandbox.process.executeCommand(
        'wget -qO- https://bun.sh/install | bash && export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH" && bun --version',
        undefined, {}, 60
      );
    }

    result.logs.push(`Bun install: ${bunResult.result?.trim() || 'unknown'}`);

    if (bunResult.exitCode !== 0) {
      result.errors.push(`Bun installation failed: ${bunResult.result}`);
      return result;
    }
    success('Bun installed');

    // Run Matrix installer
    const scriptUrl = branch ? INSTALL_SCRIPT_BRANCH_URL(branch) : INSTALL_SCRIPT_URL;
    info(`Running Matrix installer${branch ? ` (branch: ${branch})` : ''}...`);

    const installResult = await sandbox.process.executeCommand(
      `export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH" && curl -fsSL ${scriptUrl} | bash`,
      undefined, {}, 120
    );

    result.installOutput = installResult.result || '';
    result.logs.push('Installation script completed');

    if (installResult.exitCode !== 0) {
      result.errors.push(`Installation failed with exit code ${installResult.exitCode}`);
      error('Installation failed');
      console.log(dim(result.installOutput));
      return result;
    }
    success('Installation completed');

    // Run matrix verify
    info('Running verification...');
    const verifyResult = await sandbox.process.executeCommand(
      'export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH" && export PATH="$HOME/.local/bin:$PATH" && matrix verify',
      undefined, {}, 30
    );

    result.verifyOutput = verifyResult.result || '';
    result.logs.push('Verification completed');

    if (verifyResult.exitCode === 0) {
      result.success = true;
      success('All verification checks passed');
    } else {
      result.errors.push('Verification failed');
      warn('Verification found issues');
    }

    // Show verification output
    console.log();
    console.log(bold('Verification Output:'));
    console.log(result.verifyOutput);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    error(`Sandbox error: ${msg}`);
  } finally {
    // Cleanup sandbox
    if (sandbox) {
      info('Cleaning up sandbox...');
      try {
        await sandbox.stop();
        result.logs.push('Sandbox stopped');
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return result;
}

async function setApiKey(key: string): Promise<void> {
  set('daytona.apiKey', key);
  success('Daytona API key saved');
  console.log(muted('  Key stored in Matrix config'));
}

function showHelp(): void {
  console.log();
  printBox('Matrix Sandbox - Test installations in isolated environments', [], 70);
  console.log();
  console.log('  Commands:');
  console.log();
  console.log(`    ${cyan('matrix sandbox test')} [--branch <name>]`);
  console.log(muted('      Run installation test in a fresh Daytona sandbox'));
  console.log();
  console.log(`    ${cyan('matrix sandbox set-key')} <api-key>`);
  console.log(muted('      Store Daytona API key in Matrix config'));
  console.log();
  console.log(`    ${cyan('matrix sandbox status')}`);
  console.log(muted('      Check Daytona configuration status'));
  console.log();
  console.log('  Options:');
  console.log();
  console.log(`    ${cyan('--branch, -b')} <name>    Test specific branch instead of main`);
  console.log();
  console.log('  Environment:');
  console.log();
  console.log(`    ${cyan('DAYTONA_API_KEY')}        API key (overrides config)`);
  console.log();
}

async function showStatus(): Promise<void> {
  console.log();
  printBox('Daytona Sandbox Status', [], 50);
  console.log();

  const apiKey = getApiKey();

  if (apiKey) {
    const masked = apiKey.slice(0, 8) + '...' + apiKey.slice(-4);
    console.log(`  API Key: ${green('configured')} (${masked})`);

    // Test connection
    try {
      const daytona = await createDaytona();
      if (daytona) {
        console.log(`  Status:  ${green('ready')}`);
      }
    } catch {
      console.log(`  Status:  ${red('connection failed')}`);
    }
  } else {
    console.log(`  API Key: ${yellow('not configured')}`);
    console.log();
    console.log(muted('  Run: matrix sandbox set-key <your-api-key>'));
  }

  console.log();
}

export async function sandbox(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'test': {
      // Parse --branch flag
      let branch: string | undefined;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--branch' || args[i] === '-b') {
          branch = args[++i];
        }
      }

      console.log();
      printBox('Matrix Installation Test', [], 50);
      console.log();

      const result = await testInstallation(branch);

      console.log();
      if (result.success) {
        console.log(green('━'.repeat(50)));
        success('Installation test PASSED');
        console.log(green('━'.repeat(50)));
      } else {
        console.log(red('━'.repeat(50)));
        error('Installation test FAILED');
        if (result.errors.length > 0) {
          console.log();
          console.log(bold('Errors:'));
          for (const err of result.errors) {
            console.log(`  ${red('•')} ${err}`);
          }
        }
        console.log(red('━'.repeat(50)));
        process.exit(1);
      }
      console.log();
      break;
    }

    case 'set-key': {
      const key = args[1];
      if (!key) {
        error('Usage: matrix sandbox set-key <api-key>');
        return;
      }
      await setApiKey(key);
      break;
    }

    case 'status':
      await showStatus();
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      if (args.includes('--help') || args.includes('-h')) {
        showHelp();
      } else if (!subcommand) {
        await showStatus();
      } else {
        error(`Unknown subcommand: ${subcommand}`);
        showHelp();
      }
  }
}
