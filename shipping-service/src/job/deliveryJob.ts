// src/job/deliveryJob.ts
import * as cron from "node-cron";
import { ShippingService } from "../services/ShippingService";
import { logger } from "../utils/logger";

export class DeliveryJob {
  constructor(private shippingService: ShippingService) {}

  start(): void {
    // Run every minute to check for deliveries
    cron.schedule("* * * * *", async () => {
      try {
        logger.info("⏰ Checking for pending deliveries...");

        const pendingDeliveries =
          await this.shippingService.getPendingDeliveries();

        if (pendingDeliveries.length > 0) {
          logger.info(
            `📦 Found ${pendingDeliveries.length} pending deliveries to process`
          );
        }

        for (const delivery of pendingDeliveries) {
          try {
            logger.info(`🚚 Processing delivery for order ${delivery.orderId}`);
            await this.shippingService.markOrderAsDelivered(delivery.orderId);
            logger.info(`✅ Successfully delivered order ${delivery.orderId}`);
          } catch (error) {
            logger.error(
              `❌ Failed to process delivery for order ${delivery.orderId}:`,
              error
            );
          }
        }
      } catch (error) {
        logger.error("❌ Error in delivery job:", error);
      }
    });

    logger.info("✅ Delivery job started - running every minute");
  }
}
