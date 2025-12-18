import { matrixStatus } from '../tools/index.js';
import { bold, cyan, dim, green, yellow, formatDate, formatScore, truncate } from './utils/output.js';

export function stats(): void {
  const result = matrixStatus();

  console.log(`\n${bold('Matrix Memory Statistics')}\n`);

  // Status
  console.log(`${cyan('Status:')} ${result.status === 'operational' ? green('operational') : yellow(result.status)}`);
  console.log(`${cyan('Database:')} ${result.database === 'connected' ? green('connected') : yellow(result.database)}`);

  // Current repo
  console.log(`\n${bold('Current Repository')}`);
  console.log(`  ${cyan('Name:')} ${result.currentRepo.name || dim('(not detected)')}`);
  if (result.currentRepo.languages.length > 0) {
    console.log(`  ${cyan('Languages:')} ${result.currentRepo.languages.join(', ')}`);
  }
  if (result.currentRepo.frameworks.length > 0) {
    console.log(`  ${cyan('Frameworks:')} ${result.currentRepo.frameworks.join(', ')}`);
  }
  if (result.currentRepo.patterns.length > 0) {
    console.log(`  ${cyan('Patterns:')} ${result.currentRepo.patterns.join(', ')}`);
  }

  // Counts
  console.log(`\n${bold('Memory Counts')}`);
  console.log(`  ${cyan('Solutions:')} ${result.stats.solutions}`);
  console.log(`  ${cyan('Failures:')}  ${result.stats.failures}`);
  console.log(`  ${cyan('Repos:')}     ${result.stats.repos}`);

  // Top tags
  if (result.topTags.length > 0) {
    console.log(`\n${bold('Top Tags')}`);
    console.log(`  ${result.topTags.join(', ')}`);
  }

  // Recent solutions
  if (result.recentSolutions.length > 0) {
    console.log(`\n${bold('Recent Solutions')}`);
    for (const sol of result.recentSolutions) {
      const date = formatDate(sol.created_at);
      const score = formatScore(sol.score);
      console.log(`  ${dim(sol.id)} ${truncate(sol.problem, 50)}`);
      console.log(`    ${dim(`${sol.scope} | ${score} | ${date}`)}`);
    }
  }

  console.log('');
}
