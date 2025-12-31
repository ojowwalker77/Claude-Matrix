/**
 * C++ Language Parser
 *
 * Extracts symbols and imports from C++ files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class CppParser extends LanguageParser {
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

        case 'class_specifier':
          this.handleClassSpecifier(node, symbols);
          return false;

        case 'struct_specifier':
          this.handleStructSpecifier(node, symbols);
          return false;

        case 'enum_specifier':
          this.handleEnumSpecifier(node, symbols);
          return false;

        case 'namespace_definition':
          this.handleNamespaceDefinition(node, symbols);
          return true; // Continue to find namespace members

        case 'template_declaration':
          this.handleTemplateDeclaration(node, symbols);
          return false;

        case 'alias_declaration':
          this.handleAliasDeclaration(node, symbols);
          return false;

        case 'declaration':
          this.handleDeclaration(node, symbols);
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
    const signature = this.getFunctionSignature(declarator);
    const scope = this.getParentScopeName(node);

    // Determine if this is a method or function
    const kind: SymbolKind = scope ? 'method' : 'function';
    const isStatic = this.hasStorageClass(node, 'static');

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported: !isStatic,
        scope,
        signature,
      })
    );
  }

  private handleClassSpecifier(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported: true,
      })
    );

    // Extract class body
    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
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

    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
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

    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractEnumMembers(body, symbols, name);
    }
  }

  private handleNamespaceDefinition(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'namespace', node, {
        exported: true,
      })
    );
  }

  private handleTemplateDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // Handle the templated declaration
    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'function_definition') {
        this.handleFunctionDefinition(child, symbols);
      } else if (child.type === 'class_specifier') {
        this.handleClassSpecifier(child, symbols);
      } else if (child.type === 'struct_specifier') {
        this.handleStructSpecifier(child, symbols);
      } else if (child.type === 'declaration') {
        this.handleDeclaration(child, symbols);
      }
    }
  }

  private handleAliasDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'type', node, {
        exported: true,
      })
    );
  }

  private handleDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // Handle variable declarations
    const declarator = this.getChildByField(node, 'declarator');
    if (!declarator) return;

    // Check for function declarations
    if (declarator.type === 'function_declarator') {
      const nameNode = this.getFunctionName(declarator);
      if (nameNode) {
        const name = this.getNodeText(nameNode);
        const isStatic = this.hasStorageClass(node, 'static');
        const signature = this.getFunctionSignature(declarator);

        symbols.push(
          this.createSymbol(name, 'function', node, {
            exported: !isStatic,
            signature,
          })
        );
      }
      return;
    }

    // Handle variable declarations
    const isConst = this.hasTypeQualifier(node, 'const');
    const isConstexpr = this.hasSpecifier(node, 'constexpr');
    const isStatic = this.hasStorageClass(node, 'static');

    this.extractVariableNames(node, symbols, isConst || isConstexpr, isStatic);
  }

  private extractClassMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName: string
  ): void {
    let currentAccess = 'private'; // Default for class

    for (const child of body.namedChildren) {
      if (!child) continue;

      if (child.type === 'access_specifier') {
        currentAccess = this.getNodeText(child).replace(':', '').trim();
        continue;
      }

      const exported = currentAccess === 'public';

      switch (child.type) {
        case 'function_definition':
          this.handleFunctionDefinition(child, symbols);
          break;
        case 'declaration':
          this.handleMemberDeclaration(child, symbols, parentName, exported);
          break;
        case 'field_declaration':
          this.handleFieldDeclaration(child, symbols, parentName, exported);
          break;
        case 'class_specifier':
          this.handleClassSpecifier(child, symbols);
          break;
        case 'struct_specifier':
          this.handleStructSpecifier(child, symbols);
          break;
        case 'enum_specifier':
          this.handleEnumSpecifier(child, symbols);
          break;
      }
    }
  }

  private handleMemberDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName: string,
    exported: boolean
  ): void {
    const declarator = this.getChildByField(node, 'declarator');
    if (!declarator) return;

    // Handle method declarations
    if (declarator.type === 'function_declarator') {
      const nameNode = this.getFunctionName(declarator);
      if (nameNode) {
        const name = this.getNodeText(nameNode);
        const signature = this.getFunctionSignature(declarator);

        symbols.push(
          this.createSymbol(name, 'method', node, {
            exported,
            scope: parentName,
            signature,
          })
        );
      }
    }
  }

  private handleFieldDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName: string,
    exported: boolean
  ): void {
    const isConst = this.hasTypeQualifier(node, 'const');
    const _isStatic = this.hasStorageClass(node, 'static');
    const isConstexpr = this.hasSpecifier(node, 'constexpr');

    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'field_identifier') {
        const name = this.getNodeText(child);
        symbols.push(
          this.createSymbol(name, isConst || isConstexpr ? 'const' : 'property', child, {
            exported,
            scope: parentName,
          })
        );
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

  private extractVariableNames(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    isConst: boolean,
    isStatic: boolean
  ): void {
    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'init_declarator') {
        const decl = this.getChildByField(child, 'declarator');
        if (decl && decl.type === 'identifier') {
          const name = this.getNodeText(decl);
          symbols.push(
            this.createSymbol(name, isConst ? 'const' : 'variable', child, {
              exported: !isStatic,
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
    path = path.replace(/^[<"]|[>"]$/g, '');

    const parts = path.split('/');
    const name = (parts[parts.length - 1] ?? '').replace(/\.[hc]pp?$/, '');

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
        if (inner.type === 'qualified_identifier') {
          // Get the last part of qualified name
          const name = this.getChildByField(inner, 'name');
          if (name) return name;
        }
        return this.getFunctionName(inner);
      }
    }
    if (declarator.type === 'pointer_declarator' || declarator.type === 'reference_declarator') {
      const inner = this.getChildByField(declarator, 'declarator');
      if (inner) return this.getFunctionName(inner);
    }
    if (declarator.type === 'identifier') return declarator;
    return null;
  }

  private getFunctionSignature(declarator: SyntaxNode): string {
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

  private getParentScopeName(node: SyntaxNode): string | undefined {
    const parent = this.getAncestorOfType(node, 'class_specifier') ||
      this.getAncestorOfType(node, 'struct_specifier');

    if (parent) {
      const nameNode = this.getChildByField(parent, 'name');
      if (nameNode) {
        return this.getNodeText(nameNode);
      }
    }
    return undefined;
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

  private hasSpecifier(node: SyntaxNode, specifier: string): boolean {
    for (const child of node.children) {
      if (child && this.getNodeText(child) === specifier) return true;
    }
    return false;
  }
}
