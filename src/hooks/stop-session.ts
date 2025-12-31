#!/usr/bin/env bun
/**
 * Stop Hook (Session Store Prompt)
 *
 * Runs when Claude finishes responding.
 * Analyzes the session and prompts user to store significant solutions.
 *
 * Exit codes:
 *   0 = Success
 *   1 = Non-blocking error
 *   2 = Blocking (prompt user for decision)
 */

import {
  readStdin,
  outputJson,
  hooksEnabled,
  type StopInput,
  type HookOutput,
} from './index.js';
import { getDb } from '../db/client.js';
import { fingerprintRepo, getOrCreateRepo } from '../repo/index.js';
import { getConfig } from '../config/index.js';
import { randomUUID } from 'crypto';

interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  tool_use?: Array<{ name: string }>;
}

interface SessionAnalysis {
  complexity: number;
  summary: string;
  suggestedProblem: string;
  suggestedTags: string[];
  messageCount: number;
  toolUseCount: number;
}

/**
 * Tag patterns for auto-suggestion
 */
const TAG_PATTERNS = [
  { pattern: /typescript|\.ts\b/i, tag: 'typescript' },
  { pattern: /javascript|\.js\b/i, tag: 'javascript' },
  { pattern: /python|\.py\b/i, tag: 'python' },
  { pattern: /react|jsx|tsx/i, tag: 'react' },
  { pattern: /vue|\.vue\b/i, tag: 'vue' },
  { pattern: /angular/i, tag: 'angular' },
  { pattern: /svelte/i, tag: 'svelte' },
  { pattern: /next\.?js|nextjs/i, tag: 'nextjs' },
  { pattern: /node\.?js|nodejs/i, tag: 'nodejs' },
  { pattern: /api|endpoint|rest|graphql/i, tag: 'api' },
  { pattern: /database|sql|postgres|mongo|sqlite/i, tag: 'database' },
  { pattern: /auth|login|jwt|oauth|session/i, tag: 'auth' },
  { pattern: /test|spec|jest|vitest|pytest/i, tag: 'testing' },
  { pattern: /docker|container|kubernetes/i, tag: 'devops' },
  { pattern: /aws|gcp|azure|cloud/i, tag: 'cloud' },
  { pattern: /css|style|tailwind|sass/i, tag: 'styling' },
  { pattern: /form|validation|input/i, tag: 'forms' },
  { pattern: /cache|redis|memcached/i, tag: 'caching' },
  { pattern: /websocket|realtime|socket/i, tag: 'realtime' },
  { pattern: /file|upload|storage|s3/i, tag: 'files' },
];

/**
 * Analyze session transcript using config thresholds
 */
async function analyzeSession(transcriptPath: string): Promise<SessionAnalysis | null> {
  const config = getConfig();
  const { suggestStore } = config.hooks.stop;

  try {
    const content = await Bun.file(transcriptPath).text();
    const transcript: TranscriptMessage[] = JSON.parse(content);

    // Filter messages
    const userMessages = transcript.filter(m => m.role === 'user');
    const assistantMessages = transcript.filter(m => m.role === 'assistant');

    // Count tool uses
    const toolUseCount = assistantMessages.reduce((count, m) => {
      return count + (m.tool_use?.length || 0);
    }, 0);

    // Calculate total content length
    const totalLength = assistantMessages.reduce((len, m) => len + m.content.length, 0);

    // Skip if session is too short (use config thresholds)
    if (assistantMessages.length < suggestStore.minMessages || totalLength < 1000) {
      return null;
    }

    // Skip if no significant tool use (use config threshold)
    if (toolUseCount < suggestStore.minToolUses) {
      return null;
    }

    // Estimate complexity based on session characteristics
    let complexity = 1;

    // More messages = more complex
    complexity += Math.min(3, Math.floor(assistantMessages.length / 5));

    // More tool uses = more complex
    complexity += Math.min(3, Math.floor(toolUseCount / 3));

    // Longer content = more complex
    complexity += Math.min(2, Math.floor(totalLength / 10000));

    // Cap at 10
    complexity = Math.min(10, Math.max(1, complexity));

    // Only suggest storage if above complexity threshold (use config)
    if (complexity < suggestStore.minComplexity) {
      return null;
    }

    // Get first user message as problem hint
    const firstUserMessage = userMessages[0]?.content || '';
    const suggestedProblem = firstUserMessage.slice(0, 500);

    // Generate summary
    const summary = `Session with ${assistantMessages.length} responses, ${toolUseCount} tool uses`;

    // Extract tags from content
    const allContent = transcript.map(m => m.content).join(' ');
    const suggestedTags: string[] = [];

    for (const { pattern, tag } of TAG_PATTERNS) {
      if (pattern.test(allContent) && !suggestedTags.includes(tag)) {
        suggestedTags.push(tag);
      }
    }

    return {
      complexity,
      summary,
      suggestedProblem,
      suggestedTags: suggestedTags.slice(0, 5),
      messageCount: assistantMessages.length,
      toolUseCount,
    };
  } catch {
    return null;
  }
}

/**
 * Store session summary in database
 */
async function storeSessionSummary(
  sessionId: string,
  analysis: SessionAnalysis,
  repoId: string
): Promise<string> {
  const db = getDb();
  const id = `sess_${randomUUID().slice(0, 8)}`;

  db.query(`
    INSERT INTO session_summaries
      (id, session_id, repo_id, summary, complexity)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, sessionId, repoId, analysis.summary, analysis.complexity);

  return id;
}

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Check if stop hook is enabled
    const config = getConfig();
    if (!config.hooks.stop.enabled || !config.hooks.stop.suggestStore.enabled) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<StopInput>();

    // Skip if no transcript path
    if (!input.transcript_path) {
      process.exit(0);
    }

    // Analyze session
    const analysis = await analyzeSession(input.transcript_path);

    if (!analysis) {
      // Session not significant enough
      process.exit(0);
    }

    // Get repo context
    const detected = fingerprintRepo(input.cwd);
    const repoId = await getOrCreateRepo(detected);

    // Store session summary
    await storeSessionSummary(input.session_id, analysis, repoId);

    // Prepare prompt for user
    const tagsStr = analysis.suggestedTags.length > 0
      ? `Tags: ${analysis.suggestedTags.join(', ')}`
      : 'Tags: none detected';

    const problemPreview = analysis.suggestedProblem.slice(0, 150);

    const output: HookOutput = {
      decision: 'block',
      reason: `Matrix detected a significant session (complexity: ${analysis.complexity}/10)

${analysis.summary}

Would you like to store this solution in Matrix memory?

Problem preview: "${problemPreview}..."
${tagsStr}

Reply with:
• "yes" or "store" to save this solution
• "no" or "skip" to discard
• You can also provide a custom problem description

This will help Matrix recall relevant context in future similar tasks.`,
    };

    outputJson(output);
    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(`[Matrix] Stop hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
