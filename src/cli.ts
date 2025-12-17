#!/usr/bin/env bun

import { runCli } from './cli/index.js';

runCli(Bun.argv.slice(2)).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
