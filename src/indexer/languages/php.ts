/**
 * PHP Language Parser
 *
 * Extracts symbols and imports from PHP files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ExtractedSymbol, ExtractedImport } from '../types.js';

export class PHPParser extends LanguageParser {
  protected extractSymbols(rootNode: SyntaxNode, symbols: ExtractedSymbol[]): void {
    this.walkTree(rootNode, (node) => {
      switch (node.type) {
        case 'class_declaration':
          this.handleClassDeclaration(node, symbols);
          return false;

        case 'interface_declaration':
          this.handleInterfaceDeclaration(node, symbols);
          return false;

        case 'trait_declaration':
          this.handleTraitDeclaration(node, symbols);
          return false;

        case 'enum_declaration':
          this.handleEnumDeclaration(node, symbols);
          return false;

        case 'function_definition':
          this.handleFunctionDeclaration(node, symbols);
          return false;

        case 'method_declaration':
          this.handleMethodDeclaration(node, symbols);
          return false;

        case 'property_declaration':
          this.handlePropertyDeclaration(node, symbols);
          return false;

        case 'const_declaration':
          this.handleConstDeclaration(node, symbols);
          return false;

        case 'namespace_definition':
          this.handleNamespaceDefinition(node, symbols);
          return true; // Continue to extract namespace members
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
        exported: true,
      })
    );

    // Extract class body
    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleInterfaceDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported: true,
      })
    );

    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractClassMembers(body, symbols, name);
    }
  }

  private handleTraitDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
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

  private handleEnumDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);

    symbols.push(
      this.createSymbol(name, 'enum', node, {
        exported: true,
      })
    );

    // Extract enum cases
    const body = this.getChildByField(node, 'body');
    if (body) {
      this.extractEnumMembers(body, symbols, name);
    }
  }

  private handleFunctionDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol(name, 'function', node, {
        exported: true,
        signature,
      })
    );
  }

  private handleMethodDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByField(node, 'name');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');
    const signature = this.getFunctionSignature(node);
    const scope = this.getParentClassName(node);

    symbols.push(
      this.createSymbol(name, 'method', node, {
        exported,
        scope,
        signature,
      })
    );
  }

  private handlePropertyDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public');
    const isConst = modifiers.includes('const');
    const scope = this.getParentClassName(node);

    // Get property elements
    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'property_element') {
        const nameNode = this.getChildByType(child, 'variable_name');
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

  private handleConstDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const scope = this.getParentClassName(node);
    const modifiers = this.getModifiers(node);
    const exported = modifiers.includes('public') || !scope; // Top-level consts are always exported

    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'const_element') {
        const nameNode = this.getChildByField(child, 'name');
        if (nameNode) {
          const name = this.getNodeText(nameNode);
          symbols.push(
            this.createSymbol(name, 'const', child, {
              exported,
              scope,
            })
          );
        }
      }
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

  private extractClassMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    _parentName: string
  ): void {
    for (const child of body.namedChildren) {
      if (!child) continue;
      switch (child.type) {
        case 'method_declaration':
          this.handleMethodDeclaration(child, symbols);
          break;
        case 'property_declaration':
          this.handlePropertyDeclaration(child, symbols);
          break;
        case 'const_declaration':
          this.handleConstDeclaration(child, symbols);
          break;
        case 'class_declaration':
          this.handleClassDeclaration(child, symbols);
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
      if (child.type === 'enum_case') {
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
      }
    }
  }

  protected extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'namespace_use_declaration') {
        this.handleUseDeclaration(node, imports);
        return false;
      }
      return true;
    });
  }

  private handleUseDeclaration(node: SyntaxNode, imports: ExtractedImport[]): void {
    const line = node.startPosition.row + 1;

    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'namespace_use_clause') {
        const nameNode = this.getChildByField(child, 'name');
        if (!nameNode) continue;

        const path = this.getNodeText(nameNode);
        const parts = path.split('\\');
        let importName = parts[parts.length - 1] ?? path;

        // Check for alias
        const aliasNode = this.getChildByField(child, 'alias');
        let alias: string | undefined;
        if (aliasNode) {
          alias = this.getNodeText(aliasNode);
          importName = alias;
        }

        imports.push(
          this.createImport(importName, path, line, {
            localName: alias,
            isType: true,
          })
        );
      }
    }
  }

  private getModifiers(node: SyntaxNode): string[] {
    const modifiers: string[] = [];

    for (const child of node.children) {
      if (!child) continue;
      if (child.type === 'visibility_modifier' ||
          child.type === 'static_modifier' ||
          child.type === 'final_modifier' ||
          child.type === 'abstract_modifier' ||
          child.type === 'readonly_modifier') {
        modifiers.push(this.getNodeText(child));
      }
    }
    return modifiers;
  }

  private getParentClassName(node: SyntaxNode): string | undefined {
    const parent = this.getAncestorOfType(node, 'class_declaration') ||
      this.getAncestorOfType(node, 'interface_declaration') ||
      this.getAncestorOfType(node, 'trait_declaration') ||
      this.getAncestorOfType(node, 'enum_declaration');

    if (parent) {
      const nameNode = this.getChildByField(parent, 'name');
      if (nameNode) {
        return this.getNodeText(nameNode);
      }
    }
    return undefined;
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByField(node, 'parameters');
    const returnNode = this.getChildByField(node, 'return_type');

    let sig = paramsNode ? this.getNodeText(paramsNode) : '()';
    if (returnNode) {
      sig += ': ' + this.getNodeText(returnNode);
    }
    return sig;
  }
}
