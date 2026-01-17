import { getDb } from '../db/index.js';
import {
  matrixStore,
  matrixRecall,
  matrixReward,
  matrixFailure,
  matrixStatus,
  matrixDoctor,
  searchFailures,
  matrixFindDefinition,
  matrixFindCallers,
  matrixListExports,
  matrixSearchSymbols,
  matrixGetImports,
  matrixIndexStatus,
  matrixReindex,
} from '../tools/index.js';
import { matrixWarn } from '../tools/warn.js';
import { matrixPrompt } from '../tools/prompt.js';
import { matrixSkillCandidates, matrixLinkSkill } from '../tools/skill-factory.js';
import { packRepository, formatResult } from '../repomix/index.js';
import { getJob, cancelJob, listJobs, createJob, spawnBackgroundJob } from '../jobs/index.js';
import { matrixDreamer } from '../dreamer/index.js';
import {
  validators,
  validate,
  ValidationError,
  type RecallInput,
  type StoreInput,
  type RewardInput,
  type FailureInput,
  type WarnInput,
  type PromptInput,
  type FindDefinitionInput,
  type FindCallersInput,
  type ListExportsInput,
  type SearchSymbolsInput,
  type GetImportsInput,
  type IndexStatusInput,
  type ReindexInput,
  type RepomixInput,
  type DoctorInput,
  type SkillCandidatesInput,
  type LinkSkillInput,
  type JobStatusInput,
  type JobCancelInput,
  type JobListInput,
  type DreamerInput,
} from '../tools/validation.js';

/**
 * Generate intelligent hints for recall results
 */
function buildRecallHints(
  solutions: Array<{
    similarity: number;
    successRate: number;
    supersededBy?: string;
    antiPatterns?: string[];
    prerequisites?: string[];
    complexity?: number;
    category?: string;
  }>,
  hasFailures: boolean
): string[] {
  const hints: string[] = [];

  if (solutions.length === 0) {
    hints.push('No matches. After solving: matrix_store with tags for future recall.');
    return hints;
  }

  const top = solutions[0];
  if (!top) return hints;

  // Quality warnings
  if (top.successRate < 0.5) {
    hints.push(`Top solution has ${Math.round(top.successRate * 100)}% success rate - verify before using.`);
  }

  if (top.supersededBy) {
    hints.push(`Solution superseded by ${top.supersededBy} - consider using newer version.`);
  }

  // Actionable guidance
  if (top.antiPatterns && top.antiPatterns.length > 0) {
    hints.push(`Avoid: ${top.antiPatterns.slice(0, 2).join(', ')}`);
  }

  if (top.prerequisites && top.prerequisites.length > 0) {
    hints.push(`Prerequisites: ${top.prerequisites.slice(0, 2).join(', ')}`);
  }

  if (top.complexity && top.complexity >= 7) {
    hints.push('High complexity solution - consider breaking into steps.');
  }

  // Workflow reminder
  if (top.similarity > 0.8) {
    hints.push('Strong match. Use matrix_reward(outcome:"success"|"partial"|"failure") after implementing.');
  } else {
    hints.push('Partial match. Adapt solution, then matrix_reward to improve future rankings.');
  }

  // Failure awareness
  if (hasFailures) {
    hints.push('Related errors found above - review to avoid repeating mistakes.');
  }

  return hints.slice(0, 3); // Max 3 hints
}

/**
 * Generate intelligent hints for store results
 */
function buildStoreHints(input: StoreInput): string[] {
  const hints: string[] = [];

  // Missing enrichment suggestions
  if (!input.antiPatterns || input.antiPatterns.length === 0) {
    hints.push('Tip: Add antiPatterns to warn against common mistakes.');
  }

  if (!input.prerequisites || input.prerequisites.length === 0) {
    hints.push('Tip: Add prerequisites to specify when this solution applies.');
  }

  if (!input.tags || input.tags.length === 0) {
    hints.push('Tip: Add tags for better discoverability in future recalls.');
  }

  if (!input.codeBlocks || input.codeBlocks.length === 0) {
    hints.push('Tip: Add codeBlocks with working examples for quick reference.');
  }

  if (hints.length === 0) {
    hints.push('Well-documented solution stored. It will rank higher in future recalls.');
  }

  return hints.slice(0, 2);
}

/**
 * Generate intelligent hints for failure results
 */
function buildFailureHints(input: FailureInput): string[] {
  const hints: string[] = [];

  if (!input.prevention) {
    hints.push('Tip: Add prevention field to help avoid this error in the future.');
  }

  if (!input.stackTrace) {
    hints.push('Tip: Include stackTrace for better error matching.');
  }

  hints.push('This error will be surfaced in future matrix_recall results for similar problems.');

  return hints.slice(0, 2);
}

export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  // Ensure DB is initialized
  getDb();

  try {
    switch (name) {
      case 'matrix_recall': {
        const input = validate<RecallInput>(validators.recall, args);
        const result = await matrixRecall(input);

        // Also search for related failures
        const relatedFailures = await searchFailures(input.query, 2);

        return JSON.stringify({
          ...result,
          relatedFailures: relatedFailures.length > 0 ? relatedFailures : undefined,
          _hints: buildRecallHints(result.solutions, relatedFailures.length > 0),
        });
      }

      case 'matrix_store': {
        const input = validate<StoreInput>(validators.store, args);
        const result = await matrixStore(input);
        return JSON.stringify({
          ...result,
          _hints: buildStoreHints(input),
        });
      }

      case 'matrix_reward': {
        const input = validate<RewardInput>(validators.reward, args);
        const result = await matrixReward(input);
        return JSON.stringify(result);
      }

      case 'matrix_failure': {
        const input = validate<FailureInput>(validators.failure, args);
        const result = await matrixFailure(input);
        return JSON.stringify({
          ...result,
          _hints: buildFailureHints(input),
        });
      }

      case 'matrix_status': {
        const result = matrixStatus();
        return JSON.stringify(result);
      }

      // v2.0 Unified Warning tool
      case 'matrix_warn': {
        const input = validate<WarnInput>(validators.warn, args);
        const result = await matrixWarn(input);
        return JSON.stringify(result);
      }

      // Prompt Agent
      case 'matrix_prompt': {
        const input = validate<PromptInput>(validators.prompt, args);
        const result = await matrixPrompt(input);
        return JSON.stringify(result);
      }

      // Code Index Tools
      case 'matrix_find_definition': {
        const input = validate<FindDefinitionInput>(validators.findDefinition, args);
        const result = matrixFindDefinition(input);
        return JSON.stringify(result);
      }

      case 'matrix_find_callers': {
        const input = validate<FindCallersInput>(validators.findCallers, args);
        const result = matrixFindCallers(input);
        return JSON.stringify(result);
      }

      case 'matrix_list_exports': {
        const input = validate<ListExportsInput>(validators.listExports, args);
        const result = matrixListExports(input);
        return JSON.stringify(result);
      }

      case 'matrix_search_symbols': {
        const input = validate<SearchSymbolsInput>(validators.searchSymbols, args);
        const result = matrixSearchSymbols(input);
        return JSON.stringify(result);
      }

      case 'matrix_get_imports': {
        const input = validate<GetImportsInput>(validators.getImports, args);
        const result = matrixGetImports(input);
        return JSON.stringify(result);
      }

      case 'matrix_index_status': {
        const input = validate<IndexStatusInput>(validators.indexStatus, args);
        const result = matrixIndexStatus(input);
        return JSON.stringify(result);
      }

      case 'matrix_reindex': {
        const input = validate<ReindexInput>(validators.reindex, args);

        // Async mode: return job ID immediately for polling
        if (input.async) {
          const jobId = createJob('matrix_reindex', input);
          spawnBackgroundJob('reindex', jobId, input);
          return JSON.stringify({
            jobId,
            status: 'queued',
            message: 'Reindex started in background. Use matrix_job_status to poll for progress.',
          });
        }

        // Sync mode: wait for completion (existing behavior)
        const result = await matrixReindex(input);
        return JSON.stringify(result);
      }

      // Repomix Integration
      case 'matrix_repomix': {
        const input = validate<RepomixInput>(validators.repomix, args);
        const result = await packRepository(input);
        return formatResult(result);
      }

      // Diagnostics
      case 'matrix_doctor': {
        const input = validate<DoctorInput>(validators.doctor, args);
        const result = await matrixDoctor(input);
        return JSON.stringify(result);
      }

      // Skill Factory (v2.0)
      case 'matrix_skill_candidates': {
        const input = validate<SkillCandidatesInput>(validators.skillCandidates, args);
        const result = matrixSkillCandidates(input);
        return JSON.stringify(result);
      }

      case 'matrix_link_skill': {
        const input = validate<LinkSkillInput>(validators.linkSkill, args);
        const result = matrixLinkSkill(input);
        return JSON.stringify(result);
      }

<<<<<<< HEAD
      // ═══════════════════════════════════════════════════════════════
      // Background Job Tools
      // ═══════════════════════════════════════════════════════════════

      case 'matrix_job_status': {
        const input = validate<JobStatusInput>(validators.jobStatus, args);
        const job = getJob(input.jobId);
        if (!job) {
          return JSON.stringify({ error: `Job not found: ${input.jobId}` });
        }
        return JSON.stringify({
          id: job.id,
          toolName: job.toolName,
          status: job.status,
          progress: job.progressPercent,
          message: job.progressMessage,
          result: job.result,
          error: job.error,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        });
      }

      case 'matrix_job_cancel': {
        const input = validate<JobCancelInput>(validators.jobCancel, args);
        const cancelled = cancelJob(input.jobId);
        return JSON.stringify({
          jobId: input.jobId,
          cancelled,
          message: cancelled
            ? 'Job cancelled successfully'
            : 'Job could not be cancelled (already completed or not found)',
        });
      }

      case 'matrix_job_list': {
        const input = validate<JobListInput>(validators.jobList, args);
        const jobs = listJobs(input.status, input.limit ?? 50);
        return JSON.stringify({
          jobs: jobs.map(job => ({
            id: job.id,
            toolName: job.toolName,
            status: job.status,
            progress: job.progressPercent,
            message: job.progressMessage,
            createdAt: job.createdAt,
          })),
          count: jobs.length,
        });
      }

      // Dreamer - Scheduled Task Automation
      case 'matrix_dreamer': {
        const input = validate<DreamerInput>(validators.dreamer, args);
        const result = await matrixDreamer(input);
        return JSON.stringify(result);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      // Return validation errors in a structured format
      return JSON.stringify({
        error: 'Validation failed',
        details: error.errors,
      });
    }
    throw error;
  }
}
