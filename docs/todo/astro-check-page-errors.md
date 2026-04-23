# `astro check` Type Errors in `src/pages/`

## Status

Open. Surfaced when `tsconfig.json` was updated to exclude `coverage/` (previously `astro check` OOM-crashed scanning `coverage/prettify.js` and never completed). With the OOM unblocked, `astro check` now runs and reports 7 real errors that were masked for an unknown period.

## Problem

`npm run typecheck` runs `astro check && tsc --noEmit`. `tsc --noEmit` is clean. `astro check` reports:

```
src/pages/index.astro:16           error ts(18046)  'mod' is of type 'unknown'.
src/pages/[slug].astro:22          error ts(18046)  'mod' is of type 'unknown'.
src/pages/category/[slug].astro:41 error ts(18046)  'mod' is of type 'unknown'.
src/pages/category/[slug].astro:47 error ts(18048)  'page' is possibly 'undefined'.
src/pages/category/[slug].astro:47 error ts(18048)  'page' is possibly 'undefined'.
src/pages/category/[slug].astro:51 error ts(2322)   Type 'string | undefined' is not assignable to type 'string'.
src/pages/category/[slug].astro:52 error ts(2322)   Type 'string | undefined' is not assignable to type 'string'.
```

Two root causes.

### Root cause 1: untyped `import.meta.glob` results in `unknown`

All three pages use the same pattern:

```ts
const mdxModules = import.meta.glob('/pages/*.mdx');
const mod = await mdxModules[key]();
const Content = mod.default;  // error: mod is unknown
```

The default return type of `import.meta.glob` is `Record<string, () => Promise<unknown>>`. Accessing `.default` on `unknown` fails strict narrowing. Fix: pass a type parameter to `glob`:

```ts
import type { AstroInstance } from 'astro';

const mdxModules = import.meta.glob<AstroInstance>('/pages/*.mdx');
```

The MDX loader returns a module with a `default` component factory and frontmatter. `AstroInstance` is the shipped Astro type for this shape. If a more specific frontmatter type matters later, pass a custom generic.

### Root cause 2: `category/[slug].astro` prop destructuring is not narrowed

`getStaticPaths` returns two shapes of props depending on whether an MDX override exists:

```ts
// isMdx: true  →  { page: CategoryPage, isMdx: true }
// isMdx: false →  { categoryName: string, isMdx: false }
```

The destructure is a union:

```ts
const { page, categoryName, isMdx } = Astro.props;
```

So `page` is `CategoryPage | undefined` and `categoryName` is `string | undefined`. The render branch `{isMdx && Content ? ...` doesn't narrow `page` because TS can't prove the discriminant relationship across the destructure.

Fix options:

**Option A** — discriminated union with explicit prop types:

```ts
type Props =
  | { isMdx: true; page: CategoryPage; categoryName?: never }
  | { isMdx: false; categoryName: string; page?: never };

const props = Astro.props as Props;
```

Then narrow by `isMdx` before use.

**Option B** — destructure conditionally:

```ts
const { isMdx } = Astro.props;
if (isMdx) {
  const { page } = Astro.props;
  // ...
} else {
  const { categoryName } = Astro.props;
  // ...
}
```

**Option C** — unify the props shape at `getStaticPaths` (always include both fields, make the template use whichever is set). Smallest code change but hides the structural intent.

Go with **Option A**. Matches the existing pattern of explicit types at the top of the frontmatter and keeps the template branching readable.

## Fix

### `src/pages/index.astro` (1 error)

- Add `import type { AstroInstance } from 'astro';`
- Change `import.meta.glob('/pages/*.mdx')` to `import.meta.glob<AstroInstance>('/pages/*.mdx')`

### `src/pages/[slug].astro` (1 error)

- Same as index.astro.
- Also consider: `mdxModules[key]` could be `undefined` (if `page.slug` ever doesn't match a file). Current code assumes it exists and calls `()` directly. Worth an explicit check:
  ```ts
  const loader = mdxModules[`/pages/${page.slug}.mdx`];
  if (!loader) throw new Error(`Missing MDX for slug: ${page.slug}`);
  const mod = await loader();
  ```
  This is a correctness issue, not just a typing one. Include in the fix.

### `src/pages/category/[slug].astro` (5 errors)

- Same `AstroInstance` fix for line 41.
- Introduce the discriminated `Props` type at the top of the frontmatter.
- Cast `Astro.props` once, then narrow per branch.
- Update the JSX to rely on the narrowed types (may require moving some of the logic above the template return into typed branches).

## Tests

No new tests. Pages are render targets, not exported functions. Verification is:

- `npx astro check` → 0 errors.
- `npm run build` → still succeeds, output unchanged (spot check `dist-site/` HTML for home, a page slug, a category page both with and without MDX override).
- `npm run test` → 615/615 still passes (no behavior change).

## Acceptance criteria

- All 7 `astro check` errors resolved.
- No new errors introduced.
- `npm run typecheck` passes cleanly (0 errors, 0 warnings, hints OK).
- `npm run ci` progresses past `typecheck` (the `test:coverage` step will still fail for unrelated reasons tracked in `cart-listings-test-coverage.md`).
- Build output is byte-identical or near-identical (only whitespace / source-map differences acceptable).

## Out of scope

- Fixing `test:coverage` threshold failures (separate todo, `cart-listings-test-coverage.md`).
- Refactoring `getStaticPaths` in `category/[slug].astro` to flatten the prop shape. Can be done later; not required for the fix.
- Scaffolding equivalent page files in `bin/init.mjs`. These pages already exist in init; if init-time copies share the typing bug, they need the same fix in the same commit per init-parity rules. Verify during the work.

## Files you'll touch

- Edit: `src/pages/index.astro`
- Edit: `src/pages/[slug].astro`
- Edit: `src/pages/category/[slug].astro`
- Possibly: `bin/init.mjs` if scaffolded copies of these pages share the typing bug

## Don't touch

- `src/components/**`, `src/lib/**` — unrelated.
- Other `astro check` hints or warnings that pre-date this work. Flag them in a follow-up if they accumulate.

## Related

- Unblocker: the `tsconfig.json` `exclude` change landed this session (`coverage`, `dist`, `dist-site`) which is what exposed these errors.
- The MDX loader typing pattern here will be needed anywhere new page templates use `import.meta.glob`. Consider documenting the `AstroInstance` generic in `docs/principles.md` if it becomes a recurring snag.
