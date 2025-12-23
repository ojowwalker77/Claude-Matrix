/**
 * Complexity Evaluation - Pattern-based scoring
 *
 * Analyzes prompts to estimate implementation complexity on a 1-10 scale.
 * Uses weighted pattern matching for fast, cost-free evaluation.
 */

export interface ComplexityResult {
  score: number;
  reasoning: string;
  factors: string[];
}

/**
 * Complexity indicators with weights
 */
const PATTERNS = {
  // High-impact action verbs (base complexity)
  actions: {
    weight: 2,
    patterns: [
      /\b(implement|integrate|build|create|design|architect|develop)\b/i,
      /\b(refactor|migrate|overhaul|rewrite|restructure)\b/i,
      /\b(set\s*up|configure|deploy|provision)\b/i,
    ],
    label: 'implementation task',
  },

  // External services/integrations
  external: {
    weight: 2,
    patterns: [
      /\b(api|sdk|oauth|auth0|firebase|supabase|stripe|twilio)\b/i,
      /\b(aws|gcp|azure|cloudflare|vercel|netlify)\b/i,
      /\b(statsig|launchdarkly|posthog|amplitude|segment)\b/i,
      /\b(database|redis|postgres|mongodb|mysql|sqlite)\b/i,
      /\b(docker|kubernetes|k8s|terraform|pulumi)\b/i,
    ],
    label: 'external integration',
  },

  // Scope indicators (affects many files)
  scope: {
    weight: 1.5,
    patterns: [
      /\b(entire|whole|all\s+files?|across|throughout)\b/i,
      /\b(codebase|project|application|system)\b/i,
      /\b(every|each)\s+(file|component|module|service)\b/i,
    ],
    label: 'broad scope',
  },

  // Multi-step indicators
  multiStep: {
    weight: 1,
    patterns: [
      /\b(first|then|after\s+that|next|finally|step\s*\d+)\b/i,
      /\b(and\s+also|as\s+well\s+as|in\s+addition)\b/i,
      /\d+\.\s+\w/m, // Numbered lists
      /[-*]\s+\w.*\n[-*]\s+\w/m, // Bullet lists with multiple items
    ],
    label: 'multi-step',
  },

  // Technical complexity domains
  technical: {
    weight: 1.5,
    patterns: [
      /\b(authentication|authorization|security|encryption|jwt|session)\b/i,
      /\b(migration|schema|model|entity|relationship)\b/i,
      /\b(real-?time|websocket|sse|streaming|polling)\b/i,
      /\b(cache|caching|memoiz|optimization|performance)\b/i,
      /\b(concurrent|parallel|async|queue|worker|job)\b/i,
      /\b(test|testing|coverage|e2e|integration\s+test)\b/i,
    ],
    label: 'technical complexity',
  },

  // Uncertainty/exploration needed
  ambiguity: {
    weight: 0.5,
    patterns: [
      /\b(how\s+(should|do|can|would)|what('?s|\s+is)\s+the\s+best)\b/i,
      /\b(recommend|suggest|advice|opinion)\b/i,
      /\b(not\s+sure|unclear|don'?t\s+know)\b/i,
    ],
    label: 'requires exploration',
  },

  // Explicit complexity markers
  explicit: {
    weight: 2,
    patterns: [
      /\b(complex|complicated|difficult|challenging|non-?trivial)\b/i,
      /\b(major|significant|substantial|extensive)\b/i,
    ],
    label: 'explicitly complex',
  },
} as const;

/**
 * Low-complexity indicators (reduce score)
 */
const SIMPLE_PATTERNS = {
  trivial: {
    weight: -2,
    patterns: [
      /\b(fix\s+typo|rename|add\s+comment|update\s+readme)\b/i,
      /\b(simple|quick|small|minor|trivial)\b/i,
      /\b(just|only|single)\s+(one|a|1)\b/i,
    ],
    label: 'simple task',
  },

  informational: {
    weight: -3,
    patterns: [
      /\b(what\s+is|explain|describe|show\s+me|list)\b/i,
      /\b(where\s+is|find|locate|search\s+for)\b/i,
      /\b(how\s+does|why\s+does|what\s+does)\b/i,
    ],
    label: 'informational query',
  },
} as const;

/**
 * Estimate complexity of a prompt
 */
export async function estimateComplexity(prompt: string): Promise<ComplexityResult> {
  const factors: string[] = [];
  let score = 3; // Base score for any task

  // Check positive complexity patterns
  for (const [_key, config] of Object.entries(PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(prompt)) {
        score += config.weight;
        if (!factors.includes(config.label)) {
          factors.push(config.label);
        }
        break; // Only count each category once
      }
    }
  }

  // Check simplifying patterns
  for (const [_key, config] of Object.entries(SIMPLE_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(prompt)) {
        score += config.weight; // These are negative
        if (!factors.includes(config.label)) {
          factors.push(config.label);
        }
        break;
      }
    }
  }

  // Length bonus (longer prompts often = more complex tasks)
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 100) {
    score += 1;
    factors.push('detailed prompt');
  } else if (wordCount > 200) {
    score += 2;
    factors.push('very detailed prompt');
  }

  // Multiple sentences bonus
  const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length >= 4) {
    score += 1;
    factors.push('multi-part request');
  }

  // Clamp to 1-10 range
  score = Math.max(1, Math.min(10, Math.round(score)));

  // Generate reasoning
  const reasoning = factors.length > 0
    ? factors.slice(0, 3).join(', ')
    : 'standard task';

  return { score, reasoning, factors };
}

/**
 * Check if prompt needs Matrix recall based on complexity
 */
export async function needsMatrixRecall(prompt: string, threshold = 5): Promise<boolean> {
  const result = await estimateComplexity(prompt);
  return result.score >= threshold;
}
