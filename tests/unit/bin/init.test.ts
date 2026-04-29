import { describe, it, expect } from 'vitest';
import { parseCheckoutStyle, buildConfigFile, buildCartPage, buildEnvFile, deriveAnswersFromExistingConfig, buildIndexPage, buildSlugPage, buildCategorySlugPage, buildPackageJson, buildStatusPage } from '../../../bin/scaffold.mjs';

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

  describe('buildCartPage — astro check safety', () => {
    it('does not import the Cart component under the bare name Cart (collides with filename-derived identifier)', () => {
      // `src/pages/cart.astro` is compiled to a module whose default export is
      // named Cart (PascalCase of the filename), so `import { Cart }` collides
      // with that auto-generated declaration (TS 2440).
      const out = buildCartPage();
      expect(out).not.toMatch(/import\s*\{\s*Cart\s*\}\s*from\s*'corner-store\/components'/);
    });

    it('imports the cart component under an alias (CartPage) to avoid the collision', () => {
      const out = buildCartPage();
      expect(out).toMatch(/import\s*\{\s*Cart\s+as\s+CartPage\s*\}\s*from\s*'corner-store\/components'/);
      // and the rendered JSX tag uses the alias
      expect(out).toMatch(/<CartPage\b/);
      expect(out).not.toMatch(/<Cart\s/);
      expect(out).not.toMatch(/<Cart>/);
    });
  });

  describe('buildCartPage — minCartSize prop removal', () => {
    // The component-level `minCartSize` prop is dead. The minimum-cart-total
    // validation now reads its threshold from StoreConfig inside the
    // validation modules. The scaffolded cart page must not pass the prop.
    it('does not pass minCartSize as a prop to <CartPage>', () => {
      const out = buildCartPage();
      expect(out).not.toMatch(/minCartSize=\{/);
    });

    it('still passes minCartSizeRaw to <CartPage>', () => {
      // The raw-cents value is still surfaced to the client via data-* attribute,
      // so it is still derived from config and passed in.
      const out = buildCartPage();
      expect(out).toMatch(/minCartSizeRaw=\{minCartSizeRaw\}/);
    });
  });

  describe('buildIndexPage — astro check safety', () => {
    it('is exported', () => {
      expect(typeof buildIndexPage).toBe('function');
    });

    it('types import.meta.glob so mod.default is not `unknown`', () => {
      const out = buildIndexPage();
      // typed glob with a module shape, or an explicit cast at the call site
      expect(out).toMatch(/import\.meta\.glob<\{\s*default:\s*any\s*\}>\(/);
    });

    it('guards the homeModule lookup before invoking it', () => {
      const out = buildIndexPage();
      // the lookup may return undefined — guard before await/call
      expect(out).toMatch(/if\s*\(\s*homeModule\s*\)/);
    });
  });

  describe('buildSlugPage — astro check safety', () => {
    it('is exported', () => {
      expect(typeof buildSlugPage).toBe('function');
    });

    it('types import.meta.glob so mod.default is not `unknown`', () => {
      const out = buildSlugPage();
      expect(out).toMatch(/import\.meta\.glob<\{\s*default:\s*any\s*\}>\(/);
    });

    it('guards the loader lookup before invoking it', () => {
      const out = buildSlugPage();
      expect(out).toMatch(/const\s+loader\s*=\s*mdxModules\[/);
      expect(out).toMatch(/if\s*\(\s*loader\s*\)/);
    });

    it('does NOT directly call mdxModules[...]() without a guard (runtime + TS unsafe)', () => {
      const out = buildSlugPage();
      expect(out).not.toMatch(/await\s+mdxModules\[[^\]]+\]\(\)/);
    });
  });

  describe('buildCategorySlugPage — astro check safety', () => {
    it('is exported', () => {
      expect(typeof buildCategorySlugPage).toBe('function');
    });

    it('types import.meta.glob so mod.default is not `unknown`', () => {
      const out = buildCategorySlugPage();
      expect(out).toMatch(/import\.meta\.glob<\{\s*default:\s*any\s*\}>\(/);
    });

    it('guards the MDX branch against undefined page in JSX (narrows before use)', () => {
      const out = buildCategorySlugPage();
      // the MDX branch must test `page` in the condition so TS narrows it
      expect(out).toMatch(/isMdx\s*&&\s*Content\s*&&\s*page\s*\?/);
    });

    it('provides a non-undefined string for the fallback ContentPage title', () => {
      const out = buildCategorySlugPage();
      // must not pass the raw (possibly undefined) categoryName directly
      expect(out).not.toMatch(/<ContentPage\s+title=\{\s*categoryName\s*\}/);
    });

    it('provides a string[] (never (string | undefined)[]) for Listings.categories', () => {
      const out = buildCategorySlugPage();
      // must not pass [categoryName] directly
      expect(out).not.toMatch(/<Listings\s+categories=\{\s*\[\s*categoryName\s*\]\s*\}/);
    });

    it('does not declare an unused `config` local (ts6133)', () => {
      const out = buildCategorySlugPage();
      // Any `const config = await loadConfig()` outside getStaticPaths is unused
      // (only categories/pages are needed for the paths + render).
      // We allow it inside getStaticPaths (it's read) but not at module scope.
      // Simplest assertion: no top-level module-scope `const config = await loadConfig`.
      // getStaticPaths is an `export async function` — we look for the pattern
      // outside that function by checking there's no such line *after* the frontmatter
      // closer. A loose but sufficient check: the frontmatter (between --- lines)
      // contains no `const config = await loadConfig();` at indent 0 outside getStaticPaths.
      //
      // Easier: we simply forbid the whole `loadConfig` import if it's unused.
      // Since the scaffolded file historically imported it only for the unused local,
      // dropping the import is the right call.
      expect(out).not.toMatch(/\bloadConfig\b/);
    });
  });

  describe('buildPackageJson', () => {
    it('emits a package.json string with the supplied slug as name', () => {
      const out = buildPackageJson('test-store');
      const parsed = JSON.parse(out);
      expect(parsed.name).toBe('test-store');
    });

    it('declares type: "module"', () => {
      const parsed = JSON.parse(buildPackageJson('any-slug'));
      expect(parsed.type).toBe('module');
    });

    it('includes a typecheck script set to "astro check"', () => {
      const parsed = JSON.parse(buildPackageJson('any-slug'));
      expect(parsed.scripts.typecheck).toBe('astro check');
    });

    it('includes the standard astro lifecycle scripts', () => {
      const parsed = JSON.parse(buildPackageJson('any-slug'));
      expect(parsed.scripts.dev).toBe('astro dev');
      expect(parsed.scripts.build).toBe('astro build');
      expect(parsed.scripts.preview).toBe('astro preview');
    });

    it('includes the corner-store catalog scripts', () => {
      const parsed = JSON.parse(buildPackageJson('any-slug'));
      expect(parsed.scripts['catalog:diff']).toBe('corner-store-catalog diff');
      expect(parsed.scripts['catalog:add']).toBe('corner-store-catalog add');
      expect(parsed.scripts['catalog:update']).toBe('corner-store-catalog update');
      expect(parsed.scripts['catalog:sync']).toBe('corner-store-catalog sync');
    });

    it('declares astro, @astrojs/mdx, and corner-store as dependencies', () => {
      const parsed = JSON.parse(buildPackageJson('any-slug'));
      expect(parsed.dependencies['astro']).toBe('^5');
      expect(parsed.dependencies['@astrojs/mdx']).toBe('^4');
      expect(parsed.dependencies['corner-store']).toBe('^0.1.0');
    });

    it('does NOT declare @astrojs/check or typescript in devDependencies (astro auto-installs on first run)', () => {
      const parsed = JSON.parse(buildPackageJson('any-slug'));
      const dev = parsed.devDependencies ?? {};
      expect(dev['@astrojs/check']).toBeUndefined();
      expect(dev['typescript']).toBeUndefined();
    });

    it('terminates with a trailing newline', () => {
      const out = buildPackageJson('any-slug');
      expect(out.endsWith('\n')).toBe(true);
    });
  });

  describe('buildStatusPage', () => {
    it('throws on unknown kind', () => {
      // @ts-expect-error — invalid kind, exercising the runtime guard
      expect(() => buildStatusPage('teapot', 'Test Store')).toThrow();
    });

    it('emits the 404 page byte-identically to the historical inline template', () => {
      const expected = `---
import { StatusPage } from 'corner-store/components';
---

<StatusPage
  title="Page Not Found - Test Store"
  heading="Page not found."
  message="The page you're looking for doesn't exist or has been moved."
  linkText="Back to store"
  linkHref="/"
/>
`;
      expect(buildStatusPage('404', 'Test Store')).toBe(expected);
    });

    it('emits the success page byte-identically to the historical inline template', () => {
      const expected = `---
import { StatusPage } from 'corner-store/components';
---

<StatusPage
  title="Order Confirmed - Test Store"
  heading="Thank you for your purchase!"
  message="Your order has been confirmed. You will receive a receipt from Stripe shortly."
  linkText="Back to store"
  linkHref="/"
/>
`;
      expect(buildStatusPage('success', 'Test Store')).toBe(expected);
    });

    it('emits the cancel page byte-identically to the historical inline template', () => {
      const expected = `---
import { StatusPage } from 'corner-store/components';
---

<StatusPage
  title="Checkout Cancelled - Test Store"
  heading="Your checkout was cancelled."
  message="No charge has been made. You can return to the store whenever you are ready."
  linkText="Back to store"
  linkHref="/"
/>
`;
      expect(buildStatusPage('cancel', 'Test Store')).toBe(expected);
    });

    it('interpolates store name into the title for each kind', () => {
      expect(buildStatusPage('404', 'Acme Co.')).toContain('title="Page Not Found - Acme Co."');
      expect(buildStatusPage('success', 'Acme Co.')).toContain('title="Order Confirmed - Acme Co."');
      expect(buildStatusPage('cancel', 'Acme Co.')).toContain('title="Checkout Cancelled - Acme Co."');
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
