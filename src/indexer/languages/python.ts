/**
 * Python Language Parser
 *
 * Extracts symbols and imports from Python files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class PythonParser extends LanguageParser {
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

      this.extractSymbols(tree.rootNode, content, symbols);
      this.extractImports(tree.rootNode, content, imports);
    } catch (err) {
      errors.push(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { symbols, imports, errors: errors.length > 0 ? errors : undefined };
  }

  private extractSymbols(
    rootNode: SyntaxNode,
    content: string,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    this.walkTree(rootNode, (node) => {
      switch (node.type) {
        case 'function_definition':
          this.handleFunctionDefinition(node, symbols, scope);
          return false; // Don't recurse into function body

        case 'class_definition':
          this.handleClassDefinition(node, symbols, scope);
          // Handle class body with class scope
          const className = this.getChildByField(node, 'name');
          const classBody = this.getChildByField(node, 'body');
          if (classBody && className) {
            const classScope = this.getNodeText(className);
            for (const child of classBody.namedChildren) {
              if (!child) continue;
              if (child.type === 'function_definition') {
                this.handleFunctionDefinition(child, symbols, classScope);
              }
            }
          }
          return false; // Don't recurse further

        case 'expression_statement':
          // Check for module-level assignments (variables/constants)
          const expr = node.namedChildren.find(c => c !== null);
          if (expr && expr.type === 'assignment' && !scope) {
            this.handleAssignment(expr, symbols);
          }
          break;

        case 'decorated_definition':
          // Handle decorated functions/classes
          const decorated = node.namedChildren.find(
            (c) => c !== null && (c.type === 'function_definition' || c.type === 'class_definition')
          );
          if (decorated) {
            if (decorated.type === 'function_definition') {
              this.handleFunctionDefinition(decorated, symbols, scope);
            } else if (decorated.type === 'class_definition') {
              this.handleClassDefinition(decorated, symbols, scope);
            }
          }
          return false;
      }
      return true;
    });
  }

  private handleFunctionDefinition(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    // Skip private methods (starting with _) unless it's __init__ etc.
    const isSpecialMethod = name.startsWith('__') && name.endsWith('__');
    const isPrivate = name.startsWith('_') && !isSpecialMethod;

    // Determine if it's a method (inside a class)
    const isMethod = !!scope;
    const kind: SymbolKind = isMethod ? 'method' : 'function';

    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported: !isPrivate, // Python doesn't have exports, but we use convention
        scope,
        signature,
      })
    );
  }

  private handleClassDefinition(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const isPrivate = name.startsWith('_');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported: !isPrivate,
        scope,
      })
    );
  }

  private handleAssignment(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const leftNode = this.getChildByField(node, 'left');
    if (!leftNode || leftNode.type !== 'identifier') return;

    const name = this.getNodeText(leftNode);

    // Check if it's a constant (UPPER_CASE convention)
    const isConstant = /^[A-Z][A-Z0-9_]*$/.test(name);
    const isPrivate = name.startsWith('_');

    const kind: SymbolKind = isConstant ? 'const' : 'variable';

    symbols.push(
      this.createSymbol(name, kind, leftNode, {
        exported: !isPrivate,
      })
    );
  }

  private extractImports(
    rootNode: SyntaxNode,
    content: string,
    imports: ExtractedImport[]
  ): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'import_statement') {
        this.handleImportStatement(node, imports);
        return false;
      } else if (node.type === 'import_from_statement') {
        this.handleImportFromStatement(node, imports);
        return false;
      }
      return true;
    });
  }

  private handleImportStatement(node: SyntaxNode, imports: ExtractedImport[]): void {
    // import x, y, z  or  import x as alias
    const line = node.startPosition.row + 1;

    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'dotted_name') {
        const name = this.getNodeText(child);
        imports.push(
          this.createImport(name, name, line, {
            isNamespace: true,
          })
        );
      } else if (child.type === 'aliased_import') {
        const nameNode = this.getChildByField(child, 'name');
        const aliasNode = this.getChildByField(child, 'alias');
        if (nameNode) {
          const name = this.getNodeText(nameNode);
          imports.push(
            this.createImport(name, name, line, {
              localName: aliasNode ? this.getNodeText(aliasNode) : undefined,
              isNamespace: true,
            })
          );
        }
      }
    }
  }

  private handleImportFromStatement(node: SyntaxNode, imports: ExtractedImport[]): void {
    // from x import y, z  or  from x import *
    const line = node.startPosition.row + 1;

    const moduleNode = this.getChildByField(node, 'module_name');
    const sourcePath = moduleNode ? this.getNodeText(moduleNode) : '';

    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child === moduleNode) continue;

      if (child.type === 'dotted_name') {
        imports.push(this.createImport(this.getNodeText(child), sourcePath, line));
      } else if (child.type === 'aliased_import') {
        const nameNode = this.getChildByField(child, 'name');
        const aliasNode = this.getChildByField(child, 'alias');
        if (nameNode) {
          imports.push(
            this.createImport(this.getNodeText(nameNode), sourcePath, line, {
              localName: aliasNode ? this.getNodeText(aliasNode) : undefined,
            })
          );
        }
      } else if (child.type === 'wildcard_import') {
        imports.push(
          this.createImport('*', sourcePath, line, {
            isNamespace: true,
          })
        );
      }
    }
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByField(node, 'parameters');
    const returnTypeNode = this.getChildByField(node, 'return_type');

    let sig = paramsNode ? this.getNodeText(paramsNode) : '()';
    if (returnTypeNode) {
      sig += ' -> ' + this.getNodeText(returnTypeNode);
    }
    return sig;
  }
}
