/**
 * Grammar Downloader
 *
 * Downloads tree-sitter WASM grammars on-demand from GitHub releases.
 * Caches them in ~/.claude/matrix/grammars/ for reuse.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Cache directory for downloaded grammars
const CACHE_DIR = join(homedir(), '.claude', 'matrix', 'grammars');

// Base URL for grammar downloads (tree-sitter releases on GitHub)
const GRAMMAR_BASE_URLS: Record<string, string> = {
  'web-tree-sitter.wasm': 'https://unpkg.com/web-tree-sitter@0.26.3/web-tree-sitter.wasm',
  'tree-sitter-typescript.wasm': 'https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm',
  'tree-sitter-tsx.wasm': 'https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-tsx.wasm',
  'tree-sitter-javascript.wasm': 'https://unpkg.com/tree-sitter-javascript@0.25.0/tree-sitter-javascript.wasm',
  'tree-sitter-python.wasm': 'https://unpkg.com/tree-sitter-python@0.25.0/tree-sitter-python.wasm',
  'tree-sitter-go.wasm': 'https://unpkg.com/tree-sitter-go@0.25.0/tree-sitter-go.wasm',
  'tree-sitter-rust.wasm': 'https://unpkg.com/tree-sitter-rust@0.24.0/tree-sitter-rust.wasm',
  'tree-sitter-java.wasm': 'https://unpkg.com/tree-sitter-java@0.23.5/tree-sitter-java.wasm',
  'tree-sitter-c.wasm': 'https://unpkg.com/tree-sitter-c@0.24.1/tree-sitter-c.wasm',
  'tree-sitter-cpp.wasm': 'https://unpkg.com/tree-sitter-cpp@0.23.4/tree-sitter-cpp.wasm',
  'tree-sitter-ruby.wasm': 'https://unpkg.com/tree-sitter-ruby@0.23.1/tree-sitter-ruby.wasm',
  'tree-sitter-php.wasm': 'https://unpkg.com/tree-sitter-php@0.24.2/tree-sitter-php.wasm',
};

// Track ongoing downloads to avoid duplicates
const downloadPromises = new Map<string, Promise<string>>();

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get the path where a grammar should be cached
 */
export function getGrammarPath(filename: string): string {
  return join(CACHE_DIR, filename);
}

/**
 * Check if a grammar is already downloaded
 */
export function isGrammarCached(filename: string): boolean {
  return existsSync(getGrammarPath(filename));
}

/**
 * Download a grammar file if not cached
 * Returns the path to the cached file
 */
export async function downloadGrammar(filename: string): Promise<string> {
  const cachedPath = getGrammarPath(filename);

  // Already cached
  if (existsSync(cachedPath)) {
    return cachedPath;
  }

  // Check if download already in progress
  const existing = downloadPromises.get(filename);
  if (existing) {
    return existing;
  }

  // Start download
  const downloadPromise = (async () => {
    ensureCacheDir();

    const url = GRAMMAR_BASE_URLS[filename];
    if (!url) {
      throw new Error(`Unknown grammar: ${filename}`);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download ${filename}: ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      writeFileSync(cachedPath, Buffer.from(buffer));

      return cachedPath;
    } catch (err) {
      // Clean up on failure
      downloadPromises.delete(filename);
      throw err;
    }
  })();

  downloadPromises.set(filename, downloadPromise);

  try {
    const result = await downloadPromise;
    return result;
  } finally {
    // Clean up after successful download
    downloadPromises.delete(filename);
  }
}

/**
 * Download the core tree-sitter WASM if needed
 */
export async function ensureTreeSitterCore(): Promise<string> {
  return downloadGrammar('web-tree-sitter.wasm');
}

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  return CACHE_DIR;
}

/**
 * Read a cached grammar file
 */
export function readCachedGrammar(filename: string): Uint8Array | null {
  const path = getGrammarPath(filename);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path);
}
