import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const PUBLIC_IMAGES_DIR = join(process.cwd(), 'public', 'product-images');

export function parseImageFilename(filename: string): { sku: string; order: number } | null {
  const ext = extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const name = filename.slice(0, -ext.length);
  const lastHyphen = name.lastIndexOf('-');
  if (lastHyphen <= 0) return null;

  const sku = name.slice(0, lastHyphen);
  const orderStr = name.slice(lastHyphen + 1);
  const order = parseInt(orderStr, 10);

  if (isNaN(order) || order < 1 || String(order) !== orderStr) return null;

  return { sku, order };
}

export async function loadProductImages(
  dir?: string,
): Promise<Map<string, string[]>> {
  const imagesDir = dir ?? join(process.cwd(), 'product-images');
  const imageMap = new Map<string, { order: number; webPath: string; filename: string }[]>();

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
    const parsed = parseImageFilename(filename);
    if (!parsed) continue;

    const entries = imageMap.get(parsed.sku) ?? [];
    entries.push({
      order: parsed.order,
      webPath: `/product-images/${filename}`,
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

  const result = new Map<string, string[]>();
  for (const [sku, entries] of imageMap) {
    entries.sort((a, b) => a.order - b.order);
    result.set(sku, entries.map((e) => e.webPath));
  }

  return result;
}
