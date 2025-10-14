import RedisService from "./client";
import {
  BaseEvent,
  PasswordResetEvent,
  UserLoggedInEvent,
  UserRegisteredEvent,
} from "./types";

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

  async publishUserLoggedIn(data: UserLoggedInEvent["data"]): Promise<void> {
    await this.publishEvent({
      type: "USER_LOGGED_IN",
      source: "auth-service",
      timestamp: new Date(),
      version: "1.0.0",
      data,
    } as UserLoggedInEvent);
  }
}

export const eventPublisher = new EventPublisher();
