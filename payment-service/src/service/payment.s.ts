// payment-service.ts
import { eq } from "drizzle-orm";
import db from "../db";
import {
  paymentMethods,
  transactions,
  transactionTypeEnum,
} from "../db/schema";

export interface PaymentRequest {
  userId: string;
  amount: number;
  currency?: string;
  paymentMethodId?: number;
  // For new card payments (simulated)
  cardDetails?: {
    number: string;
    expiryMonth: string;
    expiryYear: string;
    cvc: string;
  };
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  gatewayTransactionId: string;
  status: string;
  failureReason?: string;
}

export class PaymentService {
  private failureRate = 0.1; // 10% failure rate for realism
  private pendingRate = 0.05; // 5% pending rate

  /**
   * Process a payment for an order
   */
  async processPayment(
    paymentRequest: PaymentRequest
  ): Promise<PaymentResponse> {
    try {
      // Validate input
      if (paymentRequest.amount <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      // Generate a fake gateway transaction ID
      const gatewayTransactionId = this.generateGatewayTransactionId();

      // Simulate different outcomes
      const outcome = this.simulatePaymentOutcome();

      // Create transaction record
      const [transaction] = await db
        .insert(transactions)
        .values({
          userId: paymentRequest.userId,
          amount: paymentRequest.amount.toString(),
          currency: paymentRequest.currency || "USD",
          type: transactionTypeEnum.enumValues[0], // CHARGE
          gateway: "SIMULATED",
          gatewayTransactionId,
          status: outcome.status,
          failureReason: outcome.failureReason,
          metadata: JSON.stringify({
            simulated: true,
            outcome: outcome.type,
            cardLast4: paymentRequest.cardDetails
              ? paymentRequest.cardDetails.number.slice(-4)
              : "saved",
          }),
        })
        .returning();

      // Simulate processing delay
      await this.simulateProcessingDelay();

      return {
        success: outcome.status === "SUCCESS",
        transactionId: transaction.id,
        gatewayTransactionId,
        status: outcome.status,
        failureReason: outcome.failureReason,
      };
    } catch (error) {
      console.error("Payment processing error:", error);
      throw new Error(
        `Payment failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Process a refund for a transaction
   */
  async processRefund(
    originalTransactionId: string,
    amount?: number
  ): Promise<PaymentResponse> {
    try {
      // Find the original transaction
      const [originalTx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, originalTransactionId));

      if (!originalTx) {
        throw new Error("Original transaction not found");
      }

      if (originalTx.type !== "CHARGE") {
        throw new Error("Can only refund CHARGE transactions");
      }

      if (originalTx.status !== "SUCCESS") {
        throw new Error("Can only refund successful transactions");
      }

      const refundAmount = amount || parseFloat(originalTx.amount);

      // Generate refund transaction ID
      const gatewayTransactionId = this.generateGatewayTransactionId();

      // Create refund transaction
      const [refundTransaction] = await db
        .insert(transactions)
        .values({
          userId: originalTx.userId,
          amount: (-refundAmount).toString(), // Negative amount for refund
          currency: originalTx.currency,
          type: "REFUND",
          gateway: "SIMULATED",
          gatewayTransactionId,
          status: "SUCCESS", // Refunds always succeed in simulation
          metadata: JSON.stringify({
            simulated: true,
            originalTransactionId,
            refundAmount,
          }),
        })
        .returning();

      return {
        success: true,
        transactionId: refundTransaction.id,
        gatewayTransactionId,
        status: "SUCCESS",
      };
    } catch (error) {
      console.error("Refund processing error:", error);
      throw new Error(
        `Refund failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Save a payment method for future use
   */
  async savePaymentMethod(
    userId: string,
    cardDetails: {
      number: string;
      expiryMonth: string;
      expiryYear: string;
      cvc: string;
    }
  ): Promise<{ id: string; last4: string; brand: string }> {
    try {
      const last4 = cardDetails.number.slice(-4);
      const brand = this.detectCardBrand(cardDetails.number);

      // Generate a fake gateway token
      const gatewayToken = `tok_${this.generateRandomString(24)}`;

      // Calculate expiry date
      const expiresAt = new Date(
        parseInt(cardDetails.expiryYear),
        parseInt(cardDetails.expiryMonth) - 1
      );

      const [paymentMethod] = await db
        .insert(paymentMethods)
        .values({
          userId,
          gatewayToken,
          last4,
          brand,
          expiresAt,
        })
        .returning();

      return {
        id: paymentMethod.id,
        last4,
        brand,
      };
    } catch (error) {
      console.error("Error saving payment method:", error);
      throw new Error("Failed to save payment method");
    }
  }

  /**
   * Get payment methods for a user
   */
  async getUserPaymentMethods(userId: string) {
    return await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId))
      .orderBy(paymentMethods.isDefault);
  }

  /**
   * Get transaction history for a user
   */
  async getUserTransactions(userId: string, limit = 50) {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(transactions.createdAt)
      .limit(limit);
  }

  private generateGatewayTransactionId(): string {
    return `sim_${Date.now()}_${this.generateRandomString(8)}`;
  }

  private generateRandomString(length: number): string {
    return Math.random()
      .toString(36)
      .substring(2, 2 + length);
  }

  private simulatePaymentOutcome(): {
    status: "SUCCESS" | "FAILED" | "PENDING";
    failureReason?: string;
    type: string;
  } {
    const random = Math.random();

    if (random < this.failureRate) {
      const reasons = [
        "Insufficient funds",
        "Card declined",
        "Invalid CVV",
        "Expired card",
        "Suspected fraud",
      ];
      return {
        status: "FAILED",
        failureReason: reasons[Math.floor(Math.random() * reasons.length)],
        type: "failure",
      };
    } else if (random < this.failureRate + this.pendingRate) {
      return {
        status: "PENDING",
        type: "pending",
      };
    } else {
      return {
        status: "SUCCESS",
        type: "success",
      };
    }
  }

  private async simulateProcessingDelay(): Promise<void> {
    // Simulate network delay
    const delay = Math.random() * 1000 + 500; // 500-1500ms
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private detectCardBrand(cardNumber: string): string {
    const cleanNumber = cardNumber.replace(/\D/g, "");

    if (/^4/.test(cleanNumber)) return "Visa";
    if (/^5[1-5]/.test(cleanNumber)) return "Mastercard";
    if (/^3[47]/.test(cleanNumber)) return "American Express";
    if (/^6(?:011|5)/.test(cleanNumber)) return "Discover";

    return "Unknown";
  }
}
