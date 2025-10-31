export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

export interface PaymentProcessedEvent extends BaseEvent {
  type: "PAYMENT_PROCESSED";
  data: {
    paymentTransactionId: string;
    message: string;
    orderId: string;
    userId: string;
  };
}

export type OrderType = PaymentProcessedEvent;
