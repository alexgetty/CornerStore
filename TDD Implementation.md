
# Testing Infrastructure Setup                                     
                  
  Set up a TypeScript testing infrastructure with strict coverage
  enforcement.

  ## Stack

  - **Runtime:** Node >= 20, ESM (`"type": "module"`)
  - **Language:** TypeScript 5+ with strict mode
  - **Test runner:** Vitest 2+
  - **Coverage:** @vitest/coverage-v8

  ## Package Scripts

  ```json
  {
    "scripts": {
      "test": "vitest run",
      "test:watch": "vitest",
      "test:coverage": "vitest run --coverage",
      "typecheck": "tsc --noEmit",
      "ci": "npm run typecheck && npm run test:coverage"
    }
  }

  Vitest Config

  // vitest.config.ts
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.d.ts'],
        thresholds: {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  });

  TypeScript Config

  Enable these strict checks beyond "strict": true:

  {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }

  Test Directory Structure

  tests/
  ├── unit/           # Isolated, mocked, fast
  ├── integration/    # Real components, minimal mocks
  ├── contracts/      # Interface compliance
  └── e2e/            # Full journeys, no mocks

  CI Behavior

  The ci script runs typecheck + test with coverage. It fails if:
  - Any test fails
  - Type errors exist
  - Coverage drops below 100% on any metric (lines, branches,
  functions, statements)

  Coverage Exceptions

  For genuinely untestable lines (platform branches, external library
   boundaries), use v8 ignore comments with mandatory explanation:

  /* v8 ignore next -- [explain why this is untestable] */

  If these accumulate beyond a handful, the architecture needs
  rethinking.

  Dev Dependencies

  vitest ^2.0.0
  @vitest/coverage-v8 ^2.0.0
  typescript ^5.6.0

  That's it. Three config files, three dev deps, one CI script.
  Everything else is methodology, not infrastructure.