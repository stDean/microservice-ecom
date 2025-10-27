export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}
