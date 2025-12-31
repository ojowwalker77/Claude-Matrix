/**
 * C Language Parser
 *
 * Extracts symbols and imports from C files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport } from '../types.js';

export class CParser extends LanguageParser {
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
        case 'function_definition':
          this.handleFunctionDefinition(node, symbols);
          return false;

        case 'declaration':
          this.handleDeclaration(node, symbols);
          return false;

        case 'struct_specifier':
          this.handleStructSpecifier(node, symbols);
          return false;

        case 'union_specifier':
          this.handleUnionSpecifier(node, symbols);
          return false;

        case 'enum_specifier':
          this.handleEnumSpecifier(node, symbols);
          return false;

        case 'type_definition':
          this.handleTypedef(node, symbols);
          return false;
      }
      return true;
    });
  }

  private handleFunctionDefinition(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const declarator = this.getChildByField(node, 'declarator');
    if (!declarator) return;

    const nameNode = this.getFunctionName(declarator);
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const signature = this.getFunctionSignature(node);

    // Check if static (file-local)
    const isStatic = this.hasStorageClass(node, 'static');

    symbols.push(
      this.createSymbol(name, 'function', node, {
        exported: !isStatic,
        signature,
      })
    );
  }

  private handleDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // Check for function declarations (prototypes)
    const declarator = this.getChildByField(node, 'declarator');
    if (!declarator) return;

    // Handle variable/constant declarations
    if (declarator.type === 'init_declarator' || declarator.type === 'identifier') {
      this.handleVariableDeclaration(node, symbols);
      return;
    }

    // Handle function declarations
    if (declarator.type === 'function_declarator') {
      const nameNode = this.getFunctionName(declarator);
      if (nameNode) {
        const name = this.getNodeText(nameNode);
        const isStatic = this.hasStorageClass(node, 'static');

        symbols.push(
          this.createSymbol(name, 'function', node, {
            exported: !isStatic,
          })
        );
      }
    }
  }

  private handleVariableDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const isConst = this.hasTypeQualifier(node, 'const');
    const isStatic = this.hasStorageClass(node, 'static');
    const isExtern = this.hasStorageClass(node, 'extern');

    // Get all declarators (can have multiple: int a, b, c;)
    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'init_declarator') {
        const nameNode = this.getChildByField(child, 'declarator');
        if (nameNode && nameNode.type === 'identifier') {
          const name = this.getNodeText(nameNode);
          symbols.push(
            this.createSymbol(name, isConst ? 'const' : 'variable', child, {
              exported: !isStatic || isExtern,
            })
          );
        }
      } else if (child.type === 'identifier') {
        const name = this.getNodeText(child);
        symbols.push(
          this.createSymbol(name, isConst ? 'const' : 'variable', child, {
            exported: !isStatic || isExtern,
          })
        );
      }
    }
  }

  private handleStructSpecifier(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported: true,
      })
    );

    // Extract struct fields
    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractStructMembers(body, symbols, name);
    }
  }

  private handleUnionSpecifier(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported: true,
      })
    );
  }

  private handleEnumSpecifier(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    const name = nameNode ? this.getNodeText(nameNode) : undefined;

    if (name) {
      symbols.push(
        this.createSymbol(name, 'enum', node, {
          exported: true,
        })
      );
    }

    // Extract enum values
    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractEnumMembers(body, symbols, name);
    }
  }

  private handleTypedef(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // Find the type name (last identifier before semicolon)
    const declarator = this.getChildByField(node, 'declarator');
    if (!declarator) return;

    let nameNode = declarator;
    // Handle pointer/array declarators
    while (nameNode.type !== 'identifier' && nameNode.type !== 'type_identifier') {
      const child = this.getChildByField(nameNode, 'declarator') ||
        this.getChildByType(nameNode, 'identifier') ||
        this.getChildByType(nameNode, 'type_identifier');
      if (!child) break;
      nameNode = child;
    }

    if (nameNode.type === 'identifier' || nameNode.type === 'type_identifier') {
      const name = this.getNodeText(nameNode);
      symbols.push(
        this.createSymbol(name, 'type', node, {
          exported: true,
        })
      );
    }
  }

  private extractStructMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName: string
  ): void {
    for (const child of body.namedChildren) {
      if (!child) continue;
      if (child.type === 'field_declaration') {
        const declarator = this.getChildByField(child, 'declarator');
        if (declarator) {
          let nameNode = declarator;
          while (nameNode.type !== 'field_identifier') {
            const inner = this.getChildByType(nameNode, 'field_identifier');
            if (!inner) break;
            nameNode = inner;
          }
          if (nameNode.type === 'field_identifier') {
            const name = this.getNodeText(nameNode);
            symbols.push(
              this.createSymbol(name, 'property', child, {
                exported: true,
                scope: parentName,
              })
            );
          }
        }
      }
    }
  }

  private extractEnumMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    enumName?: string
  ): void {
    for (const child of body.namedChildren) {
      if (!child) continue;
      if (child.type === 'enumerator') {
        const nameNode = this.getChildByField(child, 'name');
        if (nameNode) {
          const name = this.getNodeText(nameNode);
          symbols.push(
            this.createSymbol(name, 'const', child, {
              exported: true,
              scope: enumName,
            })
          );
        }
      }
    }
  }

  private extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'preproc_include') {
        this.handleInclude(node, imports);
        return false;
      }
      return true;
    });
  }

  private handleInclude(node: SyntaxNode, imports: ExtractedImport[]): void {
    const line = node.startPosition.row + 1;

    const pathNode = this.getChildByField(node, 'path');
    if (!pathNode) return;

    let path = this.getNodeText(pathNode);
    // Remove quotes or angle brackets
    path = path.replace(/^[<"]|[>"]$/g, '');

    const parts = path.split('/');
    const name = (parts[parts.length - 1] ?? '').replace(/\.[hc]$/, '');

    const _isSystem = pathNode.type === 'system_lib_string';

    imports.push(
      this.createImport(name, path, line, {
        isNamespace: true,
      })
    );
  }

  private getFunctionName(declarator: SyntaxNode): SyntaxNode | null {
    if (declarator.type === 'function_declarator') {
      const inner = this.getChildByField(declarator, 'declarator');
      if (inner) {
        if (inner.type === 'identifier') return inner;
        return this.getFunctionName(inner);
      }
    }
    if (declarator.type === 'pointer_declarator') {
      const inner = this.getChildByField(declarator, 'declarator');
      if (inner) return this.getFunctionName(inner);
    }
    if (declarator.type === 'identifier') return declarator;
    return null;
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const declarator = this.getChildByField(node, 'declarator');
    if (!declarator) return '()';

    // Find the parameter list
    let funcDecl: SyntaxNode | undefined = declarator;
    while (funcDecl && funcDecl.type !== 'function_declarator') {
      const child: SyntaxNode | undefined = this.getChildByField(funcDecl, 'declarator') ?? funcDecl.namedChildren[0];
      if (!child || child.type === 'identifier') break;
      funcDecl = child;
    }

    if (funcDecl?.type === 'function_declarator') {
      const params = this.getChildByField(funcDecl, 'parameters');
      if (params) return this.getNodeText(params);
    }
    return '()';
  }

  private hasStorageClass(node: SyntaxNode, storageClass: string): boolean {
    for (const child of node.children) {
      if (child && child.type === 'storage_class_specifier') {
        if (this.getNodeText(child) === storageClass) return true;
      }
    }
    return false;
  }

  private hasTypeQualifier(node: SyntaxNode, qualifier: string): boolean {
    for (const child of node.children) {
      if (child && child.type === 'type_qualifier') {
        if (this.getNodeText(child) === qualifier) return true;
      }
    }
    return false;
  }
}
