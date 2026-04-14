const RETRYABLE_STRIPE_TYPES = new Set([
  'StripeConnectionError',
  'StripeRateLimitError',
  'StripeAPIError',
]);

function isRetryable(err: unknown): boolean {
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string'
  ) {
    return RETRYABLE_STRIPE_TYPES.has((err as { type: string }).type);
  }
  return true;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  if (maxAttempts < 1) {
    throw new Error('maxAttempts must be >= 1');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * (2 ** (attempt - 1));
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
