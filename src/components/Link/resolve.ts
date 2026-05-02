import type { Category, PageData } from '../../lib/storefront';
import { slugify } from '../../lib/storefront/slugify';

export interface ResolveLinkArgs {
  category?: string | undefined;
  page?: string | undefined;
  categories: Category[];
  pages: Map<string, PageData>;
  home: string;
}

export interface ResolvedLink {
  label: string;
  href: string;
}

export function resolveLink(args: ResolveLinkArgs): ResolvedLink | null {
  const { category, page, categories, pages, home } = args;

  const hasCategory = typeof category === 'string' && category.length > 0;
  const hasPage = typeof page === 'string' && page.length > 0;

  if (hasCategory && hasPage) {
    console.warn('[Link] Warning: pass exactly one of `category` or `page`, not both. Rendering nothing.');
    return null;
  }
  if (!hasCategory && !hasPage) {
    console.warn('[Link] Warning: pass exactly one of `category` or `page`. Rendering nothing.');
    return null;
  }

  if (typeof category === 'string' && category.length > 0) {
    const found =
      categories.find((c) => c.name === category) ??
      categories.find((c) => c.slug === category) ??
      categories.find((c) => c.slug === slugify(category));
    if (!found) {
      console.warn(`[Link] Warning: category "${category}" not found. Rendering nothing.`);
      return null;
    }
    return { label: found.name, href: `/category/${found.slug}` };
  }

  if (typeof page === 'string' && page.length > 0) {
    const entry = pages.get(page);
    if (!entry) {
      console.warn(`[Link] Warning: page "${page}" not found. Rendering nothing.`);
      return null;
    }
    const href = page === home ? '/' : `/${page}`;
    return { label: entry.title, href };
  }

  return null;
}
