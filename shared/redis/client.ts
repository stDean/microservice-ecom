import { createClient, RedisClientType } from "redis";

class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private subscriber: RedisClientType;
  private publisher: RedisClientType;

  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
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
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.subscriber.on("error", (err) =>
      console.error("Redis Subscriber Error", err)
    );
    this.publisher.on("error", (err) =>
      console.error("Redis Publisher Error", err)
    );
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
      await this.subscriber.connect();
      await this.publisher.connect();
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  getSubscriber(): RedisClientType {
    return this.subscriber;
  }

  getPublisher(): RedisClientType {
    return this.publisher;
  }

  async publish(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(
    channel: string,
    callback: (message: any) => void
  ): Promise<void> {
    await this.subscriber.subscribe(channel, (message) => {
      callback(JSON.parse(message));
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }
}

export default RedisService;
