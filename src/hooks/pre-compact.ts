#!/usr/bin/env bun
/**
 * PreCompact Hook - Session Insights Analysis
 *
 * Runs before context compaction to analyze the session and suggest
 * storing valuable learnings in Matrix memory.
 *
 * Flow:
 *   1. Read transcript from transcript_path
 *   2. Analyze complexity and extract tags
 *   3. Print analysis box to user
 *   4. Suggest running matrix_store if significant
 *   5. Log analysis to file
 *
 * Behavior modes:
 *   - 'suggest': Print analysis, suggest matrix_store
 *   - 'auto-save': Automatically call matrix_store
 *   - 'disabled': Skip entirely
 *
 * Note: PreCompact CANNOT block compaction or inject context.
 *
 * Exit codes:
 *   0 = Success
 *   1 = Non-blocking error
 */

import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import {
  readStdin,
  hooksEnabled,
  type PreCompactInput,
} from './index.js';
import { getConfig } from '../config/index.js';

// ═══════════════════════════════════════════════════════════════
// Tag Detection Patterns
// ═══════════════════════════════════════════════════════════════

const TAG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  // Languages
  { pattern: /typescript|\.ts\b/i, tag: 'typescript' },
  { pattern: /javascript|\.js\b/i, tag: 'javascript' },
  { pattern: /python|\.py\b/i, tag: 'python' },
  { pattern: /rust|\.rs\b|cargo/i, tag: 'rust' },
  { pattern: /go\b|golang|\.go\b/i, tag: 'go' },

  // Frameworks
  { pattern: /react|jsx|tsx/i, tag: 'react' },
  { pattern: /vue|\.vue\b/i, tag: 'vue' },
  { pattern: /angular/i, tag: 'angular' },
  { pattern: /svelte/i, tag: 'svelte' },
  { pattern: /next\.?js|nextjs/i, tag: 'nextjs' },
  { pattern: /node\.?js|nodejs|express/i, tag: 'nodejs' },
  { pattern: /fastapi|django|flask/i, tag: 'python-web' },

  // Topics
  { pattern: /api|endpoint|rest|graphql/i, tag: 'api' },
  { pattern: /database|sql|postgres|mongo|sqlite/i, tag: 'database' },
  { pattern: /auth|login|jwt|oauth|session/i, tag: 'auth' },
  { pattern: /test|spec|jest|vitest|pytest/i, tag: 'testing' },
  { pattern: /docker|container|kubernetes/i, tag: 'devops' },
  { pattern: /aws|gcp|azure|cloud/i, tag: 'cloud' },
  { pattern: /css|style|tailwind|sass/i, tag: 'styling' },
  { pattern: /websocket|realtime|socket/i, tag: 'realtime' },
  { pattern: /file|upload|storage|s3/i, tag: 'files' },
  { pattern: /cache|redis|memcached/i, tag: 'caching' },
  { pattern: /error|bug|fix|debug/i, tag: 'debugging' },
  { pattern: /refactor|cleanup|optimize/i, tag: 'refactoring' },
  { pattern: /security|vulnerability|cve/i, tag: 'security' },
];

// ═══════════════════════════════════════════════════════════════
// Transcript Analysis
// ═══════════════════════════════════════════════════════════════

interface TranscriptMessage {
  type?: string;
  role?: 'user' | 'assistant';
  content?: string;
  tool_use?: Array<{ name: string }>;
}

interface SessionAnalysis {
  complexity: number;
  messageCount: number;
  toolUseCount: number;
  tags: string[];
  firstUserPrompt: string;
  problemSummary: string;
}

/**
 * Analyze a session transcript
 */
async function analyzeTranscript(transcriptPath: string): Promise<SessionAnalysis | null> {
  try {
    const content = await Bun.file(transcriptPath).text();

    // Parse JSONL format
    const lines = content.split('\n').filter(l => l.trim());
    const messages: TranscriptMessage[] = [];

    for (const line of lines) {
      try {
        messages.push(JSON.parse(line));
      } catch {
        // Skip invalid lines
      }
    }

    // Count messages and tool uses
    const userMessages = messages.filter(m => m.role === 'user' || m.type === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant' || m.type === 'assistant');

    const toolUseCount = assistantMessages.reduce((count, m) => {
      return count + (m.tool_use?.length || 0);
    }, 0);

    // Calculate complexity
    let complexity = 1;
    complexity += Math.min(3, Math.floor(assistantMessages.length / 5));
    complexity += Math.min(3, Math.floor(toolUseCount / 3));
    const totalContent = messages.map(m => m.content || '').join(' ');
    complexity += Math.min(2, Math.floor(totalContent.length / 10000));
    complexity = Math.min(10, Math.max(1, complexity));

    // Extract tags
    const tags: string[] = [];
    for (const { pattern, tag } of TAG_PATTERNS) {
      if (pattern.test(totalContent) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    // Get first user prompt
    const firstUserMessage = userMessages[0]?.content || '';
    const problemSummary = firstUserMessage.slice(0, 200);

    return {
      complexity,
      messageCount: assistantMessages.length,
      toolUseCount,
      tags: tags.slice(0, 8),
      firstUserPrompt: firstUserMessage,
      problemSummary,
    };
  } catch {
    return null;
  }
}

/**
 * Log analysis to file
 */
function logAnalysis(
  sessionId: string,
  trigger: string,
  analysis: SessionAnalysis
): void {
  const logPath = join(homedir(), '.claude', 'matrix', 'session-analysis.jsonl');
  const logDir = dirname(logPath);

  try {
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const entry = {
      timestamp: new Date().toISOString(),
      sessionId,
      trigger,
      complexity: analysis.complexity,
      messageCount: analysis.messageCount,
      toolUseCount: analysis.toolUseCount,
      tags: analysis.tags,
      problemSummary: analysis.problemSummary.slice(0, 100),
    };

    appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Silently ignore log errors
  }
}

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<PreCompactInput>();

    // Get config
    const config = getConfig();
    const preCompactConfig = config.hooks.preCompact;

    // Skip if disabled
    if (!preCompactConfig.enabled || preCompactConfig.behavior === 'disabled') {
      process.exit(0);
    }

    // Skip if no transcript
    if (!input.transcript_path || !existsSync(input.transcript_path)) {
      process.exit(0);
    }

    // Analyze transcript
    const analysis = await analyzeTranscript(input.transcript_path);
    if (!analysis) {
      process.exit(0);
    }

    // Log analysis if enabled
    if (preCompactConfig.logToFile) {
      logAnalysis(input.session_id, input.trigger, analysis);
    }

    // PreCompact hook cannot inject context or block
    // Just log the analysis for later reference
    process.exit(0);
  } catch (err) {
    // Log error but don't block (PreCompact can't block anyway)
    console.error(`[Matrix] PreCompact hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
