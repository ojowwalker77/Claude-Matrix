#!/usr/bin/env bun
/**
 * Matrix Plugin Build Script
 *
 * Compiles MCP server and hooks into standalone binaries for each platform.
 *
 * Usage:
 *   bun run scripts/build.ts              # Build for current platform
 *   bun run scripts/build.ts --all        # Build for all platforms
 *   bun run scripts/build.ts --target darwin-arm64  # Build for specific platform
 */

import { $ } from 'bun';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const BIN_DIR = join(ROOT_DIR, 'bin');
const SRC_DIR = join(ROOT_DIR, 'src');

interface Target {
  name: string;
  bunTarget: string;
  dir: string;
}

const TARGETS: Target[] = [
  { name: 'macOS ARM64', bunTarget: 'bun-darwin-arm64', dir: 'darwin-arm64' },
  { name: 'macOS x64', bunTarget: 'bun-darwin-x64', dir: 'darwin-x64' },
  { name: 'Linux x64', bunTarget: 'bun-linux-x64', dir: 'linux-x64' },
  { name: 'Linux ARM64', bunTarget: 'bun-linux-arm64', dir: 'linux-arm64' },
];

function getCurrentPlatform(): string {
  const os = process.platform;
  const arch = process.arch;

  if (os === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (os === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (os === 'linux' && arch === 'x64') return 'linux-x64';
  if (os === 'linux' && arch === 'arm64') return 'linux-arm64';

  throw new Error(`Unsupported platform: ${os}-${arch}`);
}

async function buildTarget(target: Target): Promise<void> {
  const outDir = join(BIN_DIR, target.dir);

  console.log(`\n🔨 Building for ${target.name}...`);

  // Create output directory
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // Build MCP server
  console.log(`  → Building MCP server...`);
  await $`bun build --compile --target=${target.bunTarget} --minify \
    --outfile=${join(outDir, 'matrix-mcp')} \
    ${join(SRC_DIR, 'index.ts')}`.quiet();

  // Build unified hooks
  console.log(`  → Building hooks...`);
  await $`bun build --compile --target=${target.bunTarget} --minify \
    --outfile=${join(outDir, 'matrix-hooks')} \
    ${join(SRC_DIR, 'hooks', 'unified-entry.ts')}`.quiet();

  console.log(`  ✓ ${target.name} complete`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const buildAll = args.includes('--all');
  const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1];

  console.log('🚀 Matrix Plugin Build');
  console.log('='.repeat(40));

  // Clean bin directory if building all
  if (buildAll && existsSync(BIN_DIR)) {
    console.log('🧹 Cleaning bin directory...');
    rmSync(BIN_DIR, { recursive: true });
  }

  let targetsToBuilt: Target[];

  if (buildAll) {
    console.log('📦 Building for all platforms...');
    targetsToBuilt = TARGETS;
  } else if (targetArg) {
    const target = TARGETS.find((t) => t.dir === targetArg);
    if (!target) {
      console.error(`Unknown target: ${targetArg}`);
      console.error(`Available: ${TARGETS.map((t) => t.dir).join(', ')}`);
      process.exit(1);
    }
    targetsToBuilt = [target];
  } else {
    // Build for current platform only
    const currentDir = getCurrentPlatform();
    const target = TARGETS.find((t) => t.dir === currentDir);
    if (!target) {
      console.error(`Current platform not supported: ${currentDir}`);
      process.exit(1);
    }
    console.log(`📦 Building for current platform (${target.name})...`);
    targetsToBuilt = [target];
  }

  const startTime = Date.now();

  for (const target of targetsToBuilt) {
    await buildTarget(target);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✨ Build complete in ${elapsed}s`);
  console.log(`📁 Output: ${BIN_DIR}`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
