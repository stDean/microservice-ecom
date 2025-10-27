export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

export interface UserRegisteredEvent extends BaseEvent {
  type: "USER_REGISTERED";
  data: {
    userId: string;
    email: string;
    name: string;
    verificationToken: string;
  };
}

export interface PasswordResetEvent extends BaseEvent {
  type: "PASSWORD_RESET_REQUESTED";
  data: {
    email: string;
    resetToken: string;
    expiresAt: Date;
  };
}

export interface UserLoggedInEvent extends BaseEvent {
  type: "USER_LOGGED_IN";
  data: {
    userId: string;
    ipAddress: string;
    userAgent: string;
  };
}

export interface OrderPlacedEvent extends BaseEvent {
  type: "ORDER_PLACED";
  data: {
    orderId: string;
    status: string;
    userId: string;
    items: Array<{
      productId: string;
      productName: string;
      productSku: string | null;
      quantity: number;
      unitPrice: string;
    }>;
    subtotal: number;
    shippingCost: number;
    taxAmount: number;
    totalAmount: number;
  };
}

export interface OrderCancelledEvent extends BaseEvent {
  type: "ORDER_CANCELLED";
  data: {
    orderId: string;
    status: string;
    requiresRefund: boolean;
    previousStatus: string;
    items: Array<{
      productId: string;
      productName: string;
      productSku: string | null;
      quantity: number;
      unitPrice: string;
    }>;
    userId: string;
    reason?: string;
  };
}

export type NotificationEvent =
  | UserRegisteredEvent
  | PasswordResetEvent
  | UserLoggedInEvent
  | OrderPlacedEvent
  | OrderCancelledEvent;
