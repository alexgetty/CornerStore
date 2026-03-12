import { readdir, readFile, copyFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import matter from 'gray-matter';
import type { BundleConfig } from './types.js';
import { getErrorMessage } from './utils.js';

export const BUNDLES_DIR = join(process.cwd(), 'bundles');
export const BUNDLES_PUBLIC_DIR = join(process.cwd(), 'public', 'bundles');
export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);

export async function loadBundleConfigs(): Promise<Map<string, BundleConfig>> {
  const configs = new Map<string, BundleConfig>();

  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(BUNDLES_DIR, { withFileTypes: true });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return configs;
    }
    throw err;
  }

  const subdirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of subdirs) {
    const dirPath = join(BUNDLES_DIR, dir.name);
    let files: string[];
    try {
      files = ((await readdir(dirPath)) as string[]).sort();
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: bundles/${dir.name}: failed to read — ${getErrorMessage(err)}`);
      continue;
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));
    if (mdFiles.length === 0) continue;

    if (mdFiles.length > 1) {
      console.log(`[Storefront] Warning: bundles/${dir.name}: multiple .md files — using ${mdFiles[0]}, ignoring ${mdFiles.slice(1).join(', ')}`);
    }

    const mdFile = mdFiles[0]!;
    let content: string;
    try {
      content = await readFile(join(dirPath, mdFile), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: failed to read — ${getErrorMessage(err)}`);
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = matter(content));
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: failed to parse frontmatter — ${getErrorMessage(err)}`);
      continue;
    }

    if (!data.link || typeof data.link !== 'string') {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: missing required "link" field — skipped`);
      continue;
    }

    // Find image files in the directory
    const imageFiles = files.filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()));

    // Determine cover image
    let coverFile: string | undefined;
    if (data.cover) {
      if (imageFiles.includes(data.cover as string)) {
        coverFile = data.cover as string;
      } else {
        console.log(`[Storefront] Warning: bundles/${dir.name}: cover "${data.cover}" not found — falling back to first image`);
        coverFile = imageFiles[0];
      }
    } else {
      coverFile = imageFiles[0];
    }

    // Copy images to public/bundles/<dirname>/
    if (imageFiles.length > 0) {
      try {
        const outDir = join(BUNDLES_PUBLIC_DIR, dir.name);
        await mkdir(outDir, { recursive: true });
        for (const img of imageFiles) {
          await copyFile(join(dirPath, img), join(outDir, img));
        }
      } catch (err: unknown) {
        console.log(`[Storefront] Warning: bundles/${dir.name}: failed to copy images — ${getErrorMessage(err)}`);
      }
    }

    const resolvedImage = coverFile ? `/bundles/${dir.name}/${coverFile}` : undefined;

    const config: BundleConfig = {
      link: data.link as string,
      ...(typeof data.title === 'string' && data.title ? { title: data.title } : {}),
      ...(typeof data.description === 'string' && data.description ? { description: data.description } : {}),
      ...(resolvedImage ? { image: resolvedImage } : {}),
      ...(typeof data.image_alt === 'string' && data.image_alt ? { image_alt: data.image_alt } : {}),
    };

    if (configs.has(config.link)) {
      console.log(`[Storefront] Warning: bundles/${dir.name}/${mdFile}: duplicate link — already configured, skipping`);
      continue;
    }

    configs.set(config.link, config);
  }

  return configs;
}
