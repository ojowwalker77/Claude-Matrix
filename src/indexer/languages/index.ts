/**
 * Language Registry
 *
 * Maps file extensions to language parsers and manages
 * tree-sitter initialization and grammar loading.
 * Grammars are downloaded on-demand and cached in ~/.claude/matrix/grammars/
 */

import { Parser, Language } from 'web-tree-sitter';
import { downloadGrammar, ensureTreeSitterCore, getCacheDir } from './download.js';

// Re-export types for convenience
export type { Parser, Language };

export interface LanguageConfig {
  id: string;
  name: string;
  extensions: string[];
  wasmFile: string;
}

/**
 * Supported languages with their configurations
 */
export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['ts', 'mts', 'cts'],
    wasmFile: 'tree-sitter-typescript.wasm',
  },
  {
    id: 'tsx',
    name: 'TSX',
    extensions: ['tsx'],
    wasmFile: 'tree-sitter-tsx.wasm',
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    wasmFile: 'tree-sitter-javascript.wasm',
  },
  {
    id: 'jsx',
    name: 'JSX',
    extensions: ['jsx'],
    wasmFile: 'tree-sitter-javascript.wasm',
  },
  {
    id: 'python',
    name: 'Python',
    extensions: ['py', 'pyw', 'pyi'],
    wasmFile: 'tree-sitter-python.wasm',
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['go'],
    wasmFile: 'tree-sitter-go.wasm',
  },
  {
    id: 'rust',
    name: 'Rust',
    extensions: ['rs'],
    wasmFile: 'tree-sitter-rust.wasm',
  },
  {
    id: 'java',
    name: 'Java',
    extensions: ['java'],
    wasmFile: 'tree-sitter-java.wasm',
  },
  {
    id: 'c',
    name: 'C',
    extensions: ['c', 'h'],
    wasmFile: 'tree-sitter-c.wasm',
  },
  {
    id: 'cpp',
    name: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx', 'hh'],
    wasmFile: 'tree-sitter-cpp.wasm',
  },
  {
    id: 'ruby',
    name: 'Ruby',
    extensions: ['rb', 'rake', 'gemspec'],
    wasmFile: 'tree-sitter-ruby.wasm',
  },
  {
    id: 'php',
    name: 'PHP',
    extensions: ['php'],
    wasmFile: 'tree-sitter-php.wasm',
  },
  {
    id: 'csharp',
    name: 'C#',
    extensions: ['cs', 'csx'],
    wasmFile: 'tree-sitter-c-sharp.wasm',
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    extensions: ['kt', 'kts'],
    wasmFile: 'tree-sitter-kotlin.wasm',
  },
  {
    id: 'swift',
    name: 'Swift',
    extensions: ['swift'],
    wasmFile: 'tree-sitter-swift.wasm',
  },
  {
    id: 'elixir',
    name: 'Elixir',
    extensions: ['ex', 'exs'],
    wasmFile: 'tree-sitter-elixir.wasm',
  },
  {
    id: 'zig',
    name: 'Zig',
    extensions: ['zig'],
    wasmFile: 'tree-sitter-zig.wasm',
  },
];

// Build extension lookup map
const extensionMap = new Map<string, LanguageConfig>();
for (const lang of SUPPORTED_LANGUAGES) {
  for (const ext of lang.extensions) {
    extensionMap.set(ext.toLowerCase(), lang);
  }
}

/**
 * Get language config by file extension
 */
export function getLanguageByExtension(ext: string): LanguageConfig | undefined {
  return extensionMap.get(ext.toLowerCase().replace(/^\./, ''));
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return Array.from(extensionMap.keys());
}

/**
 * Check if a file extension is supported
 */
export function isExtensionSupported(ext: string): boolean {
  return extensionMap.has(ext.toLowerCase().replace(/^\./, ''));
}

// Parser singleton
let parserInstance: Parser | null = null;
let parserInitPromise: Promise<Parser> | null = null;

// Language cache
const languageCache = new Map<string, Language>();

/**
 * Initialize and return the tree-sitter parser
 * Downloads the core WASM file on first use
 */
export async function initParser(): Promise<Parser> {
  if (parserInstance) return parserInstance;

  if (parserInitPromise) return parserInitPromise;

  parserInitPromise = (async () => {
    // Ensure tree-sitter core WASM is downloaded
    await ensureTreeSitterCore();

    await Parser.init({
      locateFile: (_scriptName: string, _scriptDirectory: string) => {
        // Return path to cached web-tree-sitter.wasm
        return getCacheDir() + '/web-tree-sitter.wasm';
      },
    });

    parserInstance = new Parser();
    return parserInstance;
  })();

  return parserInitPromise;
}

/**
 * Load a language grammar
 * Downloads the grammar WASM file on first use
 */
export async function loadLanguage(config: LanguageConfig): Promise<Language> {
  const cached = languageCache.get(config.id);
  if (cached) return cached;

  // Download grammar if not cached
  const wasmPath = await downloadGrammar(config.wasmFile);
  const language = await Language.load(wasmPath);
  languageCache.set(config.id, language);
  return language;
}

/**
 * Get the grammars cache directory path
 */
export function getGrammarsPath(): string {
  return getCacheDir();
}
