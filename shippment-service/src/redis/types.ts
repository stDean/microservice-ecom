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
    email: string;
    shippingAddress: {
      street: String;
      city: String;
      state: String;
      zipCode: String;
      country: String;
    };
  };
}

export interface ShipProductEvent extends BaseEvent {
  type: "SHIP_PRODUCT_PAY_ON_DELIVERY";
  data: {
    orderId: string;
    userId: string;
    email: string;
    shippingAddress: {
      street: String;
      city: String;
      state: String;
      zipCode: String;
      country: String;
    };
  };
}

export type ShippingEvent = PaymentProcessedEvent | ShipProductEvent;
