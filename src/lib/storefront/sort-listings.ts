import type { Listing } from './types.js';

export interface SortOptions {
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface SortResult {
  sorted: Listing[];
  warnings: string[];
}

export function sortListings(
  listings: Listing[],
  options: SortOptions,
): SortResult {
  const warnings: string[] = [];

  if (!options.sort || listings.length === 0) {
    return { sorted: [...listings], warnings };
  }

  const key = options.sort === 'price' ? 'rawPrice' : options.sort;
  const hasKey = listings.some((l) => key in l && (l as unknown as Record<string, unknown>)[key] !== null);

  if (!(key in listings[0]!)) {
    warnings.push(`[Listings] Warning: sort key "${key}" not found on any listing`);
    return { sorted: [...listings], warnings };
  }

  const direction = options.order === 'desc' ? -1 : 1;

  const sorted = [...listings].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[key];
    const bVal = (b as unknown as Record<string, unknown>)[key];

    const aNull = aVal === null || aVal === undefined;
    const bNull = bVal === null || bVal === undefined;

    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * direction;
    }

    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      return ((aVal === bVal) ? 0 : aVal ? 1 : -1) * direction;
    }

    return String(aVal).localeCompare(String(bVal)) * direction;
  });

  return { sorted, warnings };
}
