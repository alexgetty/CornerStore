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
}

export interface CatalogValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ProductOverride {
  sku: string;
  description: string | null;
  imageAlt: string | null;
}

export interface ProductImage {
  url: string;
  filename: string;
}
