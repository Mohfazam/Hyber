import type { Content } from '@google/genai';

/**
 * Why this file exists:
 * Defines the shapes the agent module works with, separate from Gemini's
 * own SDK types where we need something more specific to our domain.
 */

/** What we persist per conversation — matches the `sessions` table's jsonb column. */
export interface AgentSessionState {
  sessionId: string;
  history: Content[]; // Gemini's own Content[] format — role + parts, reused directly
}

/** The payload shape when the agent proposes a purchase. This is what gets
 * handed to the Gating Engine — the agent NEVER calls payments directly. */
export interface ProposePurchaseArgs {
  sku: string;
  quantity: number;
  userConfirmed: boolean; // set true only when the user gave an explicit, unambiguous yes
}

export interface ProposePurchaseResult {
  status: 'pending_gate_check' | 'rejected';
  message: string;
  gatingDecisionId?: string;
}
