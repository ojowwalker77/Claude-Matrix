/**
 * Go Language Parser
 *
 * Extracts symbols and imports from Go files using tree-sitter.
 */

import type { Parser, Language, Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class GoParser extends LanguageParser {
  parse(filePath: string, content: string): ParseResult {
    const symbols: ExtractedSymbol[] = [];
    const imports: ExtractedImport[] = [];
    const errors: string[] = [];

    try {
      this.parser.setLanguage(this.language);
      const tree = this.parser.parse(content);

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
    symbols: ExtractedSymbol[]
  ): void {
    this.walkTree(rootNode, (node) => {
      switch (node.type) {
        case 'function_declaration':
          this.handleFunctionDeclaration(node, symbols);
          return false;

        case 'method_declaration':
          this.handleMethodDeclaration(node, symbols);
          return false;

        case 'type_declaration':
          this.handleTypeDeclaration(node, symbols);
          return false;

        case 'const_declaration':
        case 'var_declaration':
          this.handleVarConstDeclaration(node, symbols);
          return false;
      }
      return true;
    });
  }

  private handleFunctionDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isExportedName(name);
    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol(name, 'function', node, {
        exported,
        signature,
      })
    );
  }

  private handleMethodDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isExportedName(name);

    // Get receiver type as scope
    const receiverNode = this.getChildByField(node, 'receiver');
    let scope: string | undefined;
    if (receiverNode) {
      // Extract type from receiver: (r *ReceiverType) or (r ReceiverType)
      const typeNode = receiverNode.descendantsOfType('type_identifier')[0];
      if (typeNode) {
        scope = this.getNodeText(typeNode);
      }
    }

    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol(name, 'method', node, {
        exported,
        scope,
        signature,
      })
    );
  }

  private handleTypeDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    for (const spec of node.namedChildren) {
      if (spec.type === 'type_spec') {
        const nameNode = this.getChildByField(spec, 'name');
        if (!nameNode) continue;

        const name = this.getNodeText(nameNode);
        const exported = this.isExportedName(name);

        const typeNode = this.getChildByField(spec, 'type');
        let kind: SymbolKind = 'type';

        if (typeNode) {
          const typeType = typeNode.type;
          if (typeType === 'struct_type') {
            kind = 'class'; // Map struct to class
          } else if (typeType === 'interface_type') {
            kind = 'interface';
          }
        }

        symbols.push(
          this.createSymbol(name, kind, spec, {
            exported,
          })
        );
      }
    }
  }

  private handleVarConstDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const isConst = node.type === 'const_declaration';
    const kind: SymbolKind = isConst ? 'const' : 'variable';

    for (const spec of node.namedChildren) {
      if (spec.type === 'var_spec' || spec.type === 'const_spec') {
        // Can have multiple names: var x, y, z int
        const names = spec.descendantsOfType('identifier');
        for (const nameNode of names) {
          // Skip if it's part of a value (after =)
          if (this.hasAncestorOfType(nameNode, 'expression_list')) continue;

          const name = this.getNodeText(nameNode);
          const exported = this.isExportedName(name);

          symbols.push(
            this.createSymbol(name, kind, nameNode, {
              exported,
            })
          );
          break; // Only first identifier is the name
        }
      }
    }
  }

  private extractImports(
    rootNode: SyntaxNode,
    content: string,
    imports: ExtractedImport[]
  ): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'import_declaration') {
        this.handleImportDeclaration(node, imports);
        return false;
      }
      return true;
    });
  }

  private handleImportDeclaration(node: SyntaxNode, imports: ExtractedImport[]): void {
    const line = node.startPosition.row + 1;

    for (const child of node.namedChildren) {
      if (child.type === 'import_spec_list') {
        for (const spec of child.namedChildren) {
          if (spec.type === 'import_spec') {
            this.handleImportSpec(spec, imports, line);
          }
        }
      } else if (child.type === 'import_spec') {
        this.handleImportSpec(child, imports, line);
      } else if (child.type === 'interpreted_string_literal') {
        // Single import without parens
        const path = this.getNodeText(child).replace(/^"|"$/g, '');
        const name = path.split('/').pop() || path;
        imports.push(
          this.createImport(name, path, line, {
            isNamespace: true,
          })
        );
      }
    }
  }

  private handleImportSpec(
    spec: SyntaxNode,
    imports: ExtractedImport[],
    line: number
  ): void {
    const pathNode = this.getChildByField(spec, 'path');
    if (!pathNode) return;

    const path = this.getNodeText(pathNode).replace(/^"|"$/g, '');
    const nameNode = this.getChildByField(spec, 'name');

    let importName: string;
    let localName: string | undefined;
    let isNamespace = true;

    if (nameNode) {
      const alias = this.getNodeText(nameNode);
      if (alias === '.') {
        // Dot import: import . "pkg" - imports all exported names
        importName = '*';
        isNamespace = false;
      } else if (alias === '_') {
        // Blank import: import _ "pkg" - side effects only
        importName = '_';
      } else {
        // Aliased import
        importName = path.split('/').pop() || path;
        localName = alias;
      }
    } else {
      // Regular import - use last path component as name
      importName = path.split('/').pop() || path;
    }

    imports.push(
      this.createImport(importName, path, line, {
        localName,
        isNamespace,
      })
    );
  }

  private isExportedName(name: string): boolean {
    // Go exports names that start with uppercase
    return /^[A-Z]/.test(name);
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByField(node, 'parameters');
    const resultNode = this.getChildByField(node, 'result');

    let sig = paramsNode ? this.getNodeText(paramsNode) : '()';
    if (resultNode) {
      sig += ' ' + this.getNodeText(resultNode);
    }
    return sig;
  }
}
