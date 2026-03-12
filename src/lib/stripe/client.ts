import Stripe from 'stripe';
import { StripeSetupError } from './errors.js';

export function getStripeClient(): Stripe {
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeSetupError(
      'STRIPE_SECRET_KEY is not set',
      '#missing-api-key'
    );
  }
  if (!key.startsWith('sk_')) {
    throw new StripeSetupError(
      'STRIPE_SECRET_KEY must start with sk_ (secret key). You may have pasted a publishable key (pk_*) by mistake.',
      '#invalid-key-format'
    );
  }
  return new Stripe(key);
}
