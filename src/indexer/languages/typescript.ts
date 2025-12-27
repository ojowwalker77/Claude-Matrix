/**
 * TypeScript/JavaScript Language Parser
 *
 * Extracts symbols and imports from TypeScript, TSX, JavaScript, and JSX files
 * using tree-sitter.
 */

import type { Parser, Language } from 'web-tree-sitter';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class TypeScriptParser extends LanguageParser {
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
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    this.walkTree(rootNode, (node) => {
      switch (node.type) {
        case 'function_declaration':
          this.handleFunctionDeclaration(node, symbols, scope);
          break;

        case 'class_declaration':
          this.handleClassDeclaration(node, symbols, scope);
          // Don't recurse into class body with walkTree - handle it specially
          const classBody = this.getChildByType(node, 'class_body');
          const className = this.getChildByField(node, 'name');
          if (classBody && className) {
            for (const member of classBody.children) {
              if (member.type === 'method_definition') {
                this.handleMethodDefinition(member, symbols, this.getNodeText(className));
              } else if (member.type === 'public_field_definition' || member.type === 'field_definition') {
                this.handlePropertyDefinition(member, symbols, this.getNodeText(className));
              }
            }
          }
          return false; // Don't recurse further

        case 'interface_declaration':
          this.handleInterfaceDeclaration(node, symbols, scope);
          break;

        case 'type_alias_declaration':
          this.handleTypeAliasDeclaration(node, symbols, scope);
          break;

        case 'enum_declaration':
          this.handleEnumDeclaration(node, symbols, scope);
          break;

        case 'lexical_declaration':
        case 'variable_declaration':
          this.handleVariableDeclaration(node, symbols, scope);
          break;

        case 'export_statement':
          // Handle exports - check if it has a declaration child
          const exportedDecl = node.namedChildren.find(
            (c) =>
              c.type === 'function_declaration' ||
              c.type === 'class_declaration' ||
              c.type === 'interface_declaration' ||
              c.type === 'type_alias_declaration' ||
              c.type === 'enum_declaration' ||
              c.type === 'lexical_declaration' ||
              c.type === 'variable_declaration'
          );
          if (exportedDecl) {
            // Mark as exported - will be handled by the nested declaration
            return true; // Continue recursing
          }
          break;
      }
      return true; // Continue recursing
    });
  }

  private handleFunctionDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const exported = this.isExported(node);
    const isDefault = this.isDefaultExport(node);
    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol(this.getNodeText(nameNode), 'function', node, {
        exported,
        isDefault,
        scope,
        signature,
      })
    );
  }

  private handleClassDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const exported = this.isExported(node);
    const isDefault = this.isDefaultExport(node);

    symbols.push(
      this.createSymbol(this.getNodeText(nameNode), 'class', node, {
        exported,
        isDefault,
        scope,
      })
    );
  }

  private handleMethodDefinition(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol(this.getNodeText(nameNode), 'method', node, {
        scope,
        signature,
      })
    );
  }

  private handlePropertyDefinition(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const typeNode = this.getChildByField(node, 'type');
    const signature = typeNode ? this.getNodeText(typeNode) : undefined;

    symbols.push(
      this.createSymbol(this.getNodeText(nameNode), 'property', node, {
        scope,
        signature,
      })
    );
  }

  private handleInterfaceDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const exported = this.isExported(node);

    symbols.push(
      this.createSymbol(this.getNodeText(nameNode), 'interface', node, {
        exported,
        scope,
      })
    );
  }

  private handleTypeAliasDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const exported = this.isExported(node);
    const valueNode = this.getChildByField(node, 'value');
    const signature = valueNode ? this.getNodeText(valueNode) : undefined;

    symbols.push(
      this.createSymbol(this.getNodeText(nameNode), 'type', node, {
        exported,
        scope,
        signature,
      })
    );
  }

  private handleEnumDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const exported = this.isExported(node);

    symbols.push(
      this.createSymbol(this.getNodeText(nameNode), 'enum', node, {
        exported,
        scope,
      })
    );
  }

  private handleVariableDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const exported = this.isExported(node);
    const isConst = node.type === 'lexical_declaration' && node.text.startsWith('const');

    for (const child of node.namedChildren) {
      if (child.type === 'variable_declarator') {
        const nameNode = this.getChildByField(child, 'name');
        if (!nameNode || nameNode.type !== 'identifier') continue;

        const valueNode = this.getChildByField(child, 'value');
        let kind: SymbolKind = isConst ? 'const' : 'variable';
        let signature: string | undefined;

        // Check if it's an arrow function
        if (valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
          kind = 'function';
          signature = this.getFunctionSignature(valueNode);
        }

        symbols.push(
          this.createSymbol(this.getNodeText(nameNode), kind, child, {
            exported,
            scope,
            signature,
          })
        );
      }
    }
  }

  private extractImports(
    rootNode: SyntaxNode,
    content: string,
    imports: ExtractedImport[]
  ): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'import_statement') {
        this.handleImportStatement(node, imports);
        return false; // Don't recurse into import
      }
      return true;
    });
  }

  private handleImportStatement(node: SyntaxNode, imports: ExtractedImport[]): void {
    const sourceNode = this.getChildByField(node, 'source');
    if (!sourceNode) return;

    // Remove quotes from source path
    const sourcePath = this.getNodeText(sourceNode).replace(/^['"]|['"]$/g, '');
    const line = node.startPosition.row + 1;

    // Check if it's a type-only import
    const isTypeOnly = node.children.some((c) => c.type === 'type');

    const importClause = node.namedChildren.find((c) => c.type === 'import_clause');
    if (!importClause) {
      // Side-effect import: import 'foo'
      imports.push(
        this.createImport('*', sourcePath, line, {
          isNamespace: false,
          isType: false,
        })
      );
      return;
    }

    // Check for default import
    for (const child of importClause.namedChildren) {
      if (child.type === 'identifier') {
        // Default import: import Foo from 'foo'
        imports.push(
          this.createImport(this.getNodeText(child), sourcePath, line, {
            isDefault: true,
            isType: isTypeOnly,
          })
        );
      } else if (child.type === 'namespace_import') {
        // Namespace import: import * as Foo from 'foo'
        const nameNode = this.getChildByField(child, 'name') || child.namedChildren[0];
        if (nameNode) {
          imports.push(
            this.createImport(this.getNodeText(nameNode), sourcePath, line, {
              isNamespace: true,
              isType: isTypeOnly,
            })
          );
        }
      } else if (child.type === 'named_imports') {
        // Named imports: import { Foo, Bar as Baz } from 'foo'
        for (const specifier of child.namedChildren) {
          if (specifier.type === 'import_specifier') {
            const nameNode = this.getChildByField(specifier, 'name');
            const aliasNode = this.getChildByField(specifier, 'alias');
            const isSpecifierTypeOnly = specifier.children.some((c) => c.type === 'type');

            if (nameNode) {
              imports.push(
                this.createImport(this.getNodeText(nameNode), sourcePath, line, {
                  localName: aliasNode ? this.getNodeText(aliasNode) : undefined,
                  isType: isTypeOnly || isSpecifierTypeOnly,
                })
              );
            }
          }
        }
      }
    }
  }

  private isExported(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (!parent) return false;
    return parent.type === 'export_statement';
  }

  private isDefaultExport(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (!parent || parent.type !== 'export_statement') return false;
    return parent.children.some((c) => c.type === 'default');
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByField(node, 'parameters');
    const returnTypeNode = this.getChildByField(node, 'return_type');

    let sig = paramsNode ? this.getNodeText(paramsNode) : '()';
    if (returnTypeNode) {
      sig += ': ' + this.getNodeText(returnTypeNode);
    }
    return sig;
  }
}
