import { IShipping, Shipping, ShippingStatus } from "../db/schema";
import { eventPublisher } from "../redis/publisher";

export class ShippingService {
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
        },
      });

      console.log(`Order ${orderId} delivered`);
    } catch (error) {
      console.error("Error marking order as delivered:", error);
      throw error;
    }
  }

  async getPendingDeliveries(): Promise<IShipping[]> {
    return Shipping.find({
      status: ShippingStatus.SHIPPED,
      estimatedDelivery: { $lte: new Date() },
    });
  }
}
