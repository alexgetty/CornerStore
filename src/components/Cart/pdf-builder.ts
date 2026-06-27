export interface PdfItem {
  sku: string;
  name: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface PdfOptions {
  storeName: string;
  contact: string;
  date: string;
  subtotal: string;
  items: PdfItem[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Column widths as percentages, must sum to 100.
const W = { product: 35, sku: 25, price: 15, qty: 10, total: 15 };

// Explicit separator divs — not CSS borders (html2canvas mispositions borders on flex containers)
const SEP_HEAVY = `<div style="height:2px;background:#111;"></div>`;
const SEP_LIGHT  = `<div style="height:1px;background:#ddd;"></div>`;

// Explicit spacer divs for row vertical padding — same rationale as separators:
// CSS padding inside flex items is also misrendered by html2canvas (text floats
// toward the top of the padded box). A bare height:Npx div is a simple rectangle
// with no text or layout to misinterpret.
const SPACER = `<div style="height:8px;"></div>`;

const ROW_STYLE = 'display:flex;font-size:13px;line-height:1;';

function col(pct: number, extra = ''): string {
  return `width:${pct}%;box-sizing:border-box;${extra}`;
}

function colR(pct: number): string {
  return col(pct, 'text-align:right;');
}

function dataRow(item: PdfItem, first: boolean): string {
  const sep = first ? '' : SEP_LIGHT;
  return `${sep}${SPACER}<div style="${ROW_STYLE}">
    <div style="${col(W.product)}">${escapeHtml(item.name)}</div>
    <div style="${col(W.sku)}font-family:monospace;font-size:11px;color:#555;">${escapeHtml(item.sku)}</div>
    <div style="${colR(W.price)}">${escapeHtml(item.unitPrice)}</div>
    <div style="${colR(W.qty)}">${item.quantity}</div>
    <div style="${colR(W.total)}">${escapeHtml(item.lineTotal)}</div>
  </div>${SPACER}`;
}

export function buildPdfHtml(opts: PdfOptions): string {
  const { storeName, contact, date, subtotal, items } = opts;

  const contactLine = contact
    ? `<p style="margin:4px 0 0;">Contact: ${escapeHtml(contact)}</p>`
    : '';

  const headerRow = `${SPACER}<div style="${ROW_STYLE}font-weight:600;">
    <div style="${col(W.product)}">Product</div>
    <div style="${col(W.sku)}">SKU</div>
    <div style="${colR(W.price)}">Unit Price</div>
    <div style="${colR(W.qty)}">Qty</div>
    <div style="${colR(W.total)}">Line Total</div>
  </div>${SPACER}`;

  const labelWidth = W.product + W.sku + W.price + W.qty;
  const summaryRow = `${SPACER}<div style="${ROW_STYLE}font-weight:600;">
    <div style="${colR(labelWidth)}padding-right:4px;">Subtotal</div>
    <div style="${colR(W.total)}">${escapeHtml(subtotal)}</div>
  </div>${SPACER}`;

  const rows = items.map((item, i) => dataRow(item, i === 0)).join('\n');

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">
  <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #111;">
    <div>
      <h1 style="margin:0;font-size:20px;font-weight:700;line-height:1.2;">Order Form</h1>
      <p style="margin:4px 0 0;color:#444;font-size:13px;line-height:1.4;">${escapeHtml(storeName)}</p>
    </div>
    <div style="text-align:right;font-size:13px;color:#444;line-height:1.4;">
      <p style="margin:0;">Date: ${escapeHtml(date)}</p>
      ${contactLine}
    </div>
  </div>
  ${headerRow}
  ${SEP_HEAVY}
  ${rows}
  ${SEP_HEAVY}
  ${summaryRow}
</div>`;
}
