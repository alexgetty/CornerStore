import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'bin/**/*.ts'],
      exclude: [
        'src/env.d.ts',
        'src/lib/storefront/types.ts',
        'src/lib/storefront/index.ts',
        'src/lib/catalog/types.ts',
        'src/lib/catalog/index.ts',
        'src/lib/validation/types.ts',
        'src/lib/validation/index.ts',
        'src/lib/cart/types.ts',
        'src/lib/cart/index.ts',
        'src/components/index.ts',
        'src/components/Lightbox/lightbox.ts',
        'src/pages/**/*.ts',
        'src/pages/**/*.astro',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
