// config/rabbitmq.ts
import amqp from "amqplib";
import { logger } from "./logger";

/**
 * RabbitMQService - A service class for handling RabbitMQ message queue operations
 *
 * @class RabbitMQService
 * @description Provides methods to connect to RabbitMQ, publish messages to queues,
 * and consume messages from queues with proper error handling and reconnection logic.
 * Uses type-agnostic approach to work around TypeScript definition issues with amqplib.
 *
 * @example
 * ```typescript
 * // Publish a message
 * await rabbitMQService.publishMessage('verification', {
 *   email: 'user@example.com',
 *   token: 'abc123'
 * });
 *
 * // Consume messages
 * await rabbitMQService.consumeMessages('email_verification', async (message) => {
 *   await processEmailVerification(message);
 * });
 * ```
 */
class RabbitMQService {
  private connection: any = null;
  private channel: any = null;
  private isConnecting: boolean = false;

  /**
   * Establishes connection to RabbitMQ and sets up exchange/queues
   *
   * @async
   * @method connect
   * @returns {Promise<void>} Resolves when connection is established and queues are set up
   *
   * @throws {Error} When unable to connect to RabbitMQ or set up queues
   *
   * @description
   * - Connects to RabbitMQ using RABBITMQ_URL environment variable or default localhost:5672
   * - Creates a channel for communication
   * - Declares a 'notifications' direct exchange
   * - Sets up 'email_verification' and 'password_reset' queues
   * - Binds queues to exchange with appropriate routing keys
   * - Sets up event handlers for connection close and error events
   * - Implements singleton pattern to prevent multiple simultaneous connections
   *
   * @example
   * ```typescript
   * await rabbitMQService.connect();
   * ```
   */
  async connect(): Promise<void> {
    if (this.connection || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      // Declare exchange
      await this.channel.assertExchange("notifications", "direct", {
        durable: true,
      });

      // Declare queues
      await this.channel.assertQueue("email_verification", { durable: true });
      await this.channel.assertQueue("password_reset", { durable: true });

      // Bind queues to exchange
      await this.channel.bindQueue(
        "email_verification",
        "notifications",
        "verification"
      );
      await this.channel.bindQueue(
        "password_reset",
        "notifications",
        "password_reset"
      );

      logger.info("Connected to RabbitMQ successfully");

      // Handle connection close
      this.connection.on("close", () => {
        logger.warn("RabbitMQ connection closed");
        this.cleanup();
      });

      // Handle errors
      this.connection.on("error", (error: Error) => {
        logger.error("RabbitMQ connection error:", error);
        this.cleanup();
      });
    } catch (error) {
      this.isConnecting = false;
      logger.error("Failed to connect to RabbitMQ:", error);
      throw error;
    }
  }

  /**
   * Cleans up connection and channel references
   *
   * @private
   * @method cleanup
   * @description Internal method to reset connection state when connection is closed or errors occur
   */
  private cleanup(): void {
    this.connection = null;
    this.channel = null;
    this.isConnecting = false;
  }

  /**
   * Publishes a message to a specific routing key in RabbitMQ
   *
   * @async
   * @method publishMessage
   * @param {string} routingKey - The routing key for the message ('verification' or 'password_reset')
   * @param {any} message - The message payload to be published (will be JSON stringified)
   * @returns {Promise<boolean>} True if message was published successfully, false if backpressure occurred
   *
   * @throws {Error} When RabbitMQ channel is not available after connection attempt
   * @throws {Error} When message publishing fails
   *
   * @description
   * - Automatically establishes connection if not already connected
   * - Publishes message to the 'notifications' exchange with specified routing key
   * - Messages are persistent and will survive broker restarts
   * - Handles backpressure scenarios gracefully (returns false instead of throwing)
   * - Includes comprehensive logging for publishing lifecycle
   *
   * @example
   * ```typescript
   * const success = await rabbitMQService.publishMessage('verification', {
   *   id: 'msg_123',
   *   email: 'user@example.com',
   *   token: 'abc123',
   *   timestamp: new Date().toISOString()
   * });
   *
   * if (!success) {
   *   // Handle backpressure scenario
   *   logger.warn('Message queued due to backpressure');
   * }
   * ```
   */
  async publishMessage(routingKey: string, message: any): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error("RabbitMQ channel not available");
      }

      const result = this.channel.publish(
        "notifications",
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );

      if (result) {
        logger.debug("Message published to RabbitMQ", {
          routingKey,
          messageId: message.id,
        });
      } else {
        logger.warn("Message not published to RabbitMQ (backpressure)", {
          routingKey,
        });
      }

      return result;
    } catch (error) {
      logger.error("Error publishing message to RabbitMQ:", error);
      throw error;
    }
  }

  /**
   * Starts consuming messages from a specified queue
   *
   * @async
   * @method consumeMessages
   * @param {string} queue - The name of the queue to consume from ('email_verification' or 'password_reset')
   * @param {Function} onMessage - Callback function to process each message
   * @returns {Promise<void>} Resolves when consumer is started
   *
   * @throws {Error} When RabbitMQ channel is not available or consumption setup fails
   *
   * @description
   * - Automatically establishes connection if not already connected
   * - Starts consuming messages from the specified queue
   * - Each message is automatically acknowledged (ack) after successful processing
   * - Failed messages are negatively acknowledged (nack) and not requeued
   * - Includes safety checks for channel existence before ack/nack operations
   * - Comprehensive error handling and logging for message processing lifecycle
   * - Messages are expected to be JSON format; parse errors are handled gracefully
   *
   * @example
   * ```typescript
   * await rabbitMQService.consumeMessages('email_verification', async (message) => {
   *   try {
   *     await emailService.sendVerificationEmail(message.email, message.token);
   *     logger.info(`Verification email sent to ${message.email}`);
   *   } catch (error) {
   *     logger.error(`Failed to send verification email to ${message.email}:`, error);
   *     throw error; // This will trigger nack
   *   }
   * });
   * ```
   */
  async consumeMessages(
    queue: string,
    onMessage: (message: any) => Promise<void>
  ): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error("RabbitMQ channel not available");
      }

      await this.channel.consume(queue, async (msg: any) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            logger.debug("Received message from RabbitMQ", {
              queue,
              messageId: content.id,
            });

            await onMessage(content);

            // Check if channel still exists before ack
            if (this.channel) {
              this.channel.ack(msg);
            } else {
              logger.warn("Channel not available to ack message", { queue });
            }

            logger.debug("Message processed successfully", {
              queue,
              messageId: content.id,
            });
          } catch (error) {
            logger.error("Error processing message from RabbitMQ:", {
              error: (error as Error).message,
              queue,
              message: msg.content.toString(),
            });

            // Check if channel still exists before nack
            if (this.channel) {
              this.channel.nack(msg, false, false); // Don't requeue on error
            } else {
              logger.warn("Channel not available to nack message", { queue });
            }
          }
        }
      });

      logger.info(`Started consuming messages from queue: ${queue}`);
    } catch (error) {
      logger.error(`Error consuming messages from queue ${queue}:`, error);
      throw error;
    }
  }

  /**
   * Closes the RabbitMQ connection and channel gracefully
   *
   * @async
   * @method close
   * @returns {Promise<void>} Resolves when connection and channel are closed
   *
   * @description
   * - Closes the channel if it exists
   * - Closes the connection if it exists
   * - Resets all internal state variables via cleanup()
   * - Errors during close are logged but not thrown (graceful shutdown)
   * - Should be called during application shutdown for clean disposal
   *
   * @example
   * ```typescript
   * // During application shutdown
   * await rabbitMQService.close();
   *
   * // Or use in a signal handler
   * process.on('SIGTERM', async () => {
   *   await rabbitMQService.close();
   *   process.exit(0);
   * });
   * ```
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      logger.error("Error closing RabbitMQ connection:", error);
      // Don't throw the error, just log it as this is usually called during shutdown
    } finally {
      this.cleanup();
    }
  }

  /**
   * Checks if the service is currently connected to RabbitMQ
   *
   * @method isConnected
   * @returns {boolean} True if both connection and channel are active and available
   *
   * @example
   * ```typescript
   * if (rabbitMQService.isConnected()) {
   *   // Safe to perform RabbitMQ operations
   *   await rabbitMQService.publishMessage('verification', message);
   * } else {
   *   // Handle disconnected state
   *   logger.warn('RabbitMQ is not connected');
   * }
   * ```
   */
  isConnected(): boolean {
    return !!(this.connection && this.channel);
  }

  /**
   * Gets the current connection status including connecting state
   *
   * @method getStatus
   * @returns {Object} Connection status object with detailed state information
   * @returns {boolean} status.connected - True if fully connected and operational
   * @returns {boolean} status.connecting - True if connection is in progress
   * @returns {boolean} status.hasConnection - True if connection object exists
   * @returns {boolean} status.hasChannel - True if channel object exists
   *
   * @example
   * ```typescript
   * const status = rabbitMQService.getStatus();
   * console.log(`Connected: ${status.connected}, Connecting: ${status.connecting}`);
   *
   * if (status.connecting) {
   *   // Show loading indicator
   * } else if (status.connected) {
   *   // Show connected state
   * } else {
   *   // Show disconnected state, offer reconnect option
   * }
   * ```
   */
  getStatus() {
    return {
      connected: !!(this.connection && this.channel),
      connecting: this.isConnecting,
      hasConnection: !!this.connection,
      hasChannel: !!this.channel,
    };
  }
}

/**
 * Singleton instance of RabbitMQService
 *
 * @type {RabbitMQService}
 *
 * @example
 * ```typescript
 * // Use the singleton instance throughout your application
 * import { rabbitMQService } from './config/rabbitmq';
 *
 * export class NotificationService {
 *   async sendVerification(email: string, token: string) {
 *     await rabbitMQService.publishMessage('verification', {
 *       email,
 *       token,
 *       id: `verification_${Date.now()}`
 *     });
 *   }
 * }
 * ```
 */
export const rabbitMQService = new RabbitMQService();
