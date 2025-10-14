// notification-service/src/events/client.ts
import { createClient, RedisClientType } from "redis";

class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private subscriber: RedisClientType;

  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    this.subscriber = this.client.duplicate();

    this.setupEventListeners();
  }

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  private setupEventListeners() {
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.subscriber.on("error", (err) =>
      console.error("Redis Subscriber Error", err)
    );
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
      await this.subscriber.connect();
    }
  }

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

  async disconnect(): Promise<void> {
    await this.subscriber.destroy();
    await this.client.destroy();
  }
}

export default RedisService;
