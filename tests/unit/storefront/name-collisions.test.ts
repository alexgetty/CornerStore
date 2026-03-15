import { describe, it, expect } from 'vitest';
import { findUniqueName, resolveBundleNames } from '../../../src/lib/storefront/name-collisions.js';
import type { PendingBundle, BundleConfig } from '../../../src/lib/storefront/types.js';

function makePendingBundle(overrides: Partial<PendingBundle> = {}): PendingBundle {
  return {
    kind: 'bundle',
    description: 'auto description',
    image: null,
    imageAlt: '',
    price: '$10.00',
    rawPrice: 1000,
    currency: 'usd',
    paymentLink: 'https://buy.stripe.com/test',
    suffix: 'abcd',
    config: undefined,
    linkId: 'plink_abcd',
    ...overrides,
  };
}

describe('findUniqueName', () => {
  it('returns "baseName 2" for first collision', () => {
    const used = new Set(['Bundle abc']);
    expect(findUniqueName('Bundle abc', used)).toBe('Bundle abc 2');
  });

  it('skips taken numbers', () => {
    const used = new Set(['Bundle abc', 'Bundle abc 2']);
    expect(findUniqueName('Bundle abc', used)).toBe('Bundle abc 3');
  });

  it('skips multiple taken numbers', () => {
    const used = new Set(['Bundle abc', 'Bundle abc 2', 'Bundle abc 3']);
    expect(findUniqueName('Bundle abc', used)).toBe('Bundle abc 4');
  });
});

describe('resolveBundleNames', () => {
  it('assigns auto-generated name from suffix', () => {
    const pending = makePendingBundle({ suffix: 'x1y2', linkId: 'plink_x1y2' });

    const { listings } = resolveBundleNames([pending]);

    expect(listings.get(pending)!.name).toBe('Bundle x1y2');
  });

  it('uses config title when present', () => {
    const config: BundleConfig = { link: 'https://buy.stripe.com/test', title: 'Holiday Set' };
    const pending = makePendingBundle({ config, linkId: 'plink_abc' });

    const { listings } = resolveBundleNames([pending]);

    expect(listings.get(pending)!.name).toBe('Holiday Set');
  });

  it('sorts by link ID for deterministic ordering', () => {
    const a = makePendingBundle({
      suffix: 'a3f9',
      linkId: 'plink_aaaaa3f9',
      paymentLink: 'https://buy.stripe.com/zzz',
    });
    const b = makePendingBundle({
      suffix: 'a3f9',
      linkId: 'plink_bbbba3f9',
      paymentLink: 'https://buy.stripe.com/aaa',
    });

    const { listings } = resolveBundleNames([b, a]);

    // plink_aaaa sorts first → gets bare name
    expect(listings.get(a)!.name).toBe('Bundle a3f9');
    expect(listings.get(b)!.name).toBe('Bundle a3f9 2');
  });

  it('keeps first bare and suffixes subsequent for auto-generated collisions', () => {
    const a = makePendingBundle({ suffix: 'a3f9', linkId: 'plink_xxxxa3f9', paymentLink: 'https://buy.stripe.com/xxxx' });
    const b = makePendingBundle({ suffix: 'a3f9', linkId: 'plink_yyyya3f9', paymentLink: 'https://buy.stripe.com/yyyy' });

    const { listings, warnings } = resolveBundleNames([a, b]);

    const names = [...listings.values()].map((l) => l.name);
    expect(names).toContain('Bundle a3f9');
    expect(names).toContain('Bundle a3f9 2');
    expect(warnings.some((w) => w.reason.includes('display name collision'))).toBe(true);
  });

  it('handles three-way collision', () => {
    const bundles = Array.from({ length: 3 }, (_, i) =>
      makePendingBundle({
        suffix: 'a3f9',
        linkId: `plink_${String(i).padStart(4, '0')}a3f9`,
        paymentLink: `https://buy.stripe.com/${String(i).padStart(4, '0')}`,
      })
    );

    const { listings } = resolveBundleNames(bundles);

    const names = bundles.map((b) => listings.get(b)!.name);
    expect(names).toEqual(['Bundle a3f9', 'Bundle a3f9 2', 'Bundle a3f9 3']);
  });

  it('resolves independent collision groups without interference', () => {
    const a1 = makePendingBundle({ suffix: 'aaaa', linkId: 'plink_1111aaaa', paymentLink: 'https://buy.stripe.com/a1' });
    const a2 = makePendingBundle({ suffix: 'aaaa', linkId: 'plink_2222aaaa', paymentLink: 'https://buy.stripe.com/a2' });
    const b1 = makePendingBundle({ suffix: 'bbbb', linkId: 'plink_3333bbbb', paymentLink: 'https://buy.stripe.com/b1' });
    const b2 = makePendingBundle({ suffix: 'bbbb', linkId: 'plink_4444bbbb', paymentLink: 'https://buy.stripe.com/b2' });

    const { listings } = resolveBundleNames([a1, a2, b1, b2]);

    expect(listings.get(a1)!.name).toBe('Bundle aaaa');
    expect(listings.get(a2)!.name).toBe('Bundle aaaa 2');
    expect(listings.get(b1)!.name).toBe('Bundle bbbb');
    expect(listings.get(b2)!.name).toBe('Bundle bbbb 2');
  });

  it('disambiguates user-defined title collisions with warning', () => {
    const configA: BundleConfig = { link: 'https://buy.stripe.com/aaa', title: 'Holiday Set' };
    const configB: BundleConfig = { link: 'https://buy.stripe.com/bbb', title: 'Holiday Set' };
    const a = makePendingBundle({ config: configA, linkId: 'plink_aaa1', paymentLink: 'https://buy.stripe.com/aaa' });
    const b = makePendingBundle({ config: configB, linkId: 'plink_bbb2', paymentLink: 'https://buy.stripe.com/bbb' });

    const { listings, warnings } = resolveBundleNames([a, b]);

    expect(listings.get(a)!.name).toBe('Holiday Set');
    expect(listings.get(b)!.name).toBe('Holiday Set 2');
    expect(warnings.some((w) => w.reason.includes('duplicate bundle title'))).toBe(true);
    // Winner should not have a collision warning
    expect(warnings.filter((w) => w.linkUrl === 'https://buy.stripe.com/aaa')).toHaveLength(0);
  });

  it('gives user-defined titles priority over auto-generated in cross-type collision', () => {
    const config: BundleConfig = { link: 'https://buy.stripe.com/aaa', title: 'Bundle a3f9' };
    const configured = makePendingBundle({
      config,
      suffix: 'a3f9',
      linkId: 'plink_xxxxa3f9',
      paymentLink: 'https://buy.stripe.com/aaa',
    });
    const auto = makePendingBundle({
      suffix: 'a3f9',
      linkId: 'plink_yyyya3f9',
      paymentLink: 'https://buy.stripe.com/bbb',
    });

    const { listings, warnings } = resolveBundleNames([configured, auto]);

    expect(listings.get(configured)!.name).toBe('Bundle a3f9');
    expect(listings.get(auto)!.name).toBe('Bundle a3f9 2');
    expect(warnings.some((w) => w.reason.includes('collides with configured title'))).toBe(true);
  });

  it('no collision when configured and unconfigured have different names', () => {
    const config: BundleConfig = { link: 'https://buy.stripe.com/aaa', title: 'Holiday Set' };
    const configured = makePendingBundle({
      config,
      suffix: 'a3f9',
      linkId: 'plink_xxxxa3f9',
      paymentLink: 'https://buy.stripe.com/aaa',
    });
    const auto = makePendingBundle({
      suffix: 'a3f9',
      linkId: 'plink_yyyya3f9',
      paymentLink: 'https://buy.stripe.com/bbb',
    });

    const { warnings } = resolveBundleNames([configured, auto]);

    expect(warnings.filter((w) => w.reason.includes('collision'))).toHaveLength(0);
  });

  it('skips suffix numbers already taken by existing names', () => {
    const configA: BundleConfig = { link: 'https://buy.stripe.com/aaa', title: 'Holiday Set' };
    const configB: BundleConfig = { link: 'https://buy.stripe.com/bbb', title: 'Holiday Set' };
    const configC: BundleConfig = { link: 'https://buy.stripe.com/ccc', title: 'Holiday Set 2' };
    const a = makePendingBundle({ config: configA, linkId: 'plink_aaa1', paymentLink: 'https://buy.stripe.com/aaa' });
    const b = makePendingBundle({ config: configB, linkId: 'plink_bbb2', paymentLink: 'https://buy.stripe.com/bbb' });
    const c = makePendingBundle({ config: configC, linkId: 'plink_ccc3', paymentLink: 'https://buy.stripe.com/ccc' });

    const { listings } = resolveBundleNames([a, b, c]);

    expect(listings.get(a)!.name).toBe('Holiday Set');
    expect(listings.get(b)!.name).toBe('Holiday Set 3');
    expect(listings.get(c)!.name).toBe('Holiday Set 2');
  });

  it('returns empty results for empty input', () => {
    const { listings, warnings } = resolveBundleNames([]);

    expect(listings.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('strips PendingBundle metadata from output BundleListing', () => {
    const pending = makePendingBundle({ suffix: 'test', linkId: 'plink_test' });

    const { listings } = resolveBundleNames([pending]);

    const listing = listings.get(pending)!;
    expect(listing).not.toHaveProperty('suffix');
    expect(listing).not.toHaveProperty('config');
    expect(listing).not.toHaveProperty('linkId');
  });

  it('preserves imageAlt from pending bundle', () => {
    const pending = makePendingBundle({ imageAlt: 'Custom alt text' });

    const { listings } = resolveBundleNames([pending]);

    expect(listings.get(pending)!.imageAlt).toBe('Custom alt text');
  });
});
