export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

interface PaymentSuccessfulEvent extends BaseEvent {
  type: "PAYMENT_SUCCESS";
  data: { paymentId: string };
}

interface PaymentFailedEvent extends BaseEvent {
  type: "PAYMENT_FAILED";
  data: { paymentId: string };
}

export interface RefundPaymentEvent extends BaseEvent {
  type: "ORDER_REFUND_REQUESTED";
  data: {
    orderId: string;
    paymentTransactionId: string;
    amount: number;
  };
}

export type PaymentEvent = RefundPaymentEvent;
