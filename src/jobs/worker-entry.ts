#!/usr/bin/env bun
/**
 * Background Worker Entry Point
 *
 * Spawned as a subprocess to execute long-running jobs.
 *
 * Usage: bun run worker-entry.ts <workerName> <jobId> <inputJson>
 */

import { runReindexJob, type ReindexInput } from './workers.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: worker-entry.ts <workerName> <jobId> [inputJson]');
    process.exit(1);
  }

  const workerName = args[0]!;
  const jobId = args[1]!;
  const inputJson = args[2];
  const input = inputJson ? JSON.parse(inputJson) : {};

  try {
    switch (workerName) {
      case 'reindex':
        await runReindexJob(jobId, input as ReindexInput);
        break;

      default:
        console.error(`Unknown worker: ${workerName}`);
        process.exit(1);
    }

  } catch (err) {
    console.error(`Worker error: ${err instanceof Error ? err.message : err}`);
    // Update job status to failed if it hasn't been updated yet
    const { getJob, updateJob } = await import('./manager.js');
    const job = getJob(jobId);
    if (job && (job.status === 'queued' || job.status === 'running')) {
      updateJob(jobId, {
        status: 'failed',
        error: `Worker script error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    process.exit(1);
}

main();
