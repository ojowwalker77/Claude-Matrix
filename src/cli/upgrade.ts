import { spawn } from 'bun';
import { join } from 'path';
import { bold, dim, green, yellow, cyan, error, success, info } from './utils/output.js';
import { checkForUpdates } from './update-check.js';
import { runMigrations, getSchemaVersion } from '../db/migrate.js';

async function getLocalVersion(): Promise<string> {
  try {
    const pkgPath = new URL('../../package.json', import.meta.url).pathname;
    const pkg = await Bun.file(pkgPath).json();
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function isHomebrew(): Promise<boolean> {
  try {
    const proc = spawn(['which', 'matrix'], { stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(proc.stdout).text();
    return output.includes('/Cellar/') || output.includes('/homebrew/') || output.includes('/linuxbrew/');
  } catch {
    return false;
  }
}


function getMatrixDir(): string {
  if (process.env['MATRIX_DIR']) {
    return process.env['MATRIX_DIR'];
  }
  return join(process.env['HOME'] || '~', '.claude', 'matrix');
}

async function runCommand(cmd: string[], cwd?: string): Promise<{ success: boolean; output: string }> {
  try {
    const proc = spawn(cmd, {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd,
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { success: exitCode === 0, output };
  } catch (err) {
    return { success: false, output: String(err) };
  }
}

export async function upgrade(args: string[]): Promise<void> {
  const checkOnly = args.includes('--check') || args.includes('-c');
  const currentVersion = await getLocalVersion();

  console.log(`${bold('Claude Matrix')} ${dim(`v${currentVersion}`)}`);
  console.log('');

  // Check for updates
  info('Checking for updates...');
  const updateInfo = await checkForUpdates();

  if (!updateInfo?.updateAvailable) {
    success(`You're already on the latest version (${currentVersion})`);
    return;
  }

  console.log('');
  console.log(`  ${dim('Current:')} ${yellow(updateInfo.currentVersion)}`);
  console.log(`  ${dim('Latest:')}  ${green(updateInfo.latestVersion)}`);
  console.log('');

  if (checkOnly) {
    info('Run `matrix upgrade` to install the update.');
    return;
  }

  // Detect installation method and upgrade accordingly
  const homebrew = await isHomebrew();

  if (homebrew) {
    info('Detected Homebrew installation. Upgrading...');
    console.log('');
    console.log(dim('  $ brew update && brew upgrade matrix'));
    console.log('');

    const updateResult = await runCommand(['brew', 'update']);
    if (!updateResult.success) {
      error('Failed to update Homebrew');
      console.log(dim(updateResult.output));
      return;
    }

    const upgradeResult = await runCommand(['brew', 'upgrade', 'matrix']);
    if (!upgradeResult.success) {
      error('Failed to upgrade matrix');
      console.log(dim(upgradeResult.output));
      return;
    }

    success(`Upgraded to v${updateInfo.latestVersion}`);
  } else {
    // Manual/git installation
    const matrixDir = getMatrixDir();
    info(`Detected manual installation at ${cyan(matrixDir)}`);
    console.log('');
    console.log(dim('  $ git pull && bun install'));
    console.log('');

    const pullResult = await runCommand(['git', 'pull'], matrixDir);
    if (!pullResult.success) {
      error('Failed to pull latest changes');
      console.log(dim(pullResult.output));
      return;
    }

    const installResult = await runCommand(['bun', 'install'], matrixDir);
    if (!installResult.success) {
      error('Failed to install dependencies');
      console.log(dim(installResult.output));
      return;
    }

    success(`Upgraded to v${updateInfo.latestVersion}`);
  }

  // Run database migrations
  console.log('');
  info('Checking database migrations...');
  const migrationResult = runMigrations();

  if (!migrationResult.success) {
    error(`Migration failed: ${migrationResult.error}`);
    return;
  }

  if (migrationResult.migrationsRun > 0) {
    success(`Applied ${migrationResult.migrationsRun} migration(s) (v${migrationResult.fromVersion} → v${migrationResult.toVersion})`);
  } else {
    success('Database schema is up to date');
  }

  console.log('');
  info('Restart any running Matrix MCP servers to use the new version.');
}
