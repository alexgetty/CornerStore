export interface StripeProductData {
  name: string;
  description: string | null;
  image: string | null;
  imageAlt: string;
  rawPrice: number;
  currency: string;
}

export interface SingleListing {
  kind: 'single';
  name: string;
  description: string | null;
  image: string | null;
  imageAlt: string;
  price: string;
  rawPrice: number;
  currency: string;
  paymentLink: string;
}

export interface BundleListing {
  kind: 'bundle';
  name: string;
  description: string | null;
  image: string | null;
  imageAlt: string;
  price: string | null;
  rawPrice: number | null;
  currency: string | null;
  paymentLink: string;
}

export type Listing = SingleListing | BundleListing;

export interface BundleConfig {
  link: string;
  title?: string;
  description?: string;
  image?: string;
  image_alt?: string;
}

export interface LinkWarning {
  linkUrl: string;
  reason: string;
}

export interface PaymentLink {
  id: string;
  url: string;
}

export type PendingBundle = Omit<BundleListing, 'name'> & {
  suffix: string;
  config: BundleConfig | undefined;
  linkId: string;
};

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
}

export interface PageData {
  slug: string;
  title: string;
  hasExplicitTitle: boolean;
}
