/**
 * Swift Language Parser
 *
 * Extracts symbols and imports from Swift files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ParseResult, ExtractedSymbol, ExtractedImport, SymbolKind } from '../types.js';

export class SwiftParser extends LanguageParser {
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

        case 'protocol_declaration':
          this.handleProtocolDeclaration(node, symbols);
          return false;

        case 'enum_declaration':
          this.handleEnumDeclaration(node, symbols);
          return false;

        case 'function_declaration':
          this.handleFunctionDeclaration(node, symbols);
          return false;

        case 'property_declaration':
          this.handlePropertyDeclaration(node, symbols);
          return false;

        case 'typealias_declaration':
          this.handleTypealiasDeclaration(node, symbols);
          return false;

        case 'extension_declaration':
          this.handleExtensionDeclaration(node, symbols);
          return true; // Continue to find extension members

        case 'actor_declaration':
          this.handleActorDeclaration(node, symbols);
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
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
      })
    );

    // Extract class body
    const body = this.getChildByType(node, 'class_body');
    if (body) {
      this.extractTypeMembers(body, symbols, name);
    }
  }

  private handleStructDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
      })
    );

    const body = this.getChildByType(node, 'struct_body');
    if (body) {
      this.extractTypeMembers(body, symbols, name);
    }
  }

  private handleProtocolDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported,
      })
    );

    const body = this.getChildByType(node, 'protocol_body');
    if (body) {
      this.extractTypeMembers(body, symbols, name);
    }
  }

  private handleEnumDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');

    symbols.push(
      this.createSymbol(name, 'enum', node, {
        exported,
      })
    );

    const body = this.getChildByType(node, 'enum_class_body');
    if (body) {
      this.extractEnumMembers(body, symbols, name);
    }
  }

  private handleFunctionDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'simple_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
    const signature = this.getFunctionSignature(node);
    const scope = this.getParentTypeName(node);

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
    // Get the pattern binding to find the name
    const binding = this.getChildByType(node, 'pattern');
    if (!binding) return;

    const nameNode = this.getChildByType(binding, 'simple_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
    const isLet = node.children.some((c) => c && this.getNodeText(c) === 'let');
    const isStatic = modifiers.includes('static') || modifiers.includes('class');
    const scope = this.getParentTypeName(node);

    // Top-level let are 'const', var are 'variable', members are 'property'
    let kind: SymbolKind = 'property';
    if (!scope) {
      kind = isLet ? 'const' : 'variable';
    }

    symbols.push(
      this.createSymbol(name, kind, node, {
        exported,
        scope,
      })
    );
  }

  private handleTypealiasDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');

    symbols.push(
      this.createSymbol(name, 'type', node, {
        exported,
      })
    );
  }

  private handleExtensionDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // Extensions don't create new symbols, but their members do
    // Get the type being extended for scoping
    const typeNode = this.getChildByType(node, 'type_identifier');
    if (!typeNode) return;

    const typeName = this.getNodeText(typeNode);

    const body = this.getChildByType(node, 'extension_body');
    if (body) {
      this.extractTypeMembers(body, symbols, typeName);
    }
  }

  private handleActorDeclaration(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const nameNode = this.getChildByType(node, 'type_identifier');
    if (!nameNode) return;

    const name = this.getNodeText(nameNode);
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');

    symbols.push(
      this.createSymbol(name, 'class', node, {
        exported,
      })
    );

    const body = this.getChildByType(node, 'actor_body');
    if (body) {
      this.extractTypeMembers(body, symbols, name);
    }
  }

  private extractTypeMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    parentName: string
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
        case 'struct_declaration':
          this.handleStructDeclaration(child, symbols);
          break;
        case 'enum_declaration':
          this.handleEnumDeclaration(child, symbols);
          break;
        case 'protocol_declaration':
          this.handleProtocolDeclaration(child, symbols);
          break;
        case 'init_declaration':
          this.handleInitDeclaration(child, symbols, parentName);
          break;
        case 'deinit_declaration':
          this.handleDeinitDeclaration(child, symbols, parentName);
          break;
        case 'subscript_declaration':
          this.handleSubscriptDeclaration(child, symbols, parentName);
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
      if (child.type === 'enum_entry') {
        const nameNode = this.getChildByType(child, 'simple_identifier');
        if (nameNode) {
          const name = this.getNodeText(nameNode);
          symbols.push(
            this.createSymbol(name, 'const', child, {
              exported: true,
              scope: enumName,
            })
          );
        }
      } else if (child.type === 'function_declaration') {
        this.handleFunctionDeclaration(child, symbols);
      } else if (child.type === 'property_declaration') {
        this.handlePropertyDeclaration(child, symbols);
      }
    }
  }

  private handleInitDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    className: string
  ): void {
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
    const signature = this.getFunctionSignature(node);

    symbols.push(
      this.createSymbol('init', 'method', node, {
        exported,
        scope: className,
        signature,
      })
    );
  }

  private handleDeinitDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    className: string
  ): void {
    symbols.push(
      this.createSymbol('deinit', 'method', node, {
        exported: true,
        scope: className,
      })
    );
  }

  private handleSubscriptDeclaration(
    node: SyntaxNode,
    symbols: ExtractedSymbol[],
    className: string
  ): void {
    const modifiers = this.getModifiers(node);
    const exported = !modifiers.includes('private') && !modifiers.includes('fileprivate');
    const signature = this.getSubscriptSignature(node);

    symbols.push(
      this.createSymbol('subscript', 'method', node, {
        exported,
        scope: className,
        signature,
      })
    );
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

    // Get the identifier being imported
    const identNode = this.getChildByType(node, 'identifier');
    if (!identNode) return;

    const importPath = this.getNodeText(identNode);
    const parts = importPath.split('.');
    const importName = parts[parts.length - 1] ?? importPath;

    // Check for specific import kind (class, struct, func, etc.)
    let isType = false;
    for (const child of node.children) {
      if (child && ['class', 'struct', 'enum', 'protocol', 'typealias'].includes(this.getNodeText(child))) {
        isType = true;
        break;
      }
    }

    imports.push(
      this.createImport(importName, importPath, line, {
        isNamespace: !isType,
        isType,
      })
    );
  }

  private getModifiers(node: SyntaxNode): string[] {
    const modifiers: string[] = [];
    const modifiersNode = this.getChildByType(node, 'modifiers');
    if (modifiersNode) {
      for (const child of modifiersNode.namedChildren) {
        if (!child) continue;
        if (child.type === 'visibility_modifier' ||
            child.type === 'member_modifier' ||
            child.type === 'function_modifier' ||
            child.type === 'mutation_modifier' ||
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
      this.getAncestorOfType(node, 'struct_declaration') ||
      this.getAncestorOfType(node, 'protocol_declaration') ||
      this.getAncestorOfType(node, 'enum_declaration') ||
      this.getAncestorOfType(node, 'actor_declaration');

    if (parent) {
      const nameNode = this.getChildByType(parent, 'type_identifier');
      if (nameNode) {
        return this.getNodeText(nameNode);
      }
    }

    // Check for extension
    const extension = this.getAncestorOfType(node, 'extension_declaration');
    if (extension) {
      const typeNode = this.getChildByType(extension, 'type_identifier');
      if (typeNode) {
        return this.getNodeText(typeNode);
      }
    }

    return undefined;
  }

  private getFunctionSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByType(node, 'function_value_parameter');
    const returnNode = this.getChildByType(node, 'type_annotation');

    let sig = '(';
    if (paramsNode) {
      // Collect all parameters
      const params: string[] = [];
      for (const child of node.namedChildren) {
        if (child && child.type === 'function_value_parameter') {
          params.push(this.getNodeText(child));
        }
      }
      sig += params.join(', ');
    }
    sig += ')';

    if (returnNode) {
      sig += ' -> ' + this.getNodeText(returnNode).replace(/^:\s*/, '');
    }
    return sig;
  }

  private getSubscriptSignature(node: SyntaxNode): string {
    const paramsNode = this.getChildByType(node, 'subscript_parameter');
    const returnNode = this.getChildByType(node, 'type_annotation');

    let sig = '[';
    if (paramsNode) {
      sig += this.getNodeText(paramsNode);
    }
    sig += ']';

    if (returnNode) {
      sig += ' -> ' + this.getNodeText(returnNode).replace(/^:\s*/, '');
    }
    return sig;
  }
}
