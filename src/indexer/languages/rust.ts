/**
 * Rust Language Parser
 *
 * Extracts symbols and imports from Rust files using tree-sitter.
 */

import type { Parser, Language, Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class RustParser extends LanguageParser {
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
        case 'function_item':
          this.handleFunctionItem(node, symbols, scope);
          return false;

        case 'struct_item':
          this.handleStructItem(node, symbols, scope);
          return false;

        case 'enum_item':
          this.handleEnumItem(node, symbols, scope);
          return false;

        case 'trait_item':
          this.handleTraitItem(node, symbols, scope);
          return false;

        case 'type_item':
          this.handleTypeItem(node, symbols, scope);
          return false;

        case 'impl_item':
          this.handleImplItem(node, symbols);
          return false;

        case 'const_item':
          this.handleConstItem(node, symbols, scope);
          return false;

        case 'static_item':
          this.handleStaticItem(node, symbols, scope);
          return false;

        case 'mod_item':
          this.handleModItem(node, symbols, content);
          return false;
      }
      return true;
    });
  }

  private handleFunctionItem(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);
    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol(name, 'function', node, {
        exported,
        scope,
        signature,
      })
    );
  }

  private handleStructItem(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
        scope,
      })
    );

    // Extract struct fields
    const bodyNode = this.getChildByType(node, 'field_declaration_list');
    if (bodyNode) {
      for (const field of bodyNode.namedChildren) {
        if (!field) continue;
        if (field.type === 'field_declaration') {
          const fieldNameNode = this.getChildByField(field, 'name');
          if (fieldNameNode) {
            const fieldName = this.getNodeText(fieldNameNode);
            const typeNode = this.getChildByField(field, 'type');
            symbols.push(
              this.createSymbol(fieldName, 'property', field, {
                exported: this.isPublic(field),
                scope: name,
                signature: typeNode ? this.getNodeText(typeNode) : undefined,
              })
            );
          }
        }
      }
    }
  }

  private handleEnumItem(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);

    symbols.push(
      this.createSymbol(name, 'enum', node, {
        exported,
        scope,
      })
    );
  }

  private handleTraitItem(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported,
        scope,
      })
    );
  }

  private handleTypeItem(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);
    const typeNode = this.getChildByField(node, 'type');

    symbols.push(
      this.createSymbol(name, 'type', node, {
        exported,
        scope,
        signature: typeNode ? this.getNodeText(typeNode) : undefined,
      })
    );
  }

  private handleImplItem(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // Get the type being implemented
    const typeNode = this.getChildByField(node, 'type');
    if (!typeNode) return;

    const typeName = this.getNodeText(typeNode);
    const bodyNode = this.getChildByType(node, 'declaration_list');

    if (bodyNode) {
      for (const item of bodyNode.namedChildren) {
        if (!item) continue;
        if (item.type === 'function_item') {
          const nameNode = this.getChildByField(item, 'name');
          if (nameNode) {
            const name = this.getNodeText(nameNode);
            const exported = this.isPublic(item);
            const signature = this.getFunctionSignature(item);

            symbols.push(
              this.createSymbol(name, 'method', item, {
                exported,
                scope: typeName,
                signature,
              })
            );
          }
        }
      }
    }
  }

  private handleConstItem(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);
    const typeNode = this.getChildByField(node, 'type');

    symbols.push(
      this.createSymbol(name, 'const', node, {
        exported,
        scope,
        signature: typeNode ? this.getNodeText(typeNode) : undefined,
      })
    );
  }

  private handleStaticItem(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    scope?: string
  ): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);
    const typeNode = this.getChildByField(node, 'type');

    symbols.push(
      this.createSymbol(name, 'variable', node, {
        exported,
        scope,
        signature: typeNode ? this.getNodeText(typeNode) : undefined,
      })
    );
  }

  private handleModItem(node: SyntaxNode, symbols: ExtractedSymbol[], content: string): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const exported = this.isPublic(node);

    // A module acts like a namespace
    symbols.push(
      this.createSymbol(name, 'namespace', node, {
        exported,
      })
    );

    // Recursively extract from module body
    const bodyNode = this.getChildByType(node, 'declaration_list');
    if (bodyNode) {
      this.extractSymbols(bodyNode, content, symbols, name);
    }
  }

  private extractImports(
    rootNode: SyntaxNode,
    content: string,
    imports: ExtractedImport[]
  ): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'use_declaration') {
        this.handleUseDeclaration(node, imports);
        return false;
      } else if (node.type === 'extern_crate_declaration') {
        this.handleExternCrate(node, imports);
        return false;
      }
      return true;
    });
  }

  private handleUseDeclaration(node: SyntaxNode, imports: ExtractedImport[]): void {
    const line = node.startPosition.row + 1;

    // Extract the use path
    const useTree = node.namedChildren.find(
      (c) => c !== null && (c.type === 'use_wildcard' || c.type === 'use_list' || c.type === 'scoped_identifier' || c.type === 'identifier' || c.type === 'scoped_use_list')
    );

    if (!useTree) return;

    this.extractUsePaths(useTree, '', imports, line);
  }

  private extractUsePaths(
    node: SyntaxNode,
    basePath: string,
    imports: ExtractedImport[],
    line: number
  ): void {
    switch (node.type) {
      case 'identifier':
        const name = this.getNodeText(node);
        const fullPath = basePath ? `${basePath}::${name}` : name;
        imports.push(this.createImport(name, fullPath, line));
        break;

      case 'scoped_identifier':
        const pathNode = this.getChildByField(node, 'path');
        const nameNode = this.getChildByField(node, 'name');
        if (pathNode && nameNode) {
          const path = this.getNodeText(pathNode);
          const name = this.getNodeText(nameNode);
          const fullPath = basePath ? `${basePath}::${path}::${name}` : `${path}::${name}`;
          imports.push(this.createImport(name, fullPath, line));
        }
        break;

      case 'use_wildcard':
        // use foo::*
        const wildcardPath = basePath || this.getParentPath(node);
        imports.push(
          this.createImport('*', wildcardPath, line, {
            isNamespace: true,
          })
        );
        break;

      case 'use_list':
      case 'scoped_use_list':
        // use foo::{bar, baz}
        const pathField = this.getChildByField(node, 'path');
        const listPath = node.type === 'scoped_use_list'
          ? this.getNodeText(pathField || node)
          : basePath;

        for (const child of node.namedChildren) {
          if (!child) continue;
          if (child.type === 'use_list') {
            for (const item of child.namedChildren) {
              if (!item) continue;
              this.extractUsePaths(item, listPath, imports, line);
            }
          } else if (child.type !== 'scoped_identifier' || pathField !== child) {
            this.extractUsePaths(child, listPath, imports, line);
          }
        }
        break;

      case 'use_as_clause':
        const originalNode = this.getChildByField(node, 'path');
        const aliasNode = this.getChildByField(node, 'alias');
        if (originalNode && aliasNode) {
          const original = this.getNodeText(originalNode);
          const alias = this.getNodeText(aliasNode);
          const fullPath = basePath ? `${basePath}::${original}` : original;
          imports.push(
            this.createImport(original, fullPath, line, {
              localName: alias,
            })
          );
        }
        break;
    }
  }

  private getParentPath(node: SyntaxNode): string {
    let current = node.parent;
    while (current) {
      if (current.type === 'scoped_use_list') {
        const pathNode = this.getChildByField(current, 'path');
        if (pathNode) return this.getNodeText(pathNode);
      }
      current = current.parent;
    }
    return '';
  }

  private handleExternCrate(node: SyntaxNode, imports: ExtractedImport[]): void {
    const line = node.startPosition.row + 1;
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const aliasNode = this.getChildByField(node, 'alias');

    imports.push(
      this.createImport(name, name, line, {
        localName: aliasNode ? this.getNodeText(aliasNode) : undefined,
        isNamespace: true,
      })
    );
  }

  private isPublic(node: SyntaxNode): boolean {
    // Check for pub keyword in visibility modifier
    const visNode = node.children.find((c) => c !== null && c.type === 'visibility_modifier');
    return !!visNode;
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByField(node, 'parameters');
    const returnNode = this.getChildByField(node, 'return_type');

    let sig = paramsNode ? this.getNodeText(paramsNode) : '()';
    if (returnNode) {
      sig += ' -> ' + this.getNodeText(returnNode);
    }
    return sig;
  }
}
