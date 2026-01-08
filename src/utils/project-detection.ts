/**
 * Shared project detection utilities
 *
 * Consolidates project type detection logic used by:
 * - Tool Registry (for dynamic tool visibility)
 * - Index Tools (for language detection)
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Project type with indexing support info
 */
export interface ProjectType {
  type: string;
  displayName: string;
  supported: boolean;
  markers: string[];
}

/**
 * Detection result
 */
export interface DetectionResult {
  types: ProjectType[];
  isIndexable: boolean;
  primaryLanguage: string | null;
}

/**
 * Project detection patterns
 * Ordered by priority (most common first)
 */
const PROJECT_PATTERNS: Array<{
  files: string[];
  type: string;
  displayName: string;
  supported: boolean;
}> = [
  // JavaScript/TypeScript
  {
    files: ['package.json', 'tsconfig.json', 'jsconfig.json'],
    type: 'typescript',
    displayName: 'TypeScript/JavaScript',
    supported: true,
  },
  // Python
  {
    files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    type: 'python',
    displayName: 'Python',
    supported: true,
  },
  // Go
  {
    files: ['go.mod'],
    type: 'go',
    displayName: 'Go',
    supported: true,
  },
  // Rust
  {
    files: ['Cargo.toml'],
    type: 'rust',
    displayName: 'Rust',
    supported: true,
  },
  // Java/Kotlin
  {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    type: 'java',
    displayName: 'Java/Kotlin',
    supported: true,
  },
  // Swift
  {
    files: ['Package.swift'],
    type: 'swift',
    displayName: 'Swift',
    supported: true,
  },
  // C# - use glob patterns for .csproj and .sln
  {
    files: ['*.csproj', '*.sln', 'global.json'],
    type: 'csharp',
    displayName: 'C#',
    supported: true,
  },
  // Ruby
  {
    files: ['Gemfile'],
    type: 'ruby',
    displayName: 'Ruby',
    supported: true,
  },
  // PHP
  {
    files: ['composer.json'],
    type: 'php',
    displayName: 'PHP',
    supported: true,
  },
  // Elixir
  {
    files: ['mix.exs'],
    type: 'elixir',
    displayName: 'Elixir',
    supported: true,
  },
  // Zig
  {
    files: ['build.zig'],
    type: 'zig',
    displayName: 'Zig',
    supported: true,
  },
  // C/C++
  {
    files: ['CMakeLists.txt', 'Makefile', 'configure.ac'],
    type: 'cpp',
    displayName: 'C/C++',
    supported: true,
  },
  // Unsupported languages (for better error messages)
  {
    files: ['deno.json', 'deno.jsonc'],
    type: 'deno',
    displayName: 'Deno',
    supported: false,
  },
  {
    files: ['pubspec.yaml'],
    type: 'dart',
    displayName: 'Dart/Flutter',
    supported: false,
  },
  {
    files: ['Makefile.PL', 'cpanfile'],
    type: 'perl',
    displayName: 'Perl',
    supported: false,
  },
  {
    files: ['Project.toml'],
    type: 'julia',
    displayName: 'Julia',
    supported: false,
  },
  {
    files: ['stack.yaml', 'cabal.project'],
    type: 'haskell',
    displayName: 'Haskell',
    supported: false,
  },
  {
    files: ['rebar.config'],
    type: 'erlang',
    displayName: 'Erlang',
    supported: false,
  },
  {
    files: ['project.clj', 'deps.edn'],
    type: 'clojure',
    displayName: 'Clojure',
    supported: false,
  },
  {
    files: ['build.sbt'],
    type: 'scala',
    displayName: 'Scala',
    supported: false,
  },
  {
    files: ['dub.json', 'dub.sdl'],
    type: 'd',
    displayName: 'D',
    supported: false,
  },
  {
    files: ['spago.dhall', 'spago.yaml'],
    type: 'purescript',
    displayName: 'PureScript',
    supported: false,
  },
  {
    files: ['shard.yml'],
    type: 'crystal',
    displayName: 'Crystal',
    supported: false,
  },
  {
    files: ['v.mod'],
    type: 'v',
    displayName: 'V',
    supported: false,
  },
  {
    files: ['gleam.toml'],
    type: 'gleam',
    displayName: 'Gleam',
    supported: false,
  },
  {
    files: ['esy.json'],
    type: 'ocaml',
    displayName: 'OCaml/Reason',
    supported: false,
  },
];

/**
 * Check if a file exists in directory, supporting simple glob patterns
 * Supports: *.ext patterns (e.g., *.csproj, *.sln)
 */
function fileExistsWithGlob(dir: string, pattern: string): boolean {
  // Handle glob patterns like *.csproj
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1); // Get ".csproj" from "*.csproj"
    try {
      const files = readdirSync(dir);
      return files.some(f => f.endsWith(ext));
    } catch {
      return false;
    }
  }

  // Exact file match
  return existsSync(join(dir, pattern));
}

/**
 * Detect project types in a directory
 *
 * @param cwd - Directory to check
 * @returns Detection result with all detected types
 */
export function detectProjectTypes(cwd: string): DetectionResult {
  const detectedTypes: ProjectType[] = [];
  const seenTypes = new Set<string>();

  for (const pattern of PROJECT_PATTERNS) {
    // Skip if we already detected this type
    if (seenTypes.has(pattern.type)) continue;

    for (const file of pattern.files) {
      if (fileExistsWithGlob(cwd, file)) {
        seenTypes.add(pattern.type);
        detectedTypes.push({
          type: pattern.type,
          displayName: pattern.displayName,
          supported: pattern.supported,
          markers: pattern.files.filter(f => !f.includes('*')), // Return non-glob markers
        });
        break;
      }
    }
  }

  const supportedTypes = detectedTypes.filter(t => t.supported);
  const firstSupported = supportedTypes[0];

  return {
    types: detectedTypes,
    isIndexable: supportedTypes.length > 0,
    primaryLanguage: firstSupported?.displayName ?? null,
  };
}

/**
 * Get list of supported languages for error messages
 */
export function getSupportedLanguages(): string {
  return PROJECT_PATTERNS
    .filter(p => p.supported)
    .map(p => p.displayName)
    .join(', ');
}

/**
 * Generate appropriate error message based on detection
 */
export function getNotIndexableMessage(cwd: string): string {
  const detection = detectProjectTypes(cwd);

  // Found unsupported language
  const unsupported = detection.types.find(t => !t.supported);
  if (unsupported) {
    return `Detected ${unsupported.displayName} project - indexing coming soon! Currently supported: ${getSupportedLanguages()}`;
  }

  // No language detected
  if (detection.types.length === 0) {
    return `No recognized project found. Supported: ${getSupportedLanguages()}`;
  }

  return 'Not in an indexable repository';
}
