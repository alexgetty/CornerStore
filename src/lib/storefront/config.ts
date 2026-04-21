import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { StoreConfig, NavItem, ResolvedNavItem, PageData } from './types.js';

export const CONFIG_FILENAME = 'cornerstore.config.js';

export function parseConfig(raw: unknown): StoreConfig {
  const obj = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;

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
  } else if (typeof obj.orderSheet === 'boolean' && obj.orderSheet && obj.listings === undefined) {
    config.listings = { views: ['card', 'table'] };
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

export function getNav(config: StoreConfig, pages: Map<string, PageData>): { nav: ResolvedNavItem[]; footerNav: ResolvedNavItem[] } {
  function filterAndResolve(items: NavItem[]): ResolvedNavItem[] {
    const result: ResolvedNavItem[] = [];
    for (const item of items) {
      if (item.path !== undefined) {
        result.push(resolveNavItem(item, config.home));
      } else if (item.dropdown !== undefined) {
        result.push(resolveNavItem(item, config.home));
      } else if (item.page !== undefined && pages.has(item.page)) {
        result.push(resolveNavItem(item, config.home));
      } else {
        console.warn(`[Storefront] Warning: nav references "${item.page}" but pages/${item.page}.mdx does not exist`);
      }
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
  try {
    const mod = await import(/* @vite-ignore */ pathToFileURL(configPath).href);
    return parseConfig(mod.default);
  } catch {
    return parseConfig(undefined);
  }
}
