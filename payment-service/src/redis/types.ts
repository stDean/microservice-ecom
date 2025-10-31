export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

export interface RefundPaymentEvent extends BaseEvent {
  type: "ORDER_REFUND_REQUESTED";
  data: {
    orderId: string;
    paymentTransactionId: string;
    amount: number;
    email: string;
  };
}

export type PaymentEvent = RefundPaymentEvent;
