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
