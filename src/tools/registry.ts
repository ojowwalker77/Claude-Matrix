/**
 * Tool Registry - Static tool list
 *
 * All tools are always visible. Dynamic visibility was removed
 * because MCP list_changed has poor client support and only one
 * tool (matrix_reindex) was conditionally hidden.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './schemas.js';

/**
 * Get all available tools (always returns full list)
 */
export function getAvailableTools(): Tool[] {
  return TOOLS;
}

// Backward-compat: singleton with same interface used by index.ts, index-tools.ts, workers.ts
export const toolRegistry = {
  initialize(_cwd: string): void {
    // No-op: all tools always visible
  },
  onContextChange(_callback: (...args: unknown[]) => void): void {
    // No-op: tools never change
  },
  getAvailableTools,
  setIndexReady(_ready: boolean): boolean {
    return false; // Tools never change
  },
  getContext() {
    return { cwd: process.cwd(), isIndexable: true, detectedTypes: [], indexReady: true };
  },
  detectProjectContext(_cwd: string) {
    return { cwd: _cwd, isIndexable: true, detectedTypes: [], indexReady: true };
  },
  updateContext(_partial: Record<string, unknown>): boolean {
    return false;
  },
};
