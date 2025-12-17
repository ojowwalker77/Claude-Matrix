import { existsSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { spawnSync } from 'child_process';

export interface DetectedRepo {
  root: string;
  name: string;
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  patterns: string[];
  testFramework: string | null;
}

// Framework detection patterns
const FRAMEWORK_PATTERNS: Record<string, string[]> = {
  // JS/TS
  react: ['react', 'react-dom', 'next', '@remix-run/react', 'gatsby'],
  vue: ['vue', 'nuxt', '@vue/cli'],
  angular: ['@angular/core'],
  svelte: ['svelte', '@sveltejs/kit'],
  express: ['express'],
  fastify: ['fastify'],
  hono: ['hono'],
  nestjs: ['@nestjs/core'],
  koa: ['koa'],
  // Python
  fastapi: ['fastapi'],
  django: ['django'],
  flask: ['flask'],
  starlette: ['starlette'],
  // Rust
  actix: ['actix-web'],
  axum: ['axum'],
  rocket: ['rocket'],
  warp: ['warp'],
  // Go
  gin: ['github.com/gin-gonic/gin'],
  echo: ['github.com/labstack/echo'],
  fiber: ['github.com/gofiber/fiber'],
  chi: ['github.com/go-chi/chi'],
};

// Test framework detection
const TEST_FRAMEWORKS: Record<string, string[]> = {
  jest: ['jest', '@jest/core'],
  vitest: ['vitest'],
  mocha: ['mocha'],
  pytest: ['pytest'],
  unittest: ['unittest'],
  'cargo-test': ['#[test]'],
  'go-test': ['testing'],
  bun: ['bun:test'],
};

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

function getRepoName(root: string): string {
  // Try git remote
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf-8',
  });

  if (result.status === 0 && result.stdout) {
    const url = result.stdout.trim();
    // Extract repo name from URL
    const match = url.match(/\/([^\/]+?)(\.git)?$/);
    if (match?.[1]) return match[1];
  }

  // Fallback to folder name
  return basename(root);
}

function detectFrameworks(deps: string[]): string[] {
  const detected: string[] = [];

  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (patterns.some(p => deps.includes(p))) {
      detected.push(framework);
    }
  }

  return detected;
}

function detectTestFramework(deps: string[], devDeps: string[]): string | null {
  const allDeps = [...deps, ...devDeps];

  for (const [framework, patterns] of Object.entries(TEST_FRAMEWORKS)) {
    if (patterns.some(p => allDeps.includes(p))) {
      return framework;
    }
  }

  return null;
}

function detectPatterns(root: string, deps: string[]): string[] {
  const patterns: string[] = [];

  // Monorepo detection
  if (existsSync(join(root, 'pnpm-workspace.yaml')) ||
      existsSync(join(root, 'lerna.json')) ||
      existsSync(join(root, 'nx.json'))) {
    patterns.push('monorepo');
  }

  // API detection
  if (deps.some(d => ['express', 'fastify', 'hono', 'koa', 'fastapi', 'flask', 'django', 'actix-web', 'axum', 'gin'].includes(d))) {
    patterns.push('api');
  }

  // CLI detection
  if (deps.some(d => ['commander', 'yargs', 'clap', 'cobra', 'click', 'argparse'].includes(d))) {
    patterns.push('cli');
  }

  // Library detection
  if (existsSync(join(root, 'tsconfig.build.json')) || deps.includes('tsup') || deps.includes('rollup')) {
    patterns.push('library');
  }

  return patterns;
}

function parsePackageJson(root: string): Partial<DetectedRepo> {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) return {};

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    const allDeps = [...deps, ...devDeps];

    const languages: string[] = [];
    if (devDeps.includes('typescript') || existsSync(join(root, 'tsconfig.json'))) {
      languages.push('typescript');
    } else {
      languages.push('javascript');
    }

    return {
      name: pkg.name || basename(root),
      languages,
      frameworks: detectFrameworks(allDeps),
      dependencies: deps.slice(0, 20),
      testFramework: detectTestFramework(deps, devDeps),
      patterns: detectPatterns(root, allDeps),
    };
  } catch {
    return {};
  }
}

function parseCargoToml(root: string): Partial<DetectedRepo> {
  const cargoPath = join(root, 'Cargo.toml');
  if (!existsSync(cargoPath)) return {};

  try {
    const content = readFileSync(cargoPath, 'utf-8');

    // Simple TOML parsing for name
    const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const name = nameMatch?.[1] || basename(root);

    // Extract dependencies
    const deps: string[] = [];
    const depsSection = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/);
    if (depsSection?.[1]) {
      const depMatches = depsSection[1].matchAll(/^(\w[\w-]*)\s*=/gm);
      for (const match of depMatches) {
        if (match[1]) deps.push(match[1]);
      }
    }

    return {
      name,
      languages: ['rust'],
      frameworks: detectFrameworks(deps),
      dependencies: deps.slice(0, 20),
      testFramework: 'cargo-test',
      patterns: detectPatterns(root, deps),
    };
  } catch {
    return {};
  }
}

function parsePyproject(root: string): Partial<DetectedRepo> {
  const pyprojectPath = join(root, 'pyproject.toml');
  const requirementsPath = join(root, 'requirements.txt');

  const deps: string[] = [];
  let name = basename(root);

  // Try pyproject.toml
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf-8');

      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (nameMatch?.[1]) name = nameMatch[1];

      // Extract dependencies from pyproject
      const depsMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depsMatch?.[1]) {
        const depMatches = depsMatch[1].matchAll(/"([^">=<\[]+)/g);
        for (const match of depMatches) {
          if (match[1]) deps.push(match[1].trim());
        }
      }
    } catch { /* ignore */ }
  }

  // Fallback to requirements.txt
  if (deps.length === 0 && existsSync(requirementsPath)) {
    try {
      const content = readFileSync(requirementsPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z][\w-]*)/);
        if (match?.[1]) deps.push(match[1]);
      }
    } catch { /* ignore */ }
  }

  if (deps.length === 0 && !existsSync(pyprojectPath)) return {};

  const devDeps = deps.filter(d => ['pytest', 'black', 'ruff', 'mypy', 'flake8'].includes(d));

  return {
    name,
    languages: ['python'],
    frameworks: detectFrameworks(deps),
    dependencies: deps.filter(d => !devDeps.includes(d)).slice(0, 20),
    testFramework: deps.includes('pytest') ? 'pytest' : null,
    patterns: detectPatterns(root, deps),
  };
}

function parseGoMod(root: string): Partial<DetectedRepo> {
  const goModPath = join(root, 'go.mod');
  if (!existsSync(goModPath)) return {};

  try {
    const content = readFileSync(goModPath, 'utf-8');

    // Extract module name
    const moduleMatch = content.match(/^module\s+(.+)$/m);
    const moduleName = moduleMatch?.[1]?.trim() || '';
    const name = moduleName.split('/').pop() || basename(root);

    // Extract dependencies
    const deps: string[] = [];
    const requireMatches = content.matchAll(/^\s*(\S+)\s+v[\d.]+/gm);
    for (const match of requireMatches) {
      if (match[1]) deps.push(match[1]);
    }

    return {
      name,
      languages: ['go'],
      frameworks: detectFrameworks(deps),
      dependencies: deps.slice(0, 20),
      testFramework: 'go-test',
      patterns: detectPatterns(root, deps.map(d => d.split('/').pop() || d)),
    };
  } catch {
    return {};
  }
}

export function fingerprintRepo(startPath?: string): DetectedRepo {
  const cwd = startPath || process.cwd();
  const root = findGitRoot(cwd) || cwd;
  const name = getRepoName(root);

  // Try each project type
  const packageJson = parsePackageJson(root);
  const cargoToml = parseCargoToml(root);
  const pyproject = parsePyproject(root);
  const goMod = parseGoMod(root);

  // Merge results (priority: package.json > Cargo.toml > pyproject > go.mod)
  const merged: DetectedRepo = {
    root,
    name: packageJson.name || cargoToml.name || pyproject.name || goMod.name || name,
    languages: [
      ...new Set([
        ...(packageJson.languages || []),
        ...(cargoToml.languages || []),
        ...(pyproject.languages || []),
        ...(goMod.languages || []),
      ]),
    ],
    frameworks: [
      ...new Set([
        ...(packageJson.frameworks || []),
        ...(cargoToml.frameworks || []),
        ...(pyproject.frameworks || []),
        ...(goMod.frameworks || []),
      ]),
    ],
    dependencies: [
      ...new Set([
        ...(packageJson.dependencies || []),
        ...(cargoToml.dependencies || []),
        ...(pyproject.dependencies || []),
        ...(goMod.dependencies || []),
      ]),
    ].slice(0, 30),
    patterns: [
      ...new Set([
        ...(packageJson.patterns || []),
        ...(cargoToml.patterns || []),
        ...(pyproject.patterns || []),
        ...(goMod.patterns || []),
      ]),
    ],
    testFramework: packageJson.testFramework || cargoToml.testFramework || pyproject.testFramework || goMod.testFramework || null,
  };

  return merged;
}

// Generate text for embedding
export function fingerprintToText(fp: DetectedRepo): string {
  const parts = [
    `project: ${fp.name}`,
    `languages: ${fp.languages.join(', ')}`,
    `frameworks: ${fp.frameworks.join(', ')}`,
    `patterns: ${fp.patterns.join(', ')}`,
    `dependencies: ${fp.dependencies.slice(0, 10).join(', ')}`,
  ];
  return parts.filter(p => !p.endsWith(': ')).join(' | ');
}
