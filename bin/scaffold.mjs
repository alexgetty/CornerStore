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
  return `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Cart } from 'corner-store/components';
import { loadConfig, getListings, decimalToRawPrice, DEFAULT_CURRENCY } from 'corner-store';

const config = await loadConfig();
const listings = await getListings();
const minCartSizeRaw = config.minCartSize != null
  ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
  : null;
const checkoutEnabled = config.checkout === 'stripe' && !!config.checkoutUrl;
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
`;
}

export function buildEnvFile() {
  // The storefront is static; secrets live on the consumer's separate server.
  return `# No secrets needed here. Corner Store's checkout runs on your own server,
# which imports createCheckoutHandler from 'corner-store/checkout'.
# Configure the URL via cornerstore.config.js (checkoutUrl).
`;
}
