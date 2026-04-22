import type { APIRoute } from 'astro';
import { getProductNamesResponse } from '../lib/catalog/product-names.js';

export const GET: APIRoute = () => getProductNamesResponse();
