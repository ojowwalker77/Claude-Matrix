#!/usr/bin/env bun
/**
 * UserPromptSubmit Hook
 *
 * Runs when user submits a prompt (before Claude processes it).
 * Checks complexity and injects relevant Matrix memories as context.
 *
 * Exit codes:
 *   0 = Success (stdout added to context)
 *   1 = Non-blocking error (stderr shown to user)
 *   2 = Blocking error (stderr fed back to Claude)
 */

import {
  readStdin,
  outputText,
  hooksEnabled,
  getHooksConfig,
  type UserPromptSubmitInput,
} from './index.js';
import { estimateComplexity } from './complexity.js';
import { matrixRecall } from '../tools/recall.js';
import { searchFailures } from '../tools/failure.js';
import { printToUser, renderMemoryBox, renderErrorBox } from './ui.js';

const MAX_CONTEXT_WORDS = 500;
const MAX_SOLUTION_CHARS = 300;

/**
 * Format solutions for context injection
 */
function formatContext(
  solutions: Array<{
    id: string;
    problem: string;
    solution: string;
    similarity: number;
    successRate: number;
    contextBoost?: string;
  }>,
  failures: Array<{
    id: string;
    errorMessage: string;
    rootCause: string | null;
    fixApplied: string | null;
    similarity: number;
  }>,
  complexity: { score: number; reasoning: string }
): string {
  if (solutions.length === 0 && failures.length === 0) {
    return '';
  }

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
      lines.push(`• [${sol.id}] ${successPct}% success${boost}`);

      // Truncate problem to first line or 100 chars
      const problemPreview = sol.problem.split('\n')[0]?.slice(0, 100) || sol.problem.slice(0, 100);
      lines.push(`  Problem: ${problemPreview}${problemPreview.length < sol.problem.length ? '...' : ''}`);

      // Truncate solution
      const solutionPreview = sol.solution.slice(0, MAX_SOLUTION_CHARS);
      lines.push(`  Solution: ${solutionPreview}${solutionPreview.length < sol.solution.length ? '...' : ''}`);
    }
  }

  if (failures.length > 0) {
    lines.push('');
    lines.push('Related errors to avoid:');

    for (const fail of failures.slice(0, 2)) {
      const errorPreview = fail.errorMessage.slice(0, 80);
      lines.push(`• [${fail.id}] ${errorPreview}${errorPreview.length < fail.errorMessage.length ? '...' : ''}`);
      if (fail.rootCause) {
        lines.push(`  Cause: ${fail.rootCause.slice(0, 100)}`);
      }
      if (fail.fixApplied) {
        lines.push(`  Fix: ${fail.fixApplied.slice(0, 100)}`);
      }
    }
  }

  lines.push('[End Matrix Context]');

  // Truncate to max words
  const fullText = lines.join('\n');
  const words = fullText.split(/\s+/);
  if (words.length > MAX_CONTEXT_WORDS) {
    return words.slice(0, MAX_CONTEXT_WORDS).join(' ') + '\n[Truncated...]';
  }

  return fullText;
}

async function main() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<UserPromptSubmitInput>();

    // Get config
    const config = getHooksConfig();
    const threshold = config.complexityThreshold ?? 5;

    // Estimate complexity
    const complexity = await estimateComplexity(input.prompt);

    // Skip memory injection if below threshold
    if (complexity.score < threshold) {
      const box = renderMemoryBox(complexity.score, 0, 0, true, threshold);
      printToUser(box);
      process.exit(0);
    }

    // Search Matrix memory
    const recallResult = await matrixRecall({
      query: input.prompt.slice(0, 1000), // Limit query length
      limit: 3,
      minScore: 0.35,
    });

    // Also search for related failures
    const failures = await searchFailures(input.prompt.slice(0, 500), 2);

    // Format context
    const context = formatContext(
      recallResult.solutions,
      failures,
      complexity
    );

    // Output context to Claude if we found something
    if (context) {
      outputText(context);
    }

    // Render and display box to user
    const box = renderMemoryBox(
      complexity.score,
      recallResult.solutions.length,
      failures.length
    );
    printToUser(box);

    process.exit(0);
  } catch (err) {
    // Log error but don't block
    const errorBox = renderErrorBox('Memory', err instanceof Error ? err.message : 'Unknown error');
    printToUser(errorBox);
    process.exit(1); // Non-blocking error
  }
}

main();
