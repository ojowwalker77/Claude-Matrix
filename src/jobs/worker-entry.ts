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

  const [workerName, jobId, inputJson] = args;
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

    process.exit(0);
  } catch (err) {
    console.error(`Worker error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
