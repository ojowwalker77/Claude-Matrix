import { init } from './init.js';
import { list } from './list.js';
import { search } from './search.js';
import { stats } from './stats.js';
import { exportDb } from './export.js';
import { version } from './version.js';
import { printHelp } from './help.js';
import { error } from './utils/output.js';

export async function runCli(args: string[]): Promise<void> {
  const command = args[0];
  const subArgs = args.slice(1);

  switch (command) {
    case 'init':
      return init(subArgs);

    case 'list':
    case 'ls':
      return list(subArgs);

    case 'search':
    case 'find':
    case 'recall':
      return search(subArgs);

    case 'stats':
    case 'status':
      return stats();

    case 'export':
    case 'backup':
      return exportDb(subArgs);

    case 'version':
    case '--version':
    case '-v':
      return version();

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      return printHelp();

    default:
      error(`Unknown command: ${command}`);
      console.log('');
      printHelp();
      process.exit(1);
  }
}
