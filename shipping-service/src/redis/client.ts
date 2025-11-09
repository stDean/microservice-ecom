import { createClient, RedisClientType } from "redis";

/**
 * @title Redis Service Singleton (Cache + Pub/Sub)
 * @notice Provides Redis client management with both caching and subscriber functionality
 * @dev Implements singleton pattern for shared Redis connection across application
 */
class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private subscriber: RedisClientType;
  private isConnected: boolean = false;
  private publisher: RedisClientType;

  /**
   * @notice Private constructor for singleton pattern
   * @dev Initializes Redis client and subscriber with environment configuration
   */
  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      password: process.env.REDIS_PASSWORD, // Optional
    });

    this.subscriber = this.client.duplicate();

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
   * @notice Sets up Redis client and subscriber event listeners
   * @dev Logs errors and connection status for monitoring
   */
  private setupEventListeners() {
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.client.on("connect", () => console.log("Redis Client Connected"));
    this.client.on("ready", () => {
      console.log("Redis Client Ready");
      this.isConnected = true;
    });
    this.client.on("disconnect", () => {
      console.log("Redis Client Disconnected");
      this.isConnected = false;
    });

    this.subscriber.on("error", (err) =>
      console.error("Redis Subscriber Error", err)
    );

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
      await this.subscriber.connect();
      await this.publisher.connect();
      this.isConnected = true;
    }
  }

  // ==================== CACHING METHODS ====================

  /**
   * @notice Sets a key-value pair in Redis cache
   * @param key Cache key
   * @param value Value to cache (will be JSON stringified)
   * @param ttlInSeconds Time to live in seconds (optional)
   */
  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      if (ttlInSeconds) {
        await this.client.set(key, stringValue, { EX: ttlInSeconds });
      } else {
        await this.client.set(key, stringValue);
      }
    } catch (error) {
      console.error("Redis set error:", error);
      throw error;
    }
  }

  /**
   * @notice Retrieves a value from Redis cache
   * @param key Cache key
   * @returns Parsed value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error("Redis get error:", error);
      throw error;
    }
  }

  /**
   * @notice Deletes a key from Redis cache
   * @param key Cache key to delete
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error("Redis delete error:", error);
      throw error;
    }
  }

  /**
   * @notice Checks if a key exists in Redis cache
   * @param key Cache key to check
   * @returns Boolean indicating existence
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error("Redis exists error:", error);
      throw error;
    }
  }

  /**
   * @notice Sets expiration time on a key
   * @param key Cache key
   * @param ttlInSeconds Time to live in seconds
   */
  async expire(key: string, ttlInSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlInSeconds);
    } catch (error) {
      console.error("Redis expire error:", error);
      throw error;
    }
  }

  /**
   * @notice Gets time to live for a key
   * @param key Cache key
   * @returns TTL in seconds, -2 if key doesn't exist, -1 if no expiry
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error("Redis TTL error:", error);
      throw error;
    }
  }

  /**
   * @notice Increments a numeric value
   * @param key Cache key
   * @param incrementBy Amount to increment (default: 1)
   */
  async incr(key: string, incrementBy: number = 1): Promise<number> {
    try {
      if (incrementBy === 1) {
        return await this.client.incr(key);
      } else {
        return await this.client.incrBy(key, incrementBy);
      }
    } catch (error) {
      console.error("Redis increment error:", error);
      throw error;
    }
  }

  /**
   * @notice Flushes all cache data (use with caution!)
   */
  async flushAll(): Promise<void> {
    try {
      await this.client.flushAll();
    } catch (error) {
      console.error("Redis flushAll error:", error);
      throw error;
    }
  }

  // ==================== PUB/SUB METHODS (Existing) ====================

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
   * @dev Destroys both subscriber and client connections
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    await this.subscriber.quit();
    await this.client.quit();
    await this.publisher.quit();
  }

  /**
   * @notice Gets connection status
   * @returns Boolean indicating if Redis is connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected && this.client.isOpen;
  }
}

export default RedisService;
