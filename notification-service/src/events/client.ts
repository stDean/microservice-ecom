import { createClient, RedisClientType } from "redis";

/**
 * @title Redis Service Singleton (Subscriber)
 * @notice Provides Redis client management with subscriber functionality
 * @dev Implements singleton pattern for shared Redis subscription across application
 */
class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private subscriber: RedisClientType;

  /**
   * @notice Private constructor for singleton pattern
   * @dev Initializes Redis client and subscriber with environment configuration
   */
  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    this.subscriber = this.client.duplicate();

    this.setupEventListeners();
  }

  /**
   * @notice Returns singleton RedisService instance
   * @dev Creates new instance only if one doesn't exist
   * @return RedisService Singleton instance
   */
  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * @notice Sets up Redis client and subscriber error listeners
   * @dev Logs errors to console for monitoring and debugging
   */
  private setupEventListeners() {
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.subscriber.on("error", (err) =>
      console.error("Redis Subscriber Error", err)
    );
  }

  /**
   * @notice Establishes connection to Redis server
   * @dev Only connects if client is not already open
   */
  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
      await this.subscriber.connect();
    }
  }

  /**
   * @notice Subscribes to Redis channel with message handler
   * @dev Automatically parses JSON messages and handles parse errors
   * @param channel Redis channel name to subscribe to
   * @param callback Function to handle incoming messages
   */
  async subscribe(
    channel: string,
    callback: (message: any) => void
  ): Promise<void> {
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    });
  }

  /**
   * @notice Unsubscribes from Redis channel
   * @param channel Redis channel name to unsubscribe from
   */
  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  /**
   * @notice Gracefully disconnects from Redis server
   * @dev Destroys both subscriber and client connections
   */
  async disconnect(): Promise<void> {
    await this.subscriber.destroy();
    await this.client.destroy();
  }
}

export default RedisService;
