/**
 * MCP Tool Definitions
 *
 * Uses TypeBox schemas from validation.ts as the single source of truth.
 * JSON Schema is automatically generated for MCP compatibility.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  RecallInputSchema,
  StoreInputSchema,
  RewardInputSchema,
  FailureInputSchema,
  StatusInputSchema,
  WarnCheckInputSchema,
  WarnAddInputSchema,
  WarnRemoveInputSchema,
  WarnListInputSchema,
  PromptInputSchema,
  FindDefinitionInputSchema,
  ListExportsInputSchema,
  SearchSymbolsInputSchema,
  GetImportsInputSchema,
  IndexStatusInputSchema,
  ReindexInputSchema,
  RepomixInputSchema,
  DoctorInputSchema,
} from './validation.js';

// TypeBox schemas ARE JSON Schema - we just need to cast them for MCP's type system
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypeBoxSchema = { type: 'object'; properties: Record<string, any>; required?: string[] };

// Helper to convert TypeBox schema to MCP inputSchema format
function toInputSchema(schema: TypeBoxSchema): Tool['inputSchema'] {
  return schema as Tool['inputSchema'];
}

export const TOOLS: Tool[] = [
  {
    name: 'matrix_recall',
    description: 'Search for relevant solutions from past experience. Use before implementing non-trivial solutions.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(RecallInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_store',
    description: 'Store a successful solution for future recall. Use after solving a reusable problem.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(StoreInputSchema),
  },
  {
    name: 'matrix_reward',
    description: 'Provide feedback on a recalled solution. Improves future recommendations.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(RewardInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_failure',
    description: 'Record an error and its fix for future prevention.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(FailureInputSchema),
  },
  {
    name: 'matrix_status',
    description: 'Get Matrix memory statistics.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(StatusInputSchema),
    _meta: { delegable: true },
  },
  // Warning tools for Hooks integration
  {
    name: 'matrix_warn_check',
    description: 'Check if a file or package has warnings (personal grudges). Use before editing cursed files or installing problematic packages.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(WarnCheckInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_warn_add',
    description: 'Add a warning for a file or package. Use to mark problematic dependencies or cursed files.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(WarnAddInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_warn_remove',
    description: 'Remove a warning by ID or by type+target.',
    annotations: { destructiveHint: true, idempotentHint: true },
    inputSchema: toInputSchema(WarnRemoveInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_warn_list',
    description: 'List all warnings.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(WarnListInputSchema),
    _meta: { delegable: true },
  },
  // Prompt Agent
  {
    name: 'matrix_prompt',
    description: 'Analyze and optimize a prompt before execution. Detects ambiguity, infers context, and either returns an optimized prompt or asks clarification questions. Use for complex or ambiguous user requests.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(PromptInputSchema),
  },
  // Code Index Tools
  {
    name: 'matrix_find_definition',
    description: 'Find where a symbol (function, class, type, variable) is defined in the codebase.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(FindDefinitionInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_list_exports',
    description: 'List exported symbols from a file or directory.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(ListExportsInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_search_symbols',
    description: 'Search for symbols by partial name match. Use when you know part of a symbol name.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(SearchSymbolsInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_get_imports',
    description: 'Get all imports in a file.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(GetImportsInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_index_status',
    description: 'Get code index status for a repository.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(IndexStatusInputSchema),
    _meta: { delegable: true },
  },
  {
    name: 'matrix_reindex',
    description: 'Manually trigger repository reindexing. Use to refresh the code index after changes.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(ReindexInputSchema),
    _meta: { delegable: true },
  },
  // Repomix Integration
  {
    name: 'matrix_repomix',
    description: 'Pack external repositories for context. Two-phase flow: Phase 1 (no files) returns suggested files based on query. Phase 2 (with confirmedFiles) packs those files. Minimizes token consumption by letting you confirm before packing.',
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: toInputSchema(RepomixInputSchema),
  },
  // Diagnostics
  {
    name: 'matrix_doctor',
    description: 'Run diagnostics and auto-fix Matrix plugin issues. Checks database, config, hooks, and index health. If issues cannot be auto-fixed, provides GitHub issue template.',
    annotations: { readOnlyHint: false, idempotentHint: true },
    inputSchema: toInputSchema(DoctorInputSchema),
  },
];
