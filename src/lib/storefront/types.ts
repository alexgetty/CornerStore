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

export interface StoreConfig {
  name: string;
  home: string;
  nav: NavItem[];
  footerNav: NavItem[];
  contact?: string;
  logo?: string;
  orderSheet?: boolean;
  minCartSize?: number;
}

export interface PageData {
  slug: string;
  title: string;
  hasExplicitTitle: boolean;
  description: string | undefined;
}
