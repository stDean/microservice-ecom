export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

interface ProductData {
  productId: string;
  name: string;
  description: string;
  categoryId: string;
  // Add other fields necessary for consumers to index or log
}

export interface ProductCreated extends BaseEvent {
  type: "PRODUCT_CREATED";
  data: ProductData;
}

export interface ProductDeleted extends BaseEvent {
  type: "PRODUCT_DELETED";
  data: { productId: string };
}

export interface ProductUpdated extends BaseEvent {
  type: "PRODUCT_UPDATED";
  data: ProductData & {
    changes: Array<{ field: string; oldValue: any; newValue: any }>; // Optional: helpful for auditing
  };
}

export interface ProductPriceChange extends BaseEvent {
  type: "PRODUCT_PRICE_CHANGE";
  data: {
    productId: string;
    oldPrice: string;
    newPrice: string;
    currency: string;
  };
}

export interface OrderCompleted extends BaseEvent {
  type: "ORDER_COMPLETED";
}

export type ProductEvent =
  | ProductCreated
  | ProductDeleted
  | ProductUpdated
  | ProductPriceChange;
