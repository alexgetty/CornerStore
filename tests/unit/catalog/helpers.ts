import type { CatalogProduct } from '../../../src/lib/catalog/types.js';

export function makeCatalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    price: 19.99,
    category: null,
    status: null,
    hidden: false,
    description: null,
    paymentLink: null,
    moq: null,
    featured: false,
    ...overrides,
  };
}

export function makeCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const val = row[h] ?? '';
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',')),
  ];
  return lines.join('\n');
}

export function makeCSVRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    SKU: 'TEST-001',
    Name: 'Test Product',
    Price: '19.99',
    ...overrides,
  };
}
