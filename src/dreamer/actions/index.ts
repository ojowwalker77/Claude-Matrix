/**
 * Dreamer Action Handlers
 *
 * Exports all action handlers for the unified matrix_dreamer tool.
 */

export { handleAdd, type AddResult } from './add.js';
export { handleList, type ListResult, type TaskSummary } from './list.js';
export { handleRun, type RunResult } from './run.js';
export { handleRemove, type RemoveResult } from './remove.js';
export { handleStatus, type StatusResult } from './status.js';
export { handleLogs, type LogsResult } from './logs.js';
export { handleHistory, type HistoryResult, type HistoryEntry } from './history.js';
