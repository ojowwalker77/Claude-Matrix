/**
 * Multi-Language Parser Facade
 *
 * Async parser that delegates to language-specific tree-sitter parsers.
 * Maintains backward compatibility with the original ParseResult interface.
 */

import type { ParseResult, ExtractedSymbol, ExtractedImport } from './types.js';
import {
  getLanguageByExtension,
  initParser,
  loadLanguage,
  type LanguageConfig,
} from './languages/index.js';
import { TypeScriptParser } from './languages/typescript.js';
import { PythonParser } from './languages/python.js';
import { GoParser } from './languages/go.js';
import { RustParser } from './languages/rust.js';
import { JavaParser } from './languages/java.js';
import { CSharpParser } from './languages/csharp.js';
import { KotlinParser } from './languages/kotlin.js';
import { SwiftParser } from './languages/swift.js';
import { RubyParser } from './languages/ruby.js';
import { PHPParser } from './languages/php.js';
import { CParser } from './languages/c.js';
import { CppParser } from './languages/cpp.js';
import { ElixirParser } from './languages/elixir.js';
import { ZigParser } from './languages/zig.js';
import type { LanguageParser } from './languages/base.js';

// Parser cache by language ID
const parserCache = new Map<string, LanguageParser>();

/**
 * Get or create a language parser instance
 */
async function getParserForLanguage(config: LanguageConfig): Promise<LanguageParser | null> {
  const cached = parserCache.get(config.id);
  if (cached) return cached;

  try {
    const parser = await initParser();
    const language = await loadLanguage(config);

    let langParser: LanguageParser;

    switch (config.id) {
      case 'typescript':
      case 'tsx':
      case 'javascript':
      case 'jsx':
        langParser = new TypeScriptParser(parser, language);
        break;

      case 'python':
        langParser = new PythonParser(parser, language);
        break;

      case 'go':
        langParser = new GoParser(parser, language);
        break;

      case 'rust':
        langParser = new RustParser(parser, language);
        break;

      case 'java':
        langParser = new JavaParser(parser, language);
        break;

      case 'csharp':
        langParser = new CSharpParser(parser, language);
        break;

      case 'kotlin':
        langParser = new KotlinParser(parser, language);
        break;

      case 'swift':
        langParser = new SwiftParser(parser, language);
        break;

      case 'ruby':
        langParser = new RubyParser(parser, language);
        break;

      case 'php':
        langParser = new PHPParser(parser, language);
        break;

      case 'c':
        langParser = new CParser(parser, language);
        break;

      case 'cpp':
        langParser = new CppParser(parser, language);
        break;

      case 'elixir':
        langParser = new ElixirParser(parser, language);
        break;

      case 'zig':
        langParser = new ZigParser(parser, language);
        break;

      default:
        return null;
    }

    parserCache.set(config.id, langParser);
    return langParser;
  } catch (err) {
    console.error(`Failed to initialize parser for ${config.id}:`, err);
    return null;
  }
}

/**
 * Parse a file and extract symbols and imports
 *
 * This is the main entry point - now async to support tree-sitter initialization.
 */
export async function parseFile(filePath: string, content: string): Promise<ParseResult> {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const langConfig = getLanguageByExtension(ext);

  if (!langConfig) {
    // Unsupported language - return empty result (not an error)
    return {
      symbols: [],
      imports: [],
    };
  }

  const parser = await getParserForLanguage(langConfig);
  if (!parser) {
    return {
      symbols: [],
      imports: [],
      errors: [`Parser not implemented for ${langConfig.name}`],
    };
  }

  return parser.parse(filePath, content);
}

/**
 * Parse file content and return only symbols (convenience function)
 */
export async function extractSymbols(filePath: string, content: string): Promise<ExtractedSymbol[]> {
  const result = await parseFile(filePath, content);
  return result.symbols;
}

/**
 * Parse file content and return only imports (convenience function)
 */
export async function extractImports(filePath: string, content: string): Promise<ExtractedImport[]> {
  const result = await parseFile(filePath, content);
  return result.imports;
}

/**
 * Check if a file extension is supported for parsing
 */
export function isParsingSupported(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return getLanguageByExtension(ext) !== undefined;
}

/**
 * Get the language ID for a file path
 */
export function getLanguageId(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return getLanguageByExtension(ext)?.id;
}
