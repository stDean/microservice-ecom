// schema.ts
import {
  pgTable,
  serial,
  text,
  decimal,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";

// Enums for better type safety
export const transactionTypeEnum = pgEnum("transaction_type", [
  "CHARGE",
  "REFUND",
  "AUTHORIZATION",
  "CAPTURE",
]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Core Links
  userId: text("user_id").notNull(),

  // Financial Data
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  type: transactionTypeEnum("type").notNull(),

  // Gateway Data
  gateway: text("gateway").default("SIMULATED").notNull(),
  gatewayTransactionId: text("gateway_transaction_id").unique().notNull(),
  status: transactionStatusEnum("status").notNull(),

  // Additional fields for simulation
  failureReason: text("failure_reason"),
  metadata: text("metadata"), // JSON string for additional data

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),

  // Tokenized Secure Data
  gatewayToken: text("gateway_token").notNull(),

  // Display/Reference Data
  last4: text("last_4").notNull(),
  brand: text("brand").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
