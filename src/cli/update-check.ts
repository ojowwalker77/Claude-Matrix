import { join } from 'path';
import { bold, yellow, dim, cyan, padEnd } from './utils/output.js';

const CACHE_FILE = join(process.env['HOME'] || '~', '.claude', 'matrix', '.update-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GITHUB_RELEASES_API = 'https://api.github.com/repos/ojowwalker77/Claude-Matrix/releases/latest';

interface UpdateCache {
  lastCheck: number;
  latestVersion: string | null;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

async function getLocalVersion(): Promise<string> {
  try {
    const pkgPath = new URL('../../package.json', import.meta.url).pathname;
    const pkg = await Bun.file(pkgPath).json();
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    const file = Bun.file(CACHE_FILE);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Cache read failed, ignore
  }
  return null;
}

async function writeCache(latestVersion: string | null): Promise<void> {
  try {
    const cache: UpdateCache = {
      lastCheck: Date.now(),
      latestVersion,
    };
    await Bun.write(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Cache write failed, ignore
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const response = await fetch(GITHUB_RELEASES_API, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'claude-matrix-cli',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { tag_name?: string };
    // Remove 'v' prefix if present (e.g., 'v0.5.0' -> '0.5.0')
    const version = data.tag_name?.replace(/^v/, '') || null;
    return version;
  } catch {
    // Network error or timeout, fail silently
    return null;
  }
}

function compareVersions(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Check for updates (non-blocking, cached)
 * Returns update info if an update is available, null otherwise
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const currentVersion = await getLocalVersion();

  // Check cache first
  const cache = await readCache();
  if (cache && (Date.now() - cache.lastCheck) < CACHE_TTL_MS) {
    if (cache.latestVersion && compareVersions(currentVersion, cache.latestVersion)) {
      return {
        currentVersion,
        latestVersion: cache.latestVersion,
        updateAvailable: true,
      };
    }
    return null;
  }

  // Fetch from npm registry
  const latestVersion = await fetchLatestVersion();
  await writeCache(latestVersion);

  if (latestVersion && compareVersions(currentVersion, latestVersion)) {
    return {
      currentVersion,
      latestVersion,
      updateAvailable: true,
    };
  }

  return null;
}

/**
 * Print update notification to stderr (non-blocking)
 */
export function printUpdateNotification(info: UpdateInfo): void {
  const w = 38;
  const hr = '─'.repeat(w);

  console.error('');
  console.error(yellow(`╭${hr}╮`));
  console.error(yellow('│') + padEnd(`  ${bold('Update available!')}`, w) + yellow('│'));
  console.error(yellow('│') + padEnd(`  ${dim(info.currentVersion)} → ${cyan(info.latestVersion)}`, w) + yellow('│'));
  console.error(yellow('│') + ' '.repeat(w) + yellow('│'));
  console.error(yellow('│') + padEnd(`  Run: ${bold('matrix upgrade')}`, w) + yellow('│'));
  console.error(yellow('│') + padEnd(`  Or:  ${bold('brew upgrade matrix')}`, w) + yellow('│'));
  console.error(yellow(`╰${hr}╯`));
  console.error('');
}

/**
 * Run update check in background and print notification if update available
 * This is fire-and-forget, won't block the CLI
 */
export function runBackgroundUpdateCheck(): void {
  // Run async without awaiting
  checkForUpdates()
    .then((info) => {
      if (info?.updateAvailable) {
        printUpdateNotification(info);
      }
    })
    .catch(() => {
      // Silently ignore errors
    });
}
