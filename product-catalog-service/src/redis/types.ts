export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

interface OrderData {
  orderid: string;
  status: string;
}

export interface OrderPlaced extends BaseEvent {
  type: "ORDER_PLACED";
  data: OrderData;
}

export interface OrderCompleted extends BaseEvent {
  type: "ORDER_COMPLETED";
  data: OrderData;
}

export interface OrderCanceled extends BaseEvent {
  type: "ORDER_CANCELED";
  data: OrderData;
}
