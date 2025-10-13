import RedisService from "./client";
import {
  AppEvent,
  BaseEvent,
  PasswordResetEvent,
  UserRegisteredEvent,
} from "../events/types";

export class EventPublisher {
  private redis: RedisService;

  constructor() {
    this.redis = RedisService.getInstance();
  }

  async publishEvent<T extends BaseEvent>(event: T): Promise<void> {
    try {
      await this.redis.publish(event.type, event);
      console.log(`📢 Published event: ${event.type}`, {
        source: event.source,
        timestamp: event.timestamp,
      });
    } catch (error) {
      console.error(`❌ Failed to publish event ${event.type}:`, error);
      throw error;
    }
  }

  // Convenience methods for common events
  async publishUserRegistered(
    data: UserRegisteredEvent["data"]
  ): Promise<void> {
    await this.publishEvent({
      type: "USER_REGISTERED",
      source: "auth-service",
      timestamp: new Date(),
      version: "1.0.0",
      data,
    } as UserRegisteredEvent);
  }

  async publishPasswordReset(data: PasswordResetEvent["data"]): Promise<void> {
    await this.publishEvent({
      type: "PASSWORD_RESET_REQUESTED",
      source: "auth-service",
      timestamp: new Date(),
      version: "1.0.0",
      data,
    } as PasswordResetEvent);
  }
}

export class EventSubscriber {
  private redis: RedisService;

  constructor() {
    this.redis = RedisService.getInstance();
  }

  async subscribeToEvent(
    eventType: string,
    handler: (event: AppEvent) => void
  ): Promise<void> {
    await this.redis.subscribe(eventType, handler);
    console.log(`👂 Subscribed to event: ${eventType}`);
  }

  async unsubscribeFromEvent(eventType: string): Promise<void> {
    await this.redis.unsubscribe(eventType);
    console.log(`🚫 Unsubscribed from event: ${eventType}`);
  }
}

// Export singleton instances
export const eventPublisher = new EventPublisher();
export const eventSubscriber = new EventSubscriber();
