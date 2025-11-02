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

export interface OrderShippedEvent extends BaseEvent {
  type: "ORDER_SHIPPED";
  data: {
    orderId: string;
    userId: string;
    trackingNumber: string;
    estimatedDelivery: Date;
    shippedAt: Date;
  };
}

export interface OrderDeliveredEvent extends BaseEvent {
  type: "ORDER_DELIVERED";
  data: {
    orderId: string;
    userId: string;
    trackingNumber: string;
    deliveredAt: Date;
  };
}

export type OrderType =
  | PaymentProcessedEvent
  | OrderShippedEvent
  | OrderDeliveredEvent;
