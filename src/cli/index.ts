import { init } from './init.js';
import { list } from './list.js';
import { search } from './search.js';
import { merge } from './merge.js';
import { edit } from './edit.js';
import { config } from './config.js';
import { stats } from './stats.js';
import { exportDb } from './export.js';
import { version } from './version.js';
import { upgrade } from './upgrade.js';
import { migrate } from './migrate.js';
import { verify } from './verify.js';
import { printHelp } from './help.js';
import { error } from './utils/output.js';
import { isRabbitTrigger, startRabbitHole } from './rabbit.js';
import { warn } from './warn.js';
import { hooks } from './hooks.js';
import { sandbox } from './sandbox.js';

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
      return list(subArgs);

    case 'search':
    case 'find':
    case 'recall':
      return search(subArgs);

    case 'merge':
    case 'dedupe':
      return merge(subArgs);

    case 'edit':
      return edit(subArgs);

    case 'config':
    case 'cfg':
      return config(subArgs);

    case 'stats':
    case 'status':
      return stats();

    case 'export':
    case 'backup':
      return exportDb(subArgs);

    case 'warn':
    case 'warning':
      return warn(subArgs);

    case 'hooks':
    case 'hook':
      return hooks(subArgs);

    case 'sandbox':
    case 'sb':
      return sandbox(subArgs);

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
