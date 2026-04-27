# Corner Store — Legal Strategy

**Last updated:** April 27, 2026
**Status:** Working strategy, not legal advice. Revisit before Phase 2 launch and at material revenue milestones.

---

## 1. Core Legal Position

Corner Store is **storefront infrastructure**, not a marketplace facilitator. Sellers are the merchant of record for every transaction. Corner Store provides software, hosting, and a discovery layer; sellers own products, prices, customer relationships, fulfillment, and tax obligations.

This is the same posture as Shopify, Squarespace Commerce, BigCommerce, Wix Stores, and Webflow Ecommerce — none classified as facilitators in any US state. The Phase 2 discovery surface is structurally analogous to Google Shopping (free listings), affiliate networks (ShareASale, Impact, CJ, Rakuten), and shopping directories (Honey, RetailMeNot, Lyst). None of those have been classified as facilitators either.

Strategy: **defend through architecture, contracts, and documentation. Do not change the business model to chase a marginally better legal posture.**

---

## 2. Permanent Architectural Commitments

Non-negotiable. Crossing any of these shifts Corner Store from infrastructure toward facilitator status under multiple state statutes.

### Hard lines

1. **No cross-seller cart.** No multi-seller checkout.
2. **No hosted checkout on Corner Store's domain.** Checkout completes on the seller's domain or Stripe-hosted Checkout initiated from the seller's storefront.
3. **No order-of-record at the platform.** Seller is merchant of record. No platform-level order storage, receipts, or post-purchase relationship.
4. **No aggregated buyer accounts.** Buyer accounts (if any) live with each seller.
5. **No catalog facilitation in checkout.** No platform-level product listing in checkout flows, price-setting, or fulfillment.

### Additional bright lines

6. No platform-issued refunds or chargebacks.
7. No platform-branded order confirmation emails. All transactional email comes from the seller, branded as the seller.
8. No platform-mediated buyer-seller dispute resolution.
9. No platform-provided buyer-protection guarantees.
10. No funds held in Corner Store escrow. Use Stripe Connect destination or direct charges; never separate-charges-and-transfers with platform-balance hold.
11. No platform-set return policies.
12. No reviews aggregated across sellers on cornerstore.example.
13. No "Buy with Corner Store" or platform-branded checkout button.
14. No platform-set prices or pricing recommendations.

### Permitted

- Subdomain hosting at `*.cornerstore.example`, one seller per subdomain. Shopify's `*.myshopify.com` precedent confirms this is safe.
- "Powered by Corner Store" footer on subdomain stores. Page chrome, not transaction branding; does not implicate any state's "branding sales" prong on its own.
- 3% Stripe Connect application fee. Fee structure does not drive facilitator classification — affiliate networks have charged percentage commissions for 20+ years without it. Architecture controls the analysis, not the fee.
- Phase 2 discovery surface with read-only product and price data, click-through to the seller's storefront for all transactional activity.

---

## 3. Phase 2 Discovery Surface

Core to the business. Indie maker platforms fail when they can't connect buyers to sellers. Phase 2 is not negotiable as a feature; the question is how to build it defensibly.

### Why this is defensible

- Marketplace facilitator statutes are conjunctive: they require both (A) listing/forum activity AND (B) payment collection. Corner Store does not collect payment — Stripe does, on the seller's behalf. The "indirectly collects payment" prong has been read by DORs and courts to require actual involvement in the payment flow, not merely receiving a fee tied to transaction value.
- California (Rev. & Tax. Code § 6041.5(b)), Washington, Illinois, Colorado, and Nevada have explicit advertising-only carve-outs covering this fact pattern: a website that displays products, refers via internet link, and does not participate further in the sale.
- Affiliate networks operate this exact model — percentage fees tied to transactions, product listings, click-through to merchant — across all 50 states without facilitator classification.
- Stripe is the Payment Settlement Entity for Express accounts. Corner Store never touches transaction funds, so trust-fund tax liability has no path to attach.

### Mitigations baked into the design

- Read-only product/price display. No "add to cart" or "buy now" on cornerstore.example.
- Listings are seller-syndicated (opt-in) and authorized in the seller ToS as advertising.
- No buyer accounts, wishlists, or buyer-side persistence on cornerstore.example.
- No reviews or ratings aggregated across sellers.
- No platform-wide promotions, discounts, or coupon codes.
- Click-through is an outbound link to the seller's domain, where the offer is made, accepted, and completed.
- ToS and footer disclaim Corner Store's role: not the seller, not merchant of record, does not collect payment, does not facilitate the transaction.

### Residual risk

Roughly 4–8 states have statutes drafted broadly enough that an aggressive auditor could theoretically argue Phase 2 satisfies their facilitator definition: Illinois, Pennsylvania, Texas, Iowa, Connecticut, Nevada, DC, possibly Massachusetts. No published ruling has reached an analog company on these facts. Risk is theoretical, not demonstrated. Realistic worst case is an inquiry letter, resolved through registration, voluntary disclosure agreement, or exit — not catastrophic litigation.

---

## 4. Tax Stack

### Sales tax

- **Corner Store does not collect, hold, remit, or take responsibility for sales tax.**
- Sellers are merchants of record and solely responsible for sales tax in jurisdictions where they have nexus.
- Stripe Tax is available via Stripe Connect. Onboarding actively encourages enablement as the default path to compliance.
- Flow: buyer pays Stripe → Stripe collects tax on seller's behalf → seller's Stripe balance holds the tax → seller remits to the state. Corner Store is never in this flow.

### Application fee taxability

- The 3% application fee may itself be subject to sales tax in ~22 states that tax SaaS or data-processing services. Texas treats 80% of SaaS charges as taxable. NY, PA, WA, CT, MA, and others tax SaaS at full rates.
- Separate compliance regime from facilitator status.
- Action: register and collect SaaS sales tax on the application fee in applicable states once thresholds are crossed. Use Anrok, Avalara, or TaxJar. Established SaaS founder problem with established solutions.

### Income tax / B&O nexus

- Corporate income tax economic nexus likely triggers at scale in CA (~$735K), NY (~$1.14M), TX ($500K TX-sourced gross receipts), WA (no minimum once nexus established for B&O), PA ($500K), NJ ($100K), MA ($500K).
- P.L. 86-272 does not shield SaaS service revenue.
- Action: standard multistate SaaS nexus monitoring. CPA or automated tool when approaching the first state's threshold.

### 1099-K

- Stripe is PSE for Express accounts and handles federal and state 1099-K filing for connected sellers.
- No Corner Store-level 1099-K obligation for seller transactions.

---

## 5. Contractual Layer

### Seller agreement

Allocates tax responsibility entirely to the seller:

- Seller is merchant of record for all transactions on Corner Store-powered storefronts.
- Corner Store provides software, hosting, and discovery infrastructure only.
- Corner Store does not collect, hold, remit, or take legal responsibility for sales tax, VAT, GST, or any other transactional tax.
- Seller is solely responsible for handling their own tax liabilities and responsibilities as a business.
- Seller indemnifies Corner Store against tax-related claims, liabilities, penalties, or assessments arising from seller's operations.

The agreement does not provide tax advice. It states the legal relationship. It does not tell sellers where to register, when nexus triggers, or how to comply.

### Acceptance mechanism

- Standalone, conspicuous checkbox at onboarding. Unchecked by default. Cannot proceed without checking.
- Typed-name electronic signature, capturing timestamp, IP, and ToS version. Stored immutably.
- Re-acceptance required on material ToS changes (especially at Phase 2 launch).

### Why this matters legally

The contractual allocation does not override marketplace facilitator law — facilitator obligations are statutory and cannot be contracted around as against the state. Its value is:

1. **Evidentiary.** Establishes good-faith classification as infrastructure; supports the architectural narrative.
2. **Indemnification.** Contractual claim against any seller whose noncompliance triggers Corner Store-level liability.
3. **Coherence.** Contract, architecture, and technical implementation tell the same story. That coherence is what auditors and DORs look for.

---

## 6. Corporate Structure and Personal Liability

- Corner Store operates as an LLC. Standard formalities: separate bank account, no commingling, registered agent, accurate books, annual filings.
- The LLC shields the founder from personal liability for civil tax assessments against the entity in nearly all cases.
- Trust-fund / responsible-person liability (the main exception that pierces the LLC for tax) requires that the entity collected tax and failed to remit. Corner Store never collects tax — Stripe collects on the seller's behalf, seller remits. The trust runs from buyer → seller, never through Corner Store. Effectively eliminates responsible-person exposure.
- Fraud or willful evasion would also pierce. Not applicable.

---

## 7. Documentation and Defensive Records

Maintain ongoing records of:

- Architectural decisions (this document, system design docs, technical specs) showing classification as infrastructure.
- ToS history with version control and seller acceptance records.
- Stripe Connect configuration confirming destination/direct charges and Stripe as PSE.
- Seller onboarding flow showing tax responsibility disclosure and acceptance.
- Legal-strategy reasoning (this document and the underlying research report).

This is the good-faith defense if any state ever inquires — the difference between "we made a reasoned classification decision based on the law and the facts" and "we hadn't thought about it." Cheap insurance.

---

## 8. Triggers for Engaging Counsel

No SALT attorney on retainer at launch. Engage on:

1. **Phase 2 launch.** Single SALT consult to review final implementation against the architectural commitments and ToS. Budget: $5–15K.
2. **First DOR inquiry.** Any letter, information request, or notice from a state DOR. Do not respond before consulting counsel.
3. **Approaching $500K ARR.** Counsel and a multistate SaaS tax tool for proactive nexus and SaaS sales tax compliance on the application fee.
4. **Material architectural change.** If any bright line in §2 comes up for reconsideration, counsel conversation before implementation.
5. **International expansion.** UK Online Marketplace rules, EU deemed-supplier, Canada GST/HST distribution platform operator, and Australia EDP are materially broader than US rules and warrant separate counsel before launch in any jurisdiction.

---

## 9. DOR Response Plan

If a state DOR sends an inquiry asserting Corner Store should be classified as a facilitator:

1. **Do not respond immediately.** Do not register, do not concede, do not volunteer information.
2. **Engage SALT counsel.** Defined trigger.
3. **Evaluate three options:**
   - **Push back on classification** using the architectural facts, affiliate-network analogy, statutory carve-outs, and ToS allocation. Strongest case in CA, WA, IL, CO, NV.
   - **Register prospectively.** Corner Store starts collecting platform-level tax via Stripe Tax in that state. Negotiate a voluntary disclosure agreement (VDA) for any prior period — typically limited lookback (3–4 years) with waived penalties.
   - **Exit the state.** Geofence the platform to exclude that state's sellers prospectively. Negotiate a VDA for any prior period.
4. **Practical reality check.** Sales tax was already being collected on every transaction by Stripe on the seller's behalf, and remitted by the seller. The state's substantive tax revenue was not lost. The state's claim is about which entity should have been the registered facilitator, not uncollected tax. Dramatically reduces the practical stakes of any back-period assessment.

---

## 10. What Would Make This Strategy Wrong

Load-bearing assumptions. If any changes, revisit:

- **Corner Store does not become merchant of record.** If the business model ever shifts toward MoR (the way Gumroad did in January 2025), the analysis flips and Corner Store becomes a facilitator by definition.
- **Stripe remains PSE; payment flow stays out of Corner Store's balance sheet.** If Stripe Connect configuration ever changes such that funds flow through a Corner Store-controlled account, the trust-fund analysis changes.
- **The architectural bright lines hold.** Each is load-bearing; the combination is what defines Corner Store as infrastructure.
- **State law evolves but doesn't fundamentally reshape facilitator definitions.** The trend is toward broader MoR responsibility for platforms. If a state passes a statute capturing Corner Store's exact fact pattern explicitly, the analysis changes for that state.

---

## 11. Decision Log

- **Keep the 3% Stripe Connect application fee.** Percentage pricing is core to the business model (low barrier for sellers without sales). Fee structure does not drive facilitator classification under any state statute reviewed.
- **Build Phase 2 with full product-level listings, not store-only directory.** Store-only would be marginally safer legally but materially weaker as a discovery mechanism, and discovery is the strategic point. Mitigate via architecture and ToS rather than feature reduction.
- **Subdomain hosting permitted with "Powered by Corner Store" footer.** Shopify precedent is direct. Footer is page chrome, not transaction branding.
- **No SALT attorney on retainer at launch.** Engage on defined triggers (§8).

---

## 12. References

For statutory citations, per-state matrix, comparable-companies analysis, and primary-source research, see the underlying research report (`Corner Store Marketplace Facilitator Classification Risk Analysis`, April 27, 2026).
