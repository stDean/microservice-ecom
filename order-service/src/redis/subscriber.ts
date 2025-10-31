import RedisService from "./client";
import { OrderType } from "./types";

/**
 * @title Event Subscriber Service
 * @notice Handles subscription to Redis event channels
 * @dev Provides typed event subscription with consistent logging
 */
export class EventSubscriber {
  private redis: RedisService;

  /**
   * @notice Initializes event subscriber with Redis service
   * @dev Uses singleton RedisService instance for connection management
   */
  constructor() {
    this.redis = RedisService.getInstance();
  }

  /**
   * @notice Subscribes to specific event type with handler
   * @param eventType Redis channel/event type to subscribe to
   * @param handler Callback function to process received events
   */
  async subscribeToEvent(
    eventType: string,
    handler: (event: OrderType) => void
  ): Promise<void> {
    await this.redis.subscribe(eventType, handler);
    console.log(`👂 Subscribed to event: ${eventType}`);
  }

  /**
   * @notice Unsubscribes from specific event type
   * @param eventType Redis channel/event type to unsubscribe from
   */
  async unsubscribeFromEvent(eventType: string): Promise<void> {
    await this.redis.unsubscribe(eventType);
    console.log(`🚫 Unsubscribed from event: ${eventType}`);
  }
}

/**
 * @notice Singleton instance of EventSubscriber
 * @dev Pre-configured subscriber for application-wide use
 */
export const eventSubscriber = new EventSubscriber();
