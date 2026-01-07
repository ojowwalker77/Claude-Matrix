/**
 * Tool Registry - Dynamic tool visibility based on project context
 *
 * Implements MCP list_changed notifications to show/hide tools based on:
 * - Project type detection (package.json, pyproject.toml, etc.)
 * - Index availability
 *
 * Uses Option B: Show all index tools if project is indexable,
 * grammars are lazy-downloaded on use.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { TOOLS, type ToolCategory, type VisibilityRule } from './schemas.js';
import { getConfig } from '../config/index.js';

/**
 * Project context for tool visibility decisions
 */
export interface ProjectContext {
  /** Current working directory */
  cwd: string;
  /** Whether the project has indexable source files */
  isIndexable: boolean;
  /** Detected project types (e.g., 'typescript', 'python', 'rust') */
  detectedTypes: string[];
  /** Whether the index is ready for this project */
  indexReady: boolean;
}

type ContextChangeCallback = (context: ProjectContext, toolsChanged: boolean) => void;

/**
 * Extended Tool type with Matrix metadata
 */
interface MatrixTool extends Tool {
  _meta?: {
    delegable?: boolean;
    category?: ToolCategory;
    visibility?: VisibilityRule;
  };
}

/**
 * Project type detection patterns
 */
const PROJECT_PATTERNS: Array<{ files: string[]; type: string }> = [
  // JavaScript/TypeScript
  { files: ['package.json', 'tsconfig.json', 'jsconfig.json'], type: 'typescript' },
  // Python
  { files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'], type: 'python' },
  // Go
  { files: ['go.mod'], type: 'go' },
  // Rust
  { files: ['Cargo.toml'], type: 'rust' },
  // Java/Kotlin
  { files: ['pom.xml', 'build.gradle', 'build.gradle.kts'], type: 'java' },
  // Swift
  { files: ['Package.swift'], type: 'swift' },
  // C#
  { files: ['*.csproj', '*.sln', 'global.json'], type: 'csharp' },
  // Ruby
  { files: ['Gemfile'], type: 'ruby' },
  // PHP
  { files: ['composer.json'], type: 'php' },
  // Elixir
  { files: ['mix.exs'], type: 'elixir' },
  // Zig
  { files: ['build.zig'], type: 'zig' },
  // C/C++
  { files: ['CMakeLists.txt', 'Makefile', 'configure.ac'], type: 'cpp' },
];

class ToolRegistry {
  private context: ProjectContext = {
    cwd: process.cwd(),
    isIndexable: false,
    detectedTypes: [],
    indexReady: false,
  };

  private callbacks: ContextChangeCallback[] = [];
  private initialized = false;

  /**
   * Get current project context
   */
  getContext(): ProjectContext {
    return { ...this.context };
  }

  /**
   * Detect project context from working directory
   */
  detectProjectContext(cwd: string): ProjectContext {
    const detectedTypes: string[] = [];

    for (const pattern of PROJECT_PATTERNS) {
      for (const file of pattern.files) {
        // Handle glob patterns (simplified - just check exact match)
        if (file.includes('*')) {
          // Skip glob patterns for now - they're rare and we'd need glob lib
          continue;
        }
        if (existsSync(join(cwd, file))) {
          if (!detectedTypes.includes(pattern.type)) {
            detectedTypes.push(pattern.type);
          }
          break;
        }
      }
    }

    const newContext: ProjectContext = {
      cwd,
      isIndexable: detectedTypes.length > 0,
      detectedTypes,
      indexReady: false, // Will be updated after indexing
    };

    return newContext;
  }

  /**
   * Initialize registry with project context
   * Call this once at MCP server startup
   */
  initialize(cwd: string): void {
    if (this.initialized) return;

    const newContext = this.detectProjectContext(cwd);
    this.context = newContext;
    this.initialized = true;

    this.logIfVerbose(`Detected project types: ${newContext.detectedTypes.join(', ') || 'none'}`);
  }

  /**
   * Update context and notify listeners if tools changed
   * Returns true if the available tools changed
   */
  updateContext(partial: Partial<ProjectContext>): boolean {
    const oldTools = this.getAvailableToolNames();

    this.context = { ...this.context, ...partial };

    const newTools = this.getAvailableToolNames();
    const toolsChanged = !this.arraysEqual(oldTools, newTools);

    if (toolsChanged) {
      this.logIfVerbose(`Tools changed: ${oldTools.length} → ${newTools.length}`);
    }

    // Notify all callbacks
    this.callbacks.forEach(cb => cb(this.context, toolsChanged));

    return toolsChanged;
  }

  /**
   * Mark index as ready for current project
   */
  setIndexReady(ready: boolean): boolean {
    return this.updateContext({ indexReady: ready });
  }

  /**
   * Get currently available tools based on context
   */
  getAvailableTools(): Tool[] {
    return TOOLS.filter(tool => this.isToolVisible(tool as MatrixTool));
  }

  /**
   * Get names of currently available tools (for comparison)
   */
  private getAvailableToolNames(): string[] {
    return this.getAvailableTools().map(t => t.name);
  }

  /**
   * Register callback for context changes
   * Callback receives (context, toolsChanged) where toolsChanged indicates
   * if the available tool list changed (triggering list_changed notification)
   */
  onContextChange(callback: ContextChangeCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove a callback
   */
  offContextChange(callback: ContextChangeCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index >= 0) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Check if a tool should be visible in current context
   */
  private isToolVisible(tool: MatrixTool): boolean {
    const meta = tool._meta;
    const visibility = meta?.visibility || 'always';

    switch (visibility) {
      case 'always':
        return true;

      case 'indexable':
        // Show if project is indexable (has recognized project files)
        return this.context.isIndexable;

      case 'index-ready':
        // Show if index is actually ready (after successful indexing)
        return this.context.indexReady;

      default:
        return true;
    }
  }

  /**
   * Log message if verbose mode is enabled
   */
  private logIfVerbose(message: string): void {
    try {
      const config = getConfig();
      if (config.toolSearch?.verbose) {
        console.error(`[Matrix Registry] ${message}`);
      }
    } catch {
      // Config not available yet, skip logging
    }
  }

  /**
   * Compare two string arrays for equality
   */
  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();
