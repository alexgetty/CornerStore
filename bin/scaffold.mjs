// Pure scaffold helpers for `cornerstore init`.
// Kept free of side effects so they can be unit-tested without filesystem or stdin.

export function parseCheckoutStyle(input) {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (trimmed === '') return 'pdf';
  if (trimmed === 'pdf' || trimmed === 'stripe') return trimmed;
  return null;
}

export function deriveAnswersFromExistingConfig(existingConfig) {
  const cfg = existingConfig ?? {};
  const checkoutStyle = cfg.checkout === 'stripe' ? 'stripe' : 'pdf';
  const checkoutUrl = typeof cfg.checkoutUrl === 'string' ? cfg.checkoutUrl : '';
  return { checkoutStyle, checkoutUrl };
}

export function buildConfigFile(answers) {
  const {
    storeName,
    nav,
    footerNav,
    contactEmail,
    wantTable,
    minCartSize,
    checkoutStyle,
    checkoutUrl,
  } = answers;

  const lines = [
    `export default {`,
    `  name: ${JSON.stringify(storeName)},`,
    `  home: 'home',`,
    `  // Example category dropdown item:`,
    `  // { label: 'Products', dropdown: 'categories' }`,
    `  nav: ${JSON.stringify(nav, null, 4)},`,
    `  footerNav: ${JSON.stringify(footerNav, null, 4)},`,
  ];

  if (contactEmail) {
    lines.push(`  contact: ${JSON.stringify(contactEmail)},`);
  }

  if (wantTable) {
    lines.push(`  listings: { views: ['card', 'table'] },`);
    if (minCartSize !== null && minCartSize !== undefined) {
      lines.push(`  minCartSize: ${minCartSize},`);
    }
  } else {
    lines.push(`  listings: { views: ['card'] },`);
  }

  lines.push(`  checkout: '${checkoutStyle}',`);

  if (checkoutStyle === 'stripe') {
    if (checkoutUrl && checkoutUrl.trim() !== '') {
      lines.push(`  checkoutUrl: '${checkoutUrl}',`);
    } else {
      lines.push(`  // checkoutUrl: 'https://your-server.example.com/api/checkout',`);
    }
  }

  // Commented-out optional keys — discoverable defaults without forcing consumers to hand-edit.
  lines.push(``);
  lines.push(`  // Optional:`);
  lines.push(`  // logo: '/logo.svg',`);
  lines.push(`  // wholesaleMargin: 0.5,                 // 50% of retail for wholesale customers`);
  lines.push(`  // shippingFlat: 9.99,`);
  lines.push(`  // shippingFreeThreshold: 100,`);

  lines.push(`}\n`);
  return lines.join('\n');
}

export function buildCartPage() {
  // Note: imported as CartPage, not Cart, because the page filename is
  // `cart.astro` and astro/language-server auto-generates a local `Cart`
  // identifier from the filename (PascalCase). `import { Cart }` collides
  // with it (ts2440).
  return `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Cart as CartPage } from 'corner-store/components';
import { loadConfig, getListings, decimalToRawPrice, DEFAULT_CURRENCY } from 'corner-store';

const config = await loadConfig();
const listings = await getListings();
const minCartSizeRaw = config.minCartSize != null
  ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
  : null;
const checkoutEnabled = config.checkout === 'stripe' && !!config.checkoutUrl;
---

<ContentPage title="Cart" hasExplicitTitle>
  <CartPage
    storeName={config.name}
    contact={config.contact ?? ''}
    listings={listings}
    currency={DEFAULT_CURRENCY}
    minCartSizeRaw={minCartSizeRaw}
    wholesaleMargin={config.wholesaleMargin}
    checkoutEnabled={checkoutEnabled}
    shippingFlat={config.shippingFlat}
    shippingFreeThreshold={config.shippingFreeThreshold}
    checkoutUrl={config.checkoutUrl}
  />
</ContentPage>
`;
}

export function buildIndexPage() {
  return `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Hero, Listings, Listing } from 'corner-store/components';
import { loadConfig, loadPages } from 'corner-store';

const config = await loadConfig();
const pages = await loadPages(config);
const homePage = pages.get(config.home);

const mdxModules = import.meta.glob<{ default: any }>('/pages/*.mdx');
const homeModule = mdxModules[\`/pages/\${config.home}.mdx\`];

let Content: any = null;
if (homeModule) {
  const mod = await homeModule();
  Content = mod.default;
}
---

{Content ? (
  <ContentPage title={homePage?.title ?? config.name} hasExplicitTitle={homePage?.hasExplicitTitle ?? false}>
    <Content components={{ Hero, Listings, Listing }} />
  </ContentPage>
) : (
  <ContentPage title={config.name}>
    <p>Create <code>pages/{config.home}.mdx</code> to get started.</p>
  </ContentPage>
)}
`;
}

export function buildSlugPage() {
  return `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Hero, Listings, Listing } from 'corner-store/components';
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

const mdxModules = import.meta.glob<{ default: any }>('/pages/*.mdx');
const loader = mdxModules[\`/pages/\${page.slug}.mdx\`];

let Content: any = null;
if (loader) {
  const mod = await loader();
  Content = mod.default;
}
---

<ContentPage title={page.title} hasExplicitTitle={page.hasExplicitTitle}>
  {Content ? (
    <Content components={{ Hero, Listings, Listing }} />
  ) : (
    <p>Create <code>pages/{page.slug}.mdx</code> to fill in this page.</p>
  )}
</ContentPage>
`;
}

export function buildCategorySlugPage() {
  return `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Listings, Listing } from 'corner-store/components';
import { getCategories, loadCategoryPages } from 'corner-store';

export async function getStaticPaths() {
  const categories = await getCategories();
  const categoryPages = await loadCategoryPages();

  const paths = [];

  for (const [slug, catPage] of categoryPages) {
    paths.push({
      params: { slug },
      props: { page: catPage, categoryName: '', isMdx: true },
    });
  }

  for (const cat of categories) {
    if (!categoryPages.has(cat.slug)) {
      paths.push({
        params: { slug: cat.slug },
        props: { page: null, categoryName: cat.name, isMdx: false },
      });
    }
  }

  return paths;
}

const { page, categoryName, isMdx } = Astro.props;
const slug = Astro.params.slug ?? '';

let Content: any = null;
if (isMdx) {
  const mdxModules = import.meta.glob<{ default: any }>('/pages/category/*.mdx');
  const loader = mdxModules[\`/pages/category/\${slug}.mdx\`];
  if (loader) {
    const mod = await loader();
    Content = mod.default;
  }
}
---

{isMdx && Content && page ? (
  <ContentPage title={page.title} hasExplicitTitle={page.hasExplicitTitle}>
    <Content components={{ Listings, Listing }} />
  </ContentPage>
) : (
  <ContentPage title={categoryName ?? slug}>
    <Listings categories={categoryName ? [categoryName] : []} />
  </ContentPage>
)}
`;
}

export function buildEnvFile() {
  // The storefront is static; secrets live on the consumer's separate server.
  return `# No secrets needed here. Corner Store's checkout runs on your own server,
# which imports createCheckoutHandler from 'corner-store/checkout'.
# Configure the URL via cornerstore.config.js (checkoutUrl).
`;
}

export function buildPackageJson(slug) {
  // @astrojs/check and typescript are intentionally omitted from devDependencies.
  // Astro auto-installs them on first `astro check` invocation, so consumers who
  // never typecheck don't pay the install cost.
  return JSON.stringify({
    name: slug,
    type: 'module',
    scripts: {
      dev: 'astro dev',
      build: 'astro build',
      preview: 'astro preview',
      typecheck: 'astro check',
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
  }, null, 2) + '\n';
}

const STATUS_PAGE_COPY = {
  '404': {
    title: 'Page Not Found',
    heading: 'Page not found.',
    message: "The page you're looking for doesn't exist or has been moved.",
  },
  success: {
    title: 'Order Confirmed',
    heading: 'Thank you for your purchase!',
    message: 'Your order has been confirmed. You will receive a receipt from Stripe shortly.',
  },
  cancel: {
    title: 'Checkout Cancelled',
    heading: 'Your checkout was cancelled.',
    message: 'No charge has been made. You can return to the store whenever you are ready.',
  },
};

export function buildStatusPage(kind, storeName) {
  const copy = STATUS_PAGE_COPY[kind];
  if (!copy) {
    throw new Error(`buildStatusPage: unknown kind ${JSON.stringify(kind)}. Expected '404', 'success', or 'cancel'.`);
  }
  return `---
import { StatusPage } from 'corner-store/components';
---

<StatusPage
  title="${copy.title} - ${storeName}"
  heading="${copy.heading}"
  message="${copy.message}"
  linkText="Back to store"
  linkHref="/"
/>
`;
}
