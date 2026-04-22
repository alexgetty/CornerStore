import type { Listing } from './types.js';

export interface FilterOptions {
  featured?: boolean;
  categories?: string[];
}

export interface FilterResult {
  filtered: Listing[];
  warnings: string[];
}

export function filterListings(
  listings: Listing[],
  options: FilterOptions,
): FilterResult {
  const warnings: string[] = [];

  let result = listings;

  if (options.featured) {
    result = result.filter((l) => l.featured);
  }

  if (options.categories) {
    const cats = options.categories;
    result = result.filter((l) => l.category !== null && cats.includes(l.category));

    for (const cat of cats) {
      if (!result.some((l) => l.category === cat)) {
        warnings.push(`[Listings] Warning: category "${cat}" matched no products`);
      }
    }
  }

  return { filtered: result, warnings };
}
