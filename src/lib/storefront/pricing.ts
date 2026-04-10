export const DEFAULT_CURRENCY = 'usd';

function getCurrencyDecimalPlaces(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
    .resolvedOptions().maximumFractionDigits /* v8 ignore next -- always defined for currency */ ?? 2;
}

export function rawPriceToDecimal(rawPrice: number, currency: string): number {
  const decimals = getCurrencyDecimalPlaces(currency);
  return rawPrice / (10 ** decimals);
}

export function formatPrice(unitAmount: number | null, currency: string): string {
  const amount = unitAmount ?? 0;
  const value = rawPriceToDecimal(amount, currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(value);
}

export function decimalToRawPrice(decimalPrice: number, currency: string): number {
  const decimals = getCurrencyDecimalPlaces(currency);
  return Math.round(decimalPrice * (10 ** decimals));
}
