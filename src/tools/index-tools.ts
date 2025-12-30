/**
 * Repository Index Query Tools
 *
 * MCP tools for querying the code index:
 * - matrix_find_definition: Find where a symbol is defined
 * - matrix_list_exports: List exports from a file or directory
 * - matrix_index_status: Get index status for current repo
 * - matrix_search_symbols: Search symbols by partial name
 */

import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import {
  findDefinitions,
  findExports,
  getIndexStatus,
  searchSymbols,
  getFileImports,
} from '../indexer/store.js';
import { indexRepository } from '../indexer/index.js';
import type { SymbolKind, DefinitionResult, ExportResult, IndexStatus } from '../indexer/types.js';

/**
 * Find git repository root
 */
function findGitRoot(startPath: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: startPath,
    encoding: 'utf-8',
  });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return null;
}

/**
 * Generate stable repo ID from path
 */
function generateRepoId(root: string): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 8);
  return `repo_${hash}`;
}

/**
 * Language detection result
 */
interface LanguageDetection {
  language: string | null;
  supported: boolean;
  markers: string[];
}

/**
 * Detect project language and whether it's supported for indexing
 */
function detectProjectLanguage(root: string): LanguageDetection {
  // Supported languages
  if (existsSync(join(root, 'package.json')) ||
      existsSync(join(root, 'tsconfig.json')) ||
      existsSync(join(root, 'jsconfig.json'))) {
    return { language: 'TypeScript/JavaScript', supported: true, markers: ['package.json', 'tsconfig.json'] };
  }
  if (existsSync(join(root, 'pyproject.toml')) ||
      existsSync(join(root, 'setup.py')) ||
      existsSync(join(root, 'requirements.txt'))) {
    return { language: 'Python', supported: true, markers: ['pyproject.toml', 'setup.py', 'requirements.txt'] };
  }
  if (existsSync(join(root, 'go.mod'))) {
    return { language: 'Go', supported: true, markers: ['go.mod'] };
  }
  if (existsSync(join(root, 'Cargo.toml'))) {
    return { language: 'Rust', supported: true, markers: ['Cargo.toml'] };
  }

  // Newly supported languages (v1.1.0)
  if (existsSync(join(root, 'pom.xml')) ||
      existsSync(join(root, 'build.gradle')) ||
      existsSync(join(root, 'build.gradle.kts'))) {
    return { language: 'Java/Kotlin', supported: true, markers: ['pom.xml', 'build.gradle'] };
  }
  if (existsSync(join(root, 'Package.swift')) ||
      existsSync(join(root, '*.xcodeproj')) ||
      existsSync(join(root, '*.xcworkspace'))) {
    return { language: 'Swift', supported: true, markers: ['Package.swift', '.xcodeproj'] };
  }
  // C# detection - global.json is the most reliable indicator
  if (existsSync(join(root, 'global.json'))) {
    return { language: 'C#', supported: true, markers: ['global.json', '.csproj', '.sln'] };
  }

  // Newly supported in v1.1.0 (continued)
  if (existsSync(join(root, 'Gemfile'))) {
    return { language: 'Ruby', supported: true, markers: ['Gemfile'] };
  }
  if (existsSync(join(root, 'composer.json'))) {
    return { language: 'PHP', supported: true, markers: ['composer.json'] };
  }
  if (existsSync(join(root, 'CMakeLists.txt')) ||
      existsSync(join(root, 'Makefile'))) {
    return { language: 'C/C++', supported: true, markers: ['CMakeLists.txt', 'Makefile'] };
  }
  if (existsSync(join(root, 'mix.exs'))) {
    return { language: 'Elixir', supported: true, markers: ['mix.exs'] };
  }
  if (existsSync(join(root, 'build.zig'))) {
    return { language: 'Zig', supported: true, markers: ['build.zig'] };
  }
  if (existsSync(join(root, 'deno.json')) ||
      existsSync(join(root, 'deno.jsonc'))) {
    return { language: 'Deno', supported: false, markers: ['deno.json'] };
  }
  if (existsSync(join(root, 'pubspec.yaml'))) {
    return { language: 'Dart/Flutter', supported: false, markers: ['pubspec.yaml'] };
  }
  if (existsSync(join(root, 'Makefile.PL')) ||
      existsSync(join(root, 'cpanfile'))) {
    return { language: 'Perl', supported: false, markers: ['Makefile.PL', 'cpanfile'] };
  }
  if (existsSync(join(root, 'Project.toml'))) {
    return { language: 'Julia', supported: false, markers: ['Project.toml'] };
  }
  if (existsSync(join(root, 'stack.yaml')) ||
      existsSync(join(root, 'cabal.project'))) {
    return { language: 'Haskell', supported: false, markers: ['stack.yaml', 'cabal.project'] };
  }
  if (existsSync(join(root, 'rebar.config'))) {
    return { language: 'Erlang', supported: false, markers: ['rebar.config'] };
  }
  if (existsSync(join(root, 'project.clj')) ||
      existsSync(join(root, 'deps.edn'))) {
    return { language: 'Clojure', supported: false, markers: ['project.clj', 'deps.edn'] };
  }
  if (existsSync(join(root, 'build.sbt'))) {
    return { language: 'Scala', supported: false, markers: ['build.sbt'] };
  }
  if (existsSync(join(root, 'dub.json')) ||
      existsSync(join(root, 'dub.sdl'))) {
    return { language: 'D', supported: false, markers: ['dub.json'] };
  }
  if (existsSync(join(root, 'spago.dhall')) ||
      existsSync(join(root, 'spago.yaml'))) {
    return { language: 'PureScript', supported: false, markers: ['spago.dhall'] };
  }
  if (existsSync(join(root, 'shard.yml'))) {
    return { language: 'Crystal', supported: false, markers: ['shard.yml'] };
  }
  if (existsSync(join(root, 'Package.resolved')) ||
      existsSync(join(root, '*.xcodeproj'))) {
    return { language: 'Swift/Objective-C', supported: false, markers: ['Package.resolved', '.xcodeproj'] };
  }
  if (existsSync(join(root, 'nimble.nimble')) ||
      existsSync(join(root, '*.nimble'))) {
    return { language: 'Nim', supported: false, markers: ['.nimble'] };
  }
  if (existsSync(join(root, 'v.mod'))) {
    return { language: 'V', supported: false, markers: ['v.mod'] };
  }
  if (existsSync(join(root, 'gleam.toml'))) {
    return { language: 'Gleam', supported: false, markers: ['gleam.toml'] };
  }
  if (existsSync(join(root, 'esy.json'))) {
    return { language: 'OCaml/Reason', supported: false, markers: ['esy.json'] };
  }

  return { language: null, supported: false, markers: [] };
}

/**
 * Generate appropriate error message based on language detection
 */
function getNotIndexableMessage(root: string): string {
  const detection = detectProjectLanguage(root);

  if (detection.language && !detection.supported) {
    return `Detected ${detection.language} project - indexing coming soon! Currently supported: TypeScript/JavaScript, Python, Go, Rust, Java, Kotlin, Swift, C#, Ruby, PHP, C/C++, Elixir, Zig`;
  }

  if (!detection.language) {
    return 'No recognized project found. Supported: TypeScript/JavaScript, Python, Go, Rust, Java, Kotlin, Swift, C#, Ruby, PHP, C/C++, Elixir, Zig';
  }

  return 'Not in an indexable repository';
}

/**
 * Check if directory is an indexable project
 */
function isIndexableProject(root: string): boolean {
  const detection = detectProjectLanguage(root);
  return detection.supported;
}

/**
 * Result from getRepoInfo - either success with repo info or failure with message
 */
type RepoInfoResult =
  | { success: true; root: string; id: string }
  | { success: false; message: string };

/**
 * Get repo info from a path (defaults to cwd)
 */
function getRepoInfo(targetPath?: string): RepoInfoResult {
  // Resolve relative paths to absolute
  const basePath = targetPath ? resolve(targetPath) : process.cwd();

  // Verify path exists
  if (!existsSync(basePath)) {
    return {
      success: false,
      message: `Path does not exist: ${basePath}`,
    };
  }

  const root = findGitRoot(basePath) || basePath;

  if (!isIndexableProject(root)) {
    return {
      success: false,
      message: getNotIndexableMessage(root),
    };
  }

  return {
    success: true,
    root,
    id: generateRepoId(root),
  };
}

// Tool input types
export interface FindDefinitionInput {
  symbol: string;
  kind?: SymbolKind;
  file?: string;
  repoPath?: string;
}

export interface ListExportsInput {
  path?: string;
  repoPath?: string;
}

export interface SearchSymbolsInput {
  query: string;
  limit?: number;
  repoPath?: string;
}

export interface GetImportsInput {
  file: string;
  repoPath?: string;
}

export interface IndexStatusInput {
  repoPath?: string;
}

// Tool output types
export interface FindDefinitionResult {
  found: boolean;
  definitions?: DefinitionResult[];
  message?: string;
}

export interface ListExportsResult {
  found: boolean;
  exports?: ExportResult[];
  message?: string;
}

export interface IndexStatusResult {
  indexed: boolean;
  status?: IndexStatus;
  message?: string;
}

export interface SearchSymbolsResult {
  found: boolean;
  results?: DefinitionResult[];
  message?: string;
}

/**
 * Find where a symbol is defined
 */
export function matrixFindDefinition(input: FindDefinitionInput): FindDefinitionResult {
  const repo = getRepoInfo(input.repoPath);
  if (!repo.success) {
    return {
      found: false,
      message: repo.message,
    };
  }

  const definitions = findDefinitions(
    repo.id,
    input.symbol,
    input.kind,
    input.file
  );

  if (definitions.length === 0) {
    return {
      found: false,
      message: `No definitions found for "${input.symbol}"`,
    };
  }

  return {
    found: true,
    definitions,
  };
}

/**
 * List all exports from a file or directory
 */
export function matrixListExports(input: ListExportsInput): ListExportsResult {
  const repo = getRepoInfo(input.repoPath);
  if (!repo.success) {
    return {
      found: false,
      message: repo.message,
    };
  }

  const exports = findExports(repo.id, input.path);

  if (exports.length === 0) {
    return {
      found: false,
      message: input.path
        ? `No exports found in "${input.path}"`
        : 'No exports found in repository',
    };
  }

  return {
    found: true,
    exports,
  };
}

/**
 * Get index status for a repository
 */
export function matrixIndexStatus(input: IndexStatusInput = {}): IndexStatusResult {
  const repo = getRepoInfo(input.repoPath);
  if (!repo.success) {
    return {
      indexed: false,
      message: repo.message,
    };
  }

  const repoName = repo.root.split('/').pop() || 'unknown';
  const status = getIndexStatus(repo.id, repoName);

  if (status.filesIndexed === 0) {
    return {
      indexed: false,
      message: 'Repository not yet indexed. Run session start to index.',
    };
  }

  return {
    indexed: true,
    status,
  };
}

/**
 * Search symbols by partial name match
 */
export function matrixSearchSymbols(input: SearchSymbolsInput): SearchSymbolsResult {
  const repo = getRepoInfo(input.repoPath);
  if (!repo.success) {
    return {
      found: false,
      message: repo.message,
    };
  }

  const results = searchSymbols(repo.id, input.query, input.limit || 20);

  if (results.length === 0) {
    return {
      found: false,
      message: `No symbols matching "${input.query}" found`,
    };
  }

  return {
    found: true,
    results,
  };
}

/**
 * Get imports for a specific file
 */
export function matrixGetImports(input: GetImportsInput) {
  const repo = getRepoInfo(input.repoPath);
  if (!repo.success) {
    return {
      found: false,
      message: repo.message,
    };
  }

  const imports = getFileImports(repo.id, input.file);

  if (imports.length === 0) {
    return {
      found: false,
      message: `No imports found in "${input.file}"`,
    };
  }

  return {
    found: true,
    imports,
  };
}

// Reindex input types
export interface ReindexInput {
  full?: boolean;  // Force full reindex (ignore incremental)
  repoPath?: string;  // Path to repository (defaults to cwd)
}

export interface ReindexResult {
  success: boolean;
  filesScanned?: number;
  filesIndexed?: number;
  filesSkipped?: number;
  symbolsFound?: number;
  importsFound?: number;
  duration?: number;
  message?: string;
}

/**
 * Manually trigger repository reindexing
 */
export async function matrixReindex(input: ReindexInput = {}): Promise<ReindexResult> {
  const repo = getRepoInfo(input.repoPath);
  if (!repo.success) {
    return {
      success: false,
      message: repo.message,
    };
  }

  try {
    const result = await indexRepository({
      repoRoot: repo.root,
      repoId: repo.id,
      incremental: !input.full,
    });

    return {
      success: true,
      filesScanned: result.filesScanned,
      filesIndexed: result.filesIndexed,
      filesSkipped: result.filesSkipped,
      symbolsFound: result.symbolsFound,
      importsFound: result.importsFound,
      duration: result.duration,
      message: result.filesIndexed > 0
        ? `Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols`
        : `Index up to date (${result.filesSkipped} files unchanged)`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Indexing failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
