#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

const rl = createInterface({ input: stdin, output: stdout });

console.log('\n  Corner Store\n');

const storeName = (await rl.question('  Store name (Corner Store): ')).trim() || 'Corner Store';

console.log('\n  Your Stripe secret key lets Corner Store fetch your products.');
console.log('  It stays local in .env and is never sent anywhere except directly to Stripe.');
const stripeKey = (await rl.question('  Stripe secret key (press Enter to skip): ')).trim();

rl.close();

const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'corner-store';
const dir = process.cwd();

console.log('\n  Scaffolding your store...\n');

// Directory structure
await mkdir(join(dir, 'src', 'pages'), { recursive: true });
await mkdir(join(dir, 'theme'), { recursive: true });

// package.json
await writeFile(join(dir, 'package.json'), JSON.stringify({
  name: slug,
  type: 'module',
  scripts: {
    dev: 'astro dev',
    build: 'astro build',
    preview: 'astro preview',
  },
  dependencies: {
    'astro': '^5',
    'corner-store': '^0.1.0',
  },
}, null, 2) + '\n');

// astro.config.mjs
await writeFile(join(dir, 'astro.config.mjs'), `import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
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
await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({
  extends: 'astro/tsconfigs/strict',
}, null, 2) + '\n');

// src/env.d.ts
await writeFile(join(dir, 'src', 'env.d.ts'), `/// <reference types="astro/client" />
`);

// .env
if (stripeKey) {
  await writeFile(join(dir, '.env'), `STRIPE_SECRET_KEY=${stripeKey}\n`);
} else {
  await writeFile(join(dir, '.env'), `# Your Stripe secret key — find it at https://dashboard.stripe.com/apikeys
# Paste it below, then run: npm run dev
STRIPE_SECRET_KEY=
`);
}

// .gitignore
await writeFile(join(dir, '.gitignore'), `node_modules/
dist/
.env
`);

// cornerstore.config.js
await writeFile(join(dir, 'cornerstore.config.js'), `// Corner Store configuration
// Edit the values below to customize your store

export default {
  // Your store name — appears in the header and browser tab
  name: ${JSON.stringify(storeName)},
}
`);

// theme/theme.css — read from the package's source copy
const themeTemplate = await readFile(join(packageRoot, 'theme', 'theme.css'), 'utf-8');
await writeFile(join(dir, 'theme', 'theme.css'), themeTemplate);

// src/pages/index.astro
await writeFile(join(dir, 'src', 'pages', 'index.astro'), `---
import 'corner-store/styles/pages/index.css';
import Base from 'corner-store/layouts/Base';
import { Listings } from 'corner-store/components';
import { getListings } from 'corner-store';

const listings = await getListings();
---

<Base title=${JSON.stringify(storeName)}>
  <header class="cs-header">
    <div class="cs-main">
      <h1>${storeName}</h1>
    </div>
  </header>
  <main class="cs-storefront">
    <div class="cs-main">
      <Listings listings={listings} />
    </div>
  </main>
</Base>
`);

// src/pages/404.astro
await writeFile(join(dir, 'src', 'pages', '404.astro'), `---
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

// src/pages/success.astro
await writeFile(join(dir, 'src', 'pages', 'success.astro'), `---
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
await writeFile(join(dir, 'src', 'pages', 'cancel.astro'), `---
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

console.log(`
  Your store is ready!
${stripeKey ? '' : '  Next: Open .env and add your Stripe secret key.\n'}  Then run: npm run dev
`);
