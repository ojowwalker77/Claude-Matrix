// Core imports - no embedding dependencies
import { init } from './init.js';
import { config } from './config.js';
import { version } from './version.js';
import { upgrade } from './upgrade.js';
import { migrate } from './migrate.js';
import { verify } from './verify.js';
import { printHelp } from './help.js';
import { error } from './utils/output.js';
import { isRabbitTrigger, startRabbitHole } from './rabbit.js';
import { hooks } from './hooks.js';

// Lazy imports for commands that need embeddings (prevents loading @xenova/transformers at startup)
const lazyList = () => import('./list.js').then(m => m.list);
const lazySearch = () => import('./search.js').then(m => m.search);
const lazyMerge = () => import('./merge.js').then(m => m.merge);
const lazyEdit = () => import('./edit.js').then(m => m.edit);
const lazyStats = () => import('./stats.js').then(m => m.stats);
const lazyExport = () => import('./export.js').then(m => m.exportDb);
const lazyWarn = () => import('./warn.js').then(m => m.warn);

export async function runCli(args: string[]): Promise<void> {
  // Easter egg: check for "follow the white rabbit" trigger
  const fullInput = args.join(' ');
  if (isRabbitTrigger(fullInput)) {
    return startRabbitHole();
  }

  const command = args[0];
  const subArgs = args.slice(1);

  switch (command) {
    case 'init':
      return init(subArgs);

    case 'list':
    case 'ls':
      return (await lazyList())(subArgs);

    case 'search':
    case 'find':
    case 'recall':
      return (await lazySearch())(subArgs);

    case 'merge':
    case 'dedupe':
      return (await lazyMerge())(subArgs);

    case 'edit':
      return (await lazyEdit())(subArgs);

    case 'config':
    case 'cfg':
      return config(subArgs);

    case 'stats':
    case 'status':
      return (await lazyStats())();

    case 'export':
    case 'backup':
      return (await lazyExport())(subArgs);

    case 'warn':
    case 'warning':
      return (await lazyWarn())(subArgs);

    case 'hooks':
    case 'hook':
      return hooks(subArgs);

    case 'version':
    case '--version':
    case '-v':
      return version();

    case 'upgrade':
    case 'update':
      return upgrade(subArgs);

    case 'migrate':
    case 'migration':
      return migrate(subArgs);

    case 'verify':
    case 'check':
    case 'doctor':
      return verify(subArgs);

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
