import { Type, type FunctionDeclaration } from '@google/genai';
import * as catalogService from '../catalog/catalog.service.js';
import { serializeProducts, serializeProduct } from '../catalog/catalog.serializer.js';
import type { ProposePurchaseArgs, ProposePurchaseResult } from './agent.types.js';

/**
 * Why this file exists:
 * This is the agent's ENTIRE capability surface. If a tool isn't declared
 * here, the agent cannot do it — full stop. This is the architectural
 * enforcement mechanism for "the agent can never skip the gate": notice
 * there is no `create_payment` or `call_razorpay` tool anywhere in this
 * file. The only path toward spending money is `propose_purchase`, and
 * its handler routes to the Gating Engine, never to Razorpay directly.
 *
 * Two things live in this file, kept together intentionally:
 * 1. The `FunctionDeclaration` — the JSON schema Gemini needs to know a
 *    tool exists and how to call it.
 * 2. The actual implementation — what happens when Gemini decides to call it.
 */

// ---------- Tool Declarations (schemas Gemini sees) ----------

export const searchCatalogDeclaration: FunctionDeclaration = {
  name: 'search_catalog',
  description:
    'Search the product catalog by free-text query and/or filters (category, gender, size, price range). Use this whenever the user describes what they want to buy.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Free-text search, e.g. "running shoes"' },
      category: { type: Type.STRING, description: 'e.g. Footwear, Electronics, Apparel' },
      gender: { type: Type.STRING, description: 'e.g. Men, Women, Unisex' },
      size: { type: Type.STRING, description: 'e.g. UK 9, M, L' },
      maxPrice: { type: Type.NUMBER, description: 'Maximum price in rupees (not paise)' },
    },
  },
};

export const getProductDetailsDeclaration: FunctionDeclaration = {
  name: 'get_product_details',
  description:
    'Get full details for one specific product by SKU, including its voice-friendly description for responding to the user.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      sku: { type: Type.STRING, description: 'The exact product SKU' },
    },
    required: ['sku'],
  },
};

export const proposePurchaseDeclaration: FunctionDeclaration = {
  name: 'propose_purchase',
  description:
    'Propose completing a purchase for a specific product. ONLY call this after you have stated the exact product, quantity, and price out loud to the user AND the user has given an explicit, unambiguous "yes". Never call this on an implied or soft agreement — if in doubt, ask the user to confirm again first.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      sku: { type: Type.STRING, description: 'The exact product SKU being purchased' },
      quantity: { type: Type.NUMBER, description: 'Quantity, default 1' },
      userConfirmed: {
        type: Type.BOOLEAN,
        description: 'Must be true, and only true if the user explicitly said yes to this exact purchase.',
      },
    },
    required: ['sku', 'quantity', 'userConfirmed'],
  },
};

export const agentToolDeclarations: FunctionDeclaration[] = [
  searchCatalogDeclaration,
  getProductDetailsDeclaration,
  proposePurchaseDeclaration,
];

// ---------- Tool Implementations ----------

async function executeSearchCatalog(args: {
  query?: string;
  category?: string;
  gender?: string;
  size?: string;
  maxPrice?: number;
}) {
  const rows = await catalogService.searchProducts({
    query: args.query,
    category: args.category,
    gender: args.gender,
    size: args.size,
    maxPrice: args.maxPrice ? Math.round(args.maxPrice * 100) : undefined, // rupees -> paise
    limit: 10,
    offset: 0,
  });

  // Return a lean shape to the model — full schema.org JSON-LD is verbose
  // and wastes tokens; the model just needs enough to talk about options.
  return serializeProducts(rows).map((p) => ({
    sku: p.sku,
    name: p.name,
    price: p.offers.price,
    currency: p.offers.priceCurrency,
    availability: p.offers.availability,
    voiceDescription: p.extensions.voiceDescription,
  }));
}

async function executeGetProductDetails(args: { sku: string }) {
  const row = await catalogService.getProductBySku(args.sku);
  return serializeProduct(row);
}

/**
 * IMPORTANT — current state (TEMPORARY):
 * The Gating Engine doesn't exist yet (it's the very next module we build).
 * This handler is intentionally a clearly-marked placeholder so the agent
 * module is fully testable right now via search/details, without pretending
 * money-flow is real. Once gating.service.ts exists, this function gets
 * replaced with a real call into it — nothing else in this file changes.
 */
async function executeProposePurchase(args: ProposePurchaseArgs): Promise<ProposePurchaseResult> {
  if (!args.userConfirmed) {
    return {
      status: 'rejected',
      message: 'Purchase not proposed: user confirmation flag was not true.',
    };
  }

  // TODO: replace with `gatingService.evaluatePurchase(args)` once built.
  return {
    status: 'pending_gate_check',
    message: `[STUB] Gating Engine not yet wired. Would propose purchase of ${args.quantity}x ${args.sku}.`,
  };
}

// ---------- Executor Dispatch ----------

/**
 * The orchestrator (agent.service.ts) calls this with whatever function
 * call Gemini returns. Centralizing dispatch here means the orchestrator
 * loop never needs to know about individual tool implementations.
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_catalog':
      return executeSearchCatalog(args as Parameters<typeof executeSearchCatalog>[0]);
    case 'get_product_details':
      return executeGetProductDetails(args as { sku: string });
    case 'propose_purchase':
      return executeProposePurchase(args as unknown as ProposePurchaseArgs);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
