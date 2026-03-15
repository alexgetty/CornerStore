import type { Listing, SingleListing, LinkWarning, PendingBundle, BundleConfig } from './types.js';
import { getErrorMessage } from './utils.js';
import { loadBundleConfigs } from './bundles.js';
import { getStripeClient } from '../stripe/client.js';
import { StripeSetupError } from '../stripe/errors.js';
import { listActivePaymentLinks, listLinkLineItems } from '../stripe/api.js';
import { toProductData, toPaymentLink } from './stripe-adapter.js';
import { buildSingleListing, buildBundleListing } from './listing-builders.js';
import { resolveBundleNames } from './name-collisions.js';

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
  const rawLinks = await listActivePaymentLinks(stripe);

  if (rawLinks.length === 0) {
    throw new StripeSetupError(
      'No active payment links found in Stripe',
      '#no-payment-links'
    );
  }

  // Convert to domain types immediately
  const links = rawLinks.map(toPaymentLink);

  // Step 2: For each link, fetch line items and build listings
  const singleListings: SingleListing[] = [];
  const warnings: LinkWarning[] = [];
  const pendingBundles: PendingBundle[] = [];

  for (const link of links) {
    let lineItemsResponse;
    try {
      lineItemsResponse = await listLinkLineItems(stripe, link.id);
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

    const productDataItems = lineItemsResponse.data
      .map(toProductData)
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (productDataItems.length === 0) {
      warnings.push({
        linkUrl: link.url,
        reason: 'no valid line items',
      });
      continue;
    }

    if (productDataItems.length === 1) {
      singleListings.push(buildSingleListing(productDataItems[0]!, link));
    } else {
      // Multi-product link → bundle
      const config = bundleConfigs.get(link.url);
      const result = buildBundleListing(productDataItems, link, config);
      pendingBundles.push(result.bundle);
      warnings.push(...result.warnings);
    }
  }

  // Resolve bundle display names (collision detection)
  const { listings: bundleListings, warnings: collisionWarnings } = resolveBundleNames(pendingBundles);
  warnings.push(...collisionWarnings);

  // Warn about missing config or title (after names are resolved)
  for (const pending of pendingBundles) {
    const resolved = bundleListings.get(pending)!;
    if (!pending.config) {
      warnings.push({
        linkUrl: pending.paymentLink,
        reason: `no bundle config — customers will see "${resolved.name}". Create a bundles/ directory with a markdown file to configure this bundle`,
      });
    } else if (!pending.config.title) {
      warnings.push({
        linkUrl: pending.paymentLink,
        reason: `bundle config has no title — customers will see "${resolved.name}". Add a title field to your frontmatter`,
      });
    }
  }

  // Detect orphaned configs
  const activeLinkUrls = new Set(links.map((l) => l.url));
  for (const [url] of bundleConfigs) {
    if (!activeLinkUrls.has(url)) {
      warnings.push({
        linkUrl: url,
        reason: 'no matching active payment link',
      });
    }
  }

  // Bundles first, then singles
  const listings: Listing[] = [...bundleListings.values(), ...singleListings];

  if (listings.length === 0) {
    throw new StripeSetupError(
      'No listings could be built from payment links',
      '#no-listings'
    );
  }

  // Build summary
  const singleCount = singleListings.length;
  const bundleCount = bundleListings.size;
  const configuredCount = pendingBundles.filter((p) => p.config).length;
  const defaultCount = bundleCount - configuredCount;
  const skipped = rawLinks.length - listings.length;

  if (warnings.length > 0) {
    const warningLines = warnings
      .map((w) => `  - ${w.linkUrl}: ${w.reason}`)
      .join('\n');
    console.log(`[Storefront] Warnings:\n${warningLines}`);
  }

  let summary =
    `[Storefront] Build complete:\n` +
    `  Payment links found: ${rawLinks.length}\n` +
    `  Single-product listings: ${singleCount}`;

  if (bundleCount > 0) {
    summary += `\n  Bundle listings: ${bundleCount} (${configuredCount} configured, ${defaultCount} default)`;
  }

  if (skipped > 0) {
    summary += `\n  Links skipped: ${skipped}`;
  }

  console.log(summary);

  return listings;
}
