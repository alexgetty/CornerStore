# Product Catalog Sync

## Background

Stripe lacks the data model to serve as a product catalog. It has no category, no inventory, no rich descriptions, no image management. Using Stripe as the source of truth forces sellers to manage product data across two systems (Stripe + storefront config) with fragile linking and no sync guarantees. This doesn't work.

## Proposal

A CSV-based product catalog that serves as the single source of truth. The CSV drives two independent outputs: the static storefront (at build time) and Stripe product data (via a separate sync tool). Everything edited in one place, in a portable format that is easy to import/export. Order sheet generation is a separate deliverable (see `docs/todo/order-sheet.md`).

## Data Architecture

### CSV: Product Catalog

Single source of truth for all structured product data. Sellers can add columns for their own use; only the following are recognized by the system:

| Required | Field        | Notes                                                        |
|----------|--------------|--------------------------------------------------------------|
| Yes      | SKU          | Alphanumeric, hyphens, underscores only. Primary key everywhere. |
| Yes      | Name         | Product name.                                                |
| Yes      | Price        | Numeric (decimal, e.g. 19.99).                               |
| No       | Category     | Freeform string. Used for filtering on storefront.           |
| No       | Status       | Blank = available. Any string = displayed instead of buy button. |
| No       | Storefront   | `yes`/`no`. Show on the website for browsing and checkout. Default: `yes`. |
| No       | Order Sheet  | `yes`/`no`. Include in the order sheet page/PDF. Default: `yes`. |
| No       | Description  | Short/plain text. The spreadsheet-friendly version.          |
| No       | Payment Link | Stripe Payment Link URL. Managed by the sync tool. If present, buy button links here. If absent, no buy button. |

Currency is a store-level setting, not per-product. USD only for the foreseeable future.

### Images

Live in `product-images/` directory. Naming convention: `{SKU}-{n}.{ext}` where n is sort order. First image (n=1) is primary/cover. No images for a SKU = existing placeholder logic. Build warning if a CSV row has no matching images.

### MD Files: Optional Rich Overrides

Per-product markdown files for products that need more than a card in a grid. Linked to CSV row via `sku` in frontmatter. Provides rich formatted description, custom layout, additional content. Does not replace the CSV row; the product must exist in the CSV regardless.

### Order Sheet

Deferred to separate deliverable. See `docs/todo/order-sheet.md`.

### Stripe: Downstream Consumer

Stripe is a downstream consumer of CSV data, not a source of truth. The sync tool pushes product data to Stripe and writes Payment Link URLs back to the CSV. The site build never calls the Stripe API. Order-sheet-only products do not need Stripe backing. Stripe owns nothing except the checkout session at payment time.

### Status

- Blank/not set = available (buy button shown if Payment Link is present).
- Any string value = displayed instead of buy button ("Out of Stock", "Coming Soon", "Seasonal", etc.). Seller controls availability without removing products.
- No Payment Link and no explicit status = product appears on storefront but without a buy button.

## Site Build

The site build reads the CSV and local files only. Zero Stripe API calls.

1. **Validate CSV** against structural constraints. Build aborts on any failure.
2. **Load images** from `product-images/` directory, matched to CSV rows by SKU.
3. **Load MD overrides** for products that have them.
4. **Build static site** from CSV data + images + overrides. Storefront pages use `Storefront = yes` rows. Payment Link column determines whether a buy button is rendered.

Local dev and CI/CD builds follow the same pipeline. The build is safe to run freely with no external dependencies.

## Stripe Sync (Separate Tool)

The sync tool is a standalone CLI, independent of the site build. It reads `catalog.csv`, reconciles Stripe, and writes Payment Link URLs back to the CSV. Four commands:

- **`catalog diff`**: Read-only. Compares CSV to current Stripe state. Shows what would be added, updated, or is orphaned. Zero mutations.
- **`catalog add`**: Creates Stripe Products, Prices, and Payment Links for CSV rows that don't exist in Stripe yet. Writes Payment Link URLs back to the CSV.
- **`catalog update`**: Updates existing Stripe Products where CSV data has diverged (name, price, description). Stripe Prices are immutable, so a price change creates a new Price, deactivates the old Payment Link, creates a new Payment Link with the new Price, and writes the new URL back to the CSV. Name and description changes update the Product in place. Does not touch rows that are already in sync.
- **`catalog sync`**: Runs `add` then `update`. Convenience command for the common case.

All commands validate the CSV before touching Stripe. SKU is the primary key for matching (stored in Stripe product metadata).

### Orphan Handling

`catalog diff` reports Stripe products (with SKU metadata) that have no matching CSV row. The sync tool never deletes or archives Stripe resources automatically.

### Sync writes back to CSV

When `add` creates a Payment Link, it writes the URL back to the Payment Link column of the corresponding CSV row. This means the seller's workflow is: edit CSV, run sync, commit the updated CSV (now with Payment Link URLs), build and deploy.

## Validation

Every build and every sync command validates all CSV rows before doing anything:

- Required fields present (SKU, Name, Price)
- Price is a positive number
- Product name does not exceed 250 characters (Stripe constraint)
- No duplicate SKUs
- SKU contains only alphanumeric characters, hyphens, and underscores

Content errors are caught immediately on local preview, not at deploy time.

## Resolved Decisions

- **CSV location**: `catalog.csv` at project root.
- **Stripe matching**: SKU stored in Stripe product metadata. Primary key everywhere, including Stripe.
- **Orphan handling**: Warn, never delete or archive automatically.
- **Visibility filtering**: Handled by per-product Storefront/Order Sheet flags. No site-level hidden status config needed.
- **Build/sync independence**: Site build has zero Stripe dependency. Sync is a separate tool. They share the CSV as their interface.
- **Checkout agnosticism**: The build pipeline and Listing data model do not assume a specific checkout mechanism. Payment Link is an optional data column today. A future server-based checkout (Stripe Checkout Sessions, cart, etc.) would be an alternative checkout path, not a replacement of the catalog system. The CSV, images, overrides, and build pipeline remain unchanged regardless of checkout mode. Both fully-static (Payment Links or order sheet only) and server-assisted (dynamic checkout) must remain supported long-term.

## Supersedes

- `docs/todo/category-filtering.md`: Category is now a CSV column, filtering is part of storefront build.
- Listing config system (`listings/` directory with MD frontmatter): Replaced by CSV + optional MD overrides.
- Stripe-as-source-of-truth principle in `docs/principles.md`: Must be updated.
