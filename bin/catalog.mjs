#!/usr/bin/env node

const command = process.argv[2];
const validCommands = ['diff', 'add', 'update', 'sync'];

if (!command || !validCommands.includes(command)) {
  console.log('Usage: catalog <command>\n');
  console.log('Commands:');
  console.log('  diff    Show what would change (read-only)');
  console.log('  add     Create new Stripe products from catalog');
  console.log('  update  Update existing Stripe products from catalog');
  console.log('  sync    Run add + update');
  process.exit(command ? 1 : 0);
}

try {
  const { runCatalogSync } = await import('../src/lib/stripe/catalog-cli.js');
  await runCatalogSync(command);
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}
