import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

// We need to test the registry functionality directly
// Can't import singleton as it initializes with process.cwd()

describe('Tool Registry', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'matrix-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('project detection', () => {
    it('should detect TypeScript project from package.json', async () => {
      writeFileSync(join(tempDir, 'package.json'), '{}');

      // Import fresh module to test detection
      const { toolRegistry } = await import('../tools/registry.js');
      const context = toolRegistry.detectProjectContext(tempDir);

      expect(context.isIndexable).toBe(true);
      expect(context.detectedTypes).toContain('typescript');
    });

    it('should detect Python project from pyproject.toml', async () => {
      writeFileSync(join(tempDir, 'pyproject.toml'), '');

      const { toolRegistry } = await import('../tools/registry.js');
      const context = toolRegistry.detectProjectContext(tempDir);

      expect(context.isIndexable).toBe(true);
      expect(context.detectedTypes).toContain('python');
    });

    it('should detect Rust project from Cargo.toml', async () => {
      writeFileSync(join(tempDir, 'Cargo.toml'), '');

      const { toolRegistry } = await import('../tools/registry.js');
      const context = toolRegistry.detectProjectContext(tempDir);

      expect(context.isIndexable).toBe(true);
      expect(context.detectedTypes).toContain('rust');
    });

    it('should detect Go project from go.mod', async () => {
      writeFileSync(join(tempDir, 'go.mod'), '');

      const { toolRegistry } = await import('../tools/registry.js');
      const context = toolRegistry.detectProjectContext(tempDir);

      expect(context.isIndexable).toBe(true);
      expect(context.detectedTypes).toContain('go');
    });

    it('should not detect project in empty directory', async () => {
      const { toolRegistry } = await import('../tools/registry.js');
      const context = toolRegistry.detectProjectContext(tempDir);

      expect(context.isIndexable).toBe(false);
      expect(context.detectedTypes).toHaveLength(0);
    });

    it('should detect multiple project types', async () => {
      writeFileSync(join(tempDir, 'package.json'), '{}');
      writeFileSync(join(tempDir, 'pyproject.toml'), '');

      const { toolRegistry } = await import('../tools/registry.js');
      const context = toolRegistry.detectProjectContext(tempDir);

      expect(context.isIndexable).toBe(true);
      expect(context.detectedTypes).toContain('typescript');
      expect(context.detectedTypes).toContain('python');
    });
  });

  describe('tool visibility', () => {
    it('should show all core tools regardless of project type', async () => {
      const { toolRegistry } = await import('../tools/registry.js');

      // Empty directory - no project detected
      const context = toolRegistry.detectProjectContext(tempDir);
      expect(context.isIndexable).toBe(false);

      // Update context to the empty directory
      toolRegistry.updateContext(context);

      const tools = toolRegistry.getAvailableTools();
      const toolNames = tools.map(t => t.name);

      // Core tools should always be visible
      expect(toolNames).toContain('matrix_recall');
      expect(toolNames).toContain('matrix_store');
      expect(toolNames).toContain('matrix_status');
      expect(toolNames).toContain('matrix_warn_check');
      expect(toolNames).toContain('matrix_doctor');

      // Index tools should be hidden (not indexable)
      expect(toolNames).not.toContain('matrix_find_definition');
      expect(toolNames).not.toContain('matrix_search_symbols');
    });

    it('should show index tools for indexable projects', async () => {
      writeFileSync(join(tempDir, 'package.json'), '{}');

      const { toolRegistry } = await import('../tools/registry.js');
      const context = toolRegistry.detectProjectContext(tempDir);
      toolRegistry.updateContext(context);

      const tools = toolRegistry.getAvailableTools();
      const toolNames = tools.map(t => t.name);

      // Index tools should be visible for TypeScript project
      expect(toolNames).toContain('matrix_find_definition');
      expect(toolNames).toContain('matrix_search_symbols');
      expect(toolNames).toContain('matrix_list_exports');
      expect(toolNames).toContain('matrix_get_imports');
      expect(toolNames).toContain('matrix_reindex');
    });
  });

  describe('context change notifications', () => {
    it('should notify callbacks when tools change', async () => {
      const { toolRegistry } = await import('../tools/registry.js');

      let callbackCalled = false;
      let toolsChanged = false;

      toolRegistry.onContextChange((ctx, changed) => {
        callbackCalled = true;
        toolsChanged = changed;
      });

      // Start with non-indexable
      toolRegistry.updateContext({ isIndexable: false, detectedTypes: [] });

      // Change to indexable - should trigger callback with toolsChanged=true
      toolRegistry.updateContext({ isIndexable: true, detectedTypes: ['typescript'] });

      expect(callbackCalled).toBe(true);
      expect(toolsChanged).toBe(true);
    });
  });
});
