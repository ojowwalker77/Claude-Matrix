/**
 * Skill Factory Tools
 *
 * Identify high-value solutions and promote them to Claude Code Skills.
 */

import { getDb } from '../db/client.js';

// ============================================================================
// Types
// ============================================================================

export interface SkillCandidatesInput {
  minScore?: number;      // Minimum success rate (default: 0.7)
  minUses?: number;       // Minimum number of uses (default: 3)
  limit?: number;         // Max candidates to return (default: 10)
  excludePromoted?: boolean; // Exclude already promoted (default: true)
}

export interface SkillCandidate {
  solutionId: string;
  problem: string;
  solution: string;
  successRate: number;
  uses: number;
  complexity: number | null;
  category: string | null;
  tags: string[];
  suggestedSkillName: string;
  promotionScore: number;  // Composite score for ranking
  createdAt: string;
}

export interface SkillCandidatesResult {
  candidates: SkillCandidate[];
  total: number;
  criteria: {
    minScore: number;
    minUses: number;
  };
}

export interface LinkSkillInput {
  solutionId: string;
  skillPath: string;  // Path to the skill file
}

export interface LinkSkillResult {
  success: boolean;
  solutionId: string;
  skillPath: string;
  message: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Generate a suggested skill name from a problem description
 */
function generateSkillName(problem: string): string {
  // Extract key words and create a kebab-case name
  const words = problem
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !['the', 'and', 'for', 'with', 'how', 'what', 'when', 'why', 'that', 'this'].includes(w))
    .slice(0, 4);

  if (words.length === 0) {
    return 'custom-skill';
  }

  return words.join('-');
}

/**
 * Calculate a promotion score based on multiple factors
 */
function calculatePromotionScore(
  successRate: number,
  uses: number,
  complexity: number | null
): number {
  // Base score from success rate (0-50 points)
  const successScore = successRate * 50;

  // Usage score (0-30 points, diminishing returns after 10 uses)
  const usageScore = Math.min(30, uses * 3);

  // Complexity bonus (0-20 points, prefer medium complexity)
  // Too simple (1-2) = not worth a skill
  // Too complex (9-10) = hard to reuse
  // Sweet spot (4-7) = best candidates
  let complexityScore = 10; // Default for null
  if (complexity !== null) {
    if (complexity >= 4 && complexity <= 7) {
      complexityScore = 20;
    } else if (complexity >= 3 && complexity <= 8) {
      complexityScore = 15;
    } else {
      complexityScore = 5;
    }
  }

  return successScore + usageScore + complexityScore;
}

/**
 * Find solutions that are good candidates for promotion to Skills
 */
export function matrixSkillCandidates(input: SkillCandidatesInput = {}): SkillCandidatesResult {
  const db = getDb();

  const minScore = input.minScore ?? 0.7;
  const minUses = input.minUses ?? 3;
  const limit = input.limit ?? 10;
  const excludePromoted = input.excludePromoted ?? true;

  // Query for high-value solutions
  let query = `
    SELECT
      id,
      problem,
      solution,
      score,
      uses,
      successes,
      failures,
      complexity,
      category,
      tags,
      created_at,
      promoted_to_skill
    FROM solutions
    WHERE uses >= ?
      AND (successes * 1.0 / NULLIF(uses, 0)) >= ?
  `;

  const params: (number | string)[] = [minUses, minScore];

  if (excludePromoted) {
    query += ' AND promoted_to_skill IS NULL';
  }

  query += ' ORDER BY score DESC, uses DESC LIMIT ?';
  params.push(limit * 2); // Fetch more for ranking

  const rows = db.query(query).all(...params) as Array<{
    id: string;
    problem: string;
    solution: string;
    score: number;
    uses: number;
    successes: number;
    failures: number;
    complexity: number | null;
    category: string | null;
    tags: string | null;
    created_at: string;
    promoted_to_skill: string | null;
  }>;

  // Calculate promotion scores and sort
  const candidates: SkillCandidate[] = rows
    .map(row => {
      const successRate = row.uses > 0 ? row.successes / row.uses : 0;
      // Defensive JSON.parse - handle corrupted data gracefully
      let tags: string[] = [];
      try {
        tags = row.tags ? JSON.parse(row.tags) : [];
      } catch {
        tags = [];
      }

      return {
        solutionId: row.id,
        problem: row.problem,
        solution: row.solution.slice(0, 500) + (row.solution.length > 500 ? '...' : ''),
        successRate,
        uses: row.uses,
        complexity: row.complexity,
        category: row.category,
        tags,
        suggestedSkillName: generateSkillName(row.problem),
        promotionScore: calculatePromotionScore(successRate, row.uses, row.complexity),
        createdAt: row.created_at,
      };
    })
    .sort((a, b) => b.promotionScore - a.promotionScore)
    .slice(0, limit);

  return {
    candidates,
    total: candidates.length,
    criteria: {
      minScore,
      minUses,
    },
  };
}

/**
 * Link a solution to a skill file (mark as promoted)
 */
export function matrixLinkSkill(input: LinkSkillInput): LinkSkillResult {
  const db = getDb();

  // Verify solution exists
  const solution = db.query('SELECT id, promoted_to_skill FROM solutions WHERE id = ?')
    .get(input.solutionId) as { id: string; promoted_to_skill: string | null } | null;

  if (!solution) {
    return {
      success: false,
      solutionId: input.solutionId,
      skillPath: input.skillPath,
      message: `Solution ${input.solutionId} not found`,
    };
  }

  if (solution.promoted_to_skill) {
    return {
      success: false,
      solutionId: input.solutionId,
      skillPath: input.skillPath,
      message: `Solution already promoted to: ${solution.promoted_to_skill}`,
    };
  }

  // Update solution with skill link
  const now = new Date().toISOString();
  db.query(`
    UPDATE solutions
    SET promoted_to_skill = ?, promoted_at = ?, updated_at = ?
    WHERE id = ?
  `).run(input.skillPath, now, now, input.solutionId);

  return {
    success: true,
    solutionId: input.solutionId,
    skillPath: input.skillPath,
    message: `Solution ${input.solutionId} linked to skill at ${input.skillPath}`,
  };
}

/**
 * Generate a skill markdown template from a solution
 */
export function generateSkillTemplate(
  solutionId: string,
  skillName: string
): string | null {
  const db = getDb();

  const solution = db.query(`
    SELECT problem, solution, tags, category, prerequisites, anti_patterns, code_blocks
    FROM solutions WHERE id = ?
  `).get(solutionId) as {
    problem: string;
    solution: string;
    tags: string | null;
    category: string | null;
    prerequisites: string | null;
    anti_patterns: string | null;
    code_blocks: string | null;
  } | null;

  if (!solution) {
    return null;
  }

  // Defensive JSON.parse - handle corrupted data gracefully
  const safeJsonParse = <T>(json: string | null, fallback: T): T => {
    if (!json) return fallback;
    try {
      return JSON.parse(json) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const tags = safeJsonParse<string[]>(solution.tags, []);
  const prerequisites = safeJsonParse<string[]>(solution.prerequisites, []);
  const antiPatterns = safeJsonParse<string[]>(solution.anti_patterns, []);
  const codeBlocks = safeJsonParse<Array<{ language?: string; code: string; description?: string }>>(solution.code_blocks, []);

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`description: "${solution.problem.slice(0, 100).replace(/"/g, '\\"')}"`);
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${skillName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`);
  lines.push('');

  // Problem
  lines.push('## Problem');
  lines.push('');
  lines.push(solution.problem);
  lines.push('');

  // Solution
  lines.push('## Solution');
  lines.push('');
  lines.push(solution.solution);
  lines.push('');

  // Code examples
  if (codeBlocks.length > 0) {
    lines.push('## Code Examples');
    lines.push('');
    for (const block of codeBlocks) {
      if (block.description) {
        lines.push(`### ${block.description}`);
        lines.push('');
      }
      lines.push(`\`\`\`${block.language || ''}`);
      lines.push(block.code);
      lines.push('```');
      lines.push('');
    }
  }

  // Prerequisites
  if (prerequisites.length > 0) {
    lines.push('## Prerequisites');
    lines.push('');
    for (const prereq of prerequisites) {
      lines.push(`- ${prereq}`);
    }
    lines.push('');
  }

  // Anti-patterns
  if (antiPatterns.length > 0) {
    lines.push('## What NOT to Do');
    lines.push('');
    for (const pattern of antiPatterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push('');
  }

  // Tags
  if (tags.length > 0) {
    lines.push('## Tags');
    lines.push('');
    lines.push(tags.map((t: string) => `\`${t}\``).join(' '));
    lines.push('');
  }

  // Source reference
  lines.push('---');
  lines.push(`*Generated from Matrix solution \`${solutionId}\`*`);

  return lines.join('\n');
}
