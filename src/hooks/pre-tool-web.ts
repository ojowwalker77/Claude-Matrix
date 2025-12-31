#!/usr/bin/env bun
/**
 * PreToolUse:WebFetch/WebSearch Hook
 *
 * Intercepts WebFetch and WebSearch requests to detect library documentation queries.
 * When a doc query is detected, blocks the tool and instructs Claude to use Context7 instead.
 *
 * Exit codes:
 *   0 = Success (allow tool, optionally with context)
 *   1 = Non-blocking error
 *   2 = Blocking error
 */

import {
  readStdin,
  outputJson,
  outputText,
  hooksEnabled,
  type PreToolUseInput,
  type HookOutput,
} from './index.js';

// Patterns that indicate a documentation lookup
const DOC_PATTERNS = [
  /docs?\./i,                              // docs.example.com, doc.rust-lang.org
  /documentation/i,                        // "documentation for X"
  /api[.\-_]?reference/i,                  // "API reference"
  /official.*docs?/i,                      // "official docs"
  /how\s+to\s+use.*(?:library|package|framework|module)/i,
  /getting\s+started.*(?:with|guide)/i,
  /(?:read|check|see).*(?:the\s+)?docs?/i,
];

// Library/framework patterns with their Context7 identifiers
const LIBRARY_PATTERNS: Array<{ pattern: RegExp; libraries: string[] }> = [
  // Frontend frameworks
  { pattern: /\b(react|reactjs)\b/i, libraries: ['react'] },
  { pattern: /\b(vue|vuejs|vue\.js)\b/i, libraries: ['vue'] },
  { pattern: /\b(angular)\b/i, libraries: ['angular'] },
  { pattern: /\b(svelte|sveltekit)\b/i, libraries: ['svelte'] },
  { pattern: /\b(next|nextjs|next\.js)\b/i, libraries: ['next.js'] },
  { pattern: /\b(nuxt|nuxtjs)\b/i, libraries: ['nuxt'] },
  { pattern: /\b(remix)\b/i, libraries: ['remix'] },
  { pattern: /\b(astro)\b/i, libraries: ['astro'] },
  { pattern: /\b(solid|solidjs)\b/i, libraries: ['solid'] },

  // Runtimes
  { pattern: /\b(bun)\b/i, libraries: ['bun'] },
  { pattern: /\b(deno)\b/i, libraries: ['deno'] },
  { pattern: /\b(node|nodejs|node\.js)\b/i, libraries: ['node.js'] },

  // Backend frameworks
  { pattern: /\b(express|expressjs)\b/i, libraries: ['express'] },
  { pattern: /\b(fastify)\b/i, libraries: ['fastify'] },
  { pattern: /\b(hono)\b/i, libraries: ['hono'] },
  { pattern: /\b(elysia)\b/i, libraries: ['elysia'] },
  { pattern: /\b(koa)\b/i, libraries: ['koa'] },
  { pattern: /\b(nestjs|nest)\b/i, libraries: ['nestjs'] },

  // CSS/UI
  { pattern: /\b(tailwind|tailwindcss)\b/i, libraries: ['tailwindcss'] },
  { pattern: /\b(shadcn)\b/i, libraries: ['shadcn'] },
  { pattern: /\b(radix)\b/i, libraries: ['radix'] },
  { pattern: /\b(chakra)\b/i, libraries: ['chakra-ui'] },
  { pattern: /\b(mui|material.?ui)\b/i, libraries: ['material-ui'] },

  // Database/ORM
  { pattern: /\b(prisma)\b/i, libraries: ['prisma'] },
  { pattern: /\b(drizzle)\b/i, libraries: ['drizzle'] },
  { pattern: /\b(kysely)\b/i, libraries: ['kysely'] },
  { pattern: /\b(typeorm)\b/i, libraries: ['typeorm'] },
  { pattern: /\b(sequelize)\b/i, libraries: ['sequelize'] },
  { pattern: /\b(mongoose)\b/i, libraries: ['mongoose'] },
  { pattern: /\b(supabase)\b/i, libraries: ['supabase'] },

  // Validation
  { pattern: /\b(zod)\b/i, libraries: ['zod'] },
  { pattern: /\b(yup)\b/i, libraries: ['yup'] },
  { pattern: /\b(joi)\b/i, libraries: ['joi'] },
  { pattern: /\b(valibot)\b/i, libraries: ['valibot'] },

  // Testing
  { pattern: /\b(vitest)\b/i, libraries: ['vitest'] },
  { pattern: /\b(jest)\b/i, libraries: ['jest'] },
  { pattern: /\b(playwright)\b/i, libraries: ['playwright'] },
  { pattern: /\b(cypress)\b/i, libraries: ['cypress'] },
  { pattern: /\b(testing.?library)\b/i, libraries: ['testing-library'] },

  // State management
  { pattern: /\b(zustand)\b/i, libraries: ['zustand'] },
  { pattern: /\b(redux)\b/i, libraries: ['redux'] },
  { pattern: /\b(jotai)\b/i, libraries: ['jotai'] },
  { pattern: /\b(recoil)\b/i, libraries: ['recoil'] },
  { pattern: /\b(mobx)\b/i, libraries: ['mobx'] },

  // API/HTTP
  { pattern: /\b(axios)\b/i, libraries: ['axios'] },
  { pattern: /\b(tanstack|react.?query)\b/i, libraries: ['tanstack-query'] },
  { pattern: /\b(trpc)\b/i, libraries: ['trpc'] },
  { pattern: /\b(graphql)\b/i, libraries: ['graphql'] },
  { pattern: /\b(apollo)\b/i, libraries: ['apollo'] },

  // Auth
  { pattern: /\b(auth\.?js|next.?auth)\b/i, libraries: ['auth.js'] },
  { pattern: /\b(clerk)\b/i, libraries: ['clerk'] },
  { pattern: /\b(lucia)\b/i, libraries: ['lucia'] },

  // Build tools
  { pattern: /\b(vite)\b/i, libraries: ['vite'] },
  { pattern: /\b(webpack)\b/i, libraries: ['webpack'] },
  { pattern: /\b(esbuild)\b/i, libraries: ['esbuild'] },
  { pattern: /\b(rollup)\b/i, libraries: ['rollup'] },
  { pattern: /\b(turbopack|turborepo)\b/i, libraries: ['turbo'] },

  // Python
  { pattern: /\b(fastapi)\b/i, libraries: ['fastapi'] },
  { pattern: /\b(django)\b/i, libraries: ['django'] },
  { pattern: /\b(flask)\b/i, libraries: ['flask'] },
  { pattern: /\b(pydantic)\b/i, libraries: ['pydantic'] },
  { pattern: /\b(pandas)\b/i, libraries: ['pandas'] },
  { pattern: /\b(numpy)\b/i, libraries: ['numpy'] },
  { pattern: /\b(pytorch|torch)\b/i, libraries: ['pytorch'] },
  { pattern: /\b(tensorflow)\b/i, libraries: ['tensorflow'] },

  // Rust
  { pattern: /\b(tokio)\b/i, libraries: ['tokio'] },
  { pattern: /\b(axum)\b/i, libraries: ['axum'] },
  { pattern: /\b(actix)\b/i, libraries: ['actix'] },
  { pattern: /\b(serde)\b/i, libraries: ['serde'] },

  // Go
  { pattern: /\b(gin)\b/i, libraries: ['gin'] },
  { pattern: /\b(echo)\b/i, libraries: ['echo'] },
  { pattern: /\b(fiber)\b/i, libraries: ['fiber'] },

  // Cloud/Infra
  { pattern: /\b(docker)\b/i, libraries: ['docker'] },
  { pattern: /\b(kubernetes|k8s)\b/i, libraries: ['kubernetes'] },
  { pattern: /\b(terraform)\b/i, libraries: ['terraform'] },
  { pattern: /\b(pulumi)\b/i, libraries: ['pulumi'] },

  // AI/ML
  { pattern: /\b(langchain)\b/i, libraries: ['langchain'] },
  { pattern: /\b(openai)\b/i, libraries: ['openai'] },
  { pattern: /\b(anthropic)\b/i, libraries: ['anthropic'] },
  { pattern: /\b(vercel.?ai|ai.?sdk)\b/i, libraries: ['vercel-ai'] },
];

/**
 * Check if the query/URL looks like a documentation lookup
 */
function isDocQuery(text: string): boolean {
  return DOC_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Extract library names from query/URL
 */
function extractLibraries(text: string): string[] {
  const found: string[] = [];

  for (const { pattern, libraries } of LIBRARY_PATTERNS) {
    if (pattern.test(text)) {
      found.push(...libraries);
    }
  }

  return [...new Set(found)]; // Dedupe
}

/**
 * Extract the search topic from the query
 */
function extractTopic(text: string, libraries: string[]): string {
  let topic = text;

  // Remove library names to get the actual topic
  for (const lib of libraries) {
    topic = topic.replace(new RegExp(`\\b${lib}\\b`, 'gi'), '');
  }

  // Remove common doc-related words
  topic = topic
    .replace(/\b(docs?|documentation|api|reference|guide|tutorial|how\s+to|getting\s+started)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return topic || 'general usage';
}

export async function run() {
  try {
    if (!hooksEnabled()) {
      process.exit(0);
    }

    const input = await readStdin<PreToolUseInput>();

    // Get the query or URL from tool input
    const query = (input.tool_input.query as string) || '';
    const url = (input.tool_input.url as string) || '';
    const searchText = query || url;

    if (!searchText) {
      process.exit(0); // No query/URL, allow tool
    }

    // Check if this looks like a doc query
    const looksLikeDocs = isDocQuery(searchText);
    const libraries = extractLibraries(searchText);

    // If no library detected or doesn't look like docs, allow the tool
    if (libraries.length === 0 || !looksLikeDocs) {
      process.exit(0);
    }

    // Extract the topic they're searching for
    const topic = extractTopic(searchText, libraries);
    const libraryList = libraries.join(', ');

    // Output context to Claude explaining what to do
    outputText(`[Context7 Intercept]
Detected documentation query for: ${libraryList}
Topic: ${topic}

Use the Context7 MCP tools instead of WebFetch/WebSearch for accurate, up-to-date documentation:
1. Call resolve-library-id with libraryName="${libraries[0]}"
2. Use the returned ID to call get-library-docs with topic="${topic}"

Context7 provides verified, current documentation that is more reliable than web search results.
[End Context7 Intercept]`);

    // Block the WebFetch/WebSearch tool
    outputJson({
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: `Found ${libraryList} in Context7. Use resolve-library-id and get-library-docs instead.`,
      },
    } satisfies HookOutput);

    process.exit(0);
  } catch (err) {
    // Don't block on errors, let the tool proceed
    console.error(`[Context7 Hook Error] ${err instanceof Error ? err.message : 'Unknown error'}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
