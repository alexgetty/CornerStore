import { loadCatalog } from './csv.js';

export async function getProductNamesResponse(): Promise<Response> {
  const catalog = await loadCatalog();
  const names: Record<string, string> = {};
  for (const p of catalog) names[p.sku] = p.name;
  return new Response(JSON.stringify(names), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
