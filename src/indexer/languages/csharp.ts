/**
 * C# Language Parser
 *
 * Extracts symbols and imports from C# files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class CSharpParser extends LanguageParser {
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
        case 'class_declaration':
          this.handleClassDeclaration(node, symbols);
          return false;

        case 'struct_declaration':
          this.handleStructDeclaration(node, symbols);
          return false;

        case 'interface_declaration':
          this.handleInterfaceDeclaration(node, symbols);
          return false;

        case 'enum_declaration':
          this.handleEnumDeclaration(node, symbols);
          return false;

        case 'method_declaration':
          this.handleMethodDeclaration(node, symbols);
          return false;

        case 'constructor_declaration':
          this.handleConstructorDeclaration(node, symbols);
          return false;

        case 'property_declaration':
          this.handlePropertyDeclaration(node, symbols);
          return false;

        case 'field_declaration':
          this.handleFieldDeclaration(node, symbols);
          return false;

        case 'delegate_declaration':
          this.handleDelegateDeclaration(node, symbols);
          return false;

        case 'record_declaration':
          this.handleRecordDeclaration(node, symbols);
          return false;

        case 'namespace_declaration':
          this.handleNamespaceDeclaration(node, symbols);
          return true; // Continue to find nested types
      }
      return true;
    });
  }

  private handleClassDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public') || modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
      })
    );

    // Extract class members
    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleStructDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public') || modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
      })
    );

    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleInterfaceDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public') || modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported,
      })
    );

    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleEnumDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public') || modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'enum', node, {
        exported,
      })
    );

    // Extract enum members
    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractEnumMembers(body, symbols, name);
    }
  }

  private handleMethodDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');
    const signature = this.getMethodSignature(node);
    const scope = this.getParentTypeName(node);

    symbols.push(
      this.createSymbol(name, 'method', node, {
        exported,
        scope,
        signature,
      })
    );
  }

  private handleConstructorDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');
    const signature = this.getMethodSignature(node);

    symbols.push(
      this.createSymbol(name, 'method', node, {
        exported,
        scope: name,
        signature,
      })
    );
  }

  private handlePropertyDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');
    const scope = this.getParentTypeName(node);

    symbols.push(
      this.createSymbol(name, 'property', node, {
        exported,
        scope,
      })
    );
  }

  private handleFieldDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');
    const isConst = modifiers.includes('const') || (modifiers.includes('readonly') && modifiers.includes('static'));
    const scope = this.getParentTypeName(node);

    // Get variable declarations
    const declaration = this.getChildByField(node, 'declaration');
    if (declaration) {
      for (const child of declaration.namedChildren) {
        if (!child) continue;
        if (child.type === 'variable_declarator') {
          const nameNode = this.getChildByField(child, 'name');
          if (nameNode) {
            const name = this.getNodeText(nameNode);
            symbols.push(
              this.createSymbol(name, isConst ? 'const' : 'property', child, {
                exported,
                scope,
              })
            );
          }
        }
      }
    }
  }

  private handleDelegateDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public') || modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'type', node, {
        exported,
      })
    );
  }

  private handleRecordDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public') || modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
      })
    );

    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleNamespaceDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    symbols.push(
      this.createSymbol(name, 'namespace', node, {
        exported: true,
      })
    );
  }

  private extractClassMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName: string
  ): void {
    for (const child of body.namedChildren) {
      if (!child) continue;
      switch (child.type) {
        case 'method_declaration':
          this.handleMethodDeclaration(child, symbols);
          break;
        case 'constructor_declaration':
          this.handleConstructorDeclaration(child, symbols);
          break;
        case 'property_declaration':
          this.handlePropertyDeclaration(child, symbols);
          break;
        case 'field_declaration':
          this.handleFieldDeclaration(child, symbols);
          break;
        case 'class_declaration':
          this.handleClassDeclaration(child, symbols);
          break;
        case 'struct_declaration':
          this.handleStructDeclaration(child, symbols);
          break;
        case 'interface_declaration':
          this.handleInterfaceDeclaration(child, symbols);
          break;
        case 'enum_declaration':
          this.handleEnumDeclaration(child, symbols);
          break;
      }
    }
  }

  private extractEnumMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    enumName: string
  ): void {
    for (const child of body.namedChildren) {
      if (!child) continue;
      if (child.type === 'enum_member_declaration') {
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
      if (node.type === 'using_directive') {
        this.handleUsingDirective(node, imports);
        return false;
      }
      return true;
    });
  }

  private handleUsingDirective(node: SyntaxNode, imports: ExtractedImport[]): void {
    const line = node.startPosition.row + 1;

    // Check for static using
    const isStatic = node.children.some(
      (child) => child && child.type === 'static'
    );

    // Get the namespace/type being imported
    let importPath = '';
    let alias: string | undefined;

    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'qualified_name' || child.type === 'identifier' || child.type === 'name_equals') {
        if (child.type === 'name_equals') {
          // Aliased using: using Alias = Namespace;
          const aliasNode = this.getChildByField(child, 'name');
          if (aliasNode) {
            alias = this.getNodeText(aliasNode);
          }
        } else {
          importPath = this.getNodeText(child);
        }
      }
    }

    if (importPath) {
      const parts = importPath.split('.');
      const importName = alias || parts[parts.length - 1] || importPath;

      imports.push(
        this.createImport(importName, importPath, line, {
          localName: alias,
          isNamespace: !isStatic,
          isType: isStatic,
        })
      );
    }
  }

  private getModifiers(node: SyntaxNode): string[] {
    const modifiers: string[] = [];

    for (const child of node.children) {
      if (!child) continue;
      if (child.type === 'modifier') {
        modifiers.push(this.getNodeText(child));
      }
    }
    return modifiers;
  }

  private getParentTypeName(node: SyntaxNode): string | undefined {
    const parent = this.getAncestorOfType(node, 'class_declaration') ||
      this.getAncestorOfType(node, 'struct_declaration') ||
      this.getAncestorOfType(node, 'interface_declaration') ||
      this.getAncestorOfType(node, 'record_declaration');

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
    const typeNode = this.getChildByField(node, 'type');

    let sig = '';
    if (typeNode) {
      sig = this.getNodeText(typeNode) + ' ';
    }
    sig += paramsNode ? this.getNodeText(paramsNode) : '()';
    return sig;
  }
}
