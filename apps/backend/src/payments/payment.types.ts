export interface CreateOrderInput {
  sessionId: string;
  productId: string;
  quantity: number;
  amount: number;
  currency: string;
}

export interface PaymentWebhookEvent {
  event: 'payment.captured' | 'payment.failed';
  payment: {
    id: string;
    orderId: string;
  };
}