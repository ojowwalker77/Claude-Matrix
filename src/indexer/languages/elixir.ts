/**
 * Elixir Language Parser
 *
 * Extracts symbols and imports from Elixir files using tree-sitter.
 */

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { LanguageParser } from './base.js';
import type { ExtractedSymbol, ExtractedImport } from '../types.js';

export class ElixirParser extends LanguageParser {
  protected extractSymbols(rootNode: SyntaxNode, symbols: ExtractedSymbol[]): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'call') {
        return this.handleCall(node, symbols);
      }
      return true;
    });
  }

  private handleCall(node: SyntaxNode, symbols: ExtractedSymbol[]): boolean {
    const targetNode = this.getChildByField(node, 'target');
    if (!targetNode) return true;

    const target = this.getNodeText(targetNode);

    switch (target) {
      case 'defmodule':
        this.handleDefmodule(node, symbols);
        return false;

      case 'def':
      case 'defp':
        this.handleDef(node, symbols, target === 'defp');
        return false;

      case 'defmacro':
      case 'defmacrop':
        this.handleDefmacro(node, symbols, target === 'defmacrop');
        return false;

      case 'defstruct':
        this.handleDefstruct(node, symbols);
        return false;

      case 'defprotocol':
        this.handleDefprotocol(node, symbols);
        return false;

      case 'defimpl':
        this.handleDefimpl(node, symbols);
        return false;

      case '@moduledoc':
      case '@doc':
        return true;

      case '@':
        this.handleModuleAttribute(node, symbols);
        return false;
    }

    return true;
  }

  private handleDefmodule(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const args = this.getChildByField(node, 'arguments');
    if (!args) return;

    const firstArg = args.namedChildren[0];
    if (!firstArg) return;

    const name = this.getNodeText(firstArg);

    symbols.push(
      this.createSymbol(name, 'namespace', node, {
        exported: true,
      })
    );

    // Extract module body (do block)
    const doBlock = this.findDoBlock(node);
    if (doBlock) {
      this.extractModuleMembers(doBlock, symbols, name);
    }
  }

  private handleDef(node: SyntaxNode, symbols: ExtractedSymbol[], isPrivate: boolean): void {
    const args = this.getChildByField(node, 'arguments');
    if (!args) return;

    const firstArg = args.namedChildren[0];
    if (!firstArg) return;

    let name: string;
    let signature: string;

    if (firstArg.type === 'call') {
      // def foo(arg1, arg2)
      const fnNameNode = this.getChildByField(firstArg, 'target');
      if (!fnNameNode) return;
      name = this.getNodeText(fnNameNode);
      const fnArgs = this.getChildByField(firstArg, 'arguments');
      signature = fnArgs ? this.getNodeText(fnArgs) : '()';
    } else {
      // def foo (no args)
      name = this.getNodeText(firstArg);
      signature = '()';
    }

    const scope = this.getParentModuleName(node);

    symbols.push(
      this.createSymbol(name, scope ? 'method' : 'function', node, {
        exported: !isPrivate,
        scope,
        signature,
      })
    );
  }

  private handleDefmacro(node: SyntaxNode, symbols: ExtractedSymbol[], isPrivate: boolean): void {
    const args = this.getChildByField(node, 'arguments');
    if (!args) return;

    const firstArg = args.namedChildren[0];
    if (!firstArg) return;

    let name: string;
    let signature: string;

    if (firstArg.type === 'call') {
      const macroNameNode = this.getChildByField(firstArg, 'target');
      if (!macroNameNode) return;
      name = this.getNodeText(macroNameNode);
      const macroArgs = this.getChildByField(firstArg, 'arguments');
      signature = macroArgs ? this.getNodeText(macroArgs) : '()';
    } else {
      name = this.getNodeText(firstArg);
      signature = '()';
    }

    const scope = this.getParentModuleName(node);

    symbols.push(
      this.createSymbol(name, 'function', node, {
        exported: !isPrivate,
        scope,
        signature,
      })
    );
  }

  private handleDefstruct(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const scope = this.getParentModuleName(node);
    if (!scope) return;

    // Extract struct fields
    const args = this.getChildByField(node, 'arguments');
    if (!args) return;

    for (const child of args.namedChildren) {
      if (!child) continue;
      if (child.type === 'keywords') {
        for (const pair of child.namedChildren) {
          if (pair && pair.type === 'pair') {
            const key = this.getChildByField(pair, 'key');
            if (key) {
              const fieldName = this.getNodeText(key).replace(/:$/, '');
              symbols.push(
                this.createSymbol(fieldName, 'property', pair, {
                  exported: true,
                  scope,
                })
              );
            }
          }
        }
      } else if (child.type === 'atom') {
        const fieldName = this.getNodeText(child).replace(/^:/, '');
        symbols.push(
          this.createSymbol(fieldName, 'property', child, {
            exported: true,
            scope,
          })
        );
      }
    }
  }

  private handleDefprotocol(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const args = this.getChildByField(node, 'arguments');
    if (!args) return;

    const firstArg = args.namedChildren[0];
    if (!firstArg) return;

    const name = this.getNodeText(firstArg);

    symbols.push(
      this.createSymbol(name, 'interface', node, {
        exported: true,
      })
    );
  }

  private handleDefimpl(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    // defimpl creates an implementation, extract its functions
    const doBlock = this.findDoBlock(node);
    if (doBlock) {
      const args = this.getChildByField(node, 'arguments');
      const protocolName = args?.namedChildren[0] ? this.getNodeText(args.namedChildren[0]) : undefined;
      this.extractModuleMembers(doBlock, symbols, protocolName);
    }
  }

  private handleModuleAttribute(node: SyntaxNode, symbols: ExtractedSymbol[]): void {
    const args = this.getChildByField(node, 'arguments');
    if (!args) return;

    const attrNode = args.namedChildren[0];
    if (!attrNode) return;

    // Module attributes like @attr value
    if (attrNode.type === 'call') {
      const nameNode = this.getChildByField(attrNode, 'target');
      if (nameNode) {
        const name = '@' + this.getNodeText(nameNode);
        const scope = this.getParentModuleName(node);

        symbols.push(
          this.createSymbol(name, 'const', node, {
            exported: true,
            scope,
          })
        );
      }
    }
  }

  private extractModuleMembers(
    body: SyntaxNode,
    symbols: ExtractedSymbol[],
    _parentName?: string
  ): void {
    this.walkTree(body, (node) => {
      if (node.type === 'call') {
        return this.handleCall(node, symbols);
      }
      return true;
    });
  }

  protected extractImports(rootNode: SyntaxNode, imports: ExtractedImport[]): void {
    this.walkTree(rootNode, (node) => {
      if (node.type === 'call') {
        const targetNode = this.getChildByField(node, 'target');
        if (targetNode) {
          const target = this.getNodeText(targetNode);
          if (target === 'import' || target === 'alias' || target === 'require' || target === 'use') {
            this.handleImport(node, imports, target);
            return false;
          }
        }
      }
      return true;
    });
  }

  private handleImport(node: SyntaxNode, imports: ExtractedImport[], type: string): void {
    const line = node.startPosition.row + 1;
    const args = this.getChildByField(node, 'arguments');
    if (!args) return;

    const firstArg = args.namedChildren[0];
    if (!firstArg) return;

    const path = this.getNodeText(firstArg);
    const parts = path.split('.');
    const name = parts[parts.length - 1] ?? path;

    // Check for alias
    let alias: string | undefined;
    const keywords = args.namedChildren.find((c) => c && c.type === 'keywords');
    if (keywords) {
      for (const pair of keywords.namedChildren) {
        if (pair && pair.type === 'pair') {
          const key = this.getChildByField(pair, 'key');
          if (key && this.getNodeText(key) === 'as:') {
            const value = this.getChildByField(pair, 'value');
            if (value) {
              alias = this.getNodeText(value);
            }
          }
        }
      }
    }

    imports.push(
      this.createImport(alias || name, path, line, {
        localName: alias,
        isNamespace: type === 'import' || type === 'alias',
      })
    );
  }

  private getParentModuleName(node: SyntaxNode): string | undefined {
    let current = node.parent;
    while (current) {
      if (current.type === 'call') {
        const target = this.getChildByField(current, 'target');
        if (target && this.getNodeText(target) === 'defmodule') {
          const args = this.getChildByField(current, 'arguments');
          if (args && args.namedChildren[0]) {
            return this.getNodeText(args.namedChildren[0]);
          }
        }
      }
      current = current.parent;
    }
    return undefined;
  }

  private findDoBlock(node: SyntaxNode): SyntaxNode | null {
    for (const child of node.namedChildren) {
      if (!child) continue;
      if (child.type === 'do_block') {
        return child;
      }
      if (child.type === 'keywords') {
        for (const pair of child.namedChildren) {
          if (pair && pair.type === 'pair') {
            const key = this.getChildByField(pair, 'key');
            if (key && this.getNodeText(key) === 'do:') {
              return this.getChildByField(pair, 'value');
            }
          }
        }
      }
    }
    return null;
  }
}
