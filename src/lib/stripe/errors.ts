export class StripeSetupError extends Error {
  guidance: string;

  constructor(message: string, guidance: string, cause?: Error) {
    super(
      `[Storefront] ${message}\n  → See SETUP.md${guidance} for steps to fix this.`
    );
    this.name = 'StripeSetupError';
    this.guidance = guidance;
    if (cause) {
      this.cause = cause;
    }
  }
}

export const STRIPE_ERROR_MAP: Record<string, { message: string; guidance: string }> =
  {
    StripeAuthenticationError: {
      message: 'Invalid API key',
      guidance: '#invalid-api-key',
    },
    StripePermissionError: {
      message: 'API key lacks required permissions',
      guidance: '#insufficient-permissions',
    },
    StripeConnectionError: {
      message: 'Cannot reach Stripe API',
      guidance: '#connection-error',
    },
    StripeRateLimitError: {
      message: 'Too many requests — try again shortly',
      guidance: '#rate-limit',
    },
    StripeInvalidRequestError: {
      message: 'Invalid API request — possible SDK version mismatch',
      guidance: '#invalid-request',
    },
    StripeAPIError: {
      message:
        'Stripe internal error — try again, contact Stripe support if persistent',
      guidance: '#stripe-api-error',
    },
  };

export function wrapStripeError(err: unknown): never {
  if (err instanceof Error && 'type' in err && typeof (err as { type: unknown }).type === 'string') {
    const mapping = STRIPE_ERROR_MAP[(err as { type: string }).type];
    if (mapping) {
      throw new StripeSetupError(mapping.message, mapping.guidance, err);
    }
  }
  throw err;
}
