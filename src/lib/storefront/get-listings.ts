import type { Listing } from './types.js';
import { formatPrice, decimalToRawPrice } from './pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import { loadProductImages } from '../catalog/images.js';
import { loadProductOverrides } from '../catalog/overrides.js';

const CURRENCY = 'usd';

export async function getListings(): Promise<Listing[]> {
  const catalog = await loadCatalog();
  const images = await loadProductImages();
  const overrides = await loadProductOverrides(catalog);

  const storefrontProducts = catalog.filter((p) => p.storefront);

  const listings: Listing[] = storefrontProducts.map((product) => {
    const productImages = images.get(product.sku);
    const primaryImage = productImages?.[0] ?? null;
    const override = overrides.get(product.sku);

    const rawPrice = decimalToRawPrice(product.price, CURRENCY);

    return {
      sku: product.sku,
      name: product.name,
      description: override?.description ?? product.description,
      image: primaryImage,
      imageAlt: override?.imageAlt ?? product.name,
      price: formatPrice(rawPrice, CURRENCY),
      rawPrice,
      currency: CURRENCY,
      category: product.category,
      status: product.status,
      paymentLink: product.paymentLink,
    };
  });

  for (const product of storefrontProducts) {
    if (!images.has(product.sku)) {
      console.log(`[Catalog] Warning: ${product.sku} has no images in product-images/`);
    }
  }

  if (listings.length > 0) {
    console.log(`[Catalog] Build complete: ${listings.length} storefront product${listings.length === 1 ? '' : 's'}`);
  }

  return listings;
}
