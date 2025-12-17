import { matrixRecall } from '../tools/index.js';
import { bold, cyan, dim, green, yellow, gray, error, info, formatScore } from './utils/output.js';

interface SearchOptions {
  query: string;
  limit: number;
  minScore: number;
  scopeFilter: 'all' | 'repo' | 'stack' | 'global';
}

function parseArgs(args: string[]): SearchOptions {
  const queryParts: string[] = [];
  let limit = 5;
  let minScore = 0.3;
  let scopeFilter: 'all' | 'repo' | 'stack' | 'global' = 'all';

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10) || 5;
    } else if (arg.startsWith('--min-score=')) {
      minScore = parseFloat(arg.split('=')[1]) || 0.3;
    } else if (arg.startsWith('--scope=')) {
      const scope = arg.split('=')[1];
      if (['all', 'repo', 'stack', 'global'].includes(scope)) {
        scopeFilter = scope as typeof scopeFilter;
      }
    } else if (!arg.startsWith('--')) {
      queryParts.push(arg);
    }
  }

  return {
    query: queryParts.join(' '),
    limit,
    minScore,
    scopeFilter,
  };
}

export async function search(args: string[]): Promise<void> {
  const options = parseArgs(args);

  if (!options.query) {
    error('Usage: matrix search <query> [--limit=N] [--scope=all|repo|stack|global]');
    process.exit(1);
  }

  info('Searching...');
  console.log(dim('(Generating embeddings, this may take a moment on first run)\n'));

  try {
    const result = await matrixRecall({
      query: options.query,
      limit: options.limit,
      minScore: options.minScore,
      scopeFilter: options.scopeFilter,
    });

    if (result.solutions.length === 0) {
      console.log(yellow('No matching solutions found.'));
      console.log(dim(`\nTry a different query or lower the min-score with --min-score=0.2`));
      return;
    }

    console.log(`${bold('Found')} ${green(String(result.totalFound))} ${bold('matches')}`);
    console.log(dim(`Showing top ${result.solutions.length}\n`));

    for (const sol of result.solutions) {
      const matchPercent = (sol.similarity * 100).toFixed(1);
      const scoreColor = sol.score >= 0.7 ? green : sol.score >= 0.4 ? yellow : gray;

      // Header
      console.log(`${cyan('───')} ${bold(sol.id)} ${cyan('───')} ${green(`${matchPercent}% match`)}`);

      // Context boost indicator
      if (sol.contextBoost) {
        const boostLabel = sol.contextBoost === 'same_repo' ? 'same repo' : 'similar stack';
        console.log(dim(`  Boosted: ${boostLabel}`));
      }

      // Problem
      console.log(`\n${bold('Problem:')}`);
      console.log(`  ${sol.problem}`);

      // Solution (truncated for CLI display)
      console.log(`\n${bold('Solution:')}`);
      const solutionLines = sol.solution.split('\n').slice(0, 15);
      for (const line of solutionLines) {
        console.log(`  ${line.slice(0, 100)}`);
      }
      if (sol.solution.split('\n').length > 15) {
        console.log(dim('  ... (truncated)'));
      }

      // Metadata
      console.log(`\n${dim('Scope:')} ${sol.scope}  ${dim('Score:')} ${scoreColor(formatScore(sol.score))}  ${dim('Uses:')} ${sol.uses}  ${dim('Success rate:')} ${formatScore(sol.successRate)}`);

      if (sol.tags.length > 0) {
        console.log(`${dim('Tags:')} ${sol.tags.join(', ')}`);
      }

      console.log('\n');
    }

  } catch (err) {
    error(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
