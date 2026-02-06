/**
 * MCP Tool Definitions
 *
 * Uses TypeBox schemas from validation.ts as the single source of truth.
 * JSON Schema is automatically generated for MCP compatibility.
 * All tools are always visible (dynamic visibility was removed).
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  RecallInputSchema,
  StoreInputSchema,
  RewardInputSchema,
  GetSolutionInputSchema,
  SkillInputSchema,
  FailureInputSchema,
  StatusInputSchema,
  WarnInputSchema,
  PromptInputSchema,
  FindDefinitionInputSchema,
  FindCallersInputSchema,
  ListExportsInputSchema,
  SearchSymbolsInputSchema,
  GetImportsInputSchema,
  IndexStatusInputSchema,
  ReindexInputSchema,
  RepomixInputSchema,
  DoctorInputSchema,
  SkillCandidatesInputSchema,
  LinkSkillInputSchema,
  JobStatusInputSchema,
  JobCancelInputSchema,
  JobListInputSchema,
  DreamerInputSchema,
} from './validation.js';

// TypeBox schemas ARE JSON Schema - we just need to cast them for MCP's type system
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypeBoxSchema = { type: 'object'; properties: Record<string, any>; required?: string[] };

// Helper to convert TypeBox schema to MCP inputSchema format
function toInputSchema(schema: TypeBoxSchema): Tool['inputSchema'] {
  return schema as Tool['inputSchema'];
}

/**
 * Tool categories for organization and filtering
 */
export type ToolCategory =
  | 'core'        // Memory tools (recall, store, reward, failure, status)
  | 'warn'        // Warning system tools
  | 'index'       // Code index query tools
  | 'index-mgmt'  // Index management tools (status, reindex)
  | 'utility';    // Utilities (prompt, doctor, repomix)

/**
 * Visibility rules for dynamic tool display
 *
 * - 'always': Tool is always visible
 * - 'indexable': Visible if project has indexable source files
 * - 'index-ready': Visible only after index is built (not currently used)
 */
export type VisibilityRule = 'always' | 'indexable' | 'index-ready';

export const TOOLS: Tool[] = [
  // ═══════════════════════════════════════════════════════════════
  // Core Memory Tools - Always visible
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_recall',
    description: 'Search for relevant solutions from past experience. Use before implementing non-trivial solutions.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(RecallInputSchema),
    _meta: { delegable: true, category: 'core' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_store',
    description: 'Store a successful solution for future recall. Use after solving a reusable problem.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(StoreInputSchema),
    _meta: { category: 'core' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_reward',
    description: 'Provide feedback on a recalled solution. Improves future recommendations.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(RewardInputSchema),
    _meta: { delegable: true, category: 'core' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_get_solution',
    description: 'Get full solution details by ID. Use after compact recall returns matches.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(GetSolutionInputSchema),
    _meta: { delegable: true, category: 'core' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_failure',
    description: 'Record an error and its fix for future prevention.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(FailureInputSchema),
    _meta: { category: 'core' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_status',
    description: 'Get Matrix memory statistics.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(StatusInputSchema),
    _meta: { delegable: true, category: 'core' as ToolCategory, visibility: 'always' as VisibilityRule },
  },

  // ═══════════════════════════════════════════════════════════════
  // Warning Tool (v2.0 Consolidated) - Always visible
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_warn',
    description: 'Unified warning management. Actions: "check" (verify file/package warnings), "add" (create warning), "remove" (delete by ID or type+target), "list" (show all). Use to manage problematic files and packages.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(WarnInputSchema),
    _meta: { delegable: true, category: 'warn' as ToolCategory, visibility: 'always' as VisibilityRule },
  },

  // ═══════════════════════════════════════════════════════════════
  // Utility Tools - Always visible
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_prompt',
    description: 'Analyze and optimize a prompt. Detects ambiguity, infers context, returns optimized prompt or asks clarification questions.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(PromptInputSchema),
    _meta: { category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_repomix',
    description: 'Pack external repositories for context. Phase 1: suggest files. Phase 2 (with confirmedFiles): pack them.',
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: toInputSchema(RepomixInputSchema),
    _meta: { category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_doctor',
    description: 'Run diagnostics and auto-fix Matrix plugin issues. Checks database, config, hooks, and index health. If issues cannot be auto-fixed, provides GitHub issue template.',
    annotations: { readOnlyHint: false, idempotentHint: true },
    inputSchema: toInputSchema(DoctorInputSchema),
    _meta: { category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },

  // ═══════════════════════════════════════════════════════════════
  // Index Management Tools - Always visible (useful for debugging)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_index_status',
    description: 'Get code index status for a repository.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(IndexStatusInputSchema),
    _meta: { delegable: true, category: 'index-mgmt' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_reindex',
    description: 'Manually trigger repository reindexing.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(ReindexInputSchema),
    _meta: { delegable: true, category: 'index-mgmt' as ToolCategory, visibility: 'indexable' as VisibilityRule },
  },

  // ═══════════════════════════════════════════════════════════════
  // Code Index Query Tools - Always visible, use repoPath for other repos
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_find_definition',
    description: 'Find where a symbol is defined. Pass repoPath to query other repos.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(FindDefinitionInputSchema),
    _meta: { delegable: true, category: 'index' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_find_callers',
    description: 'Find all files that import and use a symbol. Useful for blast radius analysis.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(FindCallersInputSchema),
    _meta: { delegable: true, category: 'index' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_list_exports',
    description: 'List exported symbols from a file or directory.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(ListExportsInputSchema),
    _meta: { delegable: true, category: 'index' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_search_symbols',
    description: 'Search for symbols by partial name match.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(SearchSymbolsInputSchema),
    _meta: { delegable: true, category: 'index' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_get_imports',
    description: 'Get all imports in a file.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(GetImportsInputSchema),
    _meta: { delegable: true, category: 'index' as ToolCategory, visibility: 'always' as VisibilityRule },
  },

  // ═══════════════════════════════════════════════════════════════
  // Skill Factory Tools (v2.0) - Always visible
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_skill',
    description: 'Unified skill management. Actions: "candidates" (list promotable solutions), "link" (link solution to skill file).',
    inputSchema: toInputSchema(SkillInputSchema),
    _meta: { category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  // Legacy aliases (deprecated - use matrix_skill instead)
  {
    name: 'matrix_skill_candidates',
    description: 'List solutions good for promotion to Skills. Returns high success rate solutions.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(SkillCandidatesInputSchema),
    _meta: { delegable: true, category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_link_skill',
    description: 'Link a solution to a Skill file. Marks as promoted.',
    annotations: { idempotentHint: true },
    inputSchema: toInputSchema(LinkSkillInputSchema),
    _meta: { category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },

  // ═══════════════════════════════════════════════════════════════
  // Background Job Tools - Always visible
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_job_status',
    description: 'Get the status and progress of a background job. Use to poll for completion after starting an async operation.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(JobStatusInputSchema),
    _meta: { delegable: true, category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_job_cancel',
    description: 'Cancel a running or queued background job.',
    annotations: { destructiveHint: true },
    inputSchema: toInputSchema(JobCancelInputSchema),
    _meta: { category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
  {
    name: 'matrix_job_list',
    description: 'List background jobs. Filter by status to see queued, running, or completed jobs.',
    annotations: { readOnlyHint: true },
    inputSchema: toInputSchema(JobListInputSchema),
    _meta: { delegable: true, category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },

  // ═══════════════════════════════════════════════════════════════
  // Dreamer - Scheduled Task Automation (v2.1)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'matrix_dreamer',
    description: 'Schedule and manage automated Claude tasks. Actions: "add" (create task - RECURRING by default, confirm with user first!), "list" (show all tasks), "run" (execute immediately), "remove" (delete task), "status" (system health), "logs" (view output), "history" (execution records). IMPORTANT: Before using "add", ASK user if they want ONE-TIME or RECURRING - natural language like "at 1am" becomes daily cron by default. Uses native OS schedulers (launchd on macOS, crontab on Linux).',
    annotations: { idempotentHint: false },
    inputSchema: toInputSchema(DreamerInputSchema),
    _meta: { category: 'utility' as ToolCategory, visibility: 'always' as VisibilityRule },
  },
];
