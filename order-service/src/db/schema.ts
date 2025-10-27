import {
  pgTable,
  serial,
  text,
  decimal,
  timestamp,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
]);

// --- A. Orders Table (The Header) ---
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),

    // Links to external services
    userId: text("user_id").notNull(), // Canonical ID from User Service

    // Financial details (finalized and immutable)
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    taxAmount: decimal("tax_amount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),

    // Status and Time
    currentStatus: orderStatusEnum("current_status")
      .notNull()
      .default("PENDING"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),

    // Shipping Details (Snapshot of address from User Service at time of order)
    shippingAddressJson: text("shipping_address_json").notNull(),

    // Payment Reference
    paymentTransactionId: text("payment_transaction_id"), // Link to Payment Service record
  },
  (table) => [
    index("user_idx").on(table.userId),
    index("status_idx").on(table.currentStatus),
    index("created_idx").on(table.createdAt),
  ]
);

// --- B. Order Items Table (The Line Items) ---
export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),

    orderId: integer("order_id")
      .references(() => orders.id)
      .notNull(),

    // Product details (Snapshot of product data at time of order)
    productId: integer("product_id").notNull(),
    productName: text("product_name").notNull(),
    productSku: text("product_sku"),
    quantity: integer("quantity").notNull(),

    // Fixed Price (Crucial: Never rely on Product Service for historical price)
    unitPriceAtPurchase: decimal("unit_price_at_purchase", {
      precision: 10,
      scale: 2,
    }).notNull(),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    index("order_items_product_idx").on(table.productId),
  ]
);

// --- C. Status History Table (Audit Log) ---
export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id)
    .notNull(),
  status: text("status").notNull(), // e.g., 'PENDING', 'PAID'
  reason: text("reason"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Define Drizzle relations for joining
export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
}));
