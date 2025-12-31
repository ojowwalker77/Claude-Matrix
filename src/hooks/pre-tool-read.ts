#!/usr/bin/env bun
/**
 * PreToolUse:Read Hook - Sensitive File Warning
 *
 * Warns when Claude attempts to read sensitive files:
 *   - .env files (all variations)
 *   - Private keys (.pem, .key, id_rsa)
 *   - Secret directories (secrets/, credentials/, .ssh/)
 *   - Cloud credentials (.aws/credentials, .gcloud/)
 *   - Password/token files
 *
 * Behavior modes:
 *   - 'ask': Prompt user for permission (default)
 *   - 'warn': Show warning but allow
 *   - 'block': Deny access
 *   - 'disabled': Skip check
 *
 * Exit codes:
 *   0 = Success (allows tool to proceed or outputs decision)
 *   1 = Non-blocking error
 *   2 = Blocking error (stops tool)
 */

import {
  readStdin,
  outputJson,
  hooksEnabled,
  type PreToolUseInput,
  type HookOutput,
} from './index.js';
import { getConfig, type SensitiveFilesConfig } from '../config/index.js';
import { matrixWarnCheck } from '../tools/warn.js';

// ═══════════════════════════════════════════════════════════════
// Sensitive File Patterns
// ═══════════════════════════════════════════════════════════════

interface PatternCategory {
  name: string;
  patterns: RegExp[];
  configKey: keyof SensitiveFilesConfig['patterns'];
}

const PATTERN_CATEGORIES: PatternCategory[] = [
  {
    name: 'Environment files',
    configKey: 'envFiles',
    patterns: [
      /\.env$/i,
      /\.env\.\w+$/i,
      /\.env\.local$/i,
      /\.env\.production$/i,
      /\.env\.development$/i,
    ],
  },
  {
    name: 'Keys & Certificates',
    configKey: 'keysAndCerts',
    patterns: [
      /\.pem$/i,
      /\.key$/i,
      /\.p12$/i,
      /\.pfx$/i,
      /\.crt$/i,
      /id_rsa/i,
      /id_ed25519/i,
      /id_ecdsa/i,
      /id_dsa/i,
      /\.ppk$/i,
    ],
  },
  {
    name: 'Secret directories',
    configKey: 'secretDirs',
    patterns: [
      /\/secrets?\//i,
      /\/credentials?\//i,
      /\/\.ssh\//i,
      /\/private\//i,
    ],
  },
  {
    name: 'Config files',
    configKey: 'configFiles',
    patterns: [
      /\/config\/production/i,
      /\.credentials$/i,
      /\.netrc$/i,
      /\.npmrc$/i,
      /\.pypirc$/i,
    ],
  },
  {
    name: 'Password/Token files',
    configKey: 'passwordFiles',
    patterns: [
      /passwords?\.[\w]+$/i,
      /tokens?\.[\w]+$/i,
      /api[_-]?keys?\.[\w]+$/i,
      /secrets?\.[\w]+$/i,
      /auth\.[\w]+$/i,
    ],
  },
  {
    name: 'Cloud credentials',
    configKey: 'cloudCredentials',
    patterns: [
      /\.aws\/credentials/i,
      /\.aws\/config/i,
      /\.gcloud\//i,
      /\.azure\//i,
      /\.kube\/config/i,
      /kubeconfig/i,
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// Detection Logic
// ═══════════════════════════════════════════════════════════════

interface DetectionResult {
  isSensitive: boolean;
  categoryName: string;
  matchedPattern?: string;
  isAllowListed: boolean;
}

/**
 * Check if a file path matches any sensitive patterns
 */
function detectSensitiveFile(
  filePath: string,
  config: SensitiveFilesConfig
): DetectionResult {
  // Check allow list first
  const fileName = filePath.split('/').pop() || '';
  if (config.allowList.some(allowed => {
    if (allowed.includes('/')) {
      return filePath.includes(allowed);
    }
    return fileName === allowed || filePath.endsWith(allowed);
  })) {
    return { isSensitive: false, categoryName: '', isAllowListed: true };
  }

  // Check built-in patterns
  for (const category of PATTERN_CATEGORIES) {
    // Skip if category is disabled in config
    if (!config.patterns[category.configKey]) {
      continue;
    }

    for (const pattern of category.patterns) {
      if (pattern.test(filePath)) {
        return {
          isSensitive: true,
          categoryName: category.name,
          matchedPattern: pattern.source,
          isAllowListed: false,
        };
      }
    }
  }

  // Check custom patterns
  for (const customPattern of config.customPatterns) {
    try {
      const regex = new RegExp(customPattern, 'i');
      if (regex.test(filePath)) {
        return {
          isSensitive: true,
          categoryName: 'Custom pattern',
          matchedPattern: customPattern,
          isAllowListed: false,
        };
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return { isSensitive: false, categoryName: '', isAllowListed: false };
}

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<PreToolUseInput>();

    // Get config
    const config = getConfig();
    const sensitiveConfig = config.hooks.sensitiveFiles;

    // Skip if disabled
    if (!sensitiveConfig.enabled || sensitiveConfig.behavior === 'disabled') {
      process.exit(0);
    }

    // Get file path from tool input
    const filePath = input.tool_input.file_path as string | undefined;
    if (!filePath) {
      process.exit(0);
    }

    // Check for sensitive patterns
    const detection = detectSensitiveFile(filePath, sensitiveConfig);

    // Also check Matrix warnings database
    let matrixWarning = false;
    try {
      const result = await matrixWarnCheck({ type: 'file', target: filePath });
      if (result.hasWarning) {
        matrixWarning = true;
      }
    } catch {
      // Silently ignore Matrix warning check errors
    }

    // Not sensitive and no Matrix warning - allow
    if (!detection.isSensitive && !matrixWarning) {
      process.exit(0);
    }

    const categoryName = detection.categoryName || 'Matrix warning';

    // Handle based on behavior mode
    if (sensitiveConfig.behavior === 'block') {
      // Block access completely
      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Matrix Security - Blocked access to sensitive file:\n\nFile: ${filePath}\nCategory: ${categoryName}\n\nThis file type is blocked by security policy.`,
        },
      };
      outputJson(output);
      process.exit(0);
    }

    if (sensitiveConfig.behavior === 'ask') {
      // Prompt user for permission
      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `Matrix Security - Sensitive file detected:\n\nFile: ${filePath}\nCategory: ${categoryName}\n\nThis file may contain secrets or credentials. Allow access?`,
        },
      };
      outputJson(output);
      process.exit(0);
    }

    // 'warn' mode - allow without blocking
    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(`[Matrix] Security hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
