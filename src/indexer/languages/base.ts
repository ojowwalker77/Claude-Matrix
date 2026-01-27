/**
 * Base Language Parser
 *
 * Abstract base class for language-specific parsers.
 * Each language extends this to provide symbol and import extraction.
 *
 * Template Method Pattern: parse() is implemented here, subclasses
 * only implement extractSymbols() and extractImports().
 */

import type { Parser, Language, Node as SyntaxNode, Tree } from 'web-tree-sitter';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export abstract class LanguageParser {
  protected parser: Parser;
  protected language: Language;

  constructor(parser: Parser, language: Language) {
    this.parser = parser;
    this.language = language;
  }

  /**
   * Parse source code and extract symbols/imports
   * Template method - subclasses implement extractSymbols/extractImports
   */
  parse(filePath: string, content: string): ParseResult {
    const symbols: ExtractedSymbol[] = [];
    const imports: ExtractedImport[] = [];
    const errors: string[] = [];

    try {
      this.parser.setLanguage(this.language);
      const tree = this.parser.parse(content);

      if (!tree) {
        errors.push('Failed to parse file');
        return { symbols, imports, errors };
      }

      if (tree.rootNode.hasError) {
        errors.push('Parse error detected in file');
      }

      this.extractSymbols(tree.rootNode, symbols);
      this.extractImports(tree.rootNode, imports);
    } catch (err) {
      errors.push(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { symbols, imports, errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * Extract symbols from the parsed AST
   * Implement in subclasses
   */
  protected abstract extractSymbols(rootNode: SyntaxNode, symbols: ExtractedSymbol[]): void;

  /**
   * Extract imports from the parsed AST
   * Implement in subclasses
   */
  protected abstract extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void;

  /**
   * Get line/column from a syntax node (1-indexed lines, 0-indexed columns)
   */
  protected getLocation(node: SyntaxNode): {
    line: number;
    column: number;
    endLine: number;
  } {
    return {
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Get text content of a node
   */
  protected getNodeText(node: SyntaxNode): string {
    return node.text;
  }

  /**
   * Find child node by field name
   */
  protected getChildByField(node: SyntaxNode, fieldName: string): SyntaxNode | null {
    return node.childForFieldName(fieldName);
  }

  /**
   * Find children by type
   */
  protected getChildrenByType(node: SyntaxNode, type: string): SyntaxNode[] {
    return node.children.filter((child): child is SyntaxNode =>
      child !== null && child.type === type
    );
  }

  /**
   * Find first child by type
   */
  protected getChildByType(node: SyntaxNode, type: string): SyntaxNode | null {
    return node.children.find((child): child is SyntaxNode =>
      child !== null && child.type === type
    ) ?? null;
  }

  /**
   * Check if node has a parent of given type
   */
  protected hasAncestorOfType(node: SyntaxNode, type: string): boolean {
    let current = node.parent;
    while (current) {
      if (current.type === type) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Get parent of given type
   */
  protected getAncestorOfType(node: SyntaxNode, type: string): SyntaxNode | null {
    let current = node.parent;
    while (current) {
      if (current.type === type) return current;
      current = current.parent;
    }
    return null;
  }

  /**
   * Walk the tree and call visitor for each node
   */
  protected walkTree(
    node: SyntaxNode,
    visitor: (node: SyntaxNode, depth: number) => boolean | void,
    depth: number = 0
  ): void {
    const shouldContinue = visitor(node, depth);
    if (shouldContinue === false) return;

    for (const child of node.children) {
      if (!child) continue;
      this.walkTree(child, visitor, depth + 1);
    }
  }

  /**
   * Create an extracted symbol with common defaults
   */
  protected createSymbol(
    name: string,
    kind: SymbolKind,
    node: SyntaxNode,
    options: Partial<ExtractedSymbol> = {}
  ): ExtractedSymbol {
    const loc = this.getLocation(node);
    return {
      name,
      kind,
      line: loc.line,
      column: loc.column,
      endLine: loc.endLine,
      exported: false,
      isDefault: false,
      ...options,
    };
  }

  /**
   * Create an extracted import
   */
  protected createImport(
    importedName: string,
    sourcePath: string,
    line: number,
    options: Partial<ExtractedImport> = {}
  ): ExtractedImport {
    return {
      importedName,
      sourcePath,
      isDefault: false,
      isNamespace: false,
      isType: false,
      line,
      ...options,
    };
  }
}
