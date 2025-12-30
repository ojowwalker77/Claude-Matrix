/**
 * Java Language Parser
 *
 * Extracts symbols and imports from Java files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class JavaParser extends LanguageParser {
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

        case 'field_declaration':
          this.handleFieldDeclaration(node, symbols);
          return false;

        case 'annotation_type_declaration':
          this.handleAnnotationDeclaration(node, symbols);
          return false;

        case 'record_declaration':
          this.handleRecordDeclaration(node, symbols);
          return false;
      }
      return true;
    });
  }

  private handleClassDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
      })
    );

    // Extract nested declarations
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
    const exported = modifiers.includes('public');

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported,
      })
    );

    // Extract interface methods
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
    const exported = modifiers.includes('public');

    symbols.push(
      this.createSymbol(name, 'enum', node, {
        exported,
      })
    );

    // Extract enum constants and methods
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

    // Get parent class/interface name as scope
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
        scope: name, // Constructor's scope is its own class
        signature,
      })
    );
  }

  private handleFieldDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');
    const isConst = modifiers.includes('final') && modifiers.includes('static');
    const scope = this.getParentTypeName(node);

    // Get all variable declarators
    for (const child of node.namedChildren) {
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

  private handleAnnotationDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported,
      })
    );
  }

  private handleRecordDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
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
        case 'field_declaration':
          this.handleFieldDeclaration(child, symbols);
          break;
        case 'class_declaration':
          this.handleClassDeclaration(child, symbols);
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
      if (child.type === 'enum_constant') {
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
      } else if (child.type === 'method_declaration') {
        this.handleMethodDeclaration(child, symbols);
      } else if (child.type === 'field_declaration') {
        this.handleFieldDeclaration(child, symbols);
      }
    }
  }

  private extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void {
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

    // Check if it's a static import
    const isStatic = node.children.some(
      (child) => child && child.type === 'static'
    );

    // Get the full import path
    // Could be scoped_identifier or identifier with wildcard
    let importPath = '';
    let importName = '';
    let isWildcard = false;

    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'scoped_identifier' || child.type === 'identifier') {
        importPath = this.getNodeText(child);
        const parts = importPath.split('.');
        importName = parts[parts.length - 1] ?? importPath;
      } else if (child.type === 'asterisk') {
        isWildcard = true;
        importName = '*';
      }
    }

    if (importPath) {
      imports.push(
        this.createImport(importName, importPath, line, {
          isNamespace: isWildcard,
          isType: !isStatic && !isWildcard,
        })
      );
    }
  }

  private getModifiers(node: SyntaxNode): string[] {
    const modifiers: string[] = [];
    const modifiersNode = this.getChildByType(node, 'modifiers');
    if (modifiersNode) {
      for (const child of modifiersNode.children) {
        if (child && child.type !== 'annotation' && child.type !== 'marker_annotation') {
          modifiers.push(this.getNodeText(child));
        }
      }
    }
    return modifiers;
  }

  private getParentTypeName(node: SyntaxNode): string | undefined {
    const parent = this.getAncestorOfType(node, 'class_declaration') ||
      this.getAncestorOfType(node, 'interface_declaration') ||
      this.getAncestorOfType(node, 'enum_declaration') ||
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
