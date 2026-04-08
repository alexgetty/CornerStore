# Bundle Image Caching

## Current Behavior

`loadBundleConfigs()` in `src/lib/stripe.ts` copies every image from `bundles/<name>/` to `public/bundles/<name>/` on every build. No diffing, no skip logic. Identical files get re-copied unconditionally.

## Why It Matters

Unnecessary I/O on every build. Adds up in CI where builds are frequent and disk ops aren't free.

## Possible Approaches

- **Content hash:** Hash source and destination, skip if match. Most correct, highest per-file cost.
- **mtime comparison:** Skip if destination exists and is newer. Cheap, but fragile across CI environments where mtimes reset on checkout.
- **Size check:** Skip if destination exists and byte size matches. Fast, but won't catch same-size content changes (unlikely for images, but not impossible).

Any of these could be combined — size as a fast path, hash as fallback.

## Status

Optimization, not a bug. Current behavior is correct. Just wasteful.
