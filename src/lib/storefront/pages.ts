import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { PageData, StoreConfig } from './types.js';
import { getErrorMessage } from './utils.js';

export const PAGES_DIR = join(process.cwd(), 'pages');

function findNavLabel(slug: string, config: StoreConfig): string | undefined {
  const navItem = config.nav.find((item) => item.page === slug);
  if (navItem) return navItem.label;
  const footerItem = config.footerNav.find((item) => item.page === slug);
  if (footerItem) return footerItem.label;
  return undefined;
}

export async function loadPages(config: StoreConfig): Promise<Map<string, PageData>> {
  const pages = new Map<string, PageData>();

  let files: string[];
  try {
    files = ((await readdir(PAGES_DIR)) as string[]).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return pages;
    }
    throw err;
  }

  const mdxFiles = files.filter((f) => f.endsWith('.mdx'));

  for (const file of mdxFiles) {
    const slug = file.replace(/\.mdx$/, '');

    let raw: string;
    try {
      raw = await readFile(join(PAGES_DIR, file), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: pages/${file}: failed to read — ${getErrorMessage(err)}`);
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = matter(raw));
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: pages/${file}: failed to parse frontmatter — ${getErrorMessage(err)}`);
      continue;
    }

    const hasExplicitTitle = typeof data.title === 'string' && data.title.length > 0;
    const title = hasExplicitTitle
      ? data.title as string
      : findNavLabel(slug, config) ?? slug;

    pages.set(slug, { slug, title, hasExplicitTitle });
  }

  return pages;
}
