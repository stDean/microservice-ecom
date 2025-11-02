import * as cron from "node-cron";
import { ShippingService } from "../services/ShippingService";

export class DeliveryJob {
  constructor(private shippingService: ShippingService) {}

  start(): void {
    // Run every minute to check for deliveries
    cron.schedule("* * * * *", async () => {
      try {
        console.log("Checking for pending deliveries...");

        const pendingDeliveries =
          await this.shippingService.getPendingDeliveries();

        for (const delivery of pendingDeliveries) {
          console.log(`Processing delivery for order ${delivery.orderId}`);
          await this.shippingService.markOrderAsDelivered(delivery.orderId);
        }

        if (pendingDeliveries.length > 0) {
          console.log(`Processed ${pendingDeliveries.length} deliveries`);
        }
      } catch (error) {
        console.error("Error in delivery job:", error);
      }
    });

    console.log("Delivery job started - running every minute");
  }
}

