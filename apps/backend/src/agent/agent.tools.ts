import { Type, type FunctionDeclaration } from '@google/genai';
import * as catalogService from '../catalog/catalog.service.js';
import { serializeProducts, serializeProduct } from '../catalog/catalog.serializer.js';
import * as gatingService from '../gating/gating.service.js';
import type { ProposePurchaseArgs, ProposePurchaseResult } from './agent.types.js';

/**
 * UPDATED from the agent-module version � executeProposePurchase now calls
 * the real Gating Engine instead of returning a stub. Everything else in
 * this file is unchanged. Replace the full contents of
 * src/agent/agent.tools.ts with this.
 *
 * Note the import of `sessionId` handling below � propose_purchase needs
 * the session ID to log against, so its signature changes slightly: the
 * executor now takes sessionId as a second argument, threaded through from
 * agent.service.ts's tool-calling loop.
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
    'Propose completing a purchase for a specific product. ONLY call this after you have stated the exact product, quantity, and price out loud to the user AND the user has given an explicit, unambiguous "yes". Never call this on an implied or soft agreement � if in doubt, ask the user to confirm again first.',
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
    maxPrice: args.maxPrice ? Math.round(args.maxPrice * 100) : undefined,
    limit: 10,
    offset: 0,
  });

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
 * Now calls the real Gating Engine. This function has NO ability to call
 * a payment API � it can only call gatingService.evaluatePurchase, which
 * itself has no payment capability yet either (that's the next module).
 * The agent's response to the user must be truthful about this: "pending"
 * language, not "done" language, until a real payment result exists.
 */
async function executeProposePurchase(
  args: ProposePurchaseArgs,
  sessionId: string,
): Promise<ProposePurchaseResult> {
  const decision = await gatingService.evaluatePurchase({
    sessionId,
    sku: args.sku,
    quantity: args.quantity,
    userConfirmed: args.userConfirmed,
  });

  if (!decision.passed) {
    return {
      status: 'rejected',
      message: `Purchase rejected: ${decision.reason}`,
    };
  }

  return {
    status: 'payment_ready',
    message: `Gate passed for ${args.quantity}x ${args.sku}. Razorpay order ${decision.paymentOrder?.id} is ready for payment.`,
    gatingDecisionId: decision.gatingDecisionId,
    paymentOrder: decision.paymentOrder,
  };
}

// ---------- Executor Dispatch ----------

/**
 * sessionId is now threaded through so propose_purchase can log against
 * the correct session � every other tool ignores it.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  sessionId: string,
): Promise<unknown> {
  switch (name) {
    case 'search_catalog':
      return executeSearchCatalog(args as Parameters<typeof executeSearchCatalog>[0]);
    case 'get_product_details':
      return executeGetProductDetails(args as { sku: string });
    case 'propose_purchase':
      return executeProposePurchase(args as unknown as ProposePurchaseArgs, sessionId);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
