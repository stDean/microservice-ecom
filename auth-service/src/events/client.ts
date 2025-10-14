import { createClient, RedisClientType } from "redis";

/**
 * @title Redis Service Singleton
 * @notice Provides Redis client management with publisher functionality
 * @dev Implements singleton pattern for shared Redis connection across application
 */
class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private publisher: RedisClientType;

  /**
   * @notice Private constructor for singleton pattern
   * @dev Initializes Redis client and publisher with environment configuration
   */
  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    this.publisher = this.client.duplicate();

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
   * @notice Sets up Redis client and publisher error listeners
   * @dev Logs errors to console for monitoring and debugging
   */
  private setupEventListeners() {
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.publisher.on("error", (err) =>
      console.error("Redis Publisher Error", err)
    );
  }

  /**
   * @notice Establishes connection to Redis server
   * @dev Only connects if client is not already open
   */
  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
      await this.publisher.connect();
    }
  }

  /**
   * @notice Publishes message to Redis channel
   * @dev Automatically serializes message to JSON string
   * @param channel Redis channel name to publish to
   * @param message Data to publish (will be JSON stringified)
   */
  async publish(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  /**
   * @notice Gracefully disconnects from Redis server
   * @dev Destroys both publisher and client connections
   */
  async disconnect(): Promise<void> {
    await this.publisher.destroy();
    await this.client.destroy();
  }
}

export default RedisService;
