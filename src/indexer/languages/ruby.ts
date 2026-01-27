/**
 * Ruby Language Parser
 *
 * Extracts symbols and imports from Ruby files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ExtractedSymbol, ExtractedImport } from '../types.js';

export class RubyParser extends LanguageParser {
  protected extractSymbols(rootNode: SyntaxNode, symbols: ExtractedSymbol[]): void {
    this.walkTree(rootNode, (node) => {
      switch (node.type) {
        case 'class':
          this.handleClassDeclaration(node, symbols);
          return false;

        case 'module':
          this.handleModuleDeclaration(node, symbols);
          return false;

        case 'method':
          this.handleMethodDeclaration(node, symbols);
          return false;

        case 'singleton_method':
          this.handleSingletonMethod(node, symbols);
          return false;

        case 'assignment':
          this.handleAssignment(node, symbols);
          return true;
      }
      return true;
    });
  }

  private handleClassDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported: true, // Ruby classes are always accessible
      })
    );

    // Extract class body
    const body = this.getChildByType(node, 'body_statement');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleModuleDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'namespace', node, {
        exported: true,
      })
    );

    // Extract module body
    const body = this.getChildByType(node, 'body_statement');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleMethodDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const scope = this.getParentClassName(node);
    const signature = this.getMethodSignature(node);

    // Check visibility (private/protected methods)
    const isPrivate = this.isPrivateMethod(node);

    symbols.push(
      this.createSymbol(name, scope ? 'method' : 'function', node, {
        exported: !isPrivate,
        scope,
        signature,
      })
    );
  }

  private handleSingletonMethod(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const objectNode = this.getChildByField(node, 'object');
    let scope: string | undefined;

    if (objectNode) {
      const objText = this.getNodeText(objectNode);
      if (objText === 'self') {
        scope = this.getParentClassName(node);
      } else {
        scope = objText;
      }
    }

    const signature = this.getMethodSignature(node);

    symbols.push(
      this.createSymbol(name, 'method', node, {
        exported: true,
        scope,
        signature,
      })
    );
  }

  private handleAssignment(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const leftNode = this.getChildByField(node, 'left');
    if (!leftNode) return;

    const leftText = this.getNodeText(leftNode);

    // Handle constant assignments (UPPERCASE or CamelCase starting with uppercase)
    if (leftNode.type === 'constant' || /^[A-Z]/.test(leftText)) {
      symbols.push(
        this.createSymbol(leftText, 'const', node, {
          exported: true,
          scope: this.getParentClassName(node),
        })
      );
    }
    // Handle class/instance variable assignments at class level
    else if (leftText.startsWith('@@') || leftText.startsWith('@')) {
      const scope = this.getParentClassName(node);
      if (scope) {
        symbols.push(
          this.createSymbol(leftText, 'property', node, {
            exported: !leftText.startsWith('@') || this.hasAttrAccessor(node, leftText),
            scope,
          })
        );
      }
    }
  }

  private extractClassMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    _parentName: string
  ): void {
    for (const child of body.namedChildren) {
      if (!child) continue;
      switch (child.type) {
        case 'method':
          this.handleMethodDeclaration(child, symbols);
          break;
        case 'singleton_method':
          this.handleSingletonMethod(child, symbols);
          break;
        case 'class':
          this.handleClassDeclaration(child, symbols);
          break;
        case 'module':
          this.handleModuleDeclaration(child, symbols);
          break;
        case 'assignment':
          this.handleAssignment(child, symbols);
          break;
      }
    }
  }

  protected extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'call') {
        const methodNode = this.getChildByField(node, 'method');
        if (methodNode) {
          const methodName = this.getNodeText(methodNode);
          if (methodName === 'require' || methodName === 'require_relative' || methodName === 'load') {
            this.handleRequire(node, imports, methodName);
            return false;
          }
        }
      }
      return true;
    });
  }

  private handleRequire(node: SyntaxNode, imports: ExtractedImport[], _methodName: string): void {
    const line = node.startPosition.row + 1;
    const argsNode = this.getChildByField(node, 'arguments');
    if (!argsNode) return;

    const argNode = argsNode.namedChildren[0];
    if (!argNode) return;

    let path = this.getNodeText(argNode);
    // Remove quotes
    path = path.replace(/^['"]|['"]$/g, '');

    const parts = path.split('/');
    const name = (parts[parts.length - 1] ?? '').replace(/\.rb$/, '');

    imports.push(
      this.createImport(name, path, line, {
        isNamespace: true,
      })
    );
  }

  private getParentClassName(node: SyntaxNode): string | undefined {
    const parent = this.getAncestorOfType(node, 'class') ||
      this.getAncestorOfType(node, 'module');

    if (parent) {
      const nameNode = this.getChildByField(parent, 'name');
      if (nameNode) {
        return this.getNodeText(nameNode);
      }
    }
    return undefined;
  }

  private getMethodSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByField(node, 'parameters');
    if (!paramsNode) return '()';
    return this.getNodeText(paramsNode);
  }

  private isPrivateMethod(node: SyntaxNode): boolean {
    // Check if preceded by 'private' call
    const parent = node.parent;
    if (!parent) return false;

    let prevSibling = node.previousNamedSibling;
    while (prevSibling) {
      if (prevSibling.type === 'call') {
        const methodNode = this.getChildByField(prevSibling, 'method');
        if (methodNode) {
          const text = this.getNodeText(methodNode);
          if (text === 'private' || text === 'protected') {
            return true;
          }
          if (text === 'public') {
            return false;
          }
        }
      }
      prevSibling = prevSibling.previousNamedSibling;
    }
    return false;
  }

  private hasAttrAccessor(_node: SyntaxNode, _varName: string): boolean {
    // Simplified check - would need more context for accurate detection
    return true;
  }
}
