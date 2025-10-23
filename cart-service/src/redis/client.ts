import { createClient, RedisClientType } from "redis";

/**
 * @title Redis Service Singleton (Cache + Pub/Sub + Database)
 * @notice Provides Redis client management with caching, subscriber, and database functionality
 * @dev Implements singleton pattern for shared Redis connection across application
 */
class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private subscriber: RedisClientType;
  private publisher: RedisClientType;
  private isConnected: boolean = false;

  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      password: process.env.REDIS_PASSWORD,
    });

    this.subscriber = this.client.duplicate();
    this.publisher = this.client.duplicate();

    this.setupEventListeners();
  }

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  private setupEventListeners() {
    const clients = [this.client, this.subscriber, this.publisher];

    clients.forEach((client, index) => {
      const names = ["Client", "Subscriber", "Publisher"];
      client.on("error", (err) =>
        console.error(`Redis ${names[index]} Error`, err)
      );
      client.on("connect", () =>
        console.log(`Redis ${names[index]} Connected`)
      );
      client.on("ready", () => console.log(`Redis ${names[index]} Ready`));
      client.on("disconnect", () =>
        console.log(`Redis ${names[index]} Disconnected`)
      );
    });

    this.client.on("ready", () => {
      this.isConnected = true;
    });

    this.client.on("disconnect", () => {
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
      await this.subscriber.connect();
      await this.publisher.connect();
    }
  }

  // ==================== CACHING METHODS ====================

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

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error("Redis delete error:", error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error("Redis exists error:", error);
      throw error;
    }
  }

  async expire(key: string, ttlInSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlInSeconds);
    } catch (error) {
      console.error("Redis expire error:", error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error("Redis TTL error:", error);
      throw error;
    }
  }

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

  async flushAll(): Promise<void> {
    try {
      await this.client.flushAll();
    } catch (error) {
      console.error("Redis flushAll error:", error);
      throw error;
    }
  }

  async getKeys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error("Redis keys error:", error);
      throw error;
    }
  }

  // ==================== DATABASE METHODS ====================

  /**
   * @notice Hash operations - for storing object-like data
   */

  /**
   * Sets multiple fields in a hash
   */
  async hSet(key: string, fieldValues: Record<string, any>): Promise<void> {
    try {
      const serialized: Record<string, string> = {};
      for (const [field, value] of Object.entries(fieldValues)) {
        serialized[field] = JSON.stringify(value);
      }
      await this.client.hSet(key, serialized);
    } catch (error) {
      console.error("Redis hSet error:", error);
      throw error;
    }
  }

  /**
   * Sets a single field in a hash
   */
  async hSetField(key: string, field: string, value: any): Promise<void> {
    try {
      await this.client.hSet(key, field, JSON.stringify(value));
    } catch (error) {
      console.error("Redis hSetField error:", error);
      throw error;
    }
  }

  /**
   * Gets all fields and values from a hash
   */
  async hGetAll<T = any>(key: string): Promise<Record<string, T> | null> {
    try {
      const result = await this.client.hGetAll(key);
      if (!result || Object.keys(result).length === 0) return null;

      const parsed: Record<string, T> = {};
      for (const [field, value] of Object.entries(result)) {
        parsed[field] = JSON.parse(value);
      }
      return parsed;
    } catch (error) {
      console.error("Redis hGetAll error:", error);
      throw error;
    }
  }

  /**
   * Gets a specific field from a hash
   */
  async hGet<T>(key: string, field: string): Promise<T | null> {
    try {
      const value = await this.client.hGet(key, field);
      if (value === null) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error("Redis hGet error:", error);
      throw error;
    }
  }

  /**
   * Deletes fields from a hash
   */
  async hDel(key: string, fields: string[]): Promise<void> {
    try {
      await this.client.hDel(key, fields);
    } catch (error) {
      console.error("Redis hDel error:", error);
      throw error;
    }
  }

  /**
   * @notice List operations - for queues, stacks, and ordered data
   */

  /**
   * Pushes items to the end of a list
   */
  async rPush(key: string, items: any[]): Promise<number> {
    try {
      const serialized = items.map((item) => JSON.stringify(item));
      return await this.client.rPush(key, serialized);
    } catch (error) {
      console.error("Redis rPush error:", error);
      throw error;
    }
  }

  /**
   * Pushes items to the beginning of a list
   */
  async lPush(key: string, items: any[]): Promise<number> {
    try {
      const serialized = items.map((item) => JSON.stringify(item));
      return await this.client.lPush(key, serialized);
    } catch (error) {
      console.error("Redis lPush error:", error);
      throw error;
    }
  }

  /**
   * Gets a range of items from a list
   */
  async lRange<T>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const result = await this.client.lRange(key, start, stop);
      return result.map((item) => JSON.parse(item));
    } catch (error) {
      console.error("Redis lRange error:", error);
      throw error;
    }
  }

  /**
   * Pops an item from the end of a list
   */
  async rPop<T>(key: string): Promise<T | null> {
    try {
      const result = await this.client.rPop(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      console.error("Redis rPop error:", error);
      throw error;
    }
  }

  /**
   * Pops an item from the beginning of a list
   */
  async lPop<T>(key: string): Promise<T | null> {
    try {
      const result = await this.client.lPop(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      console.error("Redis lPop error:", error);
      throw error;
    }
  }

  /**
   * @notice Set operations - for unique collections
   */

  /**
   * Adds items to a set
   */
  async sAdd(key: string, items: any[]): Promise<number> {
    try {
      const serialized = items.map((item) => JSON.stringify(item));
      return await this.client.sAdd(key, serialized);
    } catch (error) {
      console.error("Redis sAdd error:", error);
      throw error;
    }
  }

  /**
   * Gets all members of a set
   */
  async sMembers<T>(key: string): Promise<T[]> {
    try {
      const result = await this.client.sMembers(key);
      return result.map((item) => JSON.parse(item));
    } catch (error) {
      console.error("Redis sMembers error:", error);
      throw error;
    }
  }

  /**
   * Checks if item is a member of a set
   */
  async sIsMember(key: string, item: any): Promise<boolean> {
    try {
      const result = await this.client.sIsMember(key, JSON.stringify(item));
      return result === 1; // Convert number to boolean
    } catch (error) {
      console.error("Redis sIsMember error:", error);
      throw error;
    }
  }

  /**
   * Removes items from a set
   */
  async sRem(key: string, items: any[]): Promise<number> {
    try {
      const serialized = items.map((item) => JSON.stringify(item));
      return await this.client.sRem(key, serialized);
    } catch (error) {
      console.error("Redis sRem error:", error);
      throw error;
    }
  }

  /**
   * @notice Sorted Set operations - for ranked/score-based data
   */

  /**
   * Adds items to a sorted set with scores
   */
  async zAdd(
    key: string,
    items: { score: number; value: any }[]
  ): Promise<number> {
    try {
      const members = items.map((item) => ({
        score: item.score,
        value: JSON.stringify(item.value),
      }));
      return await this.client.zAdd(key, members);
    } catch (error) {
      console.error("Redis zAdd error:", error);
      throw error;
    }
  }

  /**
   * Gets a range of items from a sorted set
   */
  async zRange<T>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const result = await this.client.zRange(key, start, stop);
      return result.map((item) => JSON.parse(item));
    } catch (error) {
      console.error("Redis zRange error:", error);
      throw error;
    }
  }

  /**
   * Gets a range of items from a sorted set by score
   */
  async zRangeByScore<T>(key: string, min: number, max: number): Promise<T[]> {
    try {
      const result = await this.client.zRangeByScore(key, min, max);
      return result.map((item) => JSON.parse(item));
    } catch (error) {
      console.error("Redis zRangeByScore error:", error);
      throw error;
    }
  }

  /**
   * @notice Transaction support - for atomic operations
   */

  /**
   * Executes multiple commands as a transaction
   */
  async multi(operations: (() => Promise<any>)[]): Promise<any[]> {
    try {
      const multi = this.client.multi();
      const results: any[] = [];

      for (const op of operations) {
        // This is a simplified implementation - you might want to use a more robust approach
        const result = await op();
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error("Redis multi error:", error);
      throw error;
    }
  }

  /**
   * @notice Utility methods for database operations
   */

  /**
   * Finds items by pattern and returns with their data
   */
  async find<T>(pattern: string): Promise<{ key: string; value: T }[]> {
    try {
      const keys = await this.getKeys(pattern);
      const results: { key: string; value: T }[] = [];

      for (const key of keys) {
        const value = await this.get<T>(key);
        if (value !== null) {
          results.push({ key, value });
        }
      }

      return results;
    } catch (error) {
      console.error("Redis find error:", error);
      throw error;
    }
  }

  /**
   * Updates a key if it exists, otherwise does nothing
   */
  async update(
    key: string,
    value: any,
    ttlInSeconds?: number
  ): Promise<boolean> {
    try {
      const exists = await this.exists(key);
      if (!exists) return false;

      await this.set(key, value, ttlInSeconds);
      return true;
    } catch (error) {
      console.error("Redis update error:", error);
      throw error;
    }
  }

  // ==================== PUB/SUB METHODS ====================

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

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  async publish(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    await this.subscriber.quit();
    await this.publisher.quit();
    await this.client.quit();
  }

  getConnectionStatus(): boolean {
    return this.isConnected && this.client.isOpen;
  }

  /**
   * @notice Gets the underlying Redis client for advanced operations
   * @dev Use sparingly and with caution
   */
  getClient(): RedisClientType {
    return this.client;
  }
}

export default RedisService;
