#!/usr/bin/env bun
/**
 * PostToolUse:Bash Hook (Dependency Logger)
 *
 * Runs after Bash tool completes.
 * Logs successful package installations to the database for audit.
 *
 * Exit codes:
 *   0 = Success
 *   1 = Non-blocking error
 */

import {
  readStdin,
  hooksEnabled,
  parsePackageCommand,
  type PostToolUseInput,
} from './index.js';
import { getDb } from '../db/client.js';
import { fingerprintRepo, getOrCreateRepo } from '../repo/index.js';

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<PostToolUseInput>();

    // Only log successful executions
    const exitCode = input.tool_response?.exitCode;
    if (exitCode !== 0) {
      process.exit(0);
    }

    // Get command from tool input
    const command = input.tool_input.command as string | undefined;
    if (!command) {
      process.exit(0);
    }

    // Parse package command
    const parsed = parsePackageCommand(command);
    if (!parsed || parsed.packages.length === 0) {
      // Not a package install command
      process.exit(0);
    }

    // Get repo context
    const detected = fingerprintRepo(input.cwd);
    const repoId = await getOrCreateRepo(detected);

    // Log each package to the database
    const db = getDb();

    for (const packageName of parsed.packages) {
      // Extract version if present (e.g., "lodash@4.17.21" -> "4.17.21")
      let name = packageName;
      let version: string | null = null;

      const versionMatch = packageName.match(/^(.+)@([\d.]+.*)$/);
      if (versionMatch) {
        name = versionMatch[1]!;
        version = versionMatch[2]!;
      }

      db.query(`
        INSERT INTO dependency_installs
          (package_name, package_version, ecosystem, repo_id, command, session_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        name,
        version,
        parsed.ecosystem,
        repoId,
        command,
        input.session_id
      );
    }

    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(`[Matrix] Logger hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
