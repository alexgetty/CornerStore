import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * cart.ts checkout-failure contract — Stripe failure ALWAYS surfaces the
 * PDF backup path.
 *
 * The cart's submit handler runs `attemptCheckout`, which POSTs to the BYO
 * server. Any failure on that path (network down, randomUUID unavailable,
 * Stripe error, missing URL in response, malformed JSON) must un-hide
 * `checkoutFallback` so the buyer can retry or download the PDF order form.
 *
 * Why a string-pinning test: cart.ts has no DOM unit tests yet (tracked in
 * docs/todo/cart-listings-test-coverage.md and the playwright harness todo).
 * Pinning the structural shape of attemptCheckout against the source string
 * is the cheap stopgap. If anyone refactors attemptCheckout in a way that
 * leaves a throw outside the try/catch, OR removes the `checkoutFallback`
 * un-hide from the catch path, this test breaks and a real human notices.
 */

const cartTsPath = join(
  process.cwd(),
  'src',
  'components',
  'Cart',
  'cart.ts',
);

const readCart = (): string => readFileSync(cartTsPath, 'utf8');

function extractAttemptCheckoutBody(source: string): string {
  // Pull out the function body of attemptCheckout. Brittle but sufficient:
  // if the function name or shape changes meaningfully, the test maintainer
  // is the right person to update this regex too.
  const match = source.match(/async function attemptCheckout\(\)[^{]*{([\s\S]*?)\n  }\n/);
  if (!match) {
    throw new Error('Could not locate attemptCheckout body in cart.ts');
  }
  return match[1];
}

describe('cart.ts — Stripe checkout failure surfaces the PDF fallback', () => {
  it('attemptCheckout exists in the source', () => {
    const out = readCart();
    expect(out).toMatch(/async function attemptCheckout\(\)/);
  });

  it('imports the generateAttemptId helper from ./attempt-id', () => {
    const out = readCart();
    expect(out).toMatch(/from ['"]\.\/attempt-id(\.js)?['"]/);
    expect(out).toMatch(/generateAttemptId/);
  });

  it('attemptId generation lives inside the try block, not before it', () => {
    const body = extractAttemptCheckoutBody(readCart());
    const tryIdx = body.indexOf('try {');
    const attemptIdIdx = body.indexOf('generateAttemptId');
    expect(tryIdx, 'attemptCheckout has no try block').toBeGreaterThan(-1);
    expect(attemptIdIdx, 'generateAttemptId not called in attemptCheckout').toBeGreaterThan(-1);
    // The whole point of the contract: a throw from generateAttemptId must
    // be reachable by the catch handler that surfaces the PDF fallback.
    expect(attemptIdIdx).toBeGreaterThan(tryIdx);
  });

  it('catch block un-hides the checkout fallback (Retry + Download PDF)', () => {
    const body = extractAttemptCheckoutBody(readCart());
    const catchMatch = body.match(/catch \(err\)[^{]*{([\s\S]*)$/);
    expect(catchMatch, 'attemptCheckout has no catch block').not.toBeNull();
    const catchBody = catchMatch![1];
    expect(catchBody).toMatch(/checkoutFallback\.hidden\s*=\s*false/);
  });

  it('catch block re-enables the submit button so the buyer is not stranded', () => {
    const body = extractAttemptCheckoutBody(readCart());
    const catchMatch = body.match(/catch \(err\)[^{]*{([\s\S]*)$/);
    const catchBody = catchMatch![1];
    expect(catchBody).toMatch(/submitBtn\.disabled\s*=\s*false/);
  });

  it('Cart.astro renders the PDF download button inside the fallback panel', () => {
    // Sanity check on the markup side: the catch in cart.ts un-hides
    // .cs-checkout-fallback, which must contain the .cs-pdf-btn for the
    // backup-form contract to hold.
    const astroPath = join(process.cwd(), 'src', 'components', 'Cart', 'Cart.astro');
    const out = readFileSync(astroPath, 'utf8');
    const fallbackMatch = out.match(/class="cs-checkout-fallback"[\s\S]*?<\/div>/);
    expect(fallbackMatch, 'expected .cs-checkout-fallback block in Cart.astro').not.toBeNull();
    expect(fallbackMatch![0]).toMatch(/cs-pdf-btn/);
    expect(fallbackMatch![0]).toMatch(/cs-retry-btn/);
  });
});

describe('cart.ts — buyer-facing error copy when Stripe checkout fails', () => {
  it('Stripe failure message names Stripe and points at the PDF backup', () => {
    const body = extractAttemptCheckoutBody(readCart());
    const catchMatch = body.match(/catch \(err\)[^{]*{([\s\S]*)$/);
    const catchBody = catchMatch![1];

    // Buyer-facing copy must mention Stripe by name (so they know the
    // failure is upstream, not their cart) and direct them to the PDF
    // backup that the fallback panel exposes.
    expect(catchBody).toMatch(/Stripe checkout/);
    expect(catchBody).toMatch(/PDF/);
  });

  it('Stripe failure message references the configured contact when present', () => {
    const body = extractAttemptCheckoutBody(readCart());
    const catchMatch = body.match(/catch \(err\)[^{]*{([\s\S]*)$/);
    const catchBody = catchMatch![1];

    // Pin that the contact (read from data-contact at init time) is woven
    // into the message conditionally — empty contact must not produce a
    // grammatically broken "email it to ." sentence.
    expect(catchBody).toMatch(/contact/);
  });

  it('the raw error.message is not rendered to the buyer', () => {
    const body = extractAttemptCheckoutBody(readCart());
    const catchMatch = body.match(/catch \(err\)[^{]*{([\s\S]*)$/);
    const catchBody = catchMatch![1];

    // Regression guard: the previous copy was `Checkout unavailable: ${message}`
    // which leaked raw fetch errors like "Failed to fetch" to the buyer.
    expect(catchBody).not.toMatch(/Checkout unavailable:/);
    expect(catchBody).not.toMatch(/\$\{message\}/);
  });

  it('catch block still logs the underlying error for the operator', () => {
    const body = extractAttemptCheckoutBody(readCart());
    const catchMatch = body.match(/catch \(err\)[^{]*{([\s\S]*)$/);
    const catchBody = catchMatch![1];

    // The buyer-facing copy is friendly, but the operator (Alex) still
    // needs to see what actually broke when checking the browser console.
    expect(catchBody).toMatch(/console\.error/);
  });
});

describe('cart.ts — PDF library is loaded eagerly so it survives offline', () => {
  it('html2pdf import is kicked off outside generatePdf (preloaded at init)', () => {
    const out = readCart();
    const initBody = out.match(/function init\(root: HTMLElement\)\s*{([\s\S]*?)\n}\s*$/);
    expect(initBody, 'expected init() body in cart.ts').not.toBeNull();

    // The import must happen at init scope, not lazily inside generatePdf.
    // Pin via shape: an html2pdf import statement reachable from init scope
    // and BEFORE the generatePdf function declaration.
    const initSrc = initBody![1];
    const importIdx = initSrc.search(/import\(['"]html2pdf\.js['"]\)/);
    const generatePdfIdx = initSrc.search(/async function generatePdf\(\)/);
    expect(importIdx, 'html2pdf import not found in init scope').toBeGreaterThan(-1);
    expect(generatePdfIdx, 'generatePdf not found in init scope').toBeGreaterThan(-1);
    expect(importIdx).toBeLessThan(generatePdfIdx);
  });

  it('generatePdf does not re-import html2pdf at click time', () => {
    const out = readCart();
    const generatePdfMatch = out.match(/async function generatePdf\(\)[^{]*{([\s\S]*?)\n  }\n/);
    expect(generatePdfMatch, 'expected generatePdf body in cart.ts').not.toBeNull();
    const generatePdfBody = generatePdfMatch![1];

    // No on-demand import inside generatePdf — that's the bug we're fixing.
    expect(generatePdfBody).not.toMatch(/import\(['"]html2pdf\.js['"]\)/);
  });
});

describe('cart.ts — PDF generation failure surfaces a buyer-visible message', () => {
  it('generatePdf catch un-hides checkoutError with operator-readable copy', () => {
    const out = readCart();
    const generatePdfMatch = out.match(/async function generatePdf\(\)[^{]*{([\s\S]*?)\n  }\n/);
    const body = generatePdfMatch![1];
    const catchMatch = body.match(/catch \(err\)[^{]*{([\s\S]*)$/);
    expect(catchMatch, 'generatePdf has no catch block').not.toBeNull();
    const catchBody = catchMatch![1];

    // Don't strand the buyer silently. Surface a message AND log the
    // underlying error.
    expect(catchBody).toMatch(/checkoutError\.hidden\s*=\s*false/);
    expect(catchBody).toMatch(/console\.error/);
  });
});
