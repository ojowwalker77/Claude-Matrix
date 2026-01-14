/**
 * Background Jobs Module
 *
 * Exports job management functions for long-running operations.
 */

export {
  createJob,
  getJob,
  updateJob,
  cancelJob,
  listJobs,
  cleanupOldJobs,
  type Job,
  type JobStatus,
  type JobUpdate,
} from './manager.js';

export { runReindexJob, spawnBackgroundJob } from './workers.js';
