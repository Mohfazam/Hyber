export interface GatingCheck {
  check: string;
  result: boolean;
  detail?: string;
}

export interface GatingDecisionResult {
  passed: boolean;
  gatingDecisionId: string;
  reason: string;
  checks: GatingCheck[];
  product?: {
    sku: string;
    name: string;
    price: number; // paise
    currency: string;
  };
}

export interface EvaluatePurchaseInput {
  sessionId: string;
  sku: string;
  quantity: number;
  userConfirmed: boolean;
}
