import type { Listing } from './types.js';
import type { CatalogProduct } from '../catalog/types.js';
import { formatPrice, decimalToRawPrice, DEFAULT_CURRENCY } from './pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import { loadProductImages } from '../catalog/images.js';
import { loadProductOverrides } from '../catalog/overrides.js';

async function buildListings(
  filter: (p: CatalogProduct) => boolean,
  label: string,
): Promise<Listing[]> {
  const catalog = await loadCatalog();
  const catalogSkus = new Set(catalog.map((p) => p.sku));
  const images = await loadProductImages(catalogSkus);
  const overrides = await loadProductOverrides(catalog);

  const filtered = catalog.filter(filter);

  const listings: Listing[] = filtered.map((product) => {
    const productImages = images.get(product.sku) ?? [];
    const override = overrides.get(product.sku);

    const listingImages = productImages.map((img) => ({
      url: img.url,
      alt: override?.imageAlts.get(img.filename) ?? '',
    }));

    const rawPrice = decimalToRawPrice(product.price, DEFAULT_CURRENCY);

    return {
      sku: product.sku,
      name: product.name,
      description: override?.description ?? product.description,
      images: listingImages,
      price: formatPrice(rawPrice, DEFAULT_CURRENCY),
      rawPrice,
      currency: DEFAULT_CURRENCY,
      category: product.category,
      status: product.status,
      paymentLink: product.paymentLink,
      moq: product.moq,
      featured: product.featured,
    };
  });

  for (const product of filtered) {
    if (!images.has(product.sku)) {
      console.log(`[Catalog] Warning: ${product.sku} has no images in products/images/`);
    }
  }

  if (listings.length > 0) {
    console.log(`[Catalog] Build complete: ${listings.length} ${label} product${listings.length === 1 ? '' : 's'}`);
  }

  return listings;
}

export async function getListings(): Promise<Listing[]> {
  return buildListings((p) => !p.hidden, 'storefront');
}
