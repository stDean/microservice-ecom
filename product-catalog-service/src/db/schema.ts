import {
  pgTable,
  text,
  decimal,
  boolean,
  timestamp,
  integer,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// --- 1. Categories Table ---
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(), // Human-readable category name (e.g., "Electronics", "Clothing")
    slug: text("slug").notNull(), // URL-friendly version of name (e.g., "electronics", "clothing") - must be unique
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(), // Whether the category is visible to customers
    sortOrder: integer("sort_order").default(0), // Controls display order (lower numbers appear first)
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("categories_slug_idx").on(table.slug),
    index("categories_active_idx").on(table.isActive),
  ]
);

// --- 2. Products Table ---
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Basic Info
    name: text("name").notNull(),
    slug: text("slug").notNull(), // URL-friendly name (e.g., "iphone-15-pro") - unique
    description: text("description"),

    // Pricing & Inventory
    price: decimal("price", { precision: 10, scale: 2 }).notNull(), // Current selling price (e.g., 999.99)
    comparePrice: decimal("compare_price", { precision: 10, scale: 2 }), // Original/"compare at" price for showing discount
    stock: integer("stock").default(0).notNull(), // Available quantity for sale

    // Status
    isActive: boolean("is_active").default(true).notNull(), // Whether product is visible and purchasable
    isFeatured: boolean("is_featured").default(false).notNull(), // Mark for highlighting in featured sections

    // Category
    categoryId: uuid("category_id").references(() => categories.id),

    // Images
    images: text("images").array(),

    // Metadata
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("products_slug_idx").on(table.slug),
    index("products_category_idx").on(table.categoryId),
    index("products_price_idx").on(table.price),
    index("products_active_idx").on(table.isActive),
    index("products_featured_idx").on(table.isFeatured),
  ]
);

// --- 3. Product Variants (Optional) ---
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),

    // Variant options
    size: text("size"), // 	Variant size (e.g., "S", "M", "L", "XL")
    color: text("color"), // Variant color (e.g., "Red", "Blue", "Black")
    isActive: boolean("is_active").default(true).notNull(), // Whether the category is visible to customers

    // Pricing & Stock
    price: decimal("price", { precision: 10, scale: 2 }), // Optional override price (if different from main product)
    stock: integer("stock").default(0).notNull(), // Stock specific to this variant

    sku: text("sku").notNull(), // Stock Keeping Unit - unique identifier for inventory
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("variants_sku_idx").on(table.sku),
    index("variants_product_idx").on(table.productId),
  ]
);

// --- Relations ---
// Categories ←→ Products (One-to-Many)
// One category can have many products
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

// Products ←→ Categories (Many-to-One)
// Many products can belong to one category
export const productsRelations = relations(products, ({ one, many }) => ({
  // Products ←→ Categories (Many-to-One)
  // Many products can belong to one category
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  // Products ←→ Variants (One-to-Many)
  // One product can have many variants
  variants: many(productVariants),
}));

// Variants ←→ Products (Many-to-One)
// Many variants belong to one product
export const productVariantsRelations = relations(
  productVariants,
  ({ one }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
  })
);
