# Corner Store

## About
Ecommerce infrastructure for indie makers and small businesses who want to sell direct (wholesale, DTC, or both) without paying marketplace commissions or monthly fees. 

### Values and Positioning
Corner Store does not and will never facilitate sales. Carts are client side on the sellers own website, checkout and confirmation emails are handled by a payment processor. The seller is the merchant of record. We do not store orders, generate receipts, offer net terms. The buyer relationship is the sellers. Corner Store does not set product prices or offer paid ads spots for sellers.

This is both a values statement and a legal position:
Value: We're infrastructure, not a facilitator. Sellers and buyers are directly connected.
Legal: Corner Store is distinctly outside marketplace facilitator regulations and their tax/compliance overhead.

### Simple, Resilient Architecture
1. A config file and CSV catalog is fed into a static site generator to create a simple, secure, private, performant storefront that can be hosted on github pages or other static site hosts for free or cheap.
2. A client-side javascript + local storage cart persists accross sessions. Checkout generates a PDF order form that the buyer can email to the seller, who then invoices the buyer and completes the transaction via email.
3. An optional single server endpoint builds a dynamic stripe checkout via the sellers merchant account. Syncing the Stripe product catalog is done via API during site deployments. Sellers can choose BYO-Server + local config, which is free, or hosted.
4. The fully hosted version has product catalog, discounts, variants, etc in a web dashboard. Still integrates with 3rd party payment processors or financers (net terms), no facilitation on platform. Hosted will have a small 1-3% fee to support continued investment in the infrastructure, but only on revenue over $1000.

## Documentation
Directory: `docs/`
Design and Dev Rules: `docs/principles.md`
Test Driven Development: `docs/tdd.md`

### Todos
Active: `docs/todo/`
Closed: `docs/todo/archive/`
Deferred: `docs/todo/archive/deferred/`

### Distribution
**Primary:** NPM package with a CLI init command (`cornerstore init`) that scaffolds the user's project.
**Secondary:** The repo is open source, anyone can clone or fork it, under a license that requires any fork to also be open source.

## IMPORTANT Rules

1. Test-Driven Development: Strict TDD, no exceptions. No implementation without a failing test. Red -> Green -> Refactor.
2. Init Parity: New CSV column, env var, or runtime requirement? After your changes are complete and pass all tests, run `cornerstore init` into a fresh empty directory. Install deps. Run the build. Exercise the feature end-to-end in the scaffolded project. If you can't, init is out of sync and the feature is not done.
3. Package vs Project: The package handles core UI like default token defintions, core responsive layouts, and accessibility. Instance themes should have full control over aesthetics, easily change layouts, etc.


