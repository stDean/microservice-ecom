import { createClient, RedisClientType } from "redis";

class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private publisher: RedisClientType;

  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

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
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.publisher.on("error", (err) =>
      console.error("Redis Publisher Error", err)
    );
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
      await this.publisher.connect();
    }
  }

  async publish(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async disconnect(): Promise<void> {
    await this.publisher.destroy();
    await this.client.destroy();
  }
}

export default RedisService;
