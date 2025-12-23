import { getDb } from '../db/index.js';
import {
  matrixStore,
  matrixRecall,
  matrixReward,
  matrixFailure,
  matrixStatus,
  searchFailures,
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
      }, null, 2);
    }

    case 'matrix_store': {
      const result = await matrixStore({
        problem: args['problem'] as string,
        solution: args['solution'] as string,
        scope: args['scope'] as 'global' | 'stack' | 'repo',
        tags: args['tags'] as string[] | undefined,
        filesAffected: args['filesAffected'] as string[] | undefined,
      });
      return JSON.stringify(result, null, 2);
    }

    case 'matrix_reward': {
      const result = await matrixReward({
        solutionId: args['solutionId'] as string,
        outcome: args['outcome'] as 'success' | 'partial' | 'failure',
        notes: args['notes'] as string | undefined,
      });
      return JSON.stringify(result, null, 2);
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
      return JSON.stringify(result, null, 2);
    }

    case 'matrix_status': {
      const result = matrixStatus();
      return JSON.stringify(result, null, 2);
    }

    // Warning tools
    case 'matrix_warn_check': {
      const result = await matrixWarnCheck({
        type: args['type'] as WarningType,
        target: args['target'] as string,
        ecosystem: args['ecosystem'] as PackageEcosystem | undefined,
      });
      return JSON.stringify(result, null, 2);
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
      return JSON.stringify(result, null, 2);
    }

    case 'matrix_warn_remove': {
      const result = await matrixWarnRemove({
        id: args['id'] as string | undefined,
        type: args['type'] as WarningType | undefined,
        target: args['target'] as string | undefined,
        ecosystem: args['ecosystem'] as PackageEcosystem | undefined,
      });
      return JSON.stringify(result, null, 2);
    }

    case 'matrix_warn_list': {
      const result = await matrixWarnList({
        type: args['type'] as WarningType | undefined,
        repoOnly: args['repoOnly'] as boolean | undefined,
      });
      return JSON.stringify(result, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
