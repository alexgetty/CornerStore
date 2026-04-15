# Consumer Package Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two packaging bugs that break corner-store when installed as an npm dependency in consumer projects.

**Architecture:** Bug 1: replace gray-matter with a thin `parseFrontmatter()` utility using js-yaml@4 directly, eliminating the transitive dependency conflict with Astro's js-yaml version. Bug 2: bundle `bin/catalog.ts` into compiled JS with esbuild so consumer projects can run catalog commands without tsx.

**Tech Stack:** js-yaml@4 (replacing gray-matter), esbuild (devDependency for CLI bundling), vitest (existing test runner)

---

## Bug 1: Replace gray-matter with direct frontmatter parsing

### Task 1: Create `parseFrontmatter` utility with tests

**Files:**
- Create: `src/lib/frontmatter.ts`
- Create: `tests/unit/frontmatter.test.ts`

- [ ] **Step 1: Write failing tests for `parseFrontmatter`**

```typescript
// tests/unit/frontmatter.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/lib/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with data and content', () => {
    const result = parseFrontmatter('---\ntitle: Hello\n---\nBody text\n');
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.content).toBe('Body text\n');
  });

  it('parses multiple frontmatter fields', () => {
    const result = parseFrontmatter('---\ntitle: Hello\ndescription: A page\n---\nBody\n');
    expect(result.data).toEqual({ title: 'Hello', description: 'A page' });
    expect(result.content).toBe('Body\n');
  });

  it('returns empty data and full content when no frontmatter present', () => {
    const result = parseFrontmatter('Just plain text\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Just plain text\n');
  });

  it('returns empty data and full content for empty string', () => {
    const result = parseFrontmatter('');
    expect(result.data).toEqual({});
    expect(result.content).toBe('');
  });

  it('handles empty frontmatter block', () => {
    const result = parseFrontmatter('---\n---\nContent after empty frontmatter\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content after empty frontmatter\n');
  });

  it('handles empty frontmatter with no trailing content', () => {
    const result = parseFrontmatter('---\n---\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('');
  });

  it('handles frontmatter with no trailing newline after closing delimiter', () => {
    const result = parseFrontmatter('---\ntitle: Hi\n---');
    expect(result.data).toEqual({ title: 'Hi' });
    expect(result.content).toBe('');
  });

  it('returns empty data when no closing delimiter found', () => {
    const result = parseFrontmatter('---\ntitle: Hello\nno closing\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('---\ntitle: Hello\nno closing\n');
  });

  it('returns empty data when file is just opening delimiter', () => {
    const result = parseFrontmatter('---\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('---\n');
  });

  it('returns empty data when file is just dashes with no newline', () => {
    const result = parseFrontmatter('---');
    expect(result.data).toEqual({});
    expect(result.content).toBe('---');
  });

  it('does not treat --- mid-content as frontmatter', () => {
    const result = parseFrontmatter('Some text\n---\ntitle: Not frontmatter\n---\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Some text\n---\ntitle: Not frontmatter\n---\n');
  });

  it('handles nested YAML objects', () => {
    const raw = '---\nimage_alts:\n  img1.jpg: Primary\n  img2.jpg: Side view\n---\n';
    const result = parseFrontmatter(raw);
    expect(result.data).toEqual({
      image_alts: { 'img1.jpg': 'Primary', 'img2.jpg': 'Side view' },
    });
  });

  it('normalizes Windows line endings', () => {
    const result = parseFrontmatter('---\r\ntitle: Hello\r\n---\r\nBody\r\n');
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.content).toBe('Body\n');
  });

  it('throws on malformed YAML', () => {
    expect(() => parseFrontmatter('---\ntitle: [\n---\n')).toThrow();
  });

  it('returns empty data when YAML parses to a scalar', () => {
    const result = parseFrontmatter('---\njust a string\n---\nContent\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content\n');
  });

  it('returns empty data when YAML parses to an array', () => {
    const result = parseFrontmatter('---\n- item1\n- item2\n---\nContent\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content\n');
  });

  it('returns empty data when YAML parses to null', () => {
    const result = parseFrontmatter('---\nnull\n---\nContent\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content\n');
  });

  it('only splits on first closing delimiter', () => {
    const result = parseFrontmatter('---\ntitle: Hi\n---\nContent\n---\nMore\n');
    expect(result.data).toEqual({ title: 'Hi' });
    expect(result.content).toBe('Content\n---\nMore\n');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/frontmatter.test.ts`
Expected: FAIL (module `../../src/lib/frontmatter.js` does not exist)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/frontmatter.ts
import { load } from 'js-yaml';

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const str = raw.replace(/\r\n/g, '\n');

  if (!str.startsWith('---\n')) {
    return { data: {}, content: str };
  }

  const closingIndex = str.indexOf('\n---', 3);
  if (closingIndex === -1) {
    return { data: {}, content: str };
  }

  const yamlStr = str.slice(4, closingIndex);

  let contentStart = closingIndex + 4;
  if (str[contentStart] === '\n') contentStart++;
  const content = str.slice(contentStart);

  const parsed = load(yamlStr);
  const data =
    parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  return { data, content };
}
```

Note: `js-yaml` must be installed before this step can pass. Install it now:

Run: `cd "/Users/alex/Repos/Corner Store/Storefront" && npm install js-yaml@^4`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/frontmatter.test.ts`
Expected: All 17 tests PASS

- [ ] **Step 5: Commit**

```
feat: add parseFrontmatter utility using js-yaml

Replaces gray-matter with a direct YAML frontmatter parser to fix
js-yaml version conflicts when corner-store is installed as a package.
```

---

### Task 2: Migrate `pages.ts` from gray-matter to `parseFrontmatter`

**Files:**
- Modify: `src/lib/storefront/pages.ts` (lines 3, 67-69)
- Modify: `tests/unit/storefront/pages.test.ts` (lines 2, 5-8, 12-15, 377, 443-468)
- Modify: `tests/unit/storefront/helpers.ts` (remove `getMatterMock`, lines 37-39)

- [ ] **Step 1: Update the import in `pages.ts`**

Replace line 3 in `src/lib/storefront/pages.ts`:

```typescript
// OLD
import matter from 'gray-matter';

// NEW
import { parseFrontmatter } from '../frontmatter.js';
```

Replace lines 68-69 in `src/lib/storefront/pages.ts`:

```typescript
// OLD
      ({ data: rawData } = matter(raw));

// NEW
      ({ data: rawData } = parseFrontmatter(raw));
```

- [ ] **Step 2: Update `pages.test.ts` to remove gray-matter mocking**

Remove the gray-matter mock (lines 12-15):
```typescript
// DELETE THIS BLOCK
vi.mock('gray-matter', async (importOriginal) => {
  const original = (await importOriginal()) as { default: (...args: unknown[]) => unknown };
  return { default: vi.fn(original.default) };
});
```

Remove `getMatterMock` from the import on line 2:
```typescript
// OLD
import { getFsMock, getMatterMock } from './helpers.js';

// NEW
import { getFsMock } from './helpers.js';
```

Update the malformed frontmatter test (line 377 area). The existing test input `'---\n: invalid: yaml:\n---\n'` may not throw in js-yaml@4. Replace the test input with input that reliably throws:

```typescript
  it('warns and skips when frontmatter is malformed', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['malformed.mdx', 'valid.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('malformed')) {
        return Promise.resolve('---\ntitle: [\n---\n');
      }
      return Promise.resolve('---\ntitle: Valid\n---\n');
    }) as never);

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('valid')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: pages/malformed.mdx:');
    expect(allLogCalls).toContain('failed to parse frontmatter');
  });
```

Replace the non-Error throw test (lines 443-468) to mock `parseFrontmatter` instead of gray-matter. The mock must throw only on the first call (cursed.mdx) and use the real implementation for the second (fine.mdx), since the test expects `result.size === 1`:

```typescript
  it('warns and skips when frontmatter parser throws non-Error value', async () => {
    let callCount = 0;
    vi.doMock('../../../src/lib/frontmatter.js', async () => {
      const real = await vi.importActual<typeof import('../../../src/lib/frontmatter.js')>('../../../src/lib/frontmatter.js');
      return {
        parseFrontmatter: (...args: unknown[]) => {
          callCount++;
          if (callCount === 1) throw 42;
          return real.parseFrontmatter(...(args as [string]));
        },
      };
    });

    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['cursed.mdx', 'fine.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: Fine\n---\n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('fine')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: pages/cursed.mdx:');
    expect(allLogCalls).toContain('42');
  });
```

- [ ] **Step 3: Remove `getMatterMock` from helpers.ts**

Remove the function and its gray-matter import from `tests/unit/storefront/helpers.ts`:

```typescript
// DELETE these lines (37-39):
export async function getMatterMock() {
  const matterModule = await import('gray-matter');
  return vi.mocked(matterModule.default);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/pages.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
refactor: migrate pages.ts from gray-matter to parseFrontmatter
```

---

### Task 3: Migrate `overrides.ts` from gray-matter to `parseFrontmatter`

**Files:**
- Modify: `src/lib/catalog/overrides.ts` (lines 3, 40-41)
- Modify: `tests/unit/catalog/overrides.test.ts` (lines 9-12, 22-25, 267-299)

- [ ] **Step 1: Update the import in `overrides.ts`**

Replace line 3 in `src/lib/catalog/overrides.ts`:

```typescript
// OLD
import matter from 'gray-matter';

// NEW
import { parseFrontmatter } from '../frontmatter.js';
```

Replace lines 41-42 in `src/lib/catalog/overrides.ts`:

```typescript
// OLD
      ({ data, content } = matter(raw));

// NEW
      ({ data, content } = parseFrontmatter(raw));
```

- [ ] **Step 2: Update `overrides.test.ts` to remove gray-matter mocking**

Remove the gray-matter mock (lines 9-12):
```typescript
// DELETE THIS BLOCK
vi.mock('gray-matter', async (importOriginal) => {
  const original = (await importOriginal()) as { default: (...args: unknown[]) => unknown };
  return { default: vi.fn(original.default) };
});
```

Remove the local `getMatterMock` function (lines 22-25):
```typescript
// DELETE THIS BLOCK
async function getMatterMock() {
  const m = await import('gray-matter');
  return vi.mocked(m.default);
}
```

Update the "frontmatter parsing fails with an Error" test (line 267 area). Replace mock-based approach with actual malformed YAML:

```typescript
  it('warns and skips when frontmatter parsing fails with an Error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\ntitle: [\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to parse frontmatter'),
    );
    consoleSpy.mockRestore();
  });
```

Replace the non-Error throw test (line 284 area). This requires `vi.doMock` on the frontmatter module. Because this test suite uses a shared `beforeEach` that imports `loadProductOverrides`, the non-Error test needs its own import after the mock:

```typescript
  it('warns and skips when frontmatter parsing fails with a non-Error value', async () => {
    vi.resetModules();
    vi.doMock('../../../src/lib/frontmatter.js', () => ({
      parseFrontmatter: () => { throw 'raw parse failure'; },
    }));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const localMocks = await getFsMocks();
    const { loadProductOverrides: localLoad } = await import('../../../src/lib/catalog/overrides.js');

    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    localMocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    localMocks.readFile.mockResolvedValue('some content' as never);

    const result = await localLoad(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to parse frontmatter'),
    );
    consoleSpy.mockRestore();
  });
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/unit/catalog/overrides.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```
refactor: migrate overrides.ts from gray-matter to parseFrontmatter
```

---

### Task 4: Remove gray-matter dependency, add js-yaml

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Remove gray-matter and verify js-yaml is present**

Run:
```bash
cd "/Users/alex/Repos/Corner Store/Storefront"
npm uninstall gray-matter
```

Verify `js-yaml` was already installed in Task 1. Confirm `package.json` dependencies now include `js-yaml` and do NOT include `gray-matter`.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS. No file imports gray-matter.

- [ ] **Step 3: Verify no gray-matter references remain in source**

Run: `grep -r "gray-matter" src/ tests/ --include="*.ts"`
Expected: No matches.

- [ ] **Step 4: Commit**

```
chore: remove gray-matter dependency

gray-matter's transitive js-yaml@3 dependency conflicts with Astro's
js-yaml@4 under symlink/npm-link resolution, causing silent frontmatter
parse failures in consumer projects. Replaced with direct js-yaml@4.
```

---

## Bug 2: Expose catalog CLI to consumer projects

### Task 5: Bundle catalog CLI with esbuild

**Files:**
- Modify: `package.json` (devDependencies, scripts, bin)
- Create: `bin/catalog.mjs` (build output, committed)

- [ ] **Step 1: Install esbuild**

Run:
```bash
cd "/Users/alex/Repos/Corner Store/Storefront"
npm install -D esbuild
```

- [ ] **Step 2: Add build script to `package.json`**

Add to `scripts`:
```json
"build:cli": "esbuild bin/catalog.ts --bundle --format=esm --platform=node --target=node18 --outfile=bin/catalog.mjs --packages=external --banner:js='#!/usr/bin/env node'"
```

Add to `scripts`:
```json
"prepublishOnly": "npm run build:cli"
```

- [ ] **Step 3: Add bin entry for catalog CLI**

Update the `bin` field in `package.json`:
```json
"bin": {
  "corner-store": "./bin/init.mjs",
  "corner-store-catalog": "./bin/catalog.mjs"
}
```

- [ ] **Step 4: Build the CLI**

Run:
```bash
npm run build:cli
```

Expected: `bin/catalog.mjs` is created. It starts with `#!/usr/bin/env node` and contains compiled JavaScript (no TypeScript syntax).

- [ ] **Step 5: Verify the built CLI parses arguments correctly**

Run:
```bash
node bin/catalog.mjs
```

Expected: Prints usage help (same as `bin/catalog.ts` does for missing command). Exits 0.

Run:
```bash
node bin/catalog.mjs bogus
```

Expected: Prints usage help. Exits 1.

- [ ] **Step 6: Commit**

```
feat: bundle catalog CLI as compiled JS for consumer projects

Consumer projects can now run catalog commands via corner-store-catalog
without needing tsx or reaching into node_modules internals.
```

---

### Task 6: Update consumer scaffolding in `init.mjs`

**Files:**
- Modify: `bin/init.mjs` (lines 78-93)

- [ ] **Step 1: Update scaffolded `package.json` in `init.mjs`**

Replace the scripts and dependencies in the `writeFile` call for `package.json` (around line 75-93):

```javascript
// package.json
await writeFile(join(dir, 'package.json'), JSON.stringify({
  name: slug,
  type: 'module',
  scripts: {
    dev: 'astro dev',
    build: 'astro build',
    preview: 'astro preview',
    'catalog:diff': 'corner-store-catalog diff',
    'catalog:add': 'corner-store-catalog add',
    'catalog:update': 'corner-store-catalog update',
    'catalog:sync': 'corner-store-catalog sync',
  },
  dependencies: {
    '@astrojs/mdx': '^4',
    'astro': '^5',
    'corner-store': '^0.1.0',
  },
}, null, 2) + '\n');
```

Changes:
- Catalog scripts use `corner-store-catalog <cmd>` instead of `tsx node_modules/corner-store/bin/catalog.ts <cmd>`
- `tsx` removed from dependencies (no longer needed)

- [ ] **Step 2: Verify the scaffolded output looks correct**

Read `bin/init.mjs` and confirm:
1. No reference to `tsx` in the scaffolded package.json
2. Catalog scripts use `corner-store-catalog` binary name
3. No `node_modules/` paths in scripts

- [ ] **Step 3: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```
fix: update scaffolded consumer package.json

Catalog scripts now use the corner-store-catalog binary instead of tsx.
Removes tsx from consumer dependencies.
```
