import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { StoreConfig, NavItem, ResolvedNavItem } from './types.js';

export const CONFIG_FILENAME = 'cornerstore.config.js';

export function parseConfig(raw: unknown): StoreConfig {
  const obj = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;

  return {
    name: typeof obj.name === 'string' && obj.name ? obj.name : 'My Store',
    home: typeof obj.home === 'string' && obj.home ? obj.home : 'home',
    nav: Array.isArray(obj.nav) ? obj.nav.filter(isValidNavItem) : [],
    footerNav: Array.isArray(obj.footerNav) ? obj.footerNav.filter(isValidNavItem) : [],
  };
}

function isValidNavItem(item: unknown): item is NavItem {
  if (item === null || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return typeof rec.label === 'string' && typeof rec.page === 'string';
}

export function resolveNavItem(item: NavItem, home: string): ResolvedNavItem {
  const href = item.path ?? (item.page === home ? '/' : `/${item.page}`);
  return { label: item.label, href };
}

export function getNav(config: StoreConfig): { nav: ResolvedNavItem[]; footerNav: ResolvedNavItem[] } {
  return {
    nav: config.nav.map(item => resolveNavItem(item, config.home)),
    footerNav: config.footerNav.map(item => resolveNavItem(item, config.home)),
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
