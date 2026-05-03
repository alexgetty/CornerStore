import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogProduct, CatalogValidationError } from './types.js';

export const CATALOG_PATH = join(process.cwd(), 'products', 'catalog.csv');

export class CatalogError extends Error {
  constructor(public readonly issues: CatalogValidationError[]) {
    const summary = issues
      .map((e) => `Row ${e.row}, ${e.field}: ${e.message}`)
      .join('; ');
    super(
      `Catalog validation failed (${issues.length} issue${issues.length === 1 ? '' : 's'}): ${summary}`,
    );
    this.name = 'CatalogError';
  }
}

const SKU_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PRICE_PATTERN = /^\d+(\.\d+)?$/;
const MAX_NAME_LENGTH = 250;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PRICE = 999999.99;
const MIN_PRICE = 0.01;

function parseRow(
  row: Record<string, string>,
  rowNum: number,
  seenSkus: Set<string>,
  seenCategories: Map<string, { original: string; row: number }>,
): { errors: CatalogValidationError[]; product: CatalogProduct } {
  const errors: CatalogValidationError[] = [];

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

  let price = 0;
  if (!priceStr) {
    errors.push({ row: rowNum, field: 'Price', message: 'required' });
  } else if (!PRICE_PATTERN.test(priceStr)) {
    errors.push({ row: rowNum, field: 'Price', message: 'must be a positive number' });
  } else {
    price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      errors.push({ row: rowNum, field: 'Price', message: 'must be a positive number' });
    } else if (price < MIN_PRICE) {
      errors.push({ row: rowNum, field: 'Price', message: `must be at least ${MIN_PRICE}` });
    } else if (price > MAX_PRICE) {
      errors.push({ row: rowNum, field: 'Price', message: `exceeds maximum of ${MAX_PRICE}` });
    }
  }

  const description = row['Description']?.trim() || null;
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push({ row: rowNum, field: 'Description', message: `exceeds ${MAX_DESCRIPTION_LENGTH} characters` });
  }

  const rawCategory = row['Category'] ?? '';
  const normalizedCategory = rawCategory.trim().toLowerCase();
  if (normalizedCategory) {
    const seen = seenCategories.get(normalizedCategory);
    if (seen && seen.original !== rawCategory) {
      errors.push({
        row: rowNum,
        field: 'Category',
        message: `Category "${rawCategory}" conflicts with "${seen.original}" on row ${seen.row}`,
      });
    } else if (!seen) {
      seenCategories.set(normalizedCategory, { original: rawCategory, row: rowNum });
    }
  }

  const hiddenVal = (row['Hidden'] ?? '').trim().toLowerCase();

  const featuredVal = (row['Featured'] ?? '').trim().toLowerCase();

  const moqStr = (row['MOQ'] ?? '').trim();
  let moq: number | null = null;
  if (moqStr && moqStr !== '0') {
    const moqNum = Number(moqStr);
    if (!Number.isInteger(moqNum) || moqNum < 1) {
      errors.push({ row: rowNum, field: 'MOQ', message: 'must be a positive whole number' });
    } else {
      moq = moqNum;
    }
  }

  const product: CatalogProduct = {
    sku,
    name,
    price,
    category: row['Category']?.trim() || null,
    status: row['Status']?.trim() || null,
    hidden: hiddenVal === 'true' || hiddenVal === 'yes',
    description,
    paymentLink: row['Payment Link']?.trim() || null,
    moq,
    featured: featuredVal === 'true' || featuredVal === 'yes',
  };

  return { errors, product };
}

export function validateRows(
  records: Record<string, string>[],
): { products: CatalogProduct[]; errors: CatalogValidationError[] } {
  const allErrors: CatalogValidationError[] = [];
  const products: CatalogProduct[] = [];
  const seenSkus = new Set<string>();
  const seenCategories = new Map<string, { original: string; row: number }>();

  for (let i = 0; i < records.length; i++) {
    const { errors, product } = parseRow(records[i]!, i + 2, seenSkus, seenCategories);
    if (errors.length > 0) {
      allErrors.push(...errors);
    } else {
      products.push(product);
    }
  }

  return { products, errors: allErrors };
}

export async function loadCatalog(
  path?: string,
  options?: { lenient?: boolean },
): Promise<CatalogProduct[]> {
  const csvPath = path ?? CATALOG_PATH;
  const content = await readFile(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  const { products, errors } = validateRows(records);

  const lenient =
    options?.lenient === true ||
    process.env.CORNER_STORE_CATALOG_LENIENT === '1';

  if (errors.length > 0) {
    if (lenient) {
      for (const e of errors) {
        console.log(`[Catalog] Warning: Row ${e.row}, ${e.field}: ${e.message} — skipped`);
      }
    } else {
      throw new CatalogError(errors);
    }
  }

  return products;
}
