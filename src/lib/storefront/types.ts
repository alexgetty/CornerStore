export interface Listing {
  sku: string;
  name: string;
  description: string | null;
  images: { url: string; alt: string }[];
  price: string;
  rawPrice: number;
  currency: string;
  category: string | null;
  status: string | null;
  paymentLink: string | null;
  moq: number | null;
  featured: boolean;
}

export interface Category {
  name: string;
  slug: string;
  productCount: number;
}

export interface NavItem {
  label: string;
  page: string;
  path?: string;
}

export interface ResolvedNavItem {
  label: string;
  href: string;
}

export interface ListingsConfig {
  views: ('card' | 'table')[];
}

export interface StoreConfig {
  name: string;
  home: string;
  nav: NavItem[];
  footerNav: NavItem[];
  contact?: string;
  logo?: string;
  listings: ListingsConfig;
  minCartSize?: number;
  wholesaleMargin?: number;
  shippingFlat?: number;
  shippingFreeThreshold?: number;
  checkoutUrl?: string;
}

export interface PageData {
  slug: string;
  title: string;
  hasExplicitTitle: boolean;
  description: string | undefined;
}
