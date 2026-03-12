import type Stripe from 'stripe';
import type { StripeProductData, SingleListing, BundleListing, Listing, BundleConfig, LinkWarning } from './types.js';
import { getErrorMessage } from './utils.js';
import { formatPrice } from './pricing.js';
import { loadBundleConfigs } from './bundles.js';
import { getStripeClient } from '../stripe/client.js';
import { StripeSetupError, wrapStripeError } from '../stripe/errors.js';

export function extractProductData(
  item: Stripe.LineItem
): StripeProductData | null {
  if (!item.price) return null;
  const price = item.price;
  const product = price.product;
  if (!product || typeof product === 'string') return null;
  const prod = product as Stripe.Product;
  const metadataAlt = prod.metadata?.image_alt;
  return {
    name: prod.name,
    description: prod.description ?? null,
    image: prod.images.length > 0 ? prod.images[0]! : null,
    imageAlt: metadataAlt ? metadataAlt : prod.name,
    rawPrice: price.unit_amount ?? 0,
    currency: price.currency,
  };
}

function buildSingleListing(product: StripeProductData, linkUrl: string): SingleListing {
  return {
    kind: 'single',
    name: product.name,
    description: product.description,
    image: product.image,
    imageAlt: product.imageAlt,
    price: formatPrice(product.rawPrice, product.currency),
    rawPrice: product.rawPrice,
    currency: product.currency,
    paymentLink: linkUrl,
  };
}

function buildBundleListing(
  productDataItems: StripeProductData[],
  link: Stripe.PaymentLink,
  config: BundleConfig | undefined,
  warnings: LinkWarning[]
): { listing: BundleListing; suffix: string; config: BundleConfig | undefined; linkId: string } {
  const sorted = [...productDataItems].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const suffix = link.id.slice(-4);
  const autoDescription = `This bundle includes: ${sorted.map((p) => p.name).join(', ')}`;
  const autoImage = sorted.find((p) => p.image !== null)?.image ?? null;

  const description = config?.description ?? autoDescription;
  const image = config?.image ?? autoImage;

  // Price: sum if all same currency, null if mixed
  const currencies = new Set(productDataItems.map((p) => p.currency));
  let price: string | null;
  let rawPrice: number | null;
  let currency: string | null;
  if (currencies.size === 1) {
    currency = productDataItems[0]!.currency;
    rawPrice = productDataItems.reduce((sum, p) => sum + p.rawPrice, 0);
    price = formatPrice(rawPrice, currency);
  } else {
    price = null;
    rawPrice = null;
    currency = null;
    warnings.push({
      linkUrl: link.url,
      reason: `mixed currencies (${[...currencies].join(', ')}) — price omitted`,
    });
  }

  return {
    listing: {
      kind: 'bundle',
      name: '', // filled after collision check
      description,
      image,
      imageAlt: '', // filled after collision check
      price,
      rawPrice,
      currency,
      paymentLink: link.url,
    },
    suffix,
    config,
    linkId: link.id,
  };
}

function resolveBundleNames(
  bundlePendingNames: { linkId: string; suffix: string; config: BundleConfig | undefined; listing: BundleListing }[],
  warnings: LinkWarning[]
): BundleListing[] {
  const bundleListings: BundleListing[] = [];

  const suffixCounts = new Map<string, number>();
  for (const pending of bundlePendingNames) {
    suffixCounts.set(
      pending.suffix,
      (suffixCounts.get(pending.suffix) ?? 0) + 1
    );
  }

  // For colliding suffixes, sort by URL and assign -1, -2, etc.
  const suffixGroups = new Map<string, typeof bundlePendingNames>();
  for (const pending of bundlePendingNames) {
    if (!pending.config?.title && suffixCounts.get(pending.suffix)! > 1) {
      const group = suffixGroups.get(pending.suffix) ?? [];
      group.push(pending);
      suffixGroups.set(pending.suffix, group);
    }
  }
  for (const group of suffixGroups.values()) {
    group.sort((a, b) => a.listing.paymentLink.localeCompare(b.listing.paymentLink));
  }

  for (const pending of bundlePendingNames) {
    if (pending.config?.title) {
      pending.listing.name = pending.config.title;
    } else {
      let displayName: string;
      const group = suffixGroups.get(pending.suffix);
      if (group) {
        const index = group.indexOf(pending);
        displayName = `Bundle ${pending.suffix}-${index + 1}`;
        warnings.push({
          linkUrl: pending.listing.paymentLink,
          reason: `display name collision — disambiguated to "${displayName}"`,
        });
      } else {
        displayName = `Bundle ${pending.suffix}`;
      }
      pending.listing.name = displayName;
    }
    pending.listing.imageAlt = pending.config?.image_alt ?? pending.listing.name;
    bundleListings.push(pending.listing);
  }

  return bundleListings;
}

export async function getListings(): Promise<Listing[]> {
  const stripe = getStripeClient();
  let bundleConfigs: Map<string, BundleConfig>;
  try {
    bundleConfigs = await loadBundleConfigs();
  } catch (err: unknown) {
    console.log(`[Storefront] Warning: failed to load bundle config — ${getErrorMessage(err)}`);
    bundleConfigs = new Map();
  }

  // Step 1: Fetch active payment links
  const allLinks: Stripe.PaymentLink[] = [];
  try {
    for await (const link of stripe.paymentLinks.list({ active: true })) {
      allLinks.push(link);
    }
  } catch (err) {
    wrapStripeError(err);
  }

  if (allLinks.length === 0) {
    throw new StripeSetupError(
      'No active payment links found in Stripe',
      '#no-payment-links'
    );
  }

  // Step 2: For each link, fetch line items and build listings
  const singleListings: SingleListing[] = [];
  const warnings: LinkWarning[] = [];
  const bundlePendingNames: { linkId: string; suffix: string; config: BundleConfig | undefined; listing: BundleListing }[] = [];

  for (const link of allLinks) {
    let lineItemsResponse: Stripe.ApiList<Stripe.LineItem>;
    try {
      lineItemsResponse = await stripe.paymentLinks.listLineItems(link.id, {
        expand: ['data.price.product'],
        limit: 100,
      });
    } catch (err: unknown) {
      warnings.push({
        linkUrl: link.url,
        reason: `failed to fetch line items — ${getErrorMessage(err)}`,
      });
      continue;
    }

    if (lineItemsResponse.has_more) {
      warnings.push({
        linkUrl: link.url,
        reason: 'more than 100 line items — only the first 100 are shown',
      });
    }

    const productDataItems: StripeProductData[] = [];
    for (const item of lineItemsResponse.data) {
      const data = extractProductData(item);
      if (data) productDataItems.push(data);
    }

    if (productDataItems.length === 0) {
      warnings.push({
        linkUrl: link.url,
        reason: 'no valid line items',
      });
      continue;
    }

    if (productDataItems.length === 1) {
      singleListings.push(buildSingleListing(productDataItems[0]!, link.url));
    } else {
      // Multi-product link → bundle
      const config = bundleConfigs.get(link.url);
      const result = buildBundleListing(productDataItems, link, config, warnings);
      bundlePendingNames.push(result);

      if (!config) {
        warnings.push({
          linkUrl: link.url,
          reason: `${productDataItems.length} products, no bundle config — using defaults`,
        });
      }
    }
  }

  // Resolve bundle display names (collision detection)
  const bundleListings = resolveBundleNames(bundlePendingNames, warnings);

  // Detect orphaned configs
  const activeLinkUrls = new Set(allLinks.map((l) => l.url));
  for (const [url] of bundleConfigs) {
    if (!activeLinkUrls.has(url)) {
      warnings.push({
        linkUrl: url,
        reason: 'no matching active payment link',
      });
    }
  }

  // Bundles first, then singles
  const listings: Listing[] = [...bundleListings, ...singleListings];

  if (listings.length === 0) {
    throw new StripeSetupError(
      'No cards could be built from payment links',
      '#no-cards'
    );
  }

  // Build summary
  const singleCount = singleListings.length;
  const bundleCount = bundleListings.length;
  const configuredCount = bundlePendingNames.filter((p) => p.config).length;
  const defaultCount = bundleCount - configuredCount;
  const skipped = allLinks.length - listings.length;

  if (warnings.length > 0) {
    const warningLines = warnings
      .map((w) => `  - ${w.linkUrl}: ${w.reason}`)
      .join('\n');
    console.log(`[Storefront] Warnings:\n${warningLines}`);
  }

  let summary =
    `[Storefront] Build complete:\n` +
    `  Payment links found: ${allLinks.length}\n` +
    `  Single-product cards: ${singleCount}`;

  if (bundleCount > 0) {
    summary += `\n  Bundle cards: ${bundleCount} (${configuredCount} configured, ${defaultCount} default)`;
  }

  if (skipped > 0) {
    summary += `\n  Links skipped: ${skipped}`;
  }

  console.log(summary);

  return listings;
}
