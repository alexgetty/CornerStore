#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

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

let storeName, stripeKey, wantAbout, wantShipping, wantReturns, wantFaq, wantTable, minCartSize, contactEmail, nav, footerNav;

if (existingConfig) {
  // Re-init: derive everything from existing config, skip prompts
  console.log('\n  Corner Store — updating existing project\n');

  storeName = existingConfig.name ?? 'Corner Store';
  stripeKey = '';

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
} else {
  // Fresh init: interactive prompts
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('\n  Corner Store\n');

  storeName = (await rl.question('  Store name (Corner Store): ')).trim() || 'Corner Store';

  console.log('\n  Your Stripe secret key lets Corner Store fetch your products.');
  console.log('  It stays local in .env and is never sent anywhere except directly to Stripe.');
  stripeKey = (await rl.question('  Stripe secret key (press Enter to skip): ')).trim();

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
SAMPLE-001,Sample Product,19.99,A sample product to get you started,,,,,
`);

// products/SAMPLE-001.md — example rich description override
await safeWrite(join(dir, 'products', 'SAMPLE-001.md'), `---
sku: SAMPLE-001
---

This is a **rich description** for your sample product. Edit this file or delete it and use the Description column in catalog.csv instead.

Markdown here overrides the CSV description on your storefront, while the CSV description is still used for Stripe.
`);

// package.json
await safeWrite(join(dir, 'package.json'), JSON.stringify({
  name: slug,
  type: 'module',
  scripts: {
    dev: 'astro dev',
    build: 'astro build',
    preview: 'astro preview',
    'catalog:diff': 'corner-store-catalog diff',
    'catalog:add': 'corner-store-catalog add',
    'catalog:update': 'corner-store-catalog update',
    'catalog:sync': 'corner-store-catalog sync',
  },
  dependencies: {
    '@astrojs/mdx': '^4',
    'astro': '^5',
    'corner-store': '^0.1.0',
  },
}, null, 2) + '\n');

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

// .env
if (stripeKey) {
  await safeWrite(join(dir, '.env'), `STRIPE_SECRET_KEY=${stripeKey}\n`);
} else {
  await safeWrite(join(dir, '.env'), `# Your Stripe secret key — find it at https://dashboard.stripe.com/apikeys
# Paste it below, then run: npm run dev
STRIPE_SECRET_KEY=
`);
}

// .gitignore
await safeWrite(join(dir, '.gitignore'), `node_modules/
dist/
.env
`);

// cornerstore.config.js
const configLines = [
  `export default {`,
  `  name: ${JSON.stringify(storeName)},`,
  `  home: 'home',`,
  `  nav: ${JSON.stringify(nav, null, 4)},`,
  `  footerNav: ${JSON.stringify(footerNav, null, 4)},`,
];
if (contactEmail) {
  configLines.push(`  contact: ${JSON.stringify(contactEmail)},`);
}
if (wantTable) {
  configLines.push(`  listings: { views: ['card', 'table'] },`);
  if (minCartSize !== null) {
    configLines.push(`  minCartSize: ${minCartSize},`);
  }
} else {
  configLines.push(`  listings: { views: ['card'] },`);
}
configLines.push(`}\n`);
await safeWrite(join(dir, 'cornerstore.config.js'), configLines.join('\n'));

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


// src/pages/index.astro
await safeWrite(join(dir, 'src', 'pages', 'index.astro'), `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Listings, Listing } from 'corner-store/components';
import { loadConfig, loadPages } from 'corner-store';

const config = await loadConfig();
const pages = await loadPages(config);
const homePage = pages.get(config.home);

const mdxModules = import.meta.glob('/pages/*.mdx');
const homeModule = mdxModules[\`/pages/\${config.home}.mdx\`];

let Content = null;
if (homeModule) {
  const mod = await homeModule();
  Content = mod.default;
}
---

{Content ? (
  <ContentPage title={homePage?.title ?? config.name} hasExplicitTitle={homePage?.hasExplicitTitle ?? false}>
    <Content components={{ Listings, Listing }} />
  </ContentPage>
) : (
  <ContentPage title={config.name}>
    <p>Create <code>pages/{config.home}.mdx</code> to get started.</p>
  </ContentPage>
)}
`);

// src/pages/[slug].astro
await safeWrite(join(dir, 'src', 'pages', '[slug].astro'), `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Listings, Listing } from 'corner-store/components';
import { loadConfig, loadPages } from 'corner-store';

export async function getStaticPaths() {
  const config = await loadConfig();
  const pages = await loadPages(config);

  return [...pages.entries()]
    .filter(([slug]) => slug !== config.home)
    .map(([slug, page]) => ({
      params: { slug },
      props: { page },
    }));
}

const { page } = Astro.props;

const mdxModules = import.meta.glob('/pages/*.mdx');
const mod = await mdxModules[\`/pages/\${page.slug}.mdx\`]();
const Content = mod.default;
---

<ContentPage title={page.title} hasExplicitTitle={page.hasExplicitTitle}>
  <Content components={{ Listings, Listing }} />
</ContentPage>
`);

// src/pages/category/[slug].astro
await safeWrite(join(dir, 'src', 'pages', 'category', '[slug].astro'), `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Listings, Listing } from 'corner-store/components';
import { loadConfig, getCategories, loadCategoryPages } from 'corner-store';

export async function getStaticPaths() {
  const config = await loadConfig();
  const categories = await getCategories();
  const categoryPages = await loadCategoryPages();

  const paths = [];

  for (const [slug, catPage] of categoryPages) {
    paths.push({
      params: { slug },
      props: { page: catPage, isMdx: true },
    });
  }

  for (const cat of categories) {
    if (!categoryPages.has(cat.slug)) {
      paths.push({
        params: { slug: cat.slug },
        props: { categoryName: cat.name, isMdx: false },
      });
    }
  }

  return paths;
}

const { page, categoryName, isMdx } = Astro.props;
const slug = Astro.params.slug;

let Content = null;
if (isMdx) {
  const mdxModules = import.meta.glob('/pages/category/*.mdx');
  const loader = mdxModules[\`/pages/category/\${slug}.mdx\`];
  if (loader) {
    const mod = await loader();
    Content = mod.default;
  }
}
---

{isMdx && Content ? (
  <ContentPage title={page.title} hasExplicitTitle={page.hasExplicitTitle}>
    <Content components={{ Listings, Listing }} />
  </ContentPage>
) : (
  <ContentPage title={categoryName}>
    <Listings categories={[categoryName]} />
  </ContentPage>
)}
`);

// src/pages/404.astro
await safeWrite(join(dir, 'src', 'pages', '404.astro'), `---
import { StatusPage } from 'corner-store/components';
---

<StatusPage
  title="Page Not Found - ${storeName}"
  heading="Page not found."
  message="The page you're looking for doesn't exist or has been moved."
  linkText="Back to store"
  linkHref="/"
/>
`);

// src/pages/cart.astro
await safeWrite(join(dir, 'src', 'pages', 'cart.astro'), `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Cart } from 'corner-store/components';
import { loadConfig, getListings, decimalToRawPrice, DEFAULT_CURRENCY } from 'corner-store';

const config = await loadConfig();
const listings = await getListings();
const minCartSizeRaw = config.minCartSize != null
  ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
  : null;
const checkoutEnabled = !!import.meta.env.STRIPE_SECRET_KEY;
---

<ContentPage title="Cart" hasExplicitTitle>
  <Cart
    storeName={config.name}
    contact={config.contact ?? ''}
    listings={listings}
    currency={DEFAULT_CURRENCY}
    minCartSize={config.minCartSize}
    minCartSizeRaw={minCartSizeRaw}
    wholesaleMargin={config.wholesaleMargin}
    checkoutEnabled={checkoutEnabled}
    shippingFlat={config.shippingFlat}
    shippingFreeThreshold={config.shippingFreeThreshold}
    checkoutUrl={config.checkoutUrl}
  />
</ContentPage>
`);

// src/pages/success.astro
await safeWrite(join(dir, 'src', 'pages', 'success.astro'), `---
import { StatusPage } from 'corner-store/components';
---

<StatusPage
  title="Order Confirmed - ${storeName}"
  heading="Thank you for your purchase!"
  message="Your order has been confirmed. You will receive a receipt from Stripe shortly."
  linkText="Back to store"
  linkHref="/"
/>
`);

// src/pages/cancel.astro
await safeWrite(join(dir, 'src', 'pages', 'cancel.astro'), `---
import { StatusPage } from 'corner-store/components';
---

<StatusPage
  title="Checkout Cancelled - ${storeName}"
  heading="Your checkout was cancelled."
  message="No charge has been made. You can return to the store whenever you are ready."
  linkText="Back to store"
  linkHref="/"
/>
`);

// Link corner-store first (before npm install), so npm doesn't try to fetch it from the registry
console.log('  Installing dependencies...\n');
let linked = false;
try {
  execFileSync('npm', ['link', 'corner-store'], { cwd: dir, stdio: 'pipe' });
  linked = true;
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

console.log(`
  Your store is ready!
${stripeKey ? '' : '  Next: Open .env and add your Stripe secret key.\n'}  Then run: npm run dev
`);
