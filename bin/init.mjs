#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  parseCheckoutStyle,
  deriveAnswersFromExistingConfig,
  buildConfigFile,
  buildCartPage,
  buildEnvFile,
  buildIndexPage,
  buildSlugPage,
  buildCategorySlugPage,
  buildPackageJson,
  buildStatusPage,
} from './scaffold.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

const skipped = [];
async function safeWrite(path, content) {
  try {
    await access(path);
    skipped.push(path);
  } catch {
    await writeFile(path, content);
  }
}

const dir = process.cwd();
const configPath = join(dir, 'cornerstore.config.js');

let existingConfig = null;
try {
  await access(configPath);
  const mod = await import(pathToFileURL(configPath).href);
  existingConfig = mod.default;
} catch {
  // No existing config — fresh init
}

let storeName, wantAbout, wantShipping, wantReturns, wantFaq, wantTable, minCartSize, contactEmail, nav, footerNav, checkoutStyle, checkoutUrl;

if (existingConfig) {
  // Re-init: derive everything from existing config, skip prompts
  console.log('\n  Corner Store — updating existing project\n');

  storeName = existingConfig.name ?? 'Corner Store';

  nav = Array.isArray(existingConfig.nav) ? existingConfig.nav : [];
  footerNav = Array.isArray(existingConfig.footerNav) ? existingConfig.footerNav : [];

  wantAbout = nav.some(i => i.page === 'about');
  wantShipping = footerNav.some(i => i.page === 'shipping-policy');
  wantReturns = footerNav.some(i => i.page === 'returns-policy');
  wantFaq = footerNav.some(i => i.page === 'faq');

  const views = existingConfig.listings?.views ?? ['card'];
  wantTable = views.includes('table');
  minCartSize = existingConfig.minCartSize ?? null;
  contactEmail = existingConfig.contact ?? '';

  const derived = deriveAnswersFromExistingConfig(existingConfig);
  checkoutStyle = derived.checkoutStyle;
  checkoutUrl = derived.checkoutUrl;
} else {
  // Fresh init: interactive prompts
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('\n  Corner Store\n');

  storeName = (await rl.question('  Store name (Corner Store): ')).trim() || 'Corner Store';

  checkoutStyle = null;
  while (checkoutStyle === null) {
    const raw = await rl.question('  Checkout style — pdf or stripe? [pdf]: ');
    checkoutStyle = parseCheckoutStyle(raw);
    if (checkoutStyle === null) {
      console.log(`  Please enter 'pdf' or 'stripe'.`);
    }
  }

  checkoutUrl = '';
  if (checkoutStyle === 'stripe') {
    checkoutUrl = (await rl.question('  Checkout URL (blank to fill in later): ')).trim();
  }

  console.log('\n  Choose which pages to include:\n');
  wantAbout = (await rl.question('  About page? (Y/n): ')).trim().toLowerCase() !== 'n';
  wantShipping = (await rl.question('  Shipping Policy? (Y/n): ')).trim().toLowerCase() !== 'n';
  wantReturns = (await rl.question('  Returns Policy? (Y/n): ')).trim().toLowerCase() !== 'n';
  wantFaq = (await rl.question('  FAQ? (Y/n): ')).trim().toLowerCase() !== 'n';
  wantTable = (await rl.question('  Table view (wholesale)? (Y/n): ')).trim().toLowerCase() !== 'n';

  minCartSize = null;
  if (wantTable) {
    const minCartStr = (await rl.question('  Minimum order amount in dollars (press Enter to skip): ')).trim();
    if (minCartStr && !isNaN(Number(minCartStr)) && Number(minCartStr) > 0) {
      minCartSize = Number(minCartStr);
    }
  }

  console.log('');
  contactEmail = (await rl.question('  Contact email (press Enter to skip): ')).trim();

  rl.close();

  // Build nav/footerNav from answers
  nav = [{ label: 'Shop', page: 'home' }];
  footerNav = [];

  if (wantAbout) nav.push({ label: 'About', page: 'about' });
  if (wantShipping) footerNav.push({ label: 'Shipping Policy', page: 'shipping-policy' });
  if (wantReturns) footerNav.push({ label: 'Returns Policy', page: 'returns-policy' });
  if (wantFaq) footerNav.push({ label: 'FAQ', page: 'faq' });
  footerNav.push({ label: 'Privacy Policy', page: 'privacy-policy' });
  footerNav.push({ label: 'Terms of Service', page: 'terms-of-service' });
}

const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'corner-store';

console.log('\n  Scaffolding your store...\n');

// Directory structure
await mkdir(join(dir, 'src', 'pages'), { recursive: true });
await mkdir(join(dir, 'pages'), { recursive: true });
await mkdir(join(dir, 'pages', 'category'), { recursive: true });
await mkdir(join(dir, 'src', 'pages', 'category'), { recursive: true });
await mkdir(join(dir, 'theme'), { recursive: true });
await mkdir(join(dir, 'products'), { recursive: true });
await mkdir(join(dir, 'products', 'images'), { recursive: true });

// catalog.csv — the product catalog, source of truth for all product data
await safeWrite(join(dir, 'products', 'catalog.csv'), `SKU,Name,Price,Description,Category,Status,Featured,Hidden,MOQ,Payment Link
SAMPLE-001,Sample Product,19.99,A sample product to get you started,,,,,,
`);

// products/SAMPLE-001.md — example rich description override
await safeWrite(join(dir, 'products', 'SAMPLE-001.md'), `---
sku: SAMPLE-001
---

This is a **rich description** for your sample product. Edit this file or delete it and use the Description column in catalog.csv instead.

Markdown here overrides the CSV description on your storefront, while the CSV description is still used for Stripe.
`);

// package.json
await safeWrite(join(dir, 'package.json'), buildPackageJson(slug));

// astro.config.mjs
await safeWrite(join(dir, 'astro.config.mjs'), `import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  output: 'static',
  integrations: [mdx()],
  vite: {
    plugins: [{
      name: 'corner-store-theme-watcher',
      configureServer(server) {
        server.watcher.add('./theme');
        server.watcher.on('change', (path) => {
          if (path.includes('theme')) {
            server.ws.send({ type: 'full-reload' });
          }
        });
      },
    }],
  },
});
`);

// tsconfig.json
await safeWrite(join(dir, 'tsconfig.json'), JSON.stringify({
  extends: 'astro/tsconfigs/strict',
}, null, 2) + '\n');

// src/env.d.ts
await safeWrite(join(dir, 'src', 'env.d.ts'), `/// <reference types="astro/client" />
`);

// .env — storefront is static; secrets live on the consumer's separate server.
await safeWrite(join(dir, '.env'), buildEnvFile());

// .gitignore
await safeWrite(join(dir, '.gitignore'), `node_modules/
dist/
.env
`);

// cornerstore.config.js
await safeWrite(
  join(dir, 'cornerstore.config.js'),
  buildConfigFile({
    storeName,
    nav,
    footerNav,
    contactEmail,
    wantTable,
    minCartSize,
    checkoutStyle,
    checkoutUrl,
  }),
);

// theme/theme.css — read from the package's source copy
const themeTemplate = await readFile(join(packageRoot, 'theme', 'theme.css'), 'utf-8');
await safeWrite(join(dir, 'theme', 'theme.css'), themeTemplate);

// Page stubs
const stubsDir = join(packageRoot, 'bin', 'stubs');

// Home — always scaffolded
const homeStub = await readFile(join(stubsDir, 'home.mdx'), 'utf-8');
await safeWrite(join(dir, 'pages', 'home.mdx'), homeStub);

if (wantAbout) {
  const stub = await readFile(join(stubsDir, 'about.mdx'), 'utf-8');
  await safeWrite(join(dir, 'pages', 'about.mdx'), stub);
}

if (wantShipping) {
  const stub = await readFile(join(stubsDir, 'shipping-policy.mdx'), 'utf-8');
  await safeWrite(join(dir, 'pages', 'shipping-policy.mdx'), stub);
}

if (wantReturns) {
  const stub = await readFile(join(stubsDir, 'returns-policy.mdx'), 'utf-8');
  await safeWrite(join(dir, 'pages', 'returns-policy.mdx'), stub);
}

if (wantFaq) {
  const stub = await readFile(join(stubsDir, 'faq.mdx'), 'utf-8');
  await safeWrite(join(dir, 'pages', 'faq.mdx'), stub);
}

// Privacy Policy and Terms of Service — always scaffolded
const privacyStub = await readFile(join(stubsDir, 'privacy-policy.mdx'), 'utf-8');
await safeWrite(join(dir, 'pages', 'privacy-policy.mdx'), privacyStub);

const tosStub = await readFile(join(stubsDir, 'terms-of-service.mdx'), 'utf-8');
await safeWrite(join(dir, 'pages', 'terms-of-service.mdx'), tosStub);

// CORNERSTORE.md — quick reference for components and config; ignored by Astro build
const referenceDoc = await readFile(join(stubsDir, 'CORNERSTORE.md'), 'utf-8');
await safeWrite(join(dir, 'CORNERSTORE.md'), referenceDoc);


// src/pages/index.astro
await safeWrite(join(dir, 'src', 'pages', 'index.astro'), buildIndexPage());

// src/pages/[slug].astro
await safeWrite(join(dir, 'src', 'pages', '[slug].astro'), buildSlugPage());

// src/pages/category/[slug].astro
await safeWrite(join(dir, 'src', 'pages', 'category', '[slug].astro'), buildCategorySlugPage());

// src/pages/404.astro
await safeWrite(join(dir, 'src', 'pages', '404.astro'), buildStatusPage('404', storeName));

// src/pages/cart.astro
await safeWrite(join(dir, 'src', 'pages', 'cart.astro'), buildCartPage());

// src/pages/success.astro
await safeWrite(join(dir, 'src', 'pages', 'success.astro'), buildStatusPage('success', storeName));

// src/pages/cancel.astro
await safeWrite(join(dir, 'src', 'pages', 'cancel.astro'), buildStatusPage('cancel', storeName));

// src/pages/product-names.json.ts — SKU -> name map used by the cart to label unavailable items
await safeWrite(join(dir, 'src', 'pages', 'product-names.json.ts'), `import type { APIRoute } from 'astro';
import { getProductNamesResponse } from 'corner-store/catalog';

export const GET: APIRoute = () => getProductNamesResponse();
`);

// Link corner-store first (before npm install), so npm doesn't try to fetch it from the registry.
//
// Note for library devs: `npm link corner-store` is sufficient for `astro check`
// and `astro dev` against in-progress library changes, but NOT for `astro build`.
// Astro's vite plugin can't match compile-phase and load-phase keys for symlinked
// client-script Astro modules (e.g. Cart.astro), and the build fails with a
// "no cached compile metadata found" error. To verify the full downstream build
// pipeline, use `npm pack` + `file:./corner-store-*.tgz` instead of npm link.
console.log('  Installing dependencies...\n');
try {
  execFileSync('npm', ['link', 'corner-store'], { cwd: dir, stdio: 'pipe' });
} catch {
  // Not linked globally — npm install will try the registry
}

try {
  execFileSync('npm', ['install', '--fund=false', '--audit=false'], { cwd: dir, stdio: 'inherit' });
} catch {
  console.log('\n  npm install failed — you can run it manually.');
}

if (skipped.length > 0) {
  console.log(`  Skipped ${skipped.length} existing file${skipped.length === 1 ? '' : 's'} (not overwritten).\n`);
}

const nextLine = checkoutStyle === 'stripe' && !checkoutUrl
  ? '  Next: set `checkoutUrl` in cornerstore.config.js when your server is ready.\n'
  : '  Next: run `npm run dev`.\n';

console.log(`
  Your store is ready!
${nextLine}`);
