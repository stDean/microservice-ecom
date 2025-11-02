import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { PaymentService } from "../service/payment.s";
import { eventPublisher } from "../redis/publisher";
import { BadRequestError } from "../errors";

const paymentService = new PaymentService();

export const PaymentCtrl = {
  processPayment: async (req: Request, res: Response) => {
    try {
      const paymentRequest = {
        orderId: req.body.orderId,
        userId: req.body.userId,
        amount: parseFloat(req.body.amount),
        currency: req.body.currency,
        paymentMethodId: req.body.paymentMethodId,
        cardDetails: req.body.cardDetails,
      };

      const result = await paymentService.processPayment(paymentRequest);

      if (result.success === false) {
        eventPublisher.publishEvent({
          type: "PAYMENT_FAILED",
          version: "1.0.0",
          timestamp: new Date(),
          source: "payment-service",
          data: {
            paymentId: result.transactionId,
            orderId: req.body.orderId,
            userId: req.body.userId,
            email: req.user?.email || "",
          },
        });

        throw new BadRequestError("Payment processing failed");
      }

      // Send a payment success event
      eventPublisher.publishEvent({
        type: "PAYMENT_PROCESSED",
        version: "1.0.0",
        timestamp: new Date(),
        source: "payment-service",
        data: {
          paymentTransactionId: result.transactionId,
          message: "Payment processed successfully",
          email: req.user?.email || "",
          orderId: req.body.orderId,
          userId: req.body.userId,
          shippingAddress: req.body.shippingAddress,
        },
      });

      return res.status(StatusCodes.OK).json({
        success: result.success,
        data: result,
        message: "Payment processed",
      });
    } catch (error) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: error instanceof Error ? error.message : "Payment failed",
      });
    }
  },

  processRefund: async (req: Request, res: Response) => {
    try {
      const { transactionId, amount } = req.body;

      const result = await paymentService.processRefund(transactionId, amount);

      eventPublisher.publishEvent({
        type: "PAYMENT_REFUNDED",
        version: "1.0.0",
        timestamp: new Date(),
        source: "payment-service",
        data: {
          paymentTransactionId: transactionId,
          amount,
          message: "Payment refunded successfully",
          email: req.user?.email || "",
        },
      });

      return res
        .status(StatusCodes.OK)
        .json({ success: true, data: result, message: "Refund processed" });
    } catch (error) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: error instanceof Error ? error.message : "Refund failed",
      });
    }
  },

  savePaymentMethod: async (req: Request, res: Response) => {
    try {
      const { userId, cardDetails } = req.body;

      const result = await paymentService.savePaymentMethod(
        userId,
        cardDetails
      );

      return res.status(StatusCodes.OK).json({
        success: true,
        data: result,
        message: "Payment method saved",
      });
    } catch (error) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save payment method",
      });
    }
  },

  getPaymentMethods: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const paymentMethods = await paymentService.getUserPaymentMethods(userId);

      return res.status(StatusCodes.OK).json({
        success: true,
        data: paymentMethods,
        message: "Payment methods retrieved",
      });
    } catch (error) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch payment methods",
      });
    }
  },

  getTransactionHistory: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const transactions = await paymentService.getUserTransactions(
        userId,
        limit
      );

      return res.status(StatusCodes.OK).json({
        success: true,
        data: transactions,
        message: "Transaction history fetched",
      });
    } catch (error) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch transactions",
      });
    }
  },
};
