import Stripe from 'stripe';
import { readdir, readFile, copyFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import matter from 'gray-matter';

interface StripeProductData {
  name: string;
  description: string | null;
  image: string | null;
  imageAlt: string;
  rawPrice: number;
  currency: string;
}

export interface SingleListing {
  kind: 'single';
  name: string;
  description: string | null;
  image: string | null;
  imageAlt: string;
  price: string;
  rawPrice: number;
  currency: string;
  paymentLink: string;
}

export interface BundleListing {
  kind: 'bundle';
  name: string;
  description: string | null;
  image: string | null;
  imageAlt: string;
  price: string | null;
  rawPrice: number | null;
  currency: string | null;
  paymentLink: string;
}

export type CatalogListing = SingleListing | BundleListing;

export interface BundleConfig {
  link: string;
  title?: string;
  description?: string;
  image?: string;
  image_alt?: string;
}

export class StripeSetupError extends Error {
  guidance: string;

  constructor(message: string, guidance: string, cause?: Error) {
    super(
      `[Storefront] ${message}\n  → See SETUP.md${guidance} for steps to fix this.`
    );
    this.name = 'StripeSetupError';
    this.guidance = guidance;
    if (cause) {
      this.cause = cause;
    }
  }
}

const STRIPE_ERROR_MAP: Record<string, { message: string; guidance: string }> =
  {
    StripeAuthenticationError: {
      message: 'Invalid API key',
      guidance: '#invalid-api-key',
    },
    StripePermissionError: {
      message: 'API key lacks required permissions',
      guidance: '#insufficient-permissions',
    },
    StripeConnectionError: {
      message: 'Cannot reach Stripe API',
      guidance: '#connection-error',
    },
    StripeRateLimitError: {
      message: 'Too many requests — try again shortly',
      guidance: '#rate-limit',
    },
    StripeInvalidRequestError: {
      message: 'Invalid API request — possible SDK version mismatch',
      guidance: '#invalid-request',
    },
    StripeAPIError: {
      message:
        'Stripe internal error — try again, contact Stripe support if persistent',
      guidance: '#stripe-api-error',
    },
  };

function wrapStripeError(err: unknown): never {
  if (err instanceof Error && 'type' in err && typeof (err as { type: unknown }).type === 'string') {
    const mapping = STRIPE_ERROR_MAP[(err as { type: string }).type];
    if (mapping) {
      throw new StripeSetupError(mapping.message, mapping.guidance, err);
    }
  }
  throw err;
}

function getStripeClient(): Stripe {
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeSetupError(
      'STRIPE_SECRET_KEY is not set',
      '#missing-api-key'
    );
  }
  if (!key.startsWith('sk_')) {
    throw new StripeSetupError(
      'STRIPE_SECRET_KEY must start with sk_ (secret key). You may have pasted a publishable key (pk_*) by mistake.',
      '#invalid-key-format'
    );
  }
  return new Stripe(key);
}

function getCurrencyDecimalPlaces(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
    .resolvedOptions().maximumFractionDigits;
}

export function listingHasPrice(listing: CatalogListing): boolean {
  return listing.price !== null && listing.rawPrice !== null && listing.currency !== null;
}

export function rawPriceToDecimal(rawPrice: number, currency: string): number {
  const decimals = getCurrencyDecimalPlaces(currency);
  return rawPrice / (10 ** decimals);
}

export function formatPrice(unitAmount: number | null, currency: string): string {
  const amount = unitAmount ?? 0;
  const value = rawPriceToDecimal(amount, currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(value);
}

const BUNDLES_DIR = join(process.cwd(), 'bundles');
const BUNDLES_PUBLIC_DIR = join(process.cwd(), 'public', 'bundles');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);

export async function loadBundleConfigs(): Promise<Map<string, BundleConfig>> {
  const configs = new Map<string, BundleConfig>();

  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(BUNDLES_DIR, { withFileTypes: true });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return configs;
    }
    throw err;
  }

  const subdirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of subdirs) {
    const dirPath = join(BUNDLES_DIR, dir.name);
    let files: string[];
    try {
      files = ((await readdir(dirPath)) as string[]).sort();
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: bundles/${dir.name}: failed to read — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));
    if (mdFiles.length === 0) continue;

    if (mdFiles.length > 1) {
      console.log(`[Storefront] Warning: bundles/${dir.name}: multiple .md files — using ${mdFiles[0]}, ignoring ${mdFiles.slice(1).join(', ')}`);
    }

    const mdFile = mdFiles[0]!;
    let content: string;
    try {
      content = await readFile(join(dirPath, mdFile), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: failed to read — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = matter(content));
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: failed to parse frontmatter — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (!data.link || typeof data.link !== 'string') {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: missing required "link" field — skipped`);
      continue;
    }

    // Find image files in the directory
    const imageFiles = files.filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()));

    // Determine cover image
    let coverFile: string | undefined;
    if (data.cover) {
      if (imageFiles.includes(data.cover as string)) {
        coverFile = data.cover as string;
      } else {
        console.log(`[Storefront] Warning: bundles/${dir.name}: cover "${data.cover}" not found — falling back to first image`);
        coverFile = imageFiles[0];
      }
    } else {
      coverFile = imageFiles[0];
    }

    // Copy images to public/bundles/<dirname>/
    if (imageFiles.length > 0) {
      try {
        const outDir = join(BUNDLES_PUBLIC_DIR, dir.name);
        await mkdir(outDir, { recursive: true });
        for (const img of imageFiles) {
          await copyFile(join(dirPath, img), join(outDir, img));
        }
      } catch (err: unknown) {
        console.log(`[Storefront] Warning: bundles/${dir.name}: failed to copy images — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const resolvedImage = coverFile ? `/bundles/${dir.name}/${coverFile}` : undefined;

    const config: BundleConfig = {
      link: data.link as string,
      ...(data.title && { title: data.title as string }),
      ...(data.description && { description: data.description as string }),
      ...(resolvedImage && { image: resolvedImage }),
      ...(data.image_alt && { image_alt: data.image_alt as string }),
    };

    if (configs.has(config.link)) {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: duplicate link — already configured, skipping`);
      continue;
    }

    configs.set(config.link, config);
  }

  return configs;
}

interface LinkWarning {
  linkUrl: string;
  reason: string;
}

function extractProductData(
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

export async function getCatalog(): Promise<CatalogListing[]> {
  const stripe = getStripeClient();
  let bundleConfigs: Map<string, BundleConfig>;
  try {
    bundleConfigs = await loadBundleConfigs();
  } catch (err: unknown) {
    console.log(`[Storefront] Warning: failed to load bundle config — ${err instanceof Error ? err.message : String(err)}`);
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
  const bundleListings: BundleListing[] = [];
  const warnings: LinkWarning[] = [];
  const bundlePendingNames: {
    linkId: string;
    suffix: string;
    config: BundleConfig | undefined;
    listing: BundleListing;
  }[] = [];

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
        reason: `failed to fetch line items — ${err instanceof Error ? err.message : String(err)}`,
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
      const product = productDataItems[0]!;
      singleListings.push({
        kind: 'single',
        name: product.name,
        description: product.description,
        image: product.image,
        imageAlt: product.imageAlt,
        price: formatPrice(product.rawPrice, product.currency),
        rawPrice: product.rawPrice,
        currency: product.currency,
        paymentLink: link.url,
      });
    } else {
      // Multi-product link → bundle
      const sorted = [...productDataItems].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const suffix = link.id.slice(-4);
      const config = bundleConfigs.get(link.url);
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

      bundlePendingNames.push({
        linkId: link.id,
        suffix,
        config,
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
      });

      if (!config) {
        warnings.push({
          linkUrl: link.url,
          reason: `${productDataItems.length} products, no bundle config — using defaults`,
        });
      }
    }
  }

  // Resolve bundle display names (collision detection)
  const suffixCounts = new Map<string, number>();
  for (const pending of bundlePendingNames) {
    suffixCounts.set(
      pending.suffix,
      (suffixCounts.get(pending.suffix) ?? 0) + 1
    );
  }

  // For colliding suffixes, sort by URL and assign -a, -b, etc.
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
  const listings: CatalogListing[] = [...bundleListings, ...singleListings];

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
