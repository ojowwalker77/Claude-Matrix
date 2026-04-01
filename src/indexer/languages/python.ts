/**
 * Python Language Parser
 *
 * Extracts symbols and imports from Python files using tree-sitter.
 * Supports decorators (@property, @staticmethod, @classmethod, @dataclass, etc.)
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class PythonParser extends LanguageParser {
  protected extractSymbols(
    rootNode: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    this.walkTree(rootNode, (node) => {
      switch (node.type) {
        case 'function_definition':
          this.handleFunctionDefinition(node, symbols, scope, []);
          return false; // Don't recurse into function body

        case 'class_definition':
          this.handleClassDefinition(node, symbols, scope, []);
          // Handle class body with class scope
          const className = this.getChildByField(node, 'name');
          const classBody = this.getChildByField(node, 'body');
          if (classBody && className) {
            const classScope = this.getNodeText(className);
            for (const child of classBody.namedChildren) {
              if (!child) continue;
              if (child.type === 'function_definition') {
                this.handleFunctionDefinition(child, symbols, classScope, []);
              } else if (child.type === 'decorated_definition') {
                this.handleDecoratedDefinition(child, symbols, classScope);
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
          this.handleDecoratedDefinition(node, symbols, scope);
          return false;
      }
      return true;
    });
  }

  /**
   * Handle a decorated definition — extract decorators and delegate
   */
  private handleDecoratedDefinition(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    // Collect decorator names
    const decorators: string[] = [];
    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'decorator') {
        // Get the decorator expression (name or call)
        const exprNode = child.namedChildren.find(c => c !== null);
        if (exprNode) {
          // Handle both @foo and @foo.bar and @foo(args)
          const text = this.getNodeText(exprNode);
          // Extract just the decorator name (before any parens)
          const name = text.split('(')[0] ?? text;
          decorators.push(name);
        }
      }
    }

    // Find the actual definition
    const decorated = node.namedChildren.find(
      (c) => c !== null && (c.type === 'function_definition' || c.type === 'class_definition')
    );

    if (decorated) {
      if (decorated.type === 'function_definition') {
        this.handleFunctionDefinition(decorated, symbols, scope, decorators);
      } else if (decorated.type === 'class_definition') {
        this.handleClassDefinition(decorated, symbols, scope, decorators);
      }
    }
  }

  private handleFunctionDefinition(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string,
    decorators: string[] = []
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    // Skip private methods (starting with _) unless it's __init__ etc.
    const isSpecialMethod = name.startsWith('__') && name.endsWith('__');
    const isPrivate = name.startsWith('_') && !isSpecialMethod;

    // Determine kind based on decorators
    const isMethod = !!scope;
    const isProperty = decorators.some(d => d === 'property' || d.endsWith('.setter') || d.endsWith('.getter') || d.endsWith('.deleter'));
    let kind: SymbolKind;
    if (isProperty) {
      kind = 'property';
    } else if (isMethod) {
      kind = 'method';
    } else {
      kind = 'function';
    }

    const signature = this.getFunctionSignature(node);

    // Build decorator annotation for signature
    const decoratorSuffix = decorators.length > 0
      ? ` [@${decorators.join(', @')}]`
      : '';

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported: !isPrivate, // Python doesn't have exports, but we use convention
        scope,
        signature: signature + decoratorSuffix,
      })
    );
  }

  private handleClassDefinition(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string,
    decorators: string[] = []
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const isPrivate = name.startsWith('_');

    // Check for dataclass decorator
    const isDataclass = decorators.some(d => d === 'dataclass' || d.endsWith('.dataclass'));

    // Build signature with base classes and decorators
    const superclassNode = this.getChildByField(node, 'superclasses');
    let signature = superclassNode ? this.getNodeText(superclassNode) : undefined;

    if (decorators.length > 0) {
      const decoratorStr = `[@${decorators.join(', @')}]`;
      signature = signature ? `${signature} ${decoratorStr}` : decoratorStr;
    }

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported: !isPrivate,
        scope,
        signature,
      })
    );

    // For dataclasses, extract fields from the class body as properties
    if (isDataclass) {
      const classBody = this.getChildByField(node, 'body');
      if (classBody) {
        for (const child of classBody.namedChildren) {
          if (!child) continue;
          if (child.type === 'expression_statement') {
            const expr = child.namedChildren.find(c => c !== null);
            if (expr && expr.type === 'type') {
              // Annotated assignment: field: Type = default
              const fieldName = this.getChildByField(expr, 'left');
              if (fieldName) {
                symbols.push(
                  this.createSymbol(this.getNodeText(fieldName), 'property', fieldName, {
                    exported: true,
                    scope: name,
                  })
                );
              }
            }
          }
        }
      }
    }
  }

  private handleAssignment(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const leftNode = this.getChildByField(node, 'left');
    if (!leftNode || leftNode.type !== 'identifier') return;

    const name = this.getNodeText(leftNode);

    // Check if it's a constant (UPPER_CASE or UpperCamelCase convention)
    const isConstant = /^[A-Z][A-Z0-9_]*$/.test(name);
    const isPrivate = name.startsWith('_');

    const kind: SymbolKind = isConstant ? 'const' : 'variable';

    symbols.push(
      this.createSymbol(name, kind, leftNode, {
        exported: !isPrivate,
      })
    );
  }

  protected extractImports(
    rootNode: SyntaxNode,
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
