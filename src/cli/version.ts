import { bold, dim } from './utils/output.js';

// Read version from package.json
async function getVersion(): Promise<string> {
  try {
    const pkgPath = new URL('../../package.json', import.meta.url).pathname;
    const pkg = await Bun.file(pkgPath).json();
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function version(): Promise<void> {
  const v = await getVersion();
  console.log(`${bold('Matrix Memory System')} ${dim(`v${v}`)}`);
  console.log(dim('Persistent memory for Claude Code'));
}
