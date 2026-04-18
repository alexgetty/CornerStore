export interface ValidationItem {
  sku: string;
  name: string;
  rawPrice: number;
  moq: number | null;
  quantity: number;
}

export interface ValidationError {
  type: 'moq' | 'min-cart' | 'empty-cart' | 'missing-name' | 'missing-email';
  message: string;
  sku?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
