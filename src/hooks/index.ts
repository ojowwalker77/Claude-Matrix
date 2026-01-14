/**
 * Matrix Hooks - Shared Utilities
 *
 * Common utilities for all hook scripts.
 */

import { getDb } from '../db/client.js';
import { getConfig } from '../config/index.js';

// Re-export complexity evaluation (Haiku-powered)
export { estimateComplexity, needsMatrixRecall, type ComplexityResult } from './complexity.js';

/**
 * Standard hook input structure (from Claude Code stdin)
 */
export interface HookInput {
  session_id: string;
  transcript_path?: string;
  cwd: string;
}

export interface UserPromptSubmitInput extends HookInput {
  prompt: string;
}

export interface PreToolUseInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface PostToolUseInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    content?: unknown;
  };
}

export interface StopInput extends HookInput {
  stop_hook_active: boolean;
}

/**
 * SubagentStart hook input (Claude Code 2.0.43+)
 * Fires when a subagent (Explore, Plan, etc.) starts
 */
export interface SubagentStartInput extends HookInput {
  agent_id: string;
  agent_type: string;
  hook_event_name: 'SubagentStart';
}

/**
 * SubagentStop hook input (Claude Code 2.0.42+)
 * Fires when a subagent completes
 */
export interface SubagentStopInput extends HookInput {
  agent_id: string;
  agent_transcript_path: string;
  stop_hook_active?: boolean;
}

/**
 * PermissionRequest decision structure
 */
export interface PermissionDecision {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;      // Only for deny
  interrupt?: boolean;   // Only for deny
}

/**
 * Hook output for controlling behavior
 */
export interface HookOutput {
  hookSpecificOutput?: {
    hookEventName?: string;
    // PreToolUse / UserPromptSubmit
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    // PermissionRequest
    decision?: PermissionDecision;
    // PostToolUse / UserPromptSubmit
    additionalContext?: string;
  };
  decision?: 'continue' | 'block';
  reason?: string;
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
}

/**
 * PermissionRequest hook input
 */
export interface PermissionRequestInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

/**
 * PreCompact hook input
 */
export interface PreCompactInput extends HookInput {
  trigger: 'manual' | 'auto';
  custom_instructions: string;
}

/**
 * Read JSON input from stdin
 */
export async function readStdin<T>(): Promise<T> {
  const text = await Bun.stdin.text();
  return JSON.parse(text) as T;
}

/**
 * Output JSON result to stdout
 */
export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data));
}

/**
 * Output text to stdout (for context injection)
 */
export function outputText(text: string): void {
  console.log(text);
}

/**
 * Log to stderr - shown to user in terminal
 * (stdout goes to Claude's context, stderr goes to user)
 */
export function log(message: string): void {
  console.error(message);
}

/** @deprecated Use log() instead */
export const logError = log;

/**
 * Get hooks configuration
 */
export function getHooksConfig() {
  const config = getConfig();
  return config.hooks || {
    enabled: true,
    complexityThreshold: 5,
    enableApiCache: false,
    cacheTtlHours: 24,
    auditorTimeout: 30,
    skipDeprecationWarnings: false,
    sizeWarningThreshold: 500000,
  };
}

/**
 * Check if hooks are enabled
 */
export function hooksEnabled(): boolean {
  const config = getHooksConfig();
  return config.enabled !== false;
}

/**
 * Get cached API response (24h TTL)
 */
export function getCachedResponse(cacheKey: string): unknown | null {
  const config = getHooksConfig();
  if (!config.enableApiCache) return null;

  const db = getDb();
  const ttlHours = config.cacheTtlHours || 24;

  const row = db.query(`
    SELECT response FROM api_cache
    WHERE cache_key = ?
      AND datetime(created_at) > datetime('now', '-${ttlHours} hours')
  `).get(cacheKey) as { response: string } | null;

  if (row) {
    try {
      return JSON.parse(row.response);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Store API response in cache
 */
export function setCachedResponse(cacheKey: string, response: unknown): void {
  const config = getHooksConfig();
  if (!config.enableApiCache) return;

  const db = getDb();
  const json = JSON.stringify(response);

  db.query(`
    INSERT OR REPLACE INTO api_cache (cache_key, response, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(cacheKey, json);
}

/**
 * Clean expired cache entries
 */
export function cleanExpiredCache(): number {
  const config = getHooksConfig();
  const ttlHours = config.cacheTtlHours || 24;

  const db = getDb();
  const result = db.query(`
    DELETE FROM api_cache
    WHERE datetime(created_at) < datetime('now', '-${ttlHours} hours')
  `).run();

  return result.changes;
}

/**
 * Package manager patterns for command parsing
 */
export const PACKAGE_PATTERNS = [
  { pattern: /^(npm|yarn|pnpm)\s+(install|add|i)\s+(.+)/i, ecosystem: 'npm' as const },
  { pattern: /^bun\s+(add|install)\s+(.+)/i, ecosystem: 'npm' as const },
  { pattern: /^pip\s+install\s+(.+)/i, ecosystem: 'pip' as const },
  { pattern: /^pip3\s+install\s+(.+)/i, ecosystem: 'pip' as const },
  { pattern: /^cargo\s+add\s+(.+)/i, ecosystem: 'cargo' as const },
  { pattern: /^go\s+get\s+(.+)/i, ecosystem: 'go' as const },
] as const;

export type Ecosystem = 'npm' | 'pip' | 'cargo' | 'go';

/**
 * Parse package install command
 */
export function parsePackageCommand(command: string): { packages: string[]; ecosystem: Ecosystem } | null {
  for (const { pattern, ecosystem } of PACKAGE_PATTERNS) {
    const match = command.match(pattern);
    if (match) {
      const packagesStr = match[match.length - 1] ?? '';
      // Filter out flags (-D, --save-dev, etc.) and @types packages
      const packages = packagesStr
        .split(/\s+/)
        .filter(p => p && !p.startsWith('-'))
        .map(p => {
          // Handle scoped packages and version specifiers
          // e.g., "@scope/package@1.0.0" -> "@scope/package"
          return p.replace(/@[\d.^~>=<]+.*$/, '');
        })
        .filter(p => p.length > 0);

      if (packages.length > 0) {
        return { packages, ecosystem };
      }
    }
  }
  return null;
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ═══════════════════════════════════════════════════════════════
// Re-exports for Verbosity-Aware Formatting (v2.0)
// ═══════════════════════════════════════════════════════════════
export {
  getVerbosity,
  formatGitContext,
  formatCodeIndexContext,
  formatMatrixContext,
  formatPromptContext,
  assembleContext,
  type GitContextData,
  type IndexResult,
  type SolutionData,
  type FailureData,
  type ComplexityData,
  type Assumption,
} from './format-helpers.js';

// ═══════════════════════════════════════════════════════════════
// Re-exports for One-Time Hook Execution (v2.0.3)
// ═══════════════════════════════════════════════════════════════
export {
  hasRunThisSession,
  markAsRun,
  clearExecution,
  cleanupOldExecutions,
} from './once.js';
