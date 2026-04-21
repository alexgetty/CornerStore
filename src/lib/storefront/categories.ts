import type { Category, Listing } from './types.js';
import { slugify } from './slugify.js';
import { getListings } from './get-listings.js';

export function extractCategories(listings: Listing[]): Category[] {
  const counts = new Map<string, number>();

  for (const listing of listings) {
    if (listing.category === null) continue;
    counts.set(listing.category, (counts.get(listing.category) ?? 0) + 1);
  }

  const categories: Category[] = [];
  for (const [name, productCount] of counts) {
    categories.push({ name, slug: slugify(name), productCount });
  }

  categories.sort((a, b) => a.name.localeCompare(b.name));
  return categories;
}

export async function getCategories(): Promise<Category[]> {
  const listings = await getListings();
  return extractCategories(listings);
}
