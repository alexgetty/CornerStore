import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFile, writeFile } from 'node:fs/promises';
import { CATALOG_PATH } from './csv.js';

export async function updateCatalogPaymentLinks(
  updates: Map<string, string>,
  path?: string,
): Promise<void> {
  const csvPath = path ?? CATALOG_PATH;
  const content = await readFile(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  if (records.length === 0) return;

  const columns = Object.keys(records[0]!);

  if (!columns.includes('Payment Link')) {
    columns.push('Payment Link');
    for (const record of records) {
      record['Payment Link'] = '';
    }
  }

  for (const record of records) {
    const sku = (record['SKU'] ?? '').trim();
    if (sku && updates.has(sku)) {
      record['Payment Link'] = updates.get(sku)!;
    }
  }

  const output = stringify(records, { header: true, columns });
  await writeFile(csvPath, output);
}
