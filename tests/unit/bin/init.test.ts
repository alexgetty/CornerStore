import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs has no type declarations
import { parseCheckoutStyle, buildConfigFile, buildCartPage, buildEnvFile, deriveAnswersFromExistingConfig } from '../../../bin/scaffold.mjs';

describe('bin/scaffold.mjs', () => {
  describe('parseCheckoutStyle', () => {
    it('returns "pdf" for empty input (default)', () => {
      expect(parseCheckoutStyle('')).toBe('pdf');
    });

    it('returns "pdf" for whitespace-only input', () => {
      expect(parseCheckoutStyle('   ')).toBe('pdf');
    });

    it('accepts "pdf" verbatim', () => {
      expect(parseCheckoutStyle('pdf')).toBe('pdf');
    });

    it('accepts "stripe" verbatim', () => {
      expect(parseCheckoutStyle('stripe')).toBe('stripe');
    });

    it('accepts "PDF" case-insensitively', () => {
      expect(parseCheckoutStyle('PDF')).toBe('pdf');
    });

    it('accepts "Stripe" case-insensitively', () => {
      expect(parseCheckoutStyle('Stripe')).toBe('stripe');
    });

    it('trims surrounding whitespace', () => {
      expect(parseCheckoutStyle('  stripe  ')).toBe('stripe');
    });

    it('returns null for invalid input like "paypal"', () => {
      expect(parseCheckoutStyle('paypal')).toBeNull();
    });

    it('returns null for numeric-ish garbage', () => {
      expect(parseCheckoutStyle('123')).toBeNull();
    });
  });

  describe('buildConfigFile', () => {
    const baseAnswers = {
      storeName: 'Test Store',
      nav: [{ label: 'Shop', page: 'home' }],
      footerNav: [{ label: 'Privacy Policy', page: 'privacy-policy' }],
      contactEmail: '',
      wantTable: false,
      minCartSize: null,
      checkoutStyle: 'pdf',
      checkoutUrl: '',
    };

    it('emits checkout: \'pdf\' for pdf mode', () => {
      const out = buildConfigFile(baseAnswers);
      expect(out).toMatch(/checkout:\s*'pdf'/);
    });

    it('does NOT emit an uncommented checkoutUrl for pdf mode', () => {
      const out = buildConfigFile(baseAnswers);
      // only commented-out checkoutUrl example is allowed for pdf mode
      // (current spec: no checkoutUrl line at all for pdf mode)
      const uncommented = out.split('\n').filter(l => /^\s*checkoutUrl:/.test(l));
      expect(uncommented).toHaveLength(0);
    });

    it('emits checkout: \'stripe\' and checkoutUrl when URL is supplied', () => {
      const out = buildConfigFile({
        ...baseAnswers,
        checkoutStyle: 'stripe',
        checkoutUrl: 'https://shop.example.com/api/checkout',
      });
      expect(out).toMatch(/checkout:\s*'stripe'/);
      expect(out).toMatch(/checkoutUrl:\s*'https:\/\/shop\.example\.com\/api\/checkout'/);
    });

    it('emits checkout: \'stripe\' and a commented-out checkoutUrl placeholder when URL is blank', () => {
      const out = buildConfigFile({
        ...baseAnswers,
        checkoutStyle: 'stripe',
        checkoutUrl: '',
      });
      expect(out).toMatch(/checkout:\s*'stripe'/);
      // commented-out placeholder present
      expect(out).toMatch(/\/\/\s*checkoutUrl:\s*'https:\/\/your-server\.example\.com\/api\/checkout'/);
      // no active checkoutUrl key
      const active = out.split('\n').filter(l => /^\s*checkoutUrl:/.test(l));
      expect(active).toHaveLength(0);
    });

    it('includes commented optional keys (logo, wholesaleMargin, shippingFlat, shippingFreeThreshold)', () => {
      const out = buildConfigFile(baseAnswers);
      expect(out).toMatch(/\/\/\s*logo:\s*'\/logo\.svg'/);
      expect(out).toMatch(/\/\/\s*wholesaleMargin:\s*0\.5/);
      expect(out).toMatch(/\/\/\s*shippingFlat:\s*9\.99/);
      expect(out).toMatch(/\/\/\s*shippingFreeThreshold:\s*100/);
    });

    it('includes a commented dropdown example near nav', () => {
      const out = buildConfigFile(baseAnswers);
      expect(out).toMatch(/\/\/\s*Example category dropdown item/);
      expect(out).toMatch(/\/\/\s*\{\s*label:\s*'Products',\s*dropdown:\s*'categories'\s*\}/);
    });

    it('omits contact when empty', () => {
      const out = buildConfigFile(baseAnswers);
      expect(out).not.toMatch(/^\s*contact:/m);
    });

    it('emits contact when provided', () => {
      const out = buildConfigFile({ ...baseAnswers, contactEmail: 'me@example.com' });
      expect(out).toMatch(/contact:\s*"me@example\.com"/);
    });

    it('emits listings views array including table when wantTable=true', () => {
      const out = buildConfigFile({ ...baseAnswers, wantTable: true });
      expect(out).toMatch(/listings:\s*\{\s*views:\s*\[\s*'card',\s*'table'\s*\]\s*\}/);
    });

    it('emits card-only listings when wantTable=false', () => {
      const out = buildConfigFile(baseAnswers);
      expect(out).toMatch(/listings:\s*\{\s*views:\s*\[\s*'card'\s*\]\s*\}/);
    });

    it('emits minCartSize when wantTable=true and value provided', () => {
      const out = buildConfigFile({
        ...baseAnswers,
        wantTable: true,
        minCartSize: 200,
      });
      expect(out).toMatch(/minCartSize:\s*200/);
    });

    it('places commented optional block after uncommented keys, before closing brace', () => {
      const out = buildConfigFile(baseAnswers);
      const optionalIdx = out.indexOf('// Optional:');
      const closingIdx = out.lastIndexOf('}');
      const checkoutIdx = out.indexOf('checkout:');
      expect(optionalIdx).toBeGreaterThan(-1);
      expect(optionalIdx).toBeGreaterThan(checkoutIdx);
      expect(optionalIdx).toBeLessThan(closingIdx);
    });
  });

  describe('buildCartPage', () => {
    it('uses the new checkoutEnabled signal based on config, not env', () => {
      const out = buildCartPage();
      expect(out).toMatch(/const checkoutEnabled\s*=\s*config\.checkout === 'stripe'\s*&&\s*!!config\.checkoutUrl/);
    });

    it('does NOT reference import.meta.env.STRIPE_SECRET_KEY', () => {
      const out = buildCartPage();
      expect(out).not.toMatch(/STRIPE_SECRET_KEY/);
      expect(out).not.toMatch(/import\.meta\.env/);
    });

    it('matches the library cart.astro signal exactly', () => {
      // This is the exact line shipped in src/pages/cart.astro (library side).
      const librarySignal = "const checkoutEnabled = config.checkout === 'stripe' && !!config.checkoutUrl;";
      const out = buildCartPage();
      expect(out).toContain(librarySignal);
    });
  });

  describe('buildEnvFile', () => {
    it('does not contain STRIPE_SECRET_KEY', () => {
      const out = buildEnvFile();
      expect(out).not.toMatch(/STRIPE_SECRET_KEY/);
    });
  });

  describe('deriveAnswersFromExistingConfig', () => {
    it('reads checkout and checkoutUrl defaulting to pdf/empty', () => {
      const answers = deriveAnswersFromExistingConfig({ name: 'X' });
      expect(answers.checkoutStyle).toBe('pdf');
      expect(answers.checkoutUrl).toBe('');
    });

    it('preserves checkout=stripe and checkoutUrl when present', () => {
      const answers = deriveAnswersFromExistingConfig({
        name: 'X',
        checkout: 'stripe',
        checkoutUrl: 'https://example.com/api/checkout',
      });
      expect(answers.checkoutStyle).toBe('stripe');
      expect(answers.checkoutUrl).toBe('https://example.com/api/checkout');
    });

    it('preserves checkout=stripe with blank URL', () => {
      const answers = deriveAnswersFromExistingConfig({
        name: 'X',
        checkout: 'stripe',
      });
      expect(answers.checkoutStyle).toBe('stripe');
      expect(answers.checkoutUrl).toBe('');
    });
  });

  describe('re-init round-trip', () => {
    it('existing stripe+URL config produces a config file with the same values', () => {
      const existing = {
        name: 'Existing',
        checkout: 'stripe',
        checkoutUrl: 'https://server.example.com/api/checkout',
      };
      const answers = deriveAnswersFromExistingConfig(existing);
      const out = buildConfigFile({
        storeName: existing.name,
        nav: [],
        footerNav: [],
        contactEmail: '',
        wantTable: false,
        minCartSize: null,
        ...answers,
      });
      expect(out).toMatch(/checkout:\s*'stripe'/);
      expect(out).toMatch(/checkoutUrl:\s*'https:\/\/server\.example\.com\/api\/checkout'/);
    });
  });
});
