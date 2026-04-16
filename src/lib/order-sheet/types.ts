export interface OrderSheetItem {
  sku: string;
  name: string;
  rawPrice: number;
  moq: number | null;
  quantity: number;
}

export interface OrderValidationError {
  type: 'moq' | 'min-cart' | 'empty-cart' | 'missing-name' | 'missing-email';
  message: string;
  sku?: string;
}

export interface OrderValidation {
  valid: boolean;
  errors: OrderValidationError[];
}
