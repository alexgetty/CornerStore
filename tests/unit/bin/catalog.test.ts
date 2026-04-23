import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// Sentinel error so we can distinguish process.exit calls from real errors
class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

// Mock the catalog-cli module that bin/catalog.ts dynamically imports
vi.mock('../../../src/lib/stripe/catalog-cli.js', () => ({
  runCatalogSync: vi.fn(),
}));

describe('bin/catalog.ts', () => {
  let exitSpy: MockInstance<(code?: string | number | null | undefined) => never>;
  let logSpy: MockInstance<(...args: unknown[]) => void>;
  let errorSpy: MockInstance<(...args: unknown[]) => void>;
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetModules();

    originalArgv = process.argv;

    // process.exit must throw to halt top-level script execution
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      throw new ExitError(typeof code === 'number' ? code : 0);
    });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  async function runScript(): Promise<void> {
    await import('../../../bin/catalog.js');
  }

  // ─── isValidCommand (tested indirectly via script behavior) ─────────────────

  describe('isValidCommand', () => {
    it('returns true for "diff"', async () => {
      const { runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js') as any;
      runCatalogSync.mockResolvedValue(undefined);
      process.argv = ['node', 'catalog', 'diff'];

      await runScript();

      expect(exitSpy).not.toHaveBeenCalled();
      expect(runCatalogSync).toHaveBeenCalledWith('diff');
    });

    it('returns true for "add"', async () => {
      const { runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js') as any;
      runCatalogSync.mockResolvedValue(undefined);
      process.argv = ['node', 'catalog', 'add'];

      await runScript();

      expect(exitSpy).not.toHaveBeenCalled();
      expect(runCatalogSync).toHaveBeenCalledWith('add');
    });

    it('returns true for "update"', async () => {
      const { runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js') as any;
      runCatalogSync.mockResolvedValue(undefined);
      process.argv = ['node', 'catalog', 'update'];

      await runScript();

      expect(exitSpy).not.toHaveBeenCalled();
      expect(runCatalogSync).toHaveBeenCalledWith('update');
    });

    it('returns true for "sync"', async () => {
      const { runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js') as any;
      runCatalogSync.mockResolvedValue(undefined);
      process.argv = ['node', 'catalog', 'sync'];

      await runScript();

      expect(exitSpy).not.toHaveBeenCalled();
      expect(runCatalogSync).toHaveBeenCalledWith('sync');
    });

    it('returns false for undefined (no command)', async () => {
      process.argv = ['node', 'catalog'];

      await expect(runScript()).rejects.toThrow(ExitError);

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('returns false for an invalid string', async () => {
      process.argv = ['node', 'catalog', 'invalid'];

      await expect(runScript()).rejects.toThrow(ExitError);

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  // ─── usage output ──────────────────────────────────────────────────────────

  describe('usage output', () => {
    it('prints usage when no command is provided', async () => {
      process.argv = ['node', 'catalog'];

      await expect(runScript()).rejects.toThrow(ExitError);

      expect(logSpy).toHaveBeenCalledWith('Usage: catalog <command>\n');
      expect(logSpy).toHaveBeenCalledWith('Commands:');
      expect(logSpy).toHaveBeenCalledWith('  diff    Show what would change (read-only)');
      expect(logSpy).toHaveBeenCalledWith('  add     Create new Stripe products from catalog');
      expect(logSpy).toHaveBeenCalledWith('  update  Update existing Stripe products from catalog');
      expect(logSpy).toHaveBeenCalledWith('  sync    Run add + update');
    });

    it('prints usage when invalid command is provided', async () => {
      process.argv = ['node', 'catalog', 'bogus'];

      await expect(runScript()).rejects.toThrow(ExitError);

      expect(logSpy).toHaveBeenCalledWith('Usage: catalog <command>\n');
    });
  });

  // ─── exit codes ─────────────────────────────────────────────────────────────

  describe('exit codes', () => {
    it('exits with code 0 when no command is provided', async () => {
      process.argv = ['node', 'catalog'];

      const err = await runScript().catch((e: ExitError) => e);

      expect(err).toBeInstanceOf(ExitError);
      expect((err as ExitError).code).toBe(0);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with code 1 when an invalid command is provided', async () => {
      process.argv = ['node', 'catalog', 'nope'];

      const err = await runScript().catch((e: ExitError) => e);

      expect(err).toBeInstanceOf(ExitError);
      expect((err as ExitError).code).toBe(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  // ─── valid command execution ────────────────────────────────────────────────

  describe('valid command execution', () => {
    it('calls runCatalogSync with the provided command', async () => {
      const { runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js') as any;
      runCatalogSync.mockResolvedValue(undefined);
      process.argv = ['node', 'catalog', 'sync'];

      await runScript();

      expect(runCatalogSync).toHaveBeenCalledWith('sync');
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ─── error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('logs Error message and exits 1 when runCatalogSync throws an Error', async () => {
      const { runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js') as any;
      runCatalogSync.mockRejectedValue(new Error('Stripe API exploded'));
      process.argv = ['node', 'catalog', 'diff'];

      await expect(runScript()).rejects.toThrow(ExitError);

      expect(errorSpy).toHaveBeenCalledWith('Stripe API exploded');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('logs non-Error value and exits 1 when runCatalogSync throws a string', async () => {
      const { runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js') as any;
      runCatalogSync.mockRejectedValue('raw string error');
      process.argv = ['node', 'catalog', 'diff'];

      await expect(runScript()).rejects.toThrow(ExitError);

      expect(errorSpy).toHaveBeenCalledWith('raw string error');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
