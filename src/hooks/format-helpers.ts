/**
 * Format Helpers - Verbosity-Aware Formatting (v2.0)
 *
 * Provides compact, token-efficient formatting for hook outputs.
 * Supports three verbosity levels:
 * - 'full': Verbose multi-line format (backward compatible)
 * - 'compact': Single-line formats (~80% token reduction)
 * - 'minimal': Near-silent, only critical blockers
 */

import { getConfig, type VerbosityLevel } from '../config/index.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface GitContextData {
  branch: string | null;
  commits: string[];      // Last N commit messages
  changedFiles: string[]; // Status lines like "M src/file.ts"
}

export interface IndexResult {
  symbol: string;
  file: string;
  line: number;
  kind: string;
  signature?: string;
  exported?: boolean;
}

export interface SolutionData {
  id: string;
  problem: string;
  solution: string;
  similarity: number;
  successRate: number;
  contextBoost?: string;
}

export interface FailureData {
  id: string;
  errorMessage: string;
  rootCause: string | null;
  fixApplied: string | null;
  similarity: number;
}

export interface ComplexityData {
  score: number;
  reasoning: string;
}

export interface Assumption {
  assumption: string;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════
// Verbosity Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Get current verbosity level from config
 */
export function getVerbosity(): VerbosityLevel {
  try {
    const config = getConfig();
    return config.hooks.verbosity ?? 'full';
  } catch {
    return 'full';
  }
}

// ═══════════════════════════════════════════════════════════════
// Git Context Formatting
// ═══════════════════════════════════════════════════════════════

/**
 * Format git context based on verbosity level
 */
export function formatGitContext(
  data: GitContextData,
  verbosity?: VerbosityLevel
): string | null {
  const level = verbosity ?? getVerbosity();

  // Check if there's any data
  if (!data.branch && data.commits.length === 0 && data.changedFiles.length === 0) {
    return null;
  }

  if (level === 'minimal') {
    return null; // No git context in minimal mode
  }

  if (level === 'compact') {
    // Compact: [Git: main | +3 commits | 5 files changed]
    const parts: string[] = [];
    if (data.branch) parts.push(data.branch);
    if (data.commits.length > 0) parts.push(`+${data.commits.length} commits`);
    if (data.changedFiles.length > 0) parts.push(`${data.changedFiles.length} files changed`);
    return parts.length > 0 ? `[Git: ${parts.join(' | ')}]` : null;
  }

  // Full: Original multi-line format
  const lines: string[] = [];
  if (data.branch) {
    lines.push(`[Git Branch] ${data.branch}`);
  }
  if (data.commits.length > 0) {
    lines.push(`[Recent Commits] ${data.commits.join('; ')}`);
  }
  if (data.changedFiles.length > 0) {
    lines.push(`[Changed Files] ${data.changedFiles.slice(0, 5).join('; ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

// ═══════════════════════════════════════════════════════════════
// Code Index Context Formatting
// ═══════════════════════════════════════════════════════════════

/**
 * Format code index results based on verbosity level
 */
export function formatCodeIndexContext(
  query: string,
  results: IndexResult[],
  verbosity?: VerbosityLevel
): string | null {
  const level = verbosity ?? getVerbosity();

  if (level === 'minimal' || results.length === 0) {
    return null;
  }

  if (level === 'compact') {
    // Compact: [Index: 3 matches for "foo" -> src/file.ts:123, src/other.ts:456]
    const locations = results.slice(0, 5).map(r => `${r.file}:${r.line}`).join(', ');
    return `[Index: ${results.length} matches for "${query}" -> ${locations}]`;
  }

  // Full: Multi-line listing
  const lines: string[] = [`[Code Index: "${query}" definitions]`];
  for (const r of results.slice(0, 5)) {
    const sig = r.signature ? ` - ${r.signature}` : '';
    const exp = r.exported ? ' (exported)' : '';
    lines.push(`* ${r.file}:${r.line} [${r.kind}]${sig}${exp}`);
  }
  lines.push('[End Code Index]');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Matrix Memory Context Formatting
// ═══════════════════════════════════════════════════════════════

/**
 * Format Matrix memory context based on verbosity level
 */
export function formatMatrixContext(
  solutions: SolutionData[],
  failures: FailureData[],
  complexity: ComplexityData,
  verbosity?: VerbosityLevel
): string | null {
  const level = verbosity ?? getVerbosity();

  if (solutions.length === 0 && failures.length === 0) {
    return null;
  }

  if (level === 'minimal') {
    // Minimal: Only show if there are critical blockers (high-relevance failures)
    const criticalFailures = failures.filter(f => f.similarity > 0.8);
    if (criticalFailures.length === 0) return null;
    return `[MEM warn] ${criticalFailures.map(f => f.id).join(', ')}`;
  }

  if (level === 'compact') {
    // Compact: [MEM cplx:7] sol_abc123(92%) sol_def456(85%) | err: fail_xyz789
    const parts: string[] = [`[MEM cplx:${complexity.score}]`];

    if (solutions.length > 0) {
      const solParts = solutions.slice(0, 3).map(s =>
        `${s.id}(${Math.round(s.successRate * 100)}%)`
      );
      parts.push(solParts.join(' '));
    }

    if (failures.length > 0) {
      parts.push(`| err: ${failures.slice(0, 2).map(f => f.id).join(', ')}`);
    }

    return parts.join(' ');
  }

  // Full: Original verbose format
  const lines: string[] = [
    `[Matrix Memory Context - Complexity: ${complexity.score}/10]`,
  ];

  if (complexity.reasoning) {
    lines.push(`Reason: ${complexity.reasoning}`);
  }

  if (solutions.length > 0) {
    lines.push('');
    lines.push('Relevant solutions:');

    for (const sol of solutions.slice(0, 3)) {
      const boost = sol.contextBoost ? ` (${sol.contextBoost})` : '';
      const successPct = Math.round(sol.successRate * 100);
      lines.push(`* [${sol.id}] ${successPct}% success${boost}`);

      const problemPreview = sol.problem.split('\n')[0]?.slice(0, 100) || sol.problem.slice(0, 100);
      lines.push(`  Problem: ${problemPreview}${problemPreview.length < sol.problem.length ? '...' : ''}`);

      const solutionPreview = sol.solution.slice(0, 300);
      lines.push(`  Solution: ${solutionPreview}${solutionPreview.length < sol.solution.length ? '...' : ''}`);
    }
  }

  if (failures.length > 0) {
    lines.push('');
    lines.push('Related errors to avoid:');

    for (const fail of failures.slice(0, 2)) {
      const errorPreview = fail.errorMessage.slice(0, 80);
      lines.push(`* [${fail.id}] ${errorPreview}${errorPreview.length < fail.errorMessage.length ? '...' : ''}`);
      if (fail.rootCause) {
        lines.push(`  Cause: ${fail.rootCause.slice(0, 100)}`);
      }
      if (fail.fixApplied) {
        lines.push(`  Fix: ${fail.fixApplied.slice(0, 100)}`);
      }
    }
  }

  lines.push('[End Matrix Context]');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Prompt Context Formatting (CLAUDE.md + Assumptions)
// ═══════════════════════════════════════════════════════════════

/**
 * Format prompt context based on verbosity level
 */
export function formatPromptContext(
  claudeMdContext: string[],
  assumptions: Assumption[],
  verbosity?: VerbosityLevel
): string | null {
  const level = verbosity ?? getVerbosity();

  if (level === 'minimal') {
    return null; // No prompt context in minimal mode
  }

  const highConfidenceAssumptions = assumptions.filter(a => a.confidence > 0.7);

  if (level === 'compact') {
    // Compact: Combine all into one line
    const parts: string[] = [];
    if (claudeMdContext.length > 0) {
      parts.push(`[CLAUDE.md: ${claudeMdContext.length} rules]`);
    }
    if (highConfidenceAssumptions.length > 0) {
      const assumptionPreviews = highConfidenceAssumptions
        .map(a => a.assumption.slice(0, 30))
        .join('; ');
      parts.push(`[Assumed: ${assumptionPreviews}]`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  }

  // Full: Original format
  const lines: string[] = [...claudeMdContext];
  for (const a of highConfidenceAssumptions) {
    lines.push(`[Assumed: ${a.assumption}]`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

// ═══════════════════════════════════════════════════════════════
// Combined Context Assembly
// ═══════════════════════════════════════════════════════════════

/**
 * Assemble all context parts with appropriate separators
 */
export function assembleContext(
  parts: (string | null)[],
  verbosity?: VerbosityLevel
): string {
  const level = verbosity ?? getVerbosity();
  const validParts = parts.filter((p): p is string => p !== null && p.length > 0);

  if (validParts.length === 0) {
    return '';
  }

  // In compact mode, use single newline between parts
  // In full mode, use double newline for readability
  const separator = level === 'compact' ? '\n' : '\n\n';
  return validParts.join(separator);
}
