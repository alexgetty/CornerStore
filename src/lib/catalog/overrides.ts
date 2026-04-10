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
    let content: string;
    try {
      content = await readFile(join(overridesDir, file), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Catalog] Warning: products/${file}: failed to read — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = matter(content));
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

    overrides.set(sku, {
      sku,
      description: typeof data.description === 'string' && data.description ? data.description : null,
      imageAlt: typeof data.image_alt === 'string' && data.image_alt ? data.image_alt : null,
    });
  }

  return overrides;
}
