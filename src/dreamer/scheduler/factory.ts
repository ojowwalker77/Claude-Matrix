/**
 * Scheduler Factory
 *
 * Detects the current platform and returns the appropriate scheduler.
 * Supports macOS (launchd) and Linux (crontab).
 */

import { platform } from 'os';
import { BaseScheduler, SchedulerError } from './base.js';
import { DarwinScheduler } from './darwin.js';
import { LinuxScheduler } from './linux.js';

/**
 * Cached scheduler instance
 */
let cachedScheduler: BaseScheduler | null = null;

/**
 * Get the appropriate scheduler for the current platform
 */
export function getScheduler(): BaseScheduler {
  if (cachedScheduler) {
    return cachedScheduler;
  }

  const currentPlatform = platform();

  switch (currentPlatform) {
    case 'darwin':
      cachedScheduler = new DarwinScheduler();
      break;
    case 'linux':
      cachedScheduler = new LinuxScheduler();
      break;
    default:
      throw new SchedulerError(
        `Unsupported platform: ${currentPlatform}. Dreamer supports macOS (launchd) and Linux (crontab).`,
        currentPlatform,
        'init'
      );
  }

  return cachedScheduler;
}

/**
 * Get the platform name
 */
export function getPlatformName(): string {
  const currentPlatform = platform();
  switch (currentPlatform) {
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return currentPlatform;
  }
}

/**
 * Get the native scheduler name for the current platform
 */
export function getSchedulerName(): string {
  const currentPlatform = platform();
  switch (currentPlatform) {
    case 'darwin':
      return 'launchd';
    case 'linux':
      return 'crontab';
    default:
      return 'unknown';
  }
}

/**
 * Check if the current platform is supported
 */
export function isPlatformSupported(): boolean {
  const currentPlatform = platform();
  return ['darwin', 'linux'].includes(currentPlatform);
}

/**
 * Reset the cached scheduler (useful for testing)
 */
export function resetSchedulerCache(): void {
  cachedScheduler = null;
}
