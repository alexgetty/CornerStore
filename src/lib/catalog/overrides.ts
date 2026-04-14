import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { CatalogProduct, ProductOverride } from './types.js';

const PRODUCTS_DIR = join(process.cwd(), 'products');

export async function loadProductOverrides(
  catalog: CatalogProduct[],
  dir?: string,
): Promise<Map<string, ProductOverride>> {
  const overridesDir = dir ?? PRODUCTS_DIR;
  const overrides = new Map<string, ProductOverride>();
  const catalogSkus = new Set(catalog.map((p) => p.sku));
  const sourceFiles = new Map<string, string>();

  let files: string[];
  try {
    files = ((await readdir(overridesDir)) as string[]).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return overrides;
    }
    throw err;
  }

  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const file of mdFiles) {
    let raw: string;
    try {
      raw = await readFile(join(overridesDir, file), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Catalog] Warning: products/${file}: failed to read — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let data: Record<string, unknown>;
    let content: string;
    try {
      ({ data, content } = matter(raw));
    } catch (err: unknown) {
      console.log(`[Catalog] Warning: products/${file}: failed to parse frontmatter — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (!data.sku || typeof data.sku !== 'string') {
      console.log(`[Catalog] Warning: products/${file}: missing required "sku" field — skipped`);
      continue;
    }

    const sku = data.sku.trim();

    if (!catalogSkus.has(sku)) {
      console.log(`[Catalog] Warning: products/${file}: SKU "${sku}" has no matching product in catalog — skipped`);
      continue;
    }

    if (sourceFiles.has(sku)) {
      console.log(`[Catalog] Warning: products/${file}: duplicate override for SKU "${sku}" (already defined in products/${sourceFiles.get(sku)}) — using this one`);
    }

    const imageAlts = new Map<string, string>();
    if (data.image_alts && typeof data.image_alts === 'object' && !Array.isArray(data.image_alts)) {
      for (const [key, value] of Object.entries(data.image_alts as Record<string, unknown>)) {
        if (typeof value === 'string') {
          imageAlts.set(key, value);
        }
      }
    }

    const trimmed = content.trim();
    const description = trimmed.length > 0 ? trimmed : null;

    if (description) {
      console.log(`[Catalog] ${sku}: using rich description from products/${file} (CSV description still used for Stripe)`);
    }

    sourceFiles.set(sku, file);
    overrides.set(sku, { sku, description, imageAlts });
  }

  return overrides;
}
