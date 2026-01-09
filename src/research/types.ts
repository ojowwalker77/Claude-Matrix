/**
 * Deep Research Types
 */

export type ResearchDepth = 'quick' | 'standard' | 'exhaustive';

export interface ResearchQuery {
  original: string;
  expanded: string[];
  domains: string[];
  intent: 'learn' | 'implement' | 'compare' | 'debug' | 'optimize';
}

export interface SourceReference {
  type: 'web' | 'context7' | 'matrix' | 'github' | 'stackoverflow';
  title: string;
  url?: string;
  snippet?: string;
  relevance: number; // 0-1
}

export interface ResearchFinding {
  topic: string;
  content: string;
  codeExamples?: Array<{
    language: string;
    code: string;
    description?: string;
  }>;
  sources: SourceReference[];
}

export interface ResearchResult {
  query: string;
  depth: ResearchDepth;
  summary: string;
  findings: ResearchFinding[];
  bestPractices: string[];
  pitfalls: string[];
  sources: SourceReference[];
  generatedAt: string;
  tokenEstimate: number;
}

export interface ResearchConfig {
  depth: ResearchDepth;
  sources: Array<'web' | 'context7' | 'matrix' | 'github'>;
  outputPath?: string;
  maxSources: number;
  maxTokens: number;
}

export const DEFAULT_CONFIG: Record<ResearchDepth, Omit<ResearchConfig, 'depth' | 'outputPath'>> = {
  quick: {
    sources: ['web', 'context7'],
    maxSources: 3,
    maxTokens: 2000,
  },
  standard: {
    sources: ['web', 'context7', 'matrix', 'github'],
    maxSources: 6,
    maxTokens: 5000,
  },
  exhaustive: {
    sources: ['web', 'context7', 'matrix', 'github'],
    maxSources: 12,
    maxTokens: 15000,
  },
};
