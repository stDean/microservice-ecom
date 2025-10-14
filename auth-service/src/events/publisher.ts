import RedisService from "./client";
import {
  BaseEvent,
  PasswordResetEvent,
  UserLoggedInEvent,
  UserRegisteredEvent,
} from "./types";

/**
 * @title Event Publisher Service
 * @notice Handles publishing of domain events to Redis
 * @dev Provides typed methods for specific event types with consistent structure
 */
export class EventPublisher {
  private redis: RedisService;

  /**
   * @notice Initializes event publisher with Redis service
   * @dev Uses singleton RedisService instance for connection management
   */
  constructor() {
    this.redis = RedisService.getInstance();
  }

  /**
   * @notice Publishes generic event to Redis
   * @dev Handles serialization and error logging for all event types
   * @param event Event object implementing BaseEvent interface
   * @throws Error if Redis publish fails
   */
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

  /**
   * @notice Publishes user registration event
   * @param data User registration data including verification token
   */
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

  /**
   * @notice Publishes password reset request event
   * @param data Password reset data including reset token and expiration
   */
  async publishPasswordReset(data: PasswordResetEvent["data"]): Promise<void> {
    await this.publishEvent({
      type: "PASSWORD_RESET_REQUESTED",
      source: "auth-service",
      timestamp: new Date(),
      version: "1.0.0",
      data,
    } as PasswordResetEvent);
  }

  /**
   * @notice Publishes user login event
   * @param data User login data including timestamp and user agent
   */
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

/**
 * @notice Singleton instance of EventPublisher
 * @dev Pre-configured instance for application-wide use
 */
export const eventPublisher = new EventPublisher();
