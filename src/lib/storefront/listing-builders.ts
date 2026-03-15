import type { StripeProductData, PaymentLink, SingleListing, BundleConfig, LinkWarning, PendingBundle } from './types.js';
import { formatPrice } from './pricing.js';

export function buildSingleListing(product: StripeProductData, link: PaymentLink): SingleListing {
  return {
    kind: 'single',
    name: product.name,
    description: product.description,
    image: product.image,
    imageAlt: product.imageAlt,
    price: formatPrice(product.rawPrice, product.currency),
    rawPrice: product.rawPrice,
    currency: product.currency,
    paymentLink: link.url,
  };
}

export function buildBundleListing(
  productDataItems: StripeProductData[],
  link: PaymentLink,
  config: BundleConfig | undefined,
): { bundle: PendingBundle; warnings: LinkWarning[] } {
  const warnings: LinkWarning[] = [];
  const sorted = [...productDataItems].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const suffix = link.id.slice(-4);
  const autoDescription = `This bundle includes: ${sorted.map((p) => p.name).join(', ')}`;
  const autoImage = sorted.find((p) => p.image !== null)?.image ?? null;

  const description = config?.description ?? autoDescription;
  const image = config?.image ?? autoImage;
  const imageAlt = config?.image_alt ?? '';

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
    bundle: {
      kind: 'bundle',
      description,
      image,
      imageAlt,
      price,
      rawPrice,
      currency,
      paymentLink: link.url,
      suffix,
      config,
      linkId: link.id,
    },
    warnings,
  };
}
