import { bold, dim, green, yellow, error, success, info } from './utils/output.js';
import { runMigrations, getSchemaVersion } from '../db/migrate.js';

export async function migrate(args: string[]): Promise<void> {
  const checkOnly = args.includes('--check') || args.includes('-c');

  console.log(`${bold('Database Migration')}`);
  console.log('');

  const { current, latest } = getSchemaVersion();

  console.log(`  ${dim('Current schema:')} v${current}`);
  console.log(`  ${dim('Latest schema:')}  v${latest}`);
  console.log('');

  if (current >= latest) {
    success('Database schema is up to date');
    return;
  }

  if (checkOnly) {
    info(`${latest - current} migration(s) pending. Run \`matrix migrate\` to apply.`);
    return;
  }

  info('Running migrations...');
  const result = runMigrations();

  if (!result.success) {
    error(`Migration failed: ${result.error}`);
    process.exit(1);
  }

  if (result.migrationsRun > 0) {
    success(`Applied ${result.migrationsRun} migration(s) (v${result.fromVersion} → v${result.toVersion})`);
  } else {
    success('No migrations needed');
  }
}
