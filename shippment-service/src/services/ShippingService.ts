// src/services/ShippingService.ts
import { Shipping, ShippingStatus } from "../db/schema";
import { eventPublisher } from "../redis/publisher";
import { logger } from "../utils/logger";

export class ShippingService {
  async getPendingDeliveries() {
    return Shipping.find({
      status: ShippingStatus.SHIPPED,
      estimatedDelivery: { $lte: new Date() },
    });
  }

  async markOrderAsDelivered(orderId: string): Promise<void> {
    try {
      const shipping = await Shipping.findOne({ orderId });

      if (!shipping) {
        throw new Error(`Shipping record not found for order ${orderId}`);
      }

      shipping.status = ShippingStatus.DELIVERED;
      shipping.actualDelivery = new Date();
      await shipping.save();

      // Publish ORDER_DELIVERED event
      eventPublisher.publishEvent({
        type: "ORDER_DELIVERED",
        version: "1.0.0",
        timestamp: new Date(),
        source: "shipping-service",
        data: {
          orderId: shipping.orderId,
          userId: shipping.userId,
          trackingNumber: shipping.trackingNumber,
          deliveredAt: shipping.actualDelivery,
          email: shipping.email, // You might want to store email in shipping record
          status: shipping.status,
        },
      });

      logger.info(`Order ${orderId} marked as delivered`);
    } catch (error) {
      logger.error(`Error marking order ${orderId} as delivered:`, error);
      throw error;
    }
  }
}
