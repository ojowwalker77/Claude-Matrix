/**
 * Hooks System Checks
 *
 * - Hooks Installation
 * - Subagent Hooks Config
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getConfig, saveConfig, clearCache } from '../../../config/index.js';
import type { DiagnosticCheck } from '../types.js';

const MATRIX_DIR = join(homedir(), '.claude', 'matrix');

/**
 * Check hooks installation
 */
export function checkHooks(): DiagnosticCheck {
  const hooksDir = join(MATRIX_DIR, '..', 'plugins', 'marketplaces', 'matrix-marketplace', 'hooks');

  if (!existsSync(hooksDir)) {
    return {
      name: 'Hooks',
      status: 'warn',
      message: 'Hooks directory not found (may be in different location)',
      autoFixable: false,
    };
  }

  try {
    const files = readdirSync(hooksDir);
    const hasHooksJson = files.includes('hooks.json');

    if (!hasHooksJson) {
      return {
        name: 'Hooks',
        status: 'warn',
        message: 'hooks.json not found',
        autoFixable: false,
      };
    }

    return {
      name: 'Hooks',
      status: 'pass',
      message: 'Installed at ' + hooksDir,
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Hooks',
      status: 'warn',
      message: 'Cannot check hooks: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: false,
    };
  }
}

/**
 * Check subagent hooks configuration (SubagentStart, SubagentStop)
 */
export function checkSubagentHooks(): DiagnosticCheck {
  try {
    const config = getConfig();

    if (!config.toolSearch) {
      return {
        name: 'Subagent Hooks',
        status: 'warn',
        message: 'toolSearch config missing',
        autoFixable: true,
        fixAction: 'Add toolSearch config section',
      };
    }

    const hasMatrixIndex = config.toolSearch.preferMatrixIndex !== undefined;
    const hasContext7 = config.toolSearch.preferContext7 !== undefined;

    if (!hasMatrixIndex || !hasContext7) {
      return {
        name: 'Subagent Hooks',
        status: 'warn',
        message: 'Subagent preferences not configured',
        autoFixable: true,
        fixAction: 'Add subagent hook preferences',
      };
    }

    return {
      name: 'Subagent Hooks',
      status: 'pass',
      message: 'Configured (matrixIndex: ' + config.toolSearch.preferMatrixIndex + ', context7: ' + config.toolSearch.preferContext7 + ')',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Subagent Hooks',
      status: 'warn',
      message: 'Check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Repair configuration',
    };
  }
}

/**
 * Check model delegation configuration
 */
export function checkDelegation(): DiagnosticCheck {
  try {
    const config = getConfig();

    if (!config.delegation) {
      return {
        name: 'Model Delegation',
        status: 'warn',
        message: 'delegation config section missing',
        autoFixable: true,
        fixAction: 'Add delegation config section',
      };
    }

    if (config.delegation.enabled === undefined) {
      return {
        name: 'Model Delegation',
        status: 'warn',
        message: 'delegation.enabled not set',
        autoFixable: true,
        fixAction: 'Add delegation.enabled setting',
      };
    }

    const model = config.delegation.model || 'haiku';
    return {
      name: 'Model Delegation',
      status: 'pass',
      message: config.delegation.enabled ? 'Enabled (' + model + ')' : 'Disabled',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Model Delegation',
      status: 'warn',
      message: 'Check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Repair configuration',
    };
  }
}

/**
 * Auto-fix hooks checks
 */
export async function fixHooksCheck(check: DiagnosticCheck): Promise<DiagnosticCheck> {
  try {
    switch (check.name) {
      case 'Subagent Hooks':
      case 'Model Delegation': {
        clearCache();
        const configToFix = getConfig();
        saveConfig(configToFix);
        return { ...check, status: 'pass', fixed: true, message: 'Config updated with defaults' };
      }

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
