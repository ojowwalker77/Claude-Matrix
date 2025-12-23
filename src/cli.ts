#!/usr/bin/env bun

import { runCli } from './cli/index.js';
import { checkForUpdates, printUpdateNotification } from './cli/update-check.js';

// Commands that should skip update check (silent/quick commands)
const SKIP_UPDATE_CHECK = ['version', '--version', '-v', 'help', '--help', '-h'];

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const command = args[0];

  // Run the CLI command
  await runCli(args);

  // Check for updates after command completes (non-blocking for user)
  // Skip for version/help commands and when running in CI
  if (!SKIP_UPDATE_CHECK.includes(command) && !process.env['CI']) {
    const updateInfo = await checkForUpdates();
    if (updateInfo?.updateAvailable) {
      printUpdateNotification(updateInfo);
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
