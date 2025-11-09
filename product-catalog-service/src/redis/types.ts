export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

export interface OrderPlaced extends BaseEvent {
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
  };
}

export interface OrderCancelled extends BaseEvent {
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
  };
}

export type ProductType = OrderCancelled | OrderPlaced;