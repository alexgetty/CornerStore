import { describe, it, expect } from 'vitest';
import { buildPdfHtml } from '../../../src/components/Cart/pdf-builder.js';
import type { PdfOptions } from '../../../src/components/Cart/pdf-builder.js';

const baseItem = {
  sku: 'WGT-001',
  name: 'Widget',
  unitPrice: '$10.00',
  quantity: 5,
  lineTotal: '$50.00',
};

const baseOpts: PdfOptions = {
  storeName: 'Test Store',
  contact: 'hello@test.com',
  date: '2024-01-15',
  subtotal: '$50.00',
  items: [baseItem],
};

describe('buildPdfHtml — return type', () => {
  it('returns a non-empty string', () => {
    const result = buildPdfHtml(baseOpts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('buildPdfHtml — layout approach', () => {
  it('uses div rows, not a <table> element', () => {
    expect(buildPdfHtml(baseOpts)).not.toMatch(/<table/);
  });

  it('uses display:flex on row divs', () => {
    expect(buildPdfHtml(baseOpts)).toMatch(/display:flex/);
  });

  it('row divs and column divs carry no top/bottom CSS padding', () => {
    // html2canvas mispositions text inside padded flex items — use explicit
    // spacer divs (height:8px) instead, which render as simple rectangles.
    const html = buildPdfHtml(baseOpts);
    expect(html).not.toMatch(/padding:\s*8px\s*0/);
  });

  it('uses explicit 8px spacer divs above and below each row for vertical spacing', () => {
    // header(×2) + item(×2) + summary(×2) = 6 minimum for a single-item order
    const count = (buildPdfHtml(baseOpts).match(/height:8px/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('each additional item adds two more spacer divs', () => {
    const opts: PdfOptions = {
      ...baseOpts,
      items: [baseItem, { ...baseItem, sku: 'B-002', name: 'B' }],
      subtotal: '$100.00',
    };
    const count = (buildPdfHtml(opts).match(/height:8px/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it('uses display:flex on row divs', () => {
    expect(buildPdfHtml(baseOpts)).toMatch(/display:flex/);
  });
});

describe('buildPdfHtml — separator divs', () => {
  it('uses explicit separator divs (height + background) rather than CSS borders on row elements', () => {
    // CSS border-top/bottom on flex containers renders at wrong position in
    // html2canvas. Explicit pixel-height divs are painted as simple rectangles.
    const html = buildPdfHtml(baseOpts);
    expect(html).not.toMatch(/border-top:1px/);
    expect(html).not.toMatch(/border-bottom:1px/);
    // The 2px heavy separators (header/footer) always appear.
    expect(html).toMatch(/height:2px[^>]*background:#111/);
  });

  it('with a single item there is no grey separator (nothing to separate)', () => {
    expect(buildPdfHtml(baseOpts)).not.toMatch(/height:1px[^>]*background:#ddd/);
  });

  it('two items have exactly one grey separator div between them', () => {
    const opts: PdfOptions = {
      ...baseOpts,
      items: [baseItem, { ...baseItem, sku: 'B-002', name: 'Other' }],
      subtotal: '$100.00',
    };
    const count = (buildPdfHtml(opts).match(/height:1px[^>]*background:#ddd/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('three items have exactly two grey separator divs', () => {
    const opts: PdfOptions = {
      ...baseOpts,
      items: [
        baseItem,
        { ...baseItem, sku: 'B-002', name: 'B' },
        { ...baseItem, sku: 'C-003', name: 'C' },
      ],
      subtotal: '$150.00',
    };
    const count = (buildPdfHtml(opts).match(/height:1px[^>]*background:#ddd/g) ?? []).length;
    expect(count).toBe(2);
  });
});

describe('buildPdfHtml — column headers', () => {
  it('header row contains "Product"', () => {
    expect(buildPdfHtml(baseOpts)).toContain('Product');
  });

  it('header row contains "SKU"', () => {
    expect(buildPdfHtml(baseOpts)).toContain('SKU');
  });

  it('header row contains "Unit Price"', () => {
    expect(buildPdfHtml(baseOpts)).toContain('Unit Price');
  });

  it('header row contains "Qty"', () => {
    expect(buildPdfHtml(baseOpts)).toContain('Qty');
  });

  it('header row contains "Line Total"', () => {
    expect(buildPdfHtml(baseOpts)).toContain('Line Total');
  });

  it('header row has no dark background-color fill (print-friendly)', () => {
    expect(buildPdfHtml(baseOpts)).not.toMatch(/background-color\s*:/);
  });
});

describe('buildPdfHtml — image handling', () => {
  it('contains no <img> tags (thumbnails dropped for PDF)', () => {
    expect(buildPdfHtml(baseOpts)).not.toMatch(/<img/);
  });
});

describe('buildPdfHtml — item row content', () => {
  it('includes product name', () => {
    expect(buildPdfHtml(baseOpts)).toContain('Widget');
  });

  it('includes SKU', () => {
    expect(buildPdfHtml(baseOpts)).toContain('WGT-001');
  });

  it('includes unit price', () => {
    const opts: PdfOptions = {
      ...baseOpts,
      subtotal: '$20.00',
      items: [{ ...baseItem, unitPrice: '$10.00', lineTotal: '$20.00', quantity: 2 }],
    };
    expect(buildPdfHtml(opts)).toContain('$10.00');
  });

  it('includes quantity', () => {
    expect(buildPdfHtml(baseOpts)).toContain('5');
  });

  it('includes line total', () => {
    const opts: PdfOptions = {
      ...baseOpts,
      items: [{ ...baseItem, lineTotal: '$99.95' }],
      subtotal: '$99.95',
    };
    expect(buildPdfHtml(opts)).toContain('$99.95');
  });

  it('renders multiple items', () => {
    const opts: PdfOptions = {
      ...baseOpts,
      items: [
        { sku: 'A-001', name: 'Alpha', unitPrice: '$5.00', quantity: 2, lineTotal: '$10.00' },
        { sku: 'B-002', name: 'Beta', unitPrice: '$15.00', quantity: 1, lineTotal: '$15.00' },
      ],
      subtotal: '$25.00',
    };
    const html = buildPdfHtml(opts);
    expect(html).toContain('Alpha');
    expect(html).toContain('A-001');
    expect(html).toContain('Beta');
    expect(html).toContain('B-002');
  });

  it('renders empty items list without error', () => {
    const opts: PdfOptions = { ...baseOpts, items: [] };
    expect(buildPdfHtml(opts)).toContain('Subtotal');
  });
});

describe('buildPdfHtml — order summary', () => {
  it('includes "Subtotal" label', () => {
    expect(buildPdfHtml(baseOpts)).toContain('Subtotal');
  });

  it('includes the subtotal value', () => {
    const opts: PdfOptions = { ...baseOpts, subtotal: '$123.45' };
    expect(buildPdfHtml(opts)).toContain('$123.45');
  });
});

describe('buildPdfHtml — document header', () => {
  it('includes store name', () => {
    expect(buildPdfHtml(baseOpts)).toContain('Test Store');
  });

  it('includes date', () => {
    expect(buildPdfHtml(baseOpts)).toContain('2024-01-15');
  });

  it('includes contact when provided', () => {
    expect(buildPdfHtml(baseOpts)).toContain('hello@test.com');
  });

  it('omits contact section when contact is empty string', () => {
    const opts: PdfOptions = { ...baseOpts, contact: '' };
    const html = buildPdfHtml(opts);
    expect(html).not.toContain('hello@test.com');
    expect(html).not.toMatch(/Contact:/);
  });
});

describe('buildPdfHtml — HTML escaping', () => {
  it('escapes < and > in product name', () => {
    const opts: PdfOptions = { ...baseOpts, items: [{ ...baseItem, name: 'Widget <A>' }] };
    const html = buildPdfHtml(opts);
    expect(html).toContain('&lt;A&gt;');
    expect(html).not.toContain('<A>');
  });

  it('escapes & in product name', () => {
    const opts: PdfOptions = { ...baseOpts, items: [{ ...baseItem, name: 'A & B' }] };
    const html = buildPdfHtml(opts);
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('A & B');
  });

  it('escapes " in product name', () => {
    const opts: PdfOptions = { ...baseOpts, items: [{ ...baseItem, name: 'The "Widget"' }] };
    const html = buildPdfHtml(opts);
    expect(html).toContain('The &quot;Widget&quot;');
    expect(html).not.toContain('The "Widget"');
  });

  it('escapes HTML special characters in store name', () => {
    const opts: PdfOptions = { ...baseOpts, storeName: 'A & B Store' };
    const html = buildPdfHtml(opts);
    expect(html).toContain('A &amp; B Store');
    expect(html).not.toContain('A & B Store');
  });

  it('escapes HTML special characters in SKU', () => {
    const opts: PdfOptions = { ...baseOpts, items: [{ ...baseItem, sku: 'SKU<1>' }] };
    const html = buildPdfHtml(opts);
    expect(html).toContain('SKU&lt;1&gt;');
    expect(html).not.toContain('SKU<1>');
  });

  it('escapes HTML special characters in contact', () => {
    const opts: PdfOptions = { ...baseOpts, contact: 'a<b>@example.com' };
    const html = buildPdfHtml(opts);
    expect(html).toContain('a&lt;b&gt;@example.com');
    expect(html).not.toContain('a<b>@example.com');
  });
});
