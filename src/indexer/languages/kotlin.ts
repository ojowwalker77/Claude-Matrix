/**
 * Kotlin Language Parser
 *
 * Extracts symbols and imports from Kotlin files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class KotlinParser extends LanguageParser {
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

        case 'object_declaration':
          this.handleObjectDeclaration(node, symbols);
          return false;

        case 'interface_declaration':
          this.handleInterfaceDeclaration(node, symbols);
          return false;

        case 'function_declaration':
          this.handleFunctionDeclaration(node, symbols);
          return false;

        case 'property_declaration':
          this.handlePropertyDeclaration(node, symbols);
          return false;

        case 'enum_class_body':
          // Skip enum entries processing here, handled in class declaration
          return true;

        case 'type_alias':
          this.handleTypeAlias(node, symbols);
          return false;
      }
      return true;
    });
  }

  private handleClassDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('internal');

    // Determine if it's an enum class or data class
    let kind: SymbolKind = 'class';
    if (modifiers.includes('enum')) {
      kind = 'enum';
    }

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported,
      })
    );

    // Extract class body members
    const body = this.getChildByType(node, 'class_body');
    if (body) {
      this.extractClassMembers(body, symbols, name, kind === 'enum');
    }

    // Extract primary constructor parameters as properties
    const primaryConstructor = this.getChildByType(node, 'primary_constructor');
    if (primaryConstructor) {
      this.extractConstructorProperties(primaryConstructor, symbols, name);
    }
  }

  private handleObjectDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('internal');

    // Check if it's a companion object
    const isCompanion = modifiers.includes('companion');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
        scope: isCompanion ? this.getParentTypeName(node) : undefined,
      })
    );

    const body = this.getChildByType(node, 'class_body');
    if (body) {
      this.extractClassMembers(body, symbols, name, false);
    }
  }

  private handleInterfaceDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported,
      })
    );

    const body = this.getChildByType(node, 'class_body');
    if (body) {
      this.extractClassMembers(body, symbols, name, false);
    }
  }

  private handleFunctionDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'simple_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('internal');
    const signature = this.getFunctionSignature(node);
    const scope = this.getParentTypeName(node);

    // Top-level functions are 'function', class methods are 'method'
    const kind: SymbolKind = scope ? 'method' : 'function';

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported,
        scope,
        signature,
      })
    );
  }

  private handlePropertyDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'variable_declaration');
    if (!nameNode) return;

    const identNode = this.getChildByType(nameNode, 'simple_identifier');
    if (!identNode) return;

    const name = this.getNodeText(identNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('internal');
    const isConst = modifiers.includes('const');
    const isVal = node.children.some((c) => c && this.getNodeText(c) === 'val');
    const scope = this.getParentTypeName(node);

    // Top-level val/const are 'const', var are 'variable', class members are 'property'
    let kind: SymbolKind = 'property';
    if (!scope) {
      kind = isConst || isVal ? 'const' : 'variable';
    }

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported,
        scope,
      })
    );
  }

  private handleTypeAlias(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('internal');

    symbols.push(
      this.createSymbol(name, 'type', node, {
        exported,
      })
    );
  }

  private extractClassMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName: string,
    isEnum: boolean
  ): void {
    for (const child of body.namedChildren) {
      if (!child) continue;
      switch (child.type) {
        case 'function_declaration':
          this.handleFunctionDeclaration(child, symbols);
          break;
        case 'property_declaration':
          this.handlePropertyDeclaration(child, symbols);
          break;
        case 'class_declaration':
          this.handleClassDeclaration(child, symbols);
          break;
        case 'object_declaration':
          this.handleObjectDeclaration(child, symbols);
          break;
        case 'interface_declaration':
          this.handleInterfaceDeclaration(child, symbols);
          break;
        case 'enum_entry':
          if (isEnum) {
            const nameNode = this.getChildByType(child, 'simple_identifier');
            if (nameNode) {
              const name = this.getNodeText(nameNode);
              symbols.push(
                this.createSymbol(name, 'const', child, {
                  exported: true,
                  scope: parentName,
                })
              );
            }
          }
          break;
        case 'secondary_constructor':
          this.handleSecondaryConstructor(child, symbols, parentName);
          break;
      }
    }
  }

  private extractConstructorProperties(
    constructor: SyntaxNode,
    symbols: ExtractedSymbol[],
    className: string
  ): void {
    const paramList = this.getChildByType(constructor, 'class_parameter');
    if (!paramList) {
      // Check for multiple parameters
      for (const child of constructor.namedChildren) {
        if (!child || child.type !== 'class_parameter') continue;
        this.extractClassParameter(child, symbols, className);
      }
    } else {
      this.extractClassParameter(paramList, symbols, className);
    }
  }

  private extractClassParameter(
    param: SyntaxNode,
    symbols: ExtractedSymbol[],
    className: string
  ): void {
    // Only val/var parameters become properties
    const hasValVar = param.children.some(
      (c) => c && (this.getNodeText(c) === 'val' || this.getNodeText(c) === 'var')
    );
    if (!hasValVar) return;

    const nameNode = this.getChildByType(param, 'simple_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(param);
    const exported = !modifiers.includes('private');

    symbols.push(
      this.createSymbol(name, 'property', param, {
        exported,
        scope: className,
      })
    );
  }

  private handleSecondaryConstructor(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    className: string
  ): void {
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private');
    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol('constructor', 'method', node, {
        exported,
        scope: className,
        signature,
      })
    );
  }

  private extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'import_header') {
        this.handleImportHeader(node, imports);
        return false;
      }
      return true;
    });
  }

  private handleImportHeader(node: SyntaxNode, imports: ExtractedImport[]): void {
    const line = node.startPosition.row + 1;

    // Get the import identifier
    const identNode = this.getChildByType(node, 'identifier');
    if (!identNode) return;

    const importPath = this.getNodeText(identNode);
    const parts = importPath.split('.');
    let importName = parts[parts.length - 1] ?? importPath;

    // Check for wildcard import
    const isWildcard = node.children.some(
      (c) => c && this.getNodeText(c) === '*'
    );
    if (isWildcard) {
      importName = '*';
    }

    // Check for alias
    let alias: string | undefined;
    const importAlias = this.getChildByType(node, 'import_alias');
    if (importAlias) {
      const aliasIdent = this.getChildByType(importAlias, 'type_identifier') ||
        this.getChildByType(importAlias, 'simple_identifier');
      if (aliasIdent) {
        alias = this.getNodeText(aliasIdent);
      }
    }

    imports.push(
      this.createImport(importName, importPath, line, {
        localName: alias,
        isNamespace: isWildcard,
      })
    );
  }

  private getModifiers(node: SyntaxNode): string[] {
    const modifiers: string[] = [];
    const modifiersNode = this.getChildByType(node, 'modifiers');
    if (modifiersNode) {
      for (const child of modifiersNode.namedChildren) {
        if (!child) continue;
        // Handle visibility, class modifiers, etc.
        if (child.type === 'visibility_modifier' ||
            child.type === 'class_modifier' ||
            child.type === 'member_modifier' ||
            child.type === 'function_modifier' ||
            child.type === 'property_modifier' ||
            child.type === 'inheritance_modifier') {
          modifiers.push(this.getNodeText(child));
        }
      }
    }
    return modifiers;
  }

  private getParentTypeName(node: SyntaxNode): string | undefined {
    const parent = this.getAncestorOfType(node, 'class_declaration') ||
      this.getAncestorOfType(node, 'object_declaration') ||
      this.getAncestorOfType(node, 'interface_declaration');

    if (parent) {
      const nameNode = this.getChildByType(parent, 'type_identifier');
      if (nameNode) {
        return this.getNodeText(nameNode);
      }
    }
    return undefined;
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByType(node, 'function_value_parameters');
    const typeNode = this.getChildByType(node, 'type');

    let sig = paramsNode ? this.getNodeText(paramsNode) : '()';
    if (typeNode) {
      sig += ': ' + this.getNodeText(typeNode);
    }
    return sig;
  }
}
