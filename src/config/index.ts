import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

// Config file location (next to db in ~/.claude/matrix/)
const CONFIG_PATH = join(homedir(), '.claude', 'matrix', 'matrix.config');

// ═══════════════════════════════════════════════════════════════
// Permission Request Hook Config
// ═══════════════════════════════════════════════════════════════
export interface PermissionsConfig {
  autoApproveReadOnly: boolean;
  autoApprove: {
    coreRead: boolean;      // Read, Glob, Grep
    web: boolean;           // WebFetch, WebSearch
    matrixRead: boolean;    // matrix_recall, status, find_definition, etc.
    context7: boolean;      // resolve-library-id, query-docs
  };
  neverAutoApprove: string[];
  additionalAutoApprove: string[];
}

// ═══════════════════════════════════════════════════════════════
// PreCompact Hook Config
// ═══════════════════════════════════════════════════════════════
export interface PreCompactConfig {
  enabled: boolean;
  behavior: 'suggest' | 'auto-save' | 'disabled';
  autoSaveThreshold: number;
  logToFile: boolean;
  showNotification: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Sensitive Files Hook Config
// ═══════════════════════════════════════════════════════════════
export interface SensitiveFilesConfig {
  enabled: boolean;
  behavior: 'warn' | 'block' | 'ask' | 'disabled';
  patterns: {
    envFiles: boolean;
    keysAndCerts: boolean;
    secretDirs: boolean;
    configFiles: boolean;
    passwordFiles: boolean;
    cloudCredentials: boolean;
  };
  customPatterns: string[];
  allowList: string[];
}

// ═══════════════════════════════════════════════════════════════
// Stop Hook Config
// ═══════════════════════════════════════════════════════════════
export interface StopHookConfig {
  enabled: boolean;
  suggestStore: {
    enabled: boolean;
    minComplexity: number;
    minToolUses: number;
    minMessages: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// Package Auditor Hook Config
// ═══════════════════════════════════════════════════════════════
export interface PackageAuditorConfig {
  enabled: boolean;
  behavior: 'warn' | 'block' | 'ask' | 'disabled';
  checks: {
    cve: boolean;
    deprecated: boolean;
    bundleSize: boolean;
    localWarnings: boolean;
  };
  blockOnCriticalCVE: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Cursed Files Hook Config
// ═══════════════════════════════════════════════════════════════
export interface CursedFilesConfig {
  enabled: boolean;
  behavior: 'warn' | 'block' | 'ask';
}

// ═══════════════════════════════════════════════════════════════
// Prompt Analysis Hook Config
// ═══════════════════════════════════════════════════════════════
export interface PromptAnalysisConfig {
  enabled: boolean;
  shortcuts: { enabled: boolean };
  codeNavigation: { enabled: boolean };
  memoryInjection: {
    enabled: boolean;
    maxSolutions: number;
    maxFailures: number;
    minScore: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// Code Review Config
// ═══════════════════════════════════════════════════════════════
export interface GitCommitReviewConfig {
  /** Suggest review before git commits */
  suggestOnCommit: boolean;
  /** Default review mode: 'default' (comprehensive) | 'lazy' (quick) */
  defaultMode: 'default' | 'lazy';
  /** Auto-run review (NOT recommended - prefer suggestion) */
  autoRun: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Session Modes Config (v2.1 - Constitution-inspired)
// ═══════════════════════════════════════════════════════════════
export type SessionMode = 'ultrathink' | 'quick' | 'docs' | 'debug' | 'classic';

export interface SessionModesConfig {
  /** Show mode selection prompt on session start */
  promptOnStart: boolean;
  /** Default mode when prompt is disabled or skipped */
  defaultMode: SessionMode;
  /** Remember user's last choice and use as default */
  rememberLastChoice: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Dreamer Config (Scheduled Task Automation)
// ═══════════════════════════════════════════════════════════════
export interface DreamerWorktreeConfig {
  /** Default branch prefix for worktree branches */
  defaultBranchPrefix: string;
  /** Default remote for pushing worktree branches */
  defaultRemote: string;
  /** Optional custom base path for worktrees */
  defaultBasePath?: string;
}

export interface DreamerExecutionConfig {
  /** Default timeout in seconds */
  defaultTimeout: number;
  /** Default value for skip permissions flag */
  defaultSkipPermissions: boolean;
}

export interface DreamerConfig {
  worktree: DreamerWorktreeConfig;
  execution: DreamerExecutionConfig;
}

// ═══════════════════════════════════════════════════════════════
// User-Configurable Rules (v2.0)
// ═══════════════════════════════════════════════════════════════
export type RuleEvent = 'bash' | 'edit' | 'read' | 'prompt' | 'write';
export type RuleAction = 'block' | 'warn' | 'allow';

// ═══════════════════════════════════════════════════════════════
// Hook Verbosity (v2.0)
// ═══════════════════════════════════════════════════════════════
export type VerbosityLevel = 'full' | 'compact' | 'minimal';

export interface UserRule {
  name: string;
  enabled: boolean;
  event: RuleEvent;
  pattern: string;         // Regex pattern
  action: RuleAction;
  message: string;
  priority?: number;       // Higher = evaluated first (default: 0)
}

export interface UserRulesConfig {
  enabled: boolean;
  rules: UserRule[];
}

// ═══════════════════════════════════════════════════════════════
// Combined Hooks Config
// ═══════════════════════════════════════════════════════════════
export interface HooksConfig {
  // Legacy flat config (backward compat)
  enabled: boolean;
  complexityThreshold: number;
  enableApiCache: boolean;
  cacheTtlHours: number;
  auditorTimeout: number;
  skipDeprecationWarnings: boolean;
  sizeWarningThreshold: number;

  // New nested configs
  permissions: PermissionsConfig;
  preCompact: PreCompactConfig;
  sensitiveFiles: SensitiveFilesConfig;
  stop: StopHookConfig;
  packageAuditor: PackageAuditorConfig;
  cursedFiles: CursedFilesConfig;
  promptAnalysis: PromptAnalysisConfig;
  gitCommitReview: GitCommitReviewConfig;
  // v2.0 User Rules
  userRules: UserRulesConfig;
  // v2.0 Hook Verbosity
  verbosity: VerbosityLevel;
}

export interface MatrixConfig {
  search: {
    defaultLimit: number;
    defaultMinScore: number;
    defaultScope: 'all' | 'repo' | 'stack' | 'global';
  };
  merge: {
    defaultThreshold: number;
  };
  list: {
    defaultLimit: number;
  };
  export: {
    defaultDirectory: string;
    defaultFormat: 'json' | 'csv';
  };
  display: {
    colors: boolean;
    boxWidth: number;
    cardWidth: number;
    truncateLength: number;
  };
  scoring: {
    highThreshold: number;
    midThreshold: number;
  };
  hooks: HooksConfig;
  indexing: {
    enabled: boolean;
    excludePatterns: string[];
    maxFileSize: number;
    timeout: number;
    includeTests: boolean;
  };
  toolSearch: {
    enabled: boolean;
    preferMatrixIndex: boolean;
    preferContext7: boolean;
    /** Log when tools are shown/hidden due to project context */
    verbose: boolean;
  };
  /** Model delegation settings for read-only tools */
  delegation: {
    /** Enable tool delegation to cheaper models */
    enabled: boolean;
    /** Model for delegable tools: 'haiku' (cheaper) or 'sonnet' (more capable) */
    model: 'haiku' | 'sonnet';
  };
  /** Dreamer scheduled task automation settings */
  dreamer: DreamerConfig;
  /** Session modes configuration (v2.1) */
  sessionModes: SessionModesConfig;
}

function getDownloadsDirectory(): string {
  return join(homedir(), 'Downloads');
}

export const DEFAULT_CONFIG: MatrixConfig = {
  search: {
    defaultLimit: 5,
    defaultMinScore: 0.3,
    defaultScope: 'all',
  },
  merge: {
    defaultThreshold: 0.8,
  },
  list: {
    defaultLimit: 20,
  },
  export: {
    defaultDirectory: getDownloadsDirectory(),
    defaultFormat: 'json',
  },
  display: {
    colors: true,
    boxWidth: 55,
    cardWidth: 70,
    truncateLength: 40,
  },
  scoring: {
    highThreshold: 0.7,
    midThreshold: 0.4,
  },
  hooks: {
    // Legacy flat config (backward compat)
    enabled: true,
    complexityThreshold: 5,
    enableApiCache: false,
    cacheTtlHours: 24,
    auditorTimeout: 30,
    skipDeprecationWarnings: false,
    sizeWarningThreshold: 500000,

    // ─── Permissions (PermissionRequest hook) ───
    permissions: {
      autoApproveReadOnly: true,
      autoApprove: {
        coreRead: true,      // Read, Glob, Grep
        web: true,           // WebFetch, WebSearch
        matrixRead: true,    // matrix_recall, status, find_definition, etc.
        context7: true,      // resolve-library-id, query-docs
      },
      neverAutoApprove: ['matrix_store', 'matrix_warn', 'matrix_failure', 'matrix_link_skill'],
      additionalAutoApprove: [],
    },

    // ─── PreCompact hook ───
    preCompact: {
      enabled: true,
      behavior: 'suggest' as const,
      autoSaveThreshold: 6,
      logToFile: true,
      showNotification: false,
    },

    // ─── Sensitive Files (PreToolUse:Read hook) ───
    sensitiveFiles: {
      enabled: true,
      behavior: 'ask' as const,
      patterns: {
        envFiles: true,
        keysAndCerts: true,
        secretDirs: true,
        configFiles: true,
        passwordFiles: true,
        cloudCredentials: true,
      },
      customPatterns: [],
      allowList: ['.env.example', '.env.template', '.env.sample'],
    },

    // ─── Stop hook ───
    stop: {
      enabled: true,
      suggestStore: {
        enabled: true,
        minComplexity: 5,
        minToolUses: 3,
        minMessages: 5,
      },
    },

    // ─── Package Auditor (PreToolUse:Bash hook) ───
    packageAuditor: {
      enabled: true,
      behavior: 'ask' as const,
      checks: {
        cve: true,
        deprecated: true,
        bundleSize: true,
        localWarnings: true,
      },
      blockOnCriticalCVE: true,
    },

    // ─── Cursed Files (PreToolUse:Edit hook) ───
    cursedFiles: {
      enabled: true,
      behavior: 'ask' as const,
    },

    // ─── Prompt Analysis (UserPromptSubmit hook) ───
    promptAnalysis: {
      enabled: true,
      shortcuts: { enabled: true },
      codeNavigation: { enabled: true },
      memoryInjection: {
        enabled: true,
        maxSolutions: 3,
        maxFailures: 2,
        minScore: 0.35,
      },
    },

    // ─── Code Review Config ───
    // Controls /matrix:review behavior and commit suggestions
    gitCommitReview: {
      suggestOnCommit: true,  // Suggest review before git commits
      defaultMode: 'default' as const,  // 'default' (comprehensive) or 'lazy' (quick)
      autoRun: false,  // Never auto-run, always suggest
    },

    // ─── User Rules (v2.0) ───
    userRules: {
      enabled: true,
      rules: [
        // Example rules (commented out by default)
        // {
        //   name: 'block-rm-rf',
        //   enabled: true,
        //   event: 'bash',
        //   pattern: 'rm\\s+-rf\\s+/',
        //   action: 'block',
        //   message: 'Dangerous rm -rf command blocked',
        //   priority: 100,
        // },
        // {
        //   name: 'warn-console-log',
        //   enabled: true,
        //   event: 'edit',
        //   pattern: 'console\\.log',
        //   action: 'warn',
        //   message: 'Consider removing console.log before committing',
        //   priority: 0,
        // },
      ],
    },

    // ─── Hook Verbosity (v2.0) ───
    // Controls token overhead of hook outputs
    // 'full': Verbose multi-line format
    // 'compact': Single-line formats (~80% token reduction) - DEFAULT
    // 'minimal': Near-silent, only critical blockers shown
    verbosity: 'compact' as VerbosityLevel,
  },
  indexing: {
    enabled: true,
    excludePatterns: [],
    maxFileSize: 1024 * 1024, // 1MB
    timeout: 60,
    includeTests: false,
  },
  toolSearch: {
    enabled: true,
    preferMatrixIndex: true,
    preferContext7: true,
    verbose: false,
  },
  delegation: {
    enabled: true,
    model: 'haiku' as const,  // Use haiku for cheaper read-only operations
  },
  dreamer: {
    worktree: {
      defaultBranchPrefix: 'matrix-dreamer/',
      defaultRemote: 'origin',
      defaultBasePath: undefined,
    },
    execution: {
      defaultTimeout: 300,  // 5 minutes
      defaultSkipPermissions: false,
    },
  },
  sessionModes: {
    promptOnStart: true,           // Show mode picker on session start
    defaultMode: 'classic' as SessionMode,  // Fallback if prompt disabled
    rememberLastChoice: false,     // Don't bias toward last choice
  },
};

let cachedConfig: MatrixConfig | null = null;

/**
 * Recursive deep merge for nested objects.
 * Arrays are replaced, not merged. Undefined values are skipped.
 */
function deepMergeAny(target: unknown, source: unknown): unknown {
  // Not both objects? Return source (or target if source undefined)
  if (
    typeof target !== 'object' || target === null ||
    typeof source !== 'object' || source === null ||
    Array.isArray(target) || Array.isArray(source)
  ) {
    return source !== undefined ? source : target;
  }

  const result = { ...(target as Record<string, unknown>) };
  const src = source as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (src[key] !== undefined) {
      const targetVal = result[key];
      const sourceVal = src[key];

      // Both are non-array objects? Recurse
      if (
        typeof targetVal === 'object' && targetVal !== null && !Array.isArray(targetVal) &&
        typeof sourceVal === 'object' && sourceVal !== null && !Array.isArray(sourceVal)
      ) {
        result[key] = deepMergeAny(targetVal, sourceVal);
      } else {
        result[key] = sourceVal;
      }
    }
  }

  return result;
}

function deepMerge(target: MatrixConfig, source: Partial<MatrixConfig>): MatrixConfig {
  return deepMergeAny(target, source) as MatrixConfig;
}

export function getConfig(): MatrixConfig {
  if (cachedConfig) return cachedConfig;
  let userConfig: Partial<MatrixConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      const content = readFileSync(CONFIG_PATH, 'utf-8');
      userConfig = JSON.parse(content);
    } catch {
      // Invalid config, use defaults
    }
  } else {
    // Create config file with defaults if it doesn't exist
    const dir = dirname(CONFIG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  cachedConfig = deepMerge(DEFAULT_CONFIG, userConfig);
  return cachedConfig;
}

export function saveConfig(config: MatrixConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  cachedConfig = config;
}

export function resetConfig(): void {
  saveConfig({ ...DEFAULT_CONFIG });
}

export function get<T>(key: string): T {
  const config = getConfig();
  const parts = key.split('.');
  let value: unknown = config as unknown;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      throw new Error(`Config key not found: ${key}`);
    }
  }
  return value as T;
}

export function set(key: string, value: unknown): void {
  const config = getConfig();
  const parts = key.split('.');
  const lastPart = parts.pop()!;
  let target: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (const part of parts) {
    if (target[part] && typeof target[part] === 'object') {
      target = target[part] as Record<string, unknown>;
    } else {
      throw new Error(`Config key not found: ${key}`);
    }
  }
  const existingValue = target[lastPart];
  if (typeof existingValue === 'number') {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      throw new Error(`Invalid number value for ${key}: ${value}`);
    }
    target[lastPart] = numValue;
  } else if (typeof existingValue === 'boolean') {
    target[lastPart] = value === 'true' || value === true;
  } else {
    target[lastPart] = value;
  }
  saveConfig(config);
}

export function getAllKeys(): Array<{ key: string; value: unknown; type: string }> {
  const result: Array<{ key: string; value: unknown; type: string }> = [];
  function traverse(obj: Record<string, unknown>, prefix: string): void {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        traverse(value as Record<string, unknown>, fullKey);
      } else {
        result.push({ key: fullKey, value, type: typeof value });
      }
    }
  }
  const config = getConfig();
  traverse(config as unknown as Record<string, unknown>, '');
  return result;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function clearCache(): void {
  cachedConfig = null;
}
