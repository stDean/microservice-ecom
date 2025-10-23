export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

interface ProductData {
  productId: string;
  name: string;
  message: string;
  newStatus?: boolean;
}

export interface ProductStatusChange extends BaseEvent {
  type: "PRODUCT_STATUS_CHANGED";
  data: ProductData;
}

export interface ProductDeleted extends BaseEvent {
  type: "PRODUCT_DELETED";
  data: Omit<ProductData, "name">;
}

export interface ProductPriceChange extends BaseEvent {
  type: "PRODUCT_PRICE_CHANGE";
  data: ProductData;
}

export interface OrderCompleted extends BaseEvent {
  type: "ORDER_COMPLETED";
  data: {
    orderId: string;
    userId: string;
  };
}

export type CartEvents =
  | ProductStatusChange
  | ProductDeleted
  | ProductPriceChange
  | OrderCompleted;
