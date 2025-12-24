/**
 * Matrix Sandbox - Test installations in Docker containers
 *
 * Uses local Docker to test Matrix installation in a fresh Linux environment.
 * No cloud dependencies, no API keys required.
 */

import { $ } from 'bun';
import {
  success, error, warn, info, dim, cyan, green, yellow, red, bold, muted,
  printBox
} from './utils/output.js';

const INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/main/install.sh';
const INSTALL_SCRIPT_BRANCH_URL = (branch: string) =>
  `https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/${branch}/install.sh`;

const DOCKER_IMAGE = 'ubuntu:22.04';

interface TestResult {
  success: boolean;
  output: string;
  exitCode: number;
  stage: string;
}

async function checkDocker(): Promise<boolean> {
  try {
    const result = await $`docker info`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function pullImage(): Promise<boolean> {
  try {
    info(`Pulling ${DOCKER_IMAGE}...`);
    const result = await $`docker pull ${DOCKER_IMAGE}`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function testInstallation(branch?: string): Promise<TestResult> {
  const scriptUrl = branch ? INSTALL_SCRIPT_BRANCH_URL(branch) : INSTALL_SCRIPT_URL;

  // Build the test script
  const testScript = `
set -e

echo "=== Installing dependencies ==="
apt-get update -qq
apt-get install -y -qq curl git > /dev/null

echo "=== Installing Bun ==="
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun --version

echo "=== Running Matrix installer ==="
export MATRIX_SKIP_INIT=1
curl -fsSL ${scriptUrl} | bash

echo "=== Checking Matrix CLI ==="
export PATH="$HOME/.local/bin:$PATH"
matrix version

echo "=== Running verification ==="
matrix verify --quiet || true

echo "=== SUCCESS ==="
`;

  try {
    info('Running installation test in Docker...');

    const result = await $`docker run --rm ${DOCKER_IMAGE} bash -c ${testScript}`;

    return {
      success: result.exitCode === 0,
      output: result.text(),
      exitCode: result.exitCode,
      stage: 'complete'
    };
  } catch (err) {
    const output = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output,
      exitCode: 1,
      stage: 'docker-run'
    };
  }
}

async function runTest(branch?: string): Promise<void> {
  console.log();
  printBox('Matrix Installation Test (Docker)', [], 50);
  console.log();

  // Check Docker
  info('Checking Docker...');
  if (!await checkDocker()) {
    error('Docker is not running');
    console.log();
    console.log(muted('  Start Docker Desktop and try again'));
    console.log(muted('  Or install Docker: https://docs.docker.com/get-docker/'));
    console.log();
    process.exit(1);
  }
  success('Docker is running');

  // Pull image
  if (!await pullImage()) {
    error(`Failed to pull ${DOCKER_IMAGE}`);
    process.exit(1);
  }
  success(`Image ready: ${DOCKER_IMAGE}`);

  // Run test
  console.log();
  info(`Testing installation${branch ? ` (branch: ${branch})` : ' (main branch)'}...`);
  console.log();

  const result = await testInstallation(branch);

  // Show output
  console.log(dim('─'.repeat(50)));
  console.log(result.output);
  console.log(dim('─'.repeat(50)));
  console.log();

  // Result
  if (result.success && result.output.includes('=== SUCCESS ===')) {
    console.log(green('━'.repeat(50)));
    success('Installation test PASSED');
    console.log(green('━'.repeat(50)));
  } else {
    console.log(red('━'.repeat(50)));
    error(`Installation test FAILED (stage: ${result.stage})`);
    console.log(red('━'.repeat(50)));
    process.exit(1);
  }
  console.log();
}

async function showStatus(): Promise<void> {
  console.log();
  printBox('Docker Sandbox Status', [], 50);
  console.log();

  const dockerRunning = await checkDocker();

  if (dockerRunning) {
    console.log(`  Docker: ${green('running')}`);
    console.log(`  Image:  ${cyan(DOCKER_IMAGE)}`);
    console.log();
    console.log(muted('  Run: matrix sandbox test'));
  } else {
    console.log(`  Docker: ${red('not running')}`);
    console.log();
    console.log(muted('  Start Docker Desktop to use sandbox testing'));
  }

  console.log();
}

function showHelp(): void {
  console.log();
  printBox('Matrix Sandbox - Test installations in Docker', [], 60);
  console.log();
  console.log('  Commands:');
  console.log();
  console.log(`    ${cyan('matrix sandbox test')} [--branch <name>]`);
  console.log(muted('      Run installation test in a fresh Docker container'));
  console.log();
  console.log(`    ${cyan('matrix sandbox status')}`);
  console.log(muted('      Check if Docker is available'));
  console.log();
  console.log('  Options:');
  console.log();
  console.log(`    ${cyan('--branch, -b')} <name>    Test specific branch instead of main`);
  console.log();
  console.log('  Requirements:');
  console.log();
  console.log(`    ${cyan('Docker Desktop')}        Must be installed and running`);
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
      await runTest(branch);
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
