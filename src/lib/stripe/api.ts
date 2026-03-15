import type Stripe from 'stripe';
import { wrapStripeError } from './errors.js';

export async function listActivePaymentLinks(
  stripe: Stripe,
): Promise<Stripe.PaymentLink[]> {
  const links: Stripe.PaymentLink[] = [];
  try {
    for await (const link of stripe.paymentLinks.list({ active: true })) {
      links.push(link);
    }
  } catch (err) {
    wrapStripeError(err);
  }
  return links;
}

export async function listLinkLineItems(
  stripe: Stripe,
  linkId: string,
): Promise<Stripe.ApiList<Stripe.LineItem>> {
  return stripe.paymentLinks.listLineItems(linkId, {
    expand: ['data.price.product'],
    limit: 100,
  });
}
