import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogProduct, CatalogValidationError } from './types.js';

export const CATALOG_PATH = join(process.cwd(), 'catalog.csv');

const SKU_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_NAME_LENGTH = 250;

export function validateRows(
  records: Record<string, string>[],
): { products: CatalogProduct[]; errors: CatalogValidationError[] } {
  const errors: CatalogValidationError[] = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;

    const sku = (row['SKU'] ?? '').trim();
    const name = (row['Name'] ?? '').trim();
    const priceStr = (row['Price'] ?? '').trim();

    if (!sku) {
      errors.push({ row: rowNum, field: 'SKU', message: 'required' });
    } else if (!SKU_PATTERN.test(sku)) {
      errors.push({ row: rowNum, field: 'SKU', message: 'must contain only alphanumeric characters, hyphens, and underscores' });
    } else if (seenSkus.has(sku)) {
      errors.push({ row: rowNum, field: 'SKU', message: `duplicate SKU "${sku}"` });
    }
    if (sku) seenSkus.add(sku);

    if (!name) {
      errors.push({ row: rowNum, field: 'Name', message: 'required' });
    } else if (name.length > MAX_NAME_LENGTH) {
      errors.push({ row: rowNum, field: 'Name', message: `exceeds ${MAX_NAME_LENGTH} characters` });
    }

    if (!priceStr) {
      errors.push({ row: rowNum, field: 'Price', message: 'required' });
    } else {
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) {
        errors.push({ row: rowNum, field: 'Price', message: 'must be a positive number' });
      }
    }
  }

  if (errors.length > 0) return { products: [], errors };

  const products: CatalogProduct[] = records.map((row) => {
    const storefrontVal = (row['Storefront'] ?? '').trim().toLowerCase();
    const orderSheetVal = (row['Order Sheet'] ?? '').trim().toLowerCase();
    return {
      sku: row['SKU']!.trim(),
      name: row['Name']!.trim(),
      price: parseFloat(row['Price']!.trim()),
      category: row['Category']?.trim() || null,
      status: row['Status']?.trim() || null,
      storefront: storefrontVal !== 'no',
      orderSheet: orderSheetVal !== 'no',
      description: row['Description']?.trim() || null,
      paymentLink: row['Payment Link']?.trim() || null,
    };
  });

  return { products, errors };
}

export async function loadCatalog(path?: string): Promise<CatalogProduct[]> {
  const csvPath = path ?? CATALOG_PATH;
  const content = await readFile(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  const { products, errors } = validateRows(records);

  if (errors.length > 0) {
    const lines = errors.map(
      (e) => `  Row ${e.row}, ${e.field}: ${e.message}`
    ).join('\n');
    throw new Error(`[Catalog] Validation failed:\n${lines}`);
  }

  return products;
}
