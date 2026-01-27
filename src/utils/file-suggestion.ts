/**
 * File Suggestion Script
 *
 * Shared script content used by both session-start.ts and doctor.ts
 * for Claude Code's custom file suggestion feature.
 */

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLAUDE_DIR = join(homedir(), '.claude');
export const FILE_SUGGESTION_PATH = join(CLAUDE_DIR, 'file-suggestion.sh');
export const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');

/**
 * Custom file suggestion script for Claude Code (installed by Matrix)
 * Uses rg + fzf for fuzzy matching and symlink support
 * Prerequisites: brew install ripgrep jq fzf
 */
export const FILE_SUGGESTION_SCRIPT = `#!/bin/bash
# Custom file suggestion script for Claude Code (installed by Matrix)
# Uses rg + fzf for fuzzy matching and symlink support
# Prerequisites: brew install ripgrep jq fzf

QUERY=$(jq -r '.query // ""')
PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR" || exit 1
rg --files --follow --hidden . 2>/dev/null | sort -u | fzf --filter "$QUERY" | head -15
`;

/**
 * Install file-suggestion.sh and optionally update settings.json
 * Returns true if any changes were made
 */
export function installFileSuggestion(updateSettings = true): boolean {
  let changed = false;

  try {
    // Install the script if not present
    if (!existsSync(FILE_SUGGESTION_PATH)) {
      writeFileSync(FILE_SUGGESTION_PATH, FILE_SUGGESTION_SCRIPT, { mode: 0o755 });
      changed = true;
    }

    if (!updateSettings) {
      return changed;
    }

    // Update settings.json to use it
    let settings: Record<string, unknown> = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      } catch {
        // Invalid JSON, start fresh
        settings = {};
      }
    }

    // Add fileSuggestion if not configured (respects explicit null/false)
    if (!('fileSuggestion' in settings)) {
      settings.fileSuggestion = {
        type: 'command',
        command: '~/.claude/file-suggestion.sh',
      };
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
      changed = true;
    }

    return changed;
  } catch {
    return false;
  }
}
