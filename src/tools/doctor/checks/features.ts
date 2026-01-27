/**
 * Feature Checks
 *
 * - Code Index
 * - Repo Detection
 * - Skills Directory
 * - File Suggestion
 */

import { existsSync, statSync, readdirSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { fingerprintRepo } from '../../../repo/index.js';
import { matrixIndexStatus, matrixReindex } from '../../index-tools.js';
import {
  FILE_SUGGESTION_PATH,
  SETTINGS_PATH,
  installFileSuggestion,
} from '../../../utils/file-suggestion.js';
import type { DiagnosticCheck } from '../types.js';

const CLAUDE_DIR = join(homedir(), '.claude');
const SKILLS_DIR = join(CLAUDE_DIR, 'skills');

/**
 * Check code index status
 */
export function checkIndex(): DiagnosticCheck {
  try {
    const status = matrixIndexStatus();

    if (!status.indexed) {
      return {
        name: 'Code Index',
        status: 'warn',
        message: 'Repository not indexed',
        autoFixable: true,
        fixAction: 'Index repository',
      };
    }

    return {
      name: 'Code Index',
      status: 'pass',
      message: (status.status?.symbolCount ?? 0) + ' symbols in ' + (status.status?.filesIndexed ?? 0) + ' files',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Code Index',
      status: 'warn',
      message: 'Index check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Rebuild index',
    };
  }
}

/**
 * Check repo fingerprinting
 */
export function checkRepoDetection(): DiagnosticCheck {
  try {
    const detected = fingerprintRepo();

    if (!detected.name || detected.name === 'unknown') {
      return {
        name: 'Repo Detection',
        status: 'warn',
        message: 'Could not detect repository',
        autoFixable: false,
      };
    }

    return {
      name: 'Repo Detection',
      status: 'pass',
      message: detected.name + ' (' + detected.languages.join(', ') + ')',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Repo Detection',
      status: 'warn',
      message: 'Detection failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: false,
    };
  }
}

/**
 * Check skills directory exists (v2.0+ feature)
 */
export function checkSkillsDirectory(): DiagnosticCheck {
  if (!existsSync(SKILLS_DIR)) {
    return {
      name: 'Skills Directory',
      status: 'warn',
      message: 'Skills directory not found: ' + SKILLS_DIR,
      autoFixable: true,
      fixAction: 'Create skills directory',
    };
  }

  try {
    const stat = statSync(SKILLS_DIR);
    if (!stat.isDirectory()) {
      return {
        name: 'Skills Directory',
        status: 'fail',
        message: SKILLS_DIR + ' exists but is not a directory',
        autoFixable: false,
      };
    }

    const files = readdirSync(SKILLS_DIR);
    const skillDirs = files.filter(f => {
      const skillPath = join(SKILLS_DIR, f);
      return statSync(skillPath).isDirectory() && existsSync(join(skillPath, 'SKILL.md'));
    });

    return {
      name: 'Skills Directory',
      status: 'pass',
      message: skillDirs.length + ' skills installed',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Skills Directory',
      status: 'warn',
      message: 'Cannot check skills: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: false,
    };
  }
}

/**
 * Check file-suggestion.sh installation
 */
export function checkFileSuggestion(): DiagnosticCheck {
  if (!existsSync(FILE_SUGGESTION_PATH)) {
    return {
      name: 'File Suggestion',
      status: 'warn',
      message: 'file-suggestion.sh not installed',
      autoFixable: true,
      fixAction: 'Install file-suggestion.sh',
    };
  }

  try {
    if (existsSync(SETTINGS_PATH)) {
      const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      if (!settings.fileSuggestion) {
        return {
          name: 'File Suggestion',
          status: 'warn',
          message: 'Script exists but not configured in settings.json',
          autoFixable: true,
          fixAction: 'Configure in settings.json',
        };
      }
    }
  } catch {
    // Ignore settings.json parse errors
  }

  const checkCommand = (cmd: string): boolean => {
    const result = spawnSync('which', [cmd], { encoding: 'utf-8' });
    return result.status === 0;
  };

  const hasRg = checkCommand('rg');
  const hasFzf = checkCommand('fzf');
  const hasJq = checkCommand('jq');

  if (!hasRg || !hasFzf || !hasJq) {
    const missing: string[] = [];
    if (!hasRg) missing.push('rg');
    if (!hasFzf) missing.push('fzf');
    if (!hasJq) missing.push('jq');
    return {
      name: 'File Suggestion',
      status: 'warn',
      message: 'Script installed but missing: ' + missing.join(', ') + ' (brew install ' + missing.join(' ') + ')',
      autoFixable: false,
    };
  }

  return {
    name: 'File Suggestion',
    status: 'pass',
    message: 'Installed and configured',
    autoFixable: false,
  };
}

/**
 * Auto-fix feature checks
 */
export async function fixFeatureCheck(check: DiagnosticCheck): Promise<DiagnosticCheck> {
  try {
    switch (check.name) {
      case 'Code Index':
        await matrixReindex({ full: true });
        return { ...check, status: 'pass', fixed: true, message: 'Index rebuilt' };

      case 'Skills Directory':
        mkdirSync(SKILLS_DIR, { recursive: true });
        return { ...check, status: 'pass', fixed: true, message: 'Skills directory created' };

      case 'File Suggestion':
        installFileSuggestion();
        return { ...check, status: 'pass', fixed: true, message: 'Script installed and configured' };

      default:
        return check;
    }
  } catch (err) {
    return {
      ...check,
      fixed: false,
      message: 'Auto-fix failed: ' + (err instanceof Error ? err.message : 'Unknown'),
    };
  }
}
