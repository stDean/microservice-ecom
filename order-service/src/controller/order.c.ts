import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import db from "../db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  orderStatusEnum,
} from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { eventPublisher } from "../redis/publisher";
import { BadRequestError, NotFoundError } from "../errors";

export const OrderCtrl = {
  /**
   * Create Order from Checkout
   * POST /orders
   */
  checkOut: async (req: Request, res: Response) => {
    // paymentMethod : {type: "pay_now" | cash_on_delivery}
    const { shippingAddress, paymentMethod, cartItems } = req.body;
    const userId = req.user?.id;

    // Calculate totals
    const subtotal = cartItems.reduce(
      (sum: number, item: any) => sum + parseFloat(item.price) * item.quantity,
      0
    );

    const shippingCost = 5.99;
    const taxAmount = subtotal * 0.08;
    const totalAmount = subtotal + shippingCost + taxAmount;

    let orderStatus: (typeof orderStatusEnum.enumValues)[number] = "PENDING";
    let paymentTransactionId: string | null = null;

    if (paymentMethod.type === "pay_now") {
      orderStatus = "PENDING";
      paymentTransactionId = "mock-payment-id";
    }

    if (paymentMethod.type === "cash_on_delivery") {
      orderStatus = "PENDING";
    }

    // Create the order
    const [order] = await db.transaction(async (tx) => {
      const [newOrder] = await tx
        .insert(orders)
        .values({
          userId: userId!,
          subtotal: subtotal.toFixed(2),
          shippingCost: shippingCost.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          shippingAddressJson: JSON.stringify(shippingAddress),
          paymentTransactionId,
          currentStatus: orderStatus,
          paymentType:
            paymentMethod.type === "pay_now" ? "PAY_NOW" : "CASH_ON_DELIVERY",
          awaitingDelivery:
            paymentMethod.type === "cash_on_delivery" ? true : false,
        })
        .returning();

      // Create order items
      const orderItemsData = cartItems.map((item: any) => ({
        orderId: newOrder.id,
        productId: item.itemId,
        productName: item.name,
        productSku: item.sku || null,
        quantity: item.quantity,
        unitPriceAtPurchase: item.price.toString(),
      }));

      await tx.insert(orderItems).values(orderItemsData);

      // Create status history
      await tx.insert(orderStatusHistory).values({
        orderId: newOrder.id,
        status: orderStatus,
        reason: "Order created",
      });

      return [newOrder];
    });

    // publish event
    eventPublisher.publishEvent({
      type: "ORDER_PLACED",
      timestamp: new Date(),
      version: "1.0.0",
      source: "order-service",
      data: {
        orderId: order.id,
        status: order.currentStatus,
        userId: userId!,
        items: cartItems.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPriceAtPurchase,
        })),
        subtotal,
        shippingCost,
        taxAmount,
        totalAmount,
        email: req.user?.email || "",
      },
    });

    return res.status(StatusCodes.CREATED).json({
      message: "Order created successfully",
      orderId: order.id,
      status: orderStatus,
      orderSummary: {
        items: cartItems.length,
        subtotal: parseFloat(subtotal.toFixed(2)),
        shipping: parseFloat(shippingCost.toFixed(2)),
        tax: parseFloat(taxAmount.toFixed(2)),
        total: parseFloat(totalAmount.toFixed(2)),
      },
      payment: {
        method: paymentMethod.type,
        status: orderStatus,
      },
    });
  },

  /**
   * View order history for the authenticated user (paginated list).
   * GET /orders/me
   */
  getAll: async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Get orders with pagination
    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId!))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.userId, userId!));

    const totalCount = countResult[0]?.count || 0;

    return res.status(StatusCodes.OK).json({
      message: "All user order obtained.",
      orders: userOrders,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  },

  /**
   * View details of a specific order.
   * GET /orders/{id}
   */
  get: async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;

    // FIXED: Use manual joins instead of relational queries
    const orderDetails = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId!)))
      .then((rows) => rows[0]);

    if (!orderDetails) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Order not found",
      });
    }

    // Get order items
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));

    // Get status history
    const statusHistory = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(desc(orderStatusHistory.timestamp));

    return res.status(StatusCodes.OK).json({
      message: `Order ${id} obtained.`,
      order: {
        ...orderDetails,
        items,
        statusHistory,
      },
    });
  },

  /**
   * Cancel a pending order.
   * PATCH /orders/{id}/cancel
   */
  cancel: async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const { reason } = req.body;

    // Check if order exists and belongs to user
    const order = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId!)))
      .then((rows) => rows[0]);

    if (!order) throw new NotFoundError(`Order not found`);

    // Get order items for the event
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));

    // Check cancellation rules based on your business logic
    if (
      order.currentStatus === "SHIPPED" ||
      order.currentStatus === "DELIVERED"
    ) {
      throw new BadRequestError(
        `Cannot cancel order that has been shipped or delivered`
      );
    }

    if (
      order.currentStatus === "CANCELLED" ||
      order.currentStatus === "REFUNDED"
    ) {
      throw new BadRequestError(
        `Order is already ${order.currentStatus.toLowerCase()}`
      );
    }

    // Determine cancellation type and reason
    let cancellationType: (typeof orderStatusEnum.enumValues)[number] =
      "CANCELLED";
    let cancellationReason = reason || "Cancelled by user";
    let requiresRefund = false;

    if (order.paymentTransactionId && order.currentStatus === "PAID") {
      // Paid but not shipped - cancel and refund
      cancellationType = "REFUNDED";
      cancellationReason = "Order cancelled - refund processed";
      requiresRefund = true;
    } else if (order.currentStatus === "PENDING") {
      // Pending order - simple cancellation
      cancellationType = "CANCELLED";
      cancellationReason = reason || "Cancelled by user";
    }

    // Update order status and add to history
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          currentStatus: cancellationType,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));

      await tx.insert(orderStatusHistory).values({
        orderId: id,
        status: cancellationType,
        reason: cancellationReason,
      });
    });

    // Publish appropriate event
    if (requiresRefund) {
      eventPublisher.publishEvent({
        type: "ORDER_REFUND_REQUESTED",
        timestamp: new Date(),
        version: "1.0.0",
        source: "order-service",
        data: {
          orderId: order.id,
          paymentTransactionId: order.paymentTransactionId,
          amount: order.totalAmount,
          reason: "Order cancellation",
          email: req.user?.email || "",
        },
      });
    }

    eventPublisher.publishEvent({
      type: "ORDER_CANCELLED",
      timestamp: new Date(),
      version: "1.0.0",
      source: "order-service",
      data: {
        orderId: order.id,
        status: cancellationType,
        requiresRefund: requiresRefund,
        previousStatus: order.currentStatus,
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPriceAtPurchase,
        })),
        userId,
        reason,
        email: req.user?.email || "",
      },
    });

    return res.status(StatusCodes.OK).json({
      message: `Order ${id} ${
        requiresRefund ? "cancelled and refund initiated" : "cancelled"
      }.`,
      cancellationType: cancellationType,
      refundInitiated: requiresRefund,
    });
  },

  /**
   * Payment Service Webhook
   * POST /orders/webhook/payment
   */
  // paymentWebhook: async (req: Request, res: Response) => {
  //   const { orderId, paymentIntentId, status, secret } = req.body;

  //   // Check if order exists
  //   const order = await db
  //     .select()
  //     .from(orders)
  //     .where(eq(orders.id, orderId))
  //     .then((rows) => rows[0]);

  //   if (!order) {
  //     return res.status(StatusCodes.NOT_FOUND).json({
  //       error: "Order not found",
  //     });
  //   }

  //   let newStatus: string;
  //   let orderStatus: (typeof orderStatusEnum.enumValues)[number];
  //   let reason: string;

  //   switch (status) {
  //     case "succeeded":
  //       orderStatus = "PAID";
  //       newStatus = "PAID";
  //       reason = "Payment confirmed via webhook";
  //       break;
  //     case "failed":
  //       orderStatus = "CANCELLED";
  //       newStatus = "CANCELLED";
  //       reason = "Payment failed via webhook";
  //       break;
  //     default:
  //       return res.status(StatusCodes.BAD_REQUEST).json({
  //         error: `Unknown payment status: ${status}`,
  //       });
  //   }

  //   // Update order status and payment reference
  //   await db.transaction(async (tx) => {
  //     await tx
  //       .update(orders)
  //       .set({
  //         currentStatus: orderStatus,
  //         paymentTransactionId: paymentIntentId,
  //         updatedAt: new Date(),
  //       })
  //       .where(eq(orders.id, orderId));

  //     await tx.insert(orderStatusHistory).values({
  //       orderId,
  //       status: newStatus,
  //       reason: reason,
  //     });
  //   });

  //   return res.status(StatusCodes.OK).json({
  //     message: "Order payment status updated",
  //     orderId,
  //     newStatus,
  //   });
  // },

  /**
   * Internal/Webhook Route to update order status
   * POST /orders/status
   */
  status: async (req: Request, res: Response) => {
    const { orderId, status, reason, secret } = req.body;

    // Check if order exists
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .then((rows) => rows[0]);

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Order not found",
      });
    }

    // Update order status and add to history
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          currentStatus: status as (typeof orderStatusEnum.enumValues)[number],
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        orderId,
        status: status,
        reason: reason || `Status updated via webhook`,
      });
    });

    return res.status(StatusCodes.OK).json({
      message: "Order status updated",
      orderId,
      newStatus: status,
    });
  },
};
