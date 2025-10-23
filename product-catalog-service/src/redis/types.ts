export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

export interface OrderCompleted extends BaseEvent {
  type: "ORDER_COMPLETED";
}
