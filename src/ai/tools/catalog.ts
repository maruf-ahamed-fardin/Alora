import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { products } from "../../db/schema";
import {
  optionalString,
  requiredString,
  type ToolContext,
  type ToolDefinition,
} from "./types";

const MAX_RESULTS = 5;
const MIN_WORD = 3;

type Product = typeof products.$inferSelect;

// "T-shirt", "tshirt" and "t shirt" should all find the same product, so
// compare with everything but letters and digits removed.
const squash = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function queryWords(query: string): string[] {
  return (
    query
      .split(/[\s,.;:!?()]+/)
      .map(squash)
      // Very short words ("er", "ta", "ki") match inside unrelated names.
      .filter((w) => w.length >= MIN_WORD)
  );
}

function colorOf(product: Product): string | undefined {
  const color = (product.attributes as { color?: unknown } | null)?.color;
  return typeof color === "string" ? color : undefined;
}

function sizesOf(product: Product): Record<string, number> | null {
  const sizes = (product.attributes as { sizes?: unknown } | null)?.sizes;
  if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) return null;
  const entries = Object.entries(sizes as Record<string, unknown>).filter(
    (e): e is [string, number] => typeof e[1] === "number",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function totalStock(product: Product): number {
  const sizes = sizesOf(product);
  return sizes
    ? Object.values(sizes).reduce((sum, n) => sum + n, 0)
    : product.stockQuantity;
}

const availableSizes = (sizes: Record<string, number>) =>
  Object.keys(sizes).filter((s) => sizes[s] > 0);

function view(product: Product) {
  const stock = totalStock(product);
  return {
    sku: product.sku,
    name: product.name,
    color: colorOf(product),
    description: product.description ?? undefined,
    price: Number(product.price),
    currency: product.currency,
    inStock: stock > 0,
    unitsLeft: stock,
    sizes: sizesOf(product) ?? undefined,
  };
}

async function activeProducts(businessId: string): Promise<Product[]> {
  return getDb()
    .select()
    .from(products)
    .where(and(eq(products.businessId, businessId), eq(products.isActive, true)));
}

type Match = { product: Product; score: number };

/**
 * Products whose name, SKU or colour contain the customer's words, best match
 * first. A shop's catalogue is small enough to filter in memory; this moves to
 * a SQL / vector search if catalogues grow large.
 */
async function findProducts(businessId: string, query: string): Promise<Match[]> {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const all = await activeProducts(businessId);
  return all
    .map((product) => {
      const haystack = squash(`${product.name} ${product.sku} ${colorOf(product) ?? ""}`);
      return { product, score: words.filter((w) => haystack.includes(w)).length };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
}

export function getProductTool({ businessId }: ToolContext): ToolDefinition {
  return {
    name: "get_product",
    description:
      "Look up products in the shop's catalogue by name, colour or SKU. Returns the real price, whether it is in stock and the units left per size. Use it for every question about what the shop sells, its price or whether it exists. With an empty query it lists the first few products. Never state a price without calling this.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'What the customer asked about, e.g. "black tshirt", "jeans", "PL-RED-001".',
        },
      },
    },
    async run(input) {
      const query = optionalString(input, "query");
      if (!query) {
        const all = await activeProducts(businessId);
        return { products: all.slice(0, MAX_RESULTS).map(view), listedWithoutQuery: true };
      }
      const matches = await findProducts(businessId, query);
      if (matches.length === 0) {
        return { products: [], note: "No product in the catalogue matches that." };
      }
      return { products: matches.slice(0, MAX_RESULTS).map((m) => view(m.product)) };
    },
  };
}

export function checkStockTool({ businessId }: ToolContext): ToolDefinition {
  return {
    name: "check_stock",
    description:
      "Check whether one product, optionally in one size, is available right now and how many are left. Use it when the customer asks if something is available or in a particular size. If it returns several candidates, ask the customer which one they mean.",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string", description: "Product name or SKU." },
        size: {
          type: "string",
          description: 'Size the customer wants, e.g. "L", "XL" or "32". Leave out if not asked.',
        },
      },
      required: ["product"],
    },
    async run(input) {
      const query = requiredString(input, "product");
      const size = optionalString(input, "size");

      const all = await activeProducts(businessId);
      let product = all.find((p) => p.sku.toLowerCase() === query.toLowerCase());
      if (!product) {
        const matches = await findProducts(businessId, query);
        if (matches.length === 0) {
          return { found: false, note: "No product in the catalogue matches that." };
        }
        if (matches.length > 1 && matches[0].score === matches[1].score) {
          return {
            found: true,
            ambiguous: true,
            candidates: matches
              .slice(0, MAX_RESULTS)
              .map((m) => ({ name: m.product.name, sku: m.product.sku })),
            note: "More than one product matches; ask the customer which one.",
          };
        }
        product = matches[0].product;
      }

      const sizes = sizesOf(product);
      const base = { found: true, name: product.name, sku: product.sku };

      if (!size) {
        const stock = totalStock(product);
        return {
          ...base,
          available: stock > 0,
          unitsLeft: stock,
          availableSizes: sizes ? availableSizes(sizes) : undefined,
        };
      }
      if (!sizes) {
        // A product without sizes: the size the customer named means nothing here.
        const stock = totalStock(product);
        return {
          ...base,
          available: stock > 0,
          unitsLeft: stock,
          note: "This product has no size variants.",
        };
      }
      const key = Object.keys(sizes).find((s) => s.toLowerCase() === size.toLowerCase());
      if (!key) {
        return {
          ...base,
          size,
          sizeOffered: false,
          available: false,
          availableSizes: availableSizes(sizes),
          note: `The shop does not stock size ${size} for this product.`,
        };
      }
      return {
        ...base,
        size: key,
        sizeOffered: true,
        available: sizes[key] > 0,
        unitsLeft: sizes[key],
        availableSizes: availableSizes(sizes),
      };
    },
  };
}
