import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load .env from cwd (Astro does this automatically, but the CLI runs in plain Node)
try {
  const envFile = readFileSync(join(process.cwd(), '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // No .env file, rely on environment variables
}

const command = process.argv[2];
const validCommands = ['diff', 'add', 'update', 'sync'] as const;
type Command = (typeof validCommands)[number];

function isValidCommand(cmd: string | undefined): cmd is Command {
  return typeof cmd === 'string' && (validCommands as readonly string[]).includes(cmd);
}

if (!isValidCommand(command)) {
  console.log('Usage: catalog <command>\n');
  console.log('Commands:');
  console.log('  diff    Show what would change (read-only)');
  console.log('  add     Create new Stripe products from catalog');
  console.log('  update  Update existing Stripe products from catalog');
  console.log('  sync    Run add + update');
  process.exit(command === undefined ? 0 : 1);
}

try {
  const { runCatalogSync } = await import('../src/lib/stripe/catalog-cli.js');
  await runCatalogSync(command);
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
