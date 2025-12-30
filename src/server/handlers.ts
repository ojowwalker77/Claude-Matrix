import { getDb } from '../db/index.js';
import {
  matrixStore,
  matrixRecall,
  matrixReward,
  matrixFailure,
  matrixStatus,
  searchFailures,
  matrixFindDefinition,
  matrixListExports,
  matrixSearchSymbols,
  matrixGetImports,
  matrixIndexStatus,
  matrixReindex,
} from '../tools/index.js';
import {
  matrixWarnCheck,
  matrixWarnAdd,
  matrixWarnRemove,
  matrixWarnList,
  type WarningType,
  type WarningSeverity,
  type PackageEcosystem,
} from '../tools/warn.js';
import { matrixPrompt, type PromptInput } from '../tools/prompt.js';
import type { SymbolKind } from '../indexer/types.js';
import { packRepository, formatResult } from '../repomix/index.js';

export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  // Ensure DB is initialized
  getDb();

  switch (name) {
    case 'matrix_recall': {
      const result = await matrixRecall({
        query: args['query'] as string,
        limit: args['limit'] as number | undefined,
        minScore: args['minScore'] as number | undefined,
        scopeFilter: args['scopeFilter'] as 'all' | 'repo' | 'stack' | 'global' | undefined,
      });

      // Also search for related failures
      const relatedFailures = await searchFailures(args['query'] as string, 2);

      return JSON.stringify({
        ...result,
        relatedFailures: relatedFailures.length > 0 ? relatedFailures : undefined,
      });
    }

    case 'matrix_store': {
      const result = await matrixStore({
        problem: args['problem'] as string,
        solution: args['solution'] as string,
        scope: args['scope'] as 'global' | 'stack' | 'repo',
        tags: args['tags'] as string[] | undefined,
        filesAffected: args['filesAffected'] as string[] | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_reward': {
      const result = await matrixReward({
        solutionId: args['solutionId'] as string,
        outcome: args['outcome'] as 'success' | 'partial' | 'failure',
        notes: args['notes'] as string | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_failure': {
      const result = await matrixFailure({
        errorType: args['errorType'] as 'runtime' | 'build' | 'test' | 'type' | 'other',
        errorMessage: args['errorMessage'] as string,
        stackTrace: args['stackTrace'] as string | undefined,
        rootCause: args['rootCause'] as string,
        fixApplied: args['fixApplied'] as string,
        prevention: args['prevention'] as string | undefined,
        filesInvolved: args['filesInvolved'] as string[] | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_status': {
      const result = matrixStatus();
      return JSON.stringify(result);
    }

    // Warning tools
    case 'matrix_warn_check': {
      const result = await matrixWarnCheck({
        type: args['type'] as WarningType,
        target: args['target'] as string,
        ecosystem: args['ecosystem'] as PackageEcosystem | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_warn_add': {
      const result = await matrixWarnAdd({
        type: args['type'] as WarningType,
        target: args['target'] as string,
        reason: args['reason'] as string,
        severity: args['severity'] as WarningSeverity | undefined,
        ecosystem: args['ecosystem'] as PackageEcosystem | undefined,
        repoSpecific: args['repoSpecific'] as boolean | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_warn_remove': {
      const result = await matrixWarnRemove({
        id: args['id'] as string | undefined,
        type: args['type'] as WarningType | undefined,
        target: args['target'] as string | undefined,
        ecosystem: args['ecosystem'] as PackageEcosystem | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_warn_list': {
      const result = await matrixWarnList({
        type: args['type'] as WarningType | undefined,
        repoOnly: args['repoOnly'] as boolean | undefined,
      });
      return JSON.stringify(result);
    }

    // Prompt Agent
    case 'matrix_prompt': {
      const result = await matrixPrompt({
        rawPrompt: args['rawPrompt'] as string,
        mode: args['mode'] as PromptInput['mode'],
        skipClarification: args['skipClarification'] as boolean | undefined,
      });
      return JSON.stringify(result);
    }

    // Code Index Tools
    case 'matrix_find_definition': {
      const result = matrixFindDefinition({
        symbol: args['symbol'] as string,
        kind: args['kind'] as SymbolKind | undefined,
        file: args['file'] as string | undefined,
        repoPath: args['repoPath'] as string | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_list_exports': {
      const result = matrixListExports({
        path: args['path'] as string | undefined,
        repoPath: args['repoPath'] as string | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_search_symbols': {
      const result = matrixSearchSymbols({
        query: args['query'] as string,
        limit: args['limit'] as number | undefined,
        repoPath: args['repoPath'] as string | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_get_imports': {
      const result = matrixGetImports({
        file: args['file'] as string,
        repoPath: args['repoPath'] as string | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_index_status': {
      const result = matrixIndexStatus({
        repoPath: args['repoPath'] as string | undefined,
      });
      return JSON.stringify(result);
    }

    case 'matrix_reindex': {
      const result = await matrixReindex({
        full: args['full'] as boolean | undefined,
        repoPath: args['repoPath'] as string | undefined,
      });
      return JSON.stringify(result);
    }

    // Repomix Integration
    case 'matrix_repomix': {
      const result = await packRepository({
        target: args['target'] as string,
        query: args['query'] as string,
        branch: args['branch'] as string | undefined,
        confirmedFiles: args['confirmedFiles'] as string[] | undefined,
        maxTokens: args['maxTokens'] as number | undefined,
        maxFiles: args['maxFiles'] as number | undefined,
        cacheTTLHours: args['cacheTTLHours'] as number | undefined,
      });
      return formatResult(result);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
