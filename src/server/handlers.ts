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
} from '../tools/warn.js';
import { matrixPrompt } from '../tools/prompt.js';
import { packRepository, formatResult } from '../repomix/index.js';
import {
  validators,
  validate,
  ValidationError,
  type RecallInput,
  type StoreInput,
  type RewardInput,
  type FailureInput,
  type WarnCheckInput,
  type WarnAddInput,
  type WarnRemoveInput,
  type WarnListInput,
  type PromptInput,
  type FindDefinitionInput,
  type ListExportsInput,
  type SearchSymbolsInput,
  type GetImportsInput,
  type IndexStatusInput,
  type ReindexInput,
  type RepomixInput,
} from '../tools/validation.js';

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
        });
      }

      case 'matrix_store': {
        const input = validate<StoreInput>(validators.store, args);
        const result = await matrixStore(input);
        return JSON.stringify(result);
      }

      case 'matrix_reward': {
        const input = validate<RewardInput>(validators.reward, args);
        const result = await matrixReward(input);
        return JSON.stringify(result);
      }

      case 'matrix_failure': {
        const input = validate<FailureInput>(validators.failure, args);
        const result = await matrixFailure(input);
        return JSON.stringify(result);
      }

      case 'matrix_status': {
        const result = matrixStatus();
        return JSON.stringify(result);
      }

      // Warning tools
      case 'matrix_warn_check': {
        const input = validate<WarnCheckInput>(validators.warnCheck, args);
        const result = await matrixWarnCheck(input);
        return JSON.stringify(result);
      }

      case 'matrix_warn_add': {
        const input = validate<WarnAddInput>(validators.warnAdd, args);
        const result = await matrixWarnAdd(input);
        return JSON.stringify(result);
      }

      case 'matrix_warn_remove': {
        const input = validate<WarnRemoveInput>(validators.warnRemove, args);
        const result = await matrixWarnRemove(input);
        return JSON.stringify(result);
      }

      case 'matrix_warn_list': {
        const input = validate<WarnListInput>(validators.warnList, args);
        const result = await matrixWarnList(input);
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
        const result = await matrixReindex(input);
        return JSON.stringify(result);
      }

      // Repomix Integration
      case 'matrix_repomix': {
        const input = validate<RepomixInput>(validators.repomix, args);
        const result = await packRepository(input);
        return formatResult(result);
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
