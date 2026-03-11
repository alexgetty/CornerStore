# Bundle Metadata Source Config

## Context

Bundle cards need title, description, and image. These can come from two sources: Stripe metadata on payment links, or local markdown files. Mixing sources per-bundle is confusing and hard to validate. This should be a site-wide binary choice.

## Options

**Stripe metadata mode:** `metadata.title`, `metadata.description` on payment links. Child product images as fallback. Must use this for ALL bundles — no local files.

**Local file mode:** `/bundles/*.md` files with frontmatter. Must use this for ALL bundles — no Stripe metadata.

## Status

Future work. Currently only local file mode is supported.
