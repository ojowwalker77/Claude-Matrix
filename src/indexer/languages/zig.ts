/**
 * Zig Language Parser
 *
 * Extracts symbols and imports from Zig files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class ZigParser extends LanguageParser {
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

  private extractSymbols(rootNode: SyntaxNode, symbols: ExtractedSymbol[]): void {
    this.walkTree(rootNode, (node) => {
      switch (node.type) {
        case 'FnDecl':
          this.handleFnDecl(node, symbols);
          return false;

        case 'VarDecl':
          this.handleVarDecl(node, symbols);
          return false;

        case 'ContainerDecl':
          this.handleContainerDecl(node, symbols);
          return false;

        case 'TestDecl':
          this.handleTestDecl(node, symbols);
          return false;
      }
      return true;
    });
  }

  private handleFnDecl(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const signature = this.getFunctionSignature(node);
    const isPublic = this.isPublic(node);
    const scope = this.getParentContainerName(node);

    symbols.push(
      this.createSymbol(name, scope ? 'method' : 'function', node, {
        exported: isPublic,
        scope,
        signature,
      })
    );
  }

  private handleVarDecl(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const isConst = this.isConst(node);
    const isPublic = this.isPublic(node);
    const scope = this.getParentContainerName(node);

    // Check if this is a type definition (const Foo = struct { ... })
    const value = this.getChildByField(node, 'value');
    let kind: SymbolKind = isConst ? 'const' : 'variable';

    if (value) {
      const valueType = value.type;
      if (valueType === 'ContainerDecl' || valueType === 'ErrorSetDecl') {
        kind = 'type';
      }
    }

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported: isPublic,
        scope,
      })
    );

    // If the value is a container, extract its members
    if (value && value.type === 'ContainerDecl') {
      this.extractContainerMembers(value, symbols, name);
    }
  }

  private handleContainerDecl(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // Standalone container declaration (struct, enum, union)
    const _containerType = this.getContainerType(node);
    const scope = this.getParentContainerName(node);

    // Container declarations without a name are handled via VarDecl
    // This handles inline/anonymous containers
    this.extractContainerMembers(node, symbols, scope);
  }

  private handleTestDecl(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    let name = this.getNodeText(nameNode);
    // Remove quotes from test name
    name = name.replace(/^"|"$/g, '');

    symbols.push(
      this.createSymbol(name, 'function', node, {
        exported: false,
      })
    );
  }

  private extractContainerMembers(
    container: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName?: string
  ): void {
    const members = this.getChildByField(container, 'members');
    if (!members) return;

    for (const child of members.namedChildren) {
      if (!child) continue;

      switch (child.type) {
        case 'ContainerField':
          this.handleContainerField(child, symbols, parentName);
          break;

        case 'FnDecl':
          // Handle methods
          const nameNode = this.getChildByField(child, 'name');
          if (nameNode) {
            const name = this.getNodeText(nameNode);
            const signature = this.getFunctionSignature(child);
            const isPublic = this.isPublic(child);

            symbols.push(
              this.createSymbol(name, 'method', child, {
                exported: isPublic,
                scope: parentName,
                signature,
              })
            );
          }
          break;

        case 'VarDecl':
          // Handle nested type definitions
          this.handleVarDecl(child, symbols);
          break;
      }
    }
  }

  private handleContainerField(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'property', node, {
        exported: true,
        scope: parentName,
      })
    );
  }

  private extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'VarDecl') {
        const value = this.getChildByField(node, 'value');
        if (value && value.type === 'BuiltinCallExpr') {
          const builtin = this.getChildByField(value, 'builtin');
          if (builtin && this.getNodeText(builtin) === '@import') {
            this.handleImport(node, value, imports);
            return false;
          }
        }
      }
      return true;
    });
  }

  private handleImport(
    varDecl: SyntaxNode,
    importExpr: SyntaxNode,
    imports: ExtractedImport[]
  ): void {
    const line = varDecl.startPosition.row + 1;

    const args = this.getChildByField(importExpr, 'args');
    if (!args) return;

    const pathArg = args.namedChildren[0];
    if (!pathArg) return;

    let path = this.getNodeText(pathArg);
    path = path.replace(/^"|"$/g, '');

    // Get the local name from the variable declaration
    const nameNode = this.getChildByField(varDecl, 'name');
    const localName = nameNode ? this.getNodeText(nameNode) : path;

    // Extract module name from path
    const parts = path.split('/');
    const importName = (parts[parts.length - 1] ?? '').replace(/\.zig$/, '');

    imports.push(
      this.createImport(importName, path, line, {
        localName: localName !== importName ? localName : undefined,
        isNamespace: true,
      })
    );
  }

  private getContainerType(node: SyntaxNode): string {
    const typeNode = this.getChildByField(node, 'container_type');
    if (typeNode) {
      return this.getNodeText(typeNode);
    }
    return 'struct';
  }

  private isPublic(node: SyntaxNode): boolean {
    // Check for 'pub' visibility modifier
    for (const child of node.children) {
      if (child && this.getNodeText(child) === 'pub') {
        return true;
      }
    }
    return false;
  }

  private isConst(node: SyntaxNode): boolean {
    for (const child of node.children) {
      if (child && this.getNodeText(child) === 'const') {
        return true;
      }
    }
    return false;
  }

  private getParentContainerName(node: SyntaxNode): string | undefined {
    let current = node.parent;
    while (current) {
      if (current.type === 'VarDecl') {
        const value = this.getChildByField(current, 'value');
        if (value && value.type === 'ContainerDecl') {
          const nameNode = this.getChildByField(current, 'name');
          if (nameNode) {
            return this.getNodeText(nameNode);
          }
        }
      }
      current = current.parent;
    }
    return undefined;
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const params = this.getChildByField(node, 'params');
    const returnType = this.getChildByField(node, 'return_type');

    let sig = params ? this.getNodeText(params) : '()';
    if (returnType) {
      sig += ' ' + this.getNodeText(returnType);
    }
    return sig;
  }
}
