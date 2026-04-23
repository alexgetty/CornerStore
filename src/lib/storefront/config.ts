import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { StoreConfig, NavItem, ResolvedNavItem, PageData, Category } from './types.js';

export const CONFIG_FILENAME = 'cornerstore.config.js';

let checkoutUrlWarningEmitted = false;

export function parseConfig(raw: unknown): StoreConfig {
  const obj = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;

  let checkoutMode: 'pdf' | 'stripe' = 'pdf';
  if ('checkout' in obj) {
    if (obj.checkout === 'pdf' || obj.checkout === 'stripe') {
      checkoutMode = obj.checkout;
    } else {
      throw new Error(
        `[Storefront] Invalid checkout value: ${JSON.stringify(obj.checkout)}. checkout must be 'pdf' or 'stripe'.`,
      );
    }
  }

  const config: StoreConfig = {
    name: typeof obj.name === 'string' && obj.name ? obj.name : 'My Store',
    home: typeof obj.home === 'string' && obj.home ? obj.home : 'home',
    nav: Array.isArray(obj.nav)
      ? obj.nav.map(parseNavItem).filter((item): item is NavItem => item !== null)
      : [],
    footerNav: Array.isArray(obj.footerNav)
      ? obj.footerNav.map(parseNavItem).filter((item): item is NavItem => item !== null)
      : [],
    listings: { views: ['card'] },
    checkout: checkoutMode,
  };

  if (typeof obj.contact === 'string' && obj.contact) {
    config.contact = obj.contact;
  }

  if (typeof obj.logo === 'string' && obj.logo) {
    config.logo = obj.logo;
  }

  const VALID_VIEWS = ['card', 'table'] as const;
  type View = typeof VALID_VIEWS[number];

  if (
    obj.listings !== null &&
    typeof obj.listings === 'object' &&
    !Array.isArray(obj.listings)
  ) {
    const listingsObj = obj.listings as Record<string, unknown>;
    if (Array.isArray(listingsObj.views)) {
      const filtered = listingsObj.views.filter(
        (v: unknown): v is View =>
          typeof v === 'string' && (VALID_VIEWS as readonly string[]).includes(v),
      );
      if (filtered.length > 0) {
        config.listings = { views: filtered };
      }
    }
  }

  if (typeof obj.minCartSize === 'number' && obj.minCartSize > 0) {
    config.minCartSize = obj.minCartSize;
  }

  if (typeof obj.wholesaleMargin === 'number' && obj.wholesaleMargin > 0 && obj.wholesaleMargin < 1) {
    config.wholesaleMargin = obj.wholesaleMargin;
  }

  if (typeof obj.shippingFlat === 'number' && obj.shippingFlat > 0) {
    config.shippingFlat = obj.shippingFlat;
  }

  if (typeof obj.shippingFreeThreshold === 'number' && obj.shippingFreeThreshold > 0) {
    config.shippingFreeThreshold = obj.shippingFreeThreshold;
  }

  if (typeof obj.checkoutUrl === 'string' && obj.checkoutUrl) {
    config.checkoutUrl = obj.checkoutUrl;
  }

  if (config.checkout === 'stripe' && !config.checkoutUrl && !checkoutUrlWarningEmitted) {
    checkoutUrlWarningEmitted = true;
    console.warn(
      "[Storefront] checkout mode is 'stripe' but checkoutUrl is not set; cart will fall back to PDF until you configure it.",
    );
  }

  return config;
}

function parseNavItem(item: unknown): NavItem | null {
  if (item === null || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;

  if (typeof rec.label !== 'string') return null;

  const result: NavItem = { label: rec.label };

  if (typeof rec.page === 'string') result.page = rec.page;
  if (typeof rec.path === 'string') result.path = rec.path;

  if (rec.dropdown === 'categories') {
    result.dropdown = 'categories';
  } else if (Array.isArray(rec.dropdown)) {
    const filtered = rec.dropdown.filter(
      (v: unknown): v is string => typeof v === 'string',
    );
    if (filtered.length > 0) result.dropdown = filtered;
  }

  if (result.page === undefined && result.path === undefined && result.dropdown === undefined) {
    return null;
  }

  return result;
}

export function resolveNavItem(item: NavItem, home: string): ResolvedNavItem {
  const href = item.path ?? (item.page === home ? '/' : `/${item.page}`);
  return { label: item.label, href };
}

export interface CategoryNavData {
  catalogCategories: Category[];
  customCategoryPages: Map<string, PageData>;
}

export function getNav(
  config: StoreConfig,
  pages: Map<string, PageData>,
  categoryData?: CategoryNavData,
): { nav: ResolvedNavItem[]; footerNav: ResolvedNavItem[] } {

  function resolveDropdownChildren(dropdown: 'categories' | string[]): ResolvedNavItem[] {
    if (dropdown === 'categories') {
      if (!categoryData) return [];

      const { catalogCategories, customCategoryPages } = categoryData;
      const catalogSlugs = new Set(catalogCategories.map(c => c.slug));

      const customEntries: ResolvedNavItem[] = [];
      for (const [slug, catPage] of customCategoryPages) {
        if (!catalogSlugs.has(slug)) {
          customEntries.push({ label: catPage.title, href: `/category/${slug}` });
        }
      }
      customEntries.sort((a, b) => a.label.localeCompare(b.label));

      const catalogEntries: ResolvedNavItem[] = [];
      for (const cat of catalogCategories) {
        const override = customCategoryPages.get(cat.slug);
        catalogEntries.push({
          label: override ? override.title : cat.name,
          href: `/category/${cat.slug}`,
        });
      }

      return [...customEntries, ...catalogEntries];
    }

    const children: ResolvedNavItem[] = [];
    for (const pageName of dropdown) {
      const p = pages.get(pageName);
      if (p) {
        children.push({
          label: p.title,
          href: pageName === config.home ? '/' : `/${pageName}`,
        });
      } else {
        console.warn(`[Storefront] Warning: dropdown references "${pageName}" but pages/${pageName}.mdx does not exist`);
      }
    }
    return children;
  }

  function filterAndResolve(items: NavItem[]): ResolvedNavItem[] {
    const result: ResolvedNavItem[] = [];
    for (const item of items) {
      let href: string | undefined;

      if (item.path !== undefined) {
        href = item.path;
      } else if (item.page !== undefined) {
        if (pages.has(item.page)) {
          href = item.page === config.home ? '/' : `/${item.page}`;
        } else if (!item.dropdown) {
          console.warn(`[Storefront] Warning: nav references "${item.page}" but pages/${item.page}.mdx does not exist`);
          continue;
        }
      }

      let children: ResolvedNavItem[] | undefined;
      if (item.dropdown) {
        const resolved = resolveDropdownChildren(item.dropdown);
        if (resolved.length > 0) children = resolved;
      }

      if (href === undefined && !children) {
        continue;
      }

      const resolved: ResolvedNavItem = { label: item.label };
      if (href !== undefined) resolved.href = href;
      if (children) resolved.children = children;
      result.push(resolved);
    }
    return result;
  }

  return {
    nav: filterAndResolve(config.nav),
    footerNav: filterAndResolve(config.footerNav),
  };
}

export async function loadConfig(): Promise<StoreConfig> {
  const configPath = join(process.cwd(), CONFIG_FILENAME);
  let mod: { default?: unknown };
  try {
    mod = await import(/* @vite-ignore */ pathToFileURL(configPath).href);
  } catch {
    return parseConfig(undefined);
  }
  return parseConfig(mod.default);
}
