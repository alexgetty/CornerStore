import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { ProductImage } from './types.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const PUBLIC_IMAGES_DIR = join(process.cwd(), 'public', 'products', 'images');

export function parseImageFilename(
  filename: string,
  catalogSkus: Set<string>,
): { sku: string; order: number | null } | null {
  const ext = extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const name = filename.slice(0, -ext.length);

  // Most specific: full filename matches a catalog SKU
  if (catalogSkus.has(name)) {
    return { sku: name, order: null };
  }

  // Last-hyphen split
  const lastHyphen = name.lastIndexOf('-');
  if (lastHyphen <= 0) return null;

  const prefix = name.slice(0, lastHyphen);
  const suffix = name.slice(lastHyphen + 1);

  if (!catalogSkus.has(prefix)) return null;

  // If suffix is purely numeric, it must be a valid positive order (no leading zeros, no zero)
  if (/^\d+$/.test(suffix)) {
    const order = parseInt(suffix, 10);
    if (order >= 1 && String(order) === suffix) {
      return { sku: prefix, order };
    }
    return null;
  }

  return { sku: prefix, order: null };
}

export async function loadProductImages(
  catalogSkus: Set<string>,
  dir?: string,
): Promise<Map<string, ProductImage[]>> {
  const imagesDir = dir ?? join(process.cwd(), 'products', 'images');
  const imageMap = new Map<string, { order: number | null; url: string; filename: string }[]>();

  let files: string[];
  try {
    files = ((await readdir(imagesDir)) as string[]).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return new Map();
    }
    throw err;
  }

  for (const filename of files) {
    const parsed = parseImageFilename(filename, catalogSkus);
    if (!parsed) {
      const ext = extname(filename).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        console.log(`[Catalog] Warning: products/images/${filename}: no matching SKU in catalog — skipped`);
      }
      continue;
    }

    const entries = imageMap.get(parsed.sku) ?? [];
    entries.push({
      order: parsed.order,
      url: `/products/images/${filename}`,
      filename,
    });
    imageMap.set(parsed.sku, entries);
  }

  if (imageMap.size > 0) {
    await mkdir(PUBLIC_IMAGES_DIR, { recursive: true });
    for (const [, entries] of imageMap) {
      for (const entry of entries) {
        await copyFile(
          join(imagesDir, entry.filename),
          join(PUBLIC_IMAGES_DIR, entry.filename),
        );
      }
    }
  }

  const result = new Map<string, ProductImage[]>();
  for (const [sku, entries] of imageMap) {
    const ordered = entries
      .filter((e): e is typeof e & { order: number } => e.order !== null)
      .sort((a, b) => a.order - b.order);
    const unordered = entries
      .filter((e) => e.order === null)
      .sort((a, b) => a.filename.localeCompare(b.filename));
    result.set(sku, [...ordered, ...unordered].map((e) => ({ url: e.url, filename: e.filename })));
  }

  return result;
}
