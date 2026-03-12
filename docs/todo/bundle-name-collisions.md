# Fix bundle display name handling

## Problems

Three issues in `resolveBundleNames` and the bundle processing loop in `listings.ts`:

### 1. Collision detection bug

`suffixCounts` in `resolveBundleNames` (line 101) counts ALL bundles with a given suffix, including those with config titles. When a configured and unconfigured bundle share a suffix, the unconfigured one incorrectly gets a `-1` suffix and a spurious collision warning despite being the only auto-named bundle for that suffix.

### 2. No detection of user-defined title collisions

Two bundle configs with `title: Holiday Set` produce identical listing names with zero warning. Collision detection only looks at auto-generated suffix overlap, not final name uniqueness.

### 3. No detection of cross-type collisions

A user-defined title could theoretically match an auto-generated name (e.g., `title: Bundle a3f9`). Not caught.

### 4. Untitled bundle warnings are vague

The existing "no bundle config — using defaults" warning (line 226) doesn't explain the CX impact. Two distinct cases need distinct messages:

- **No config at all:** The seller hasn't created a bundle directory/markdown for this payment link. Customers will see `Bundle a3f9`. Tell them how to create the config.
- **Config exists but no title:** The seller set up description, image, etc. but missed the `title` field. Customers will see `Bundle a3f9`. Tell them to add `title` to their frontmatter.

These are CX warnings independent of collision detection.

## Pipeline placement

Changes happen at two points in `getListings()`:

**Step 5f — per-link bundle processing (lines 217-229):**
- Replace the current `if (!config)` warning with two specific CX warnings:
  - No config → warn with instructions to create bundle config directory + markdown
  - Config but no title → warn to add `title` field to existing frontmatter

**Step 6 — `resolveBundleNames()` (line 233):**
- Rewrite collision detection to operate on final names, not suffixes:
  1. Assign all names first (config titles and auto-generated `Bundle XXXX`)
  2. Scan for duplicate names across the full list
  3. Disambiguate duplicates with `-1`, `-2` suffixes
  4. Warning severity by source:
     - Auto-generated collisions: informational (rare suffix overlap)
     - User-defined collisions: error-level — user mistake, message says how to fix
     - Mixed: same as user-defined

## Scope

- Modify per-link processing in `getListings()` for untitled warnings
- Rewrite `resolveBundleNames` for name-based collision detection
- TDD: add failing tests for each scenario before implementation
- Update existing collision tests to match new behavior
