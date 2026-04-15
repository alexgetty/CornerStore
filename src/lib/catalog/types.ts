export interface CatalogProduct {
  sku: string;
  name: string;
  price: number;
  category: string | null;
  status: string | null;
  storefront: boolean;
  orderSheet: boolean;
  description: string | null;
  paymentLink: string | null;
  moq: number | null;
}

export interface CatalogValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ProductOverride {
  sku: string;
  description: string | null;
  imageAlts: Map<string, string>;
}

export interface ProductImage {
  url: string;
  filename: string;
}
