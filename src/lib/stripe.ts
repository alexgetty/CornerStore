import Stripe from 'stripe';

export interface Product {
  name: string;
  description: string | null;
  image: string | null;
  price: string;
  paymentLink: string;
}

function getStripeClient(): Stripe {
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(key);
}

function formatPrice(unitAmount: number | null): string {
  const cents = unitAmount ?? 0;
  return `$${(cents / 100).toFixed(2)}`;
}

async function getPaymentLinkMap(
  stripe: Stripe
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for await (const link of stripe.paymentLinks.list({ active: true })) {
    const lineItems = await stripe.paymentLinks.listLineItems(link.id);
    for (const item of lineItems.data) {
      if (!item.price) continue;
      const priceId =
        typeof item.price === 'string' ? item.price : item.price.id;
      map.set(priceId, link.url);
    }
  }
  return map;
}

export async function getProducts(): Promise<Product[]> {
  const stripe = getStripeClient();
  const paymentLinkMap = await getPaymentLinkMap(stripe);
  const products: Product[] = [];

  for await (const product of stripe.products.list({
    active: true,
    expand: ['data.default_price'],
  })) {
    if (typeof product.default_price === 'string' || !product.default_price) {
      continue;
    }

    const paymentLink = paymentLinkMap.get(product.default_price.id);
    if (!paymentLink) {
      console.warn(
        `Skipping product "${product.name}": no payment link found for price ${product.default_price.id}`
      );
      continue;
    }

    products.push({
      name: product.name,
      description: product.description ?? null,
      image: product.images.length > 0 ? product.images[0]! : null,
      price: formatPrice(product.default_price.unit_amount),
      paymentLink,
    });
  }

  return products;
}
