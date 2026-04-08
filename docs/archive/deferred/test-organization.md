# Separate unit and integration tests

## Problem

All tests currently live in `tests/unit/`. Some are genuine unit tests (single function, mocked dependencies). Others are integration tests that exercise the full pipeline — e.g., the parameterized Stripe error tests in `listings.test.ts` that verify error propagation from Stripe SDK through `wrapStripeError` through `getListings()` to the caller.

Mixing them in one directory with no structural distinction makes it harder to:
- Know what broke and where (unit failure = bug in that function, integration failure = bug anywhere in the chain)
- Run fast unit tests separately from slower integration tests
- Understand what a test file is actually verifying

## Plan

1. Create `tests/integration/` alongside `tests/unit/`
2. Move tests that exercise multiple real components through the call chain into `tests/integration/`
3. Keep tests that verify a single function with mocked dependencies in `tests/unit/`
4. Update vitest config if needed for separate test runs

## When

Before the test suite grows significantly. The current 99 tests are manageable, but the pattern needs to be set before it becomes a migration.
