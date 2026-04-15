#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/catalog/csv.ts
import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
function parseRow(row, rowNum, seenSkus) {
  const errors = [];
  const sku = (row["SKU"] ?? "").trim();
  const name = (row["Name"] ?? "").trim();
  const priceStr = (row["Price"] ?? "").trim();
  if (!sku) {
    errors.push({ row: rowNum, field: "SKU", message: "required" });
  } else if (!SKU_PATTERN.test(sku)) {
    errors.push({ row: rowNum, field: "SKU", message: "must contain only alphanumeric characters, hyphens, and underscores" });
  } else if (seenSkus.has(sku)) {
    errors.push({ row: rowNum, field: "SKU", message: `duplicate SKU "${sku}"` });
  }
  if (sku) seenSkus.add(sku);
  if (!name) {
    errors.push({ row: rowNum, field: "Name", message: "required" });
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push({ row: rowNum, field: "Name", message: `exceeds ${MAX_NAME_LENGTH} characters` });
  }
  let price = 0;
  if (!priceStr) {
    errors.push({ row: rowNum, field: "Price", message: "required" });
  } else if (!PRICE_PATTERN.test(priceStr)) {
    errors.push({ row: rowNum, field: "Price", message: "must be a positive number" });
  } else {
    price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      errors.push({ row: rowNum, field: "Price", message: "must be a positive number" });
    } else if (price < MIN_PRICE) {
      errors.push({ row: rowNum, field: "Price", message: `must be at least ${MIN_PRICE}` });
    } else if (price > MAX_PRICE) {
      errors.push({ row: rowNum, field: "Price", message: `exceeds maximum of ${MAX_PRICE}` });
    }
  }
  const description = row["Description"]?.trim() || null;
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push({ row: rowNum, field: "Description", message: `exceeds ${MAX_DESCRIPTION_LENGTH} characters` });
  }
  const storefrontVal = (row["Storefront"] ?? "").trim().toLowerCase();
  const orderSheetVal = (row["Order Sheet"] ?? "").trim().toLowerCase();
  const product = {
    sku,
    name,
    price,
    category: row["Category"]?.trim() || null,
    status: row["Status"]?.trim() || null,
    storefront: storefrontVal !== "no",
    orderSheet: orderSheetVal !== "no",
    description,
    paymentLink: row["Payment Link"]?.trim() || null
  };
  return { errors, product };
}
function validateRows(records) {
  const allErrors = [];
  const products = [];
  const seenSkus = /* @__PURE__ */ new Set();
  for (let i = 0; i < records.length; i++) {
    const { errors, product } = parseRow(records[i], i + 2, seenSkus);
    allErrors.push(...errors);
    products.push(product);
  }
  if (allErrors.length > 0) return { products: [], errors: allErrors };
  return { products, errors: [] };
}
async function loadCatalog(path) {
  const csvPath = path ?? CATALOG_PATH;
  const content = await readFile(csvPath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });
  const { products, errors } = validateRows(records);
  if (errors.length > 0) {
    const lines = errors.map(
      (e) => `  Row ${e.row}, ${e.field}: ${e.message}`
    ).join("\n");
    throw new Error(`[Catalog] Validation failed:
${lines}`);
  }
  return products;
}
var CATALOG_PATH, SKU_PATTERN, PRICE_PATTERN, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_PRICE, MIN_PRICE;
var init_csv = __esm({
  "src/lib/catalog/csv.ts"() {
    "use strict";
    CATALOG_PATH = join(process.cwd(), "products", "catalog.csv");
    SKU_PATTERN = /^[a-zA-Z0-9_-]+$/;
    PRICE_PATTERN = /^\d+(\.\d+)?$/;
    MAX_NAME_LENGTH = 250;
    MAX_DESCRIPTION_LENGTH = 500;
    MAX_PRICE = 999999.99;
    MIN_PRICE = 0.01;
  }
});

// src/lib/catalog/csv-writer.ts
import { parse as parse2 } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFile as readFile2, writeFile } from "node:fs/promises";
async function updateCatalogPaymentLinks(updates, path) {
  const csvPath = path ?? CATALOG_PATH;
  const content = await readFile2(csvPath, "utf-8");
  const records = parse2(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });
  if (records.length === 0) return;
  const columns = Object.keys(records[0]);
  if (!columns.includes("Payment Link")) {
    columns.push("Payment Link");
    for (const record of records) {
      record["Payment Link"] = "";
    }
  }
  for (const record of records) {
    const sku = (record["SKU"] ?? "").trim();
    if (sku && updates.has(sku)) {
      record["Payment Link"] = updates.get(sku);
    }
  }
  const output = stringify(records, { header: true, columns });
  await writeFile(csvPath, output);
}
var init_csv_writer = __esm({
  "src/lib/catalog/csv-writer.ts"() {
    "use strict";
    init_csv();
  }
});

// src/lib/stripe/errors.ts
var StripeSetupError;
var init_errors = __esm({
  "src/lib/stripe/errors.ts"() {
    "use strict";
    StripeSetupError = class extends Error {
      guidance;
      constructor(message, guidance, cause) {
        super(
          `[Storefront] ${message}
  \u2192 See SETUP.md${guidance} for steps to fix this.`
        );
        this.name = "StripeSetupError";
        this.guidance = guidance;
        if (cause) {
          this.cause = cause;
        }
      }
    };
  }
});

// src/lib/stripe/client.ts
import Stripe from "stripe";
function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeSetupError(
      "STRIPE_SECRET_KEY is not set",
      "#missing-api-key"
    );
  }
  if (!key.startsWith("sk_")) {
    throw new StripeSetupError(
      "STRIPE_SECRET_KEY must start with sk_ (secret key). You may have pasted a publishable key (pk_*) by mistake.",
      "#invalid-key-format"
    );
  }
  return new Stripe(key);
}
var init_client = __esm({
  "src/lib/stripe/client.ts"() {
    "use strict";
    init_errors();
  }
});

// src/lib/storefront/pricing.ts
function getCurrencyDecimalPlaces(currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
}
function rawPriceToDecimal(rawPrice, currency) {
  const decimals = getCurrencyDecimalPlaces(currency);
  return rawPrice / 10 ** decimals;
}
function formatPrice(unitAmount, currency) {
  const amount = unitAmount ?? 0;
  const value = rawPriceToDecimal(amount, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(value);
}
function decimalToRawPrice(decimalPrice, currency) {
  const decimals = getCurrencyDecimalPlaces(currency);
  return Math.round(decimalPrice * 10 ** decimals);
}
var DEFAULT_CURRENCY;
var init_pricing = __esm({
  "src/lib/storefront/pricing.ts"() {
    "use strict";
    DEFAULT_CURRENCY = "usd";
  }
});

// src/lib/stripe/retry.ts
function isRetryable(err) {
  if (typeof err === "object" && err !== null && "type" in err && typeof err.type === "string") {
    return RETRYABLE_STRIPE_TYPES.has(err.type);
  }
  return true;
}
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 500) {
  if (maxAttempts < 1) {
    throw new Error("maxAttempts must be >= 1");
  }
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
var RETRYABLE_STRIPE_TYPES;
var init_retry = __esm({
  "src/lib/stripe/retry.ts"() {
    "use strict";
    RETRYABLE_STRIPE_TYPES = /* @__PURE__ */ new Set([
      "StripeConnectionError",
      "StripeRateLimitError",
      "StripeAPIError"
    ]);
  }
});

// src/lib/stripe/sync.ts
async function readStripeState(stripe) {
  return withRetry(async () => {
    const state = /* @__PURE__ */ new Map();
    const incompleteSkus = /* @__PURE__ */ new Map();
    for await (const product of stripe.products.list({ active: true, expand: ["data.default_price"] })) {
      const sku = product.metadata?.sku;
      if (!sku) continue;
      const defaultPrice = product.default_price;
      if (!defaultPrice || typeof defaultPrice === "string") {
        incompleteSkus.set(sku, product.id);
        continue;
      }
      state.set(sku, {
        productId: product.id,
        name: product.name,
        description: product.description || null,
        priceId: defaultPrice.id,
        unitAmount: defaultPrice.unit_amount ?? 0,
        currency: defaultPrice.currency,
        paymentLinkId: product.metadata?.payment_link_id ?? null,
        paymentLinkUrl: product.metadata?.payment_link_url ?? null
      });
    }
    return { state, incompleteSkus };
  });
}
function catalogDiff(catalog, stripeState, currency) {
  const toAdd = [];
  const toUpdate = [];
  const catalogSkus = new Set(catalog.map((p) => p.sku));
  for (const product of catalog) {
    const existing = stripeState.get(product.sku);
    if (!existing) {
      toAdd.push({ sku: product.sku, product });
      continue;
    }
    const changes = [];
    if (existing.name !== product.name) changes.push("name");
    if (existing.description !== (product.description ?? null)) changes.push("description");
    if (existing.currency !== currency) changes.push("currency");
    const expectedAmount = decimalToRawPrice(product.price, currency);
    if (existing.unitAmount !== expectedAmount) changes.push("price");
    if (product.storefront === true && existing.paymentLinkId === null) changes.push("storefront-added");
    if (product.storefront === false && existing.paymentLinkId !== null) changes.push("storefront-removed");
    if (changes.length > 0) {
      toUpdate.push({ sku: product.sku, product, existing, changes });
    }
  }
  const orphaned = [];
  for (const [sku, state] of stripeState) {
    if (!catalogSkus.has(sku)) {
      orphaned.push({ sku, state });
    }
  }
  return { toAdd, toUpdate, orphaned };
}
async function catalogAdd(stripe, toAdd, currency, incompleteSkus = /* @__PURE__ */ new Map()) {
  const newLinks = /* @__PURE__ */ new Map();
  const errors = [];
  for (const entry of toAdd) {
    try {
      let productId;
      if (incompleteSkus.has(entry.sku)) {
        productId = incompleteSkus.get(entry.sku);
        console.log(`[Sync] Resuming incomplete product: ${entry.sku}`);
      } else {
        const product = await withRetry(() => stripe.products.create({
          name: entry.product.name,
          description: entry.product.description ?? void 0,
          metadata: { sku: entry.sku }
        }));
        productId = product.id;
      }
      const rawPrice = decimalToRawPrice(entry.product.price, currency);
      const price = await withRetry(() => stripe.prices.create({
        product: productId,
        unit_amount: rawPrice,
        currency
      }));
      const updatePayload = { default_price: price.id, "metadata[sku]": entry.sku };
      if (entry.product.storefront) {
        const link = await withRetry(() => stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }]
        }));
        updatePayload["metadata[payment_link_id]"] = link.id;
        updatePayload["metadata[payment_link_url]"] = link.url;
        newLinks.set(entry.sku, link.url);
      }
      await withRetry(() => stripe.products.update(productId, updatePayload));
      console.log(`[Sync] Created: ${entry.sku} \u2014 ${entry.product.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Sync] Failed to create ${entry.sku}: ${message}`);
      errors.push({ sku: entry.sku, error: err });
      continue;
    }
  }
  return { links: newLinks, errors };
}
async function catalogUpdate(stripe, toUpdate, currency) {
  const updatedLinks = /* @__PURE__ */ new Map();
  const errors = [];
  for (const entry of toUpdate) {
    try {
      const productUpdate = {};
      if (entry.changes.includes("name")) productUpdate.name = entry.product.name;
      if (entry.changes.includes("description")) productUpdate.description = entry.product.description ?? "";
      const priceChanged = entry.changes.includes("price");
      if (priceChanged) {
        const rawPrice = decimalToRawPrice(entry.product.price, currency);
        const newPrice = await withRetry(() => stripe.prices.create({
          product: entry.existing.productId,
          unit_amount: rawPrice,
          currency
        }));
        await withRetry(() => stripe.prices.update(entry.existing.priceId, { active: false }));
        productUpdate.default_price = newPrice.id;
        if (entry.product.storefront) {
          if (entry.existing.paymentLinkId) {
            await withRetry(() => stripe.paymentLinks.update(entry.existing.paymentLinkId, { active: false }));
          }
          const newLink = await withRetry(() => stripe.paymentLinks.create({
            line_items: [{ price: newPrice.id, quantity: 1 }]
          }));
          productUpdate["metadata[sku]"] = entry.sku;
          productUpdate["metadata[payment_link_id]"] = newLink.id;
          productUpdate["metadata[payment_link_url]"] = newLink.url;
          updatedLinks.set(entry.sku, newLink.url);
          console.log(`[Sync] Updated: ${entry.sku} \u2014 price changed, new Payment Link created`);
        } else {
          console.log(`[Sync] Updated: ${entry.sku} \u2014 price changed`);
        }
      } else {
        console.log(`[Sync] Updated: ${entry.sku} \u2014 ${entry.changes.join(", ")}`);
      }
      if (Object.keys(productUpdate).length > 0) {
        await withRetry(() => stripe.products.update(entry.existing.productId, productUpdate));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Sync] Failed to update ${entry.sku}: ${message}`);
      errors.push({ sku: entry.sku, error: err });
      continue;
    }
  }
  return { links: updatedLinks, errors };
}
var init_sync = __esm({
  "src/lib/stripe/sync.ts"() {
    "use strict";
    init_pricing();
    init_retry();
  }
});

// src/lib/stripe/catalog-cli.ts
var catalog_cli_exports = {};
__export(catalog_cli_exports, {
  runCatalogSync: () => runCatalogSync
});
async function runCatalogSync(mode) {
  const catalog = await loadCatalog();
  const stripe = getStripeClient();
  const currency = DEFAULT_CURRENCY;
  const { state, incompleteSkus } = await readStripeState(stripe);
  const diff = catalogDiff(catalog, state, currency);
  if (mode === "diff") {
    if (diff.toAdd.length > 0) {
      console.log(`
New products (${diff.toAdd.length}):`);
      for (const entry of diff.toAdd) {
        const type = entry.product.storefront ? "storefront" : "order sheet";
        console.log(`  + ${entry.sku}: ${entry.product.name} \u2014 ${formatPrice(decimalToRawPrice(entry.product.price, currency), currency)} (${type})`);
      }
    }
    if (diff.toUpdate.length > 0) {
      console.log(`
Products to update (${diff.toUpdate.length}):`);
      for (const entry of diff.toUpdate) {
        console.log(`  ~ ${entry.sku}: ${entry.changes.join(", ")}`);
      }
    }
    if (diff.orphaned.length > 0) {
      console.log(`
Orphaned in Stripe (${diff.orphaned.length}):`);
      for (const entry of diff.orphaned) {
        console.log(`  ? ${entry.sku}: ${entry.state.name}`);
      }
    }
    if (diff.toAdd.length === 0 && diff.toUpdate.length === 0 && diff.orphaned.length === 0) {
      console.log("\nEverything is in sync.");
    }
    return;
  }
  const allUpdatedLinks = /* @__PURE__ */ new Map();
  const allErrors = [];
  if (mode === "add" || mode === "sync") {
    if (diff.toAdd.length > 0) {
      const result = await catalogAdd(stripe, diff.toAdd, currency, incompleteSkus);
      for (const [sku, url] of result.links) allUpdatedLinks.set(sku, url);
      allErrors.push(...result.errors);
    } else {
      console.log("[Sync] No new products to add.");
    }
  }
  if (mode === "update" || mode === "sync") {
    if (diff.toUpdate.length > 0) {
      const result = await catalogUpdate(stripe, diff.toUpdate, currency);
      for (const [sku, url] of result.links) allUpdatedLinks.set(sku, url);
      allErrors.push(...result.errors);
    } else {
      console.log("[Sync] No products to update.");
    }
  }
  if (allUpdatedLinks.size > 0) {
    await updateCatalogPaymentLinks(allUpdatedLinks);
    console.log(`[Sync] Wrote ${allUpdatedLinks.size} Payment Link URL${allUpdatedLinks.size === 1 ? "" : "s"} back to products/catalog.csv`);
  }
  if (diff.orphaned.length > 0) {
    console.log(`[Sync] Warning: ${diff.orphaned.length} Stripe product${diff.orphaned.length === 1 ? "" : "s"} not in catalog:`);
    for (const entry of diff.orphaned) {
      console.log(`  ? ${entry.sku}: ${entry.state.name}`);
    }
  }
  if (allErrors.length > 0) {
    const skus = allErrors.map((e) => e.sku);
    for (const e of allErrors) {
      const message = e.error instanceof Error ? e.error.message : String(e.error);
      console.error(`[Sync] Error: ${e.sku}: ${message}`);
    }
    throw new Error(`[Sync] ${allErrors.length} SKUs failed: ${skus.join(", ")}`);
  }
}
var init_catalog_cli = __esm({
  "src/lib/stripe/catalog-cli.ts"() {
    "use strict";
    init_csv();
    init_csv_writer();
    init_client();
    init_sync();
    init_pricing();
  }
});

// bin/catalog.ts
var command = process.argv[2];
var validCommands = ["diff", "add", "update", "sync"];
function isValidCommand(cmd) {
  return typeof cmd === "string" && validCommands.includes(cmd);
}
if (!isValidCommand(command)) {
  console.log("Usage: catalog <command>\n");
  console.log("Commands:");
  console.log("  diff    Show what would change (read-only)");
  console.log("  add     Create new Stripe products from catalog");
  console.log("  update  Update existing Stripe products from catalog");
  console.log("  sync    Run add + update");
  process.exit(command === void 0 ? 0 : 1);
}
try {
  const { runCatalogSync: runCatalogSync2 } = await Promise.resolve().then(() => (init_catalog_cli(), catalog_cli_exports));
  await runCatalogSync2(command);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
