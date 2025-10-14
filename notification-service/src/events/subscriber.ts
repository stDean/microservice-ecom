import RedisService from "./client";
import { NotificationEvent } from "./types";

export class EventSubscriber {
  private redis: RedisService;

  constructor() {
    this.redis = RedisService.getInstance();
  }

  async subscribeToEvent(
    eventType: string,
    handler: (event: NotificationEvent) => void
  ): Promise<void> {
    await this.redis.subscribe(eventType, handler);
    console.log(`👂 Subscribed to event: ${eventType}`);
  }

  async unsubscribeFromEvent(eventType: string): Promise<void> {
    await this.redis.unsubscribe(eventType);
    console.log(`🚫 Unsubscribed from event: ${eventType}`);
  }
}

export const eventSubscriber = new EventSubscriber();
