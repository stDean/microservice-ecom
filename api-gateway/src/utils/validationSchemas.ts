import { optional, z } from "zod";

// Auth Schema
export const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["customer", "admin"]).default("customer"),
});

export const logInUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const onlyEmailSchema = z.object({
  email: z.string().email("Email is required"),
});

export const onlyTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

// User schemas
export const updateUserSchema = z
  .object({
    firstName: z.string().min(1, "First name is required").max(50).optional(),
    lastName: z.string().min(1, "Last name is required").max(50).optional(),
    phone: z
      .string()
      .regex(/^[+]?[\d\s-()]+$/, "Invalid phone format")
      .optional(),
  })
  .strict(); // No extra fields allowed

// Address schemas
export const createAddressSchema = z
  .object({
    type: z.enum(["Shipping", "Billing", "Home", "Work"]).default("Shipping"),
    isDefault: z.boolean().default(false),
    line1: z.string().min(1, "Address line 1 is required").max(100),
    line2: z.string().max(100).optional(),
    city: z.string().min(1, "City is required").max(50),
    stateProvince: z.string().min(1, "State/Province is required").max(50),
    postalCode: z.string().min(1, "Postal code is required").max(20),
    country: z.string().length(2, "Country must be 2-letter ISO code"),
  })
  .strict();

export const updateAddressSchema = z
  .object({
    type: z.enum(["Shipping", "Billing", "Home", "Work"]).optional(),
    isDefault: z.boolean().optional(),
    line1: z.string().min(1).max(100).optional(),
    line2: z.string().max(100).optional(),
    city: z.string().min(1).max(50).optional(),
    stateProvince: z.string().min(1).max(50).optional(),
    postalCode: z.string().min(1).max(20).optional(),
    country: z.string().length(2).optional(),
  })
  .strict();

// Common schemas
export const uuidSchema = z.string().uuid("Invalid UUID format");
export const slugSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(
    /^[a-z0-9-]+$/,
    "Slug can only contain lowercase letters, numbers, and hyphens"
  );

// Category schemas
export const createCategorySchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    slug: slugSchema,
    description: z.string().max(500).optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    slug: slugSchema.optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

// Bulk operation schemas
export const bulkDeleteSchema = z
  .object({
    ids: z
      .array(uuidSchema)
      .min(1)
      .max(100, "Cannot process more than 100 items at once"),
    hardDelete: z.boolean().default(false),
  })
  .strict();

export const bulkUpdateSchema = z
  .object({
    ids: z
      .array(uuidSchema)
      .min(1)
      .max(100, "Cannot process more than 100 items at once"),
    data: updateCategorySchema, // Reuse the update schema for consistency
  })
  .strict();

export const bulkRestoreSchema = z
  .object({
    ids: z
      .array(uuidSchema)
      .min(1)
      .max(100, "Cannot process more than 100 items at once"),
  })
  .strict();

// Product schemas
export const createProductSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(200, "Name too long"),
    slug: slugSchema,
    description: z.string().max(2000).optional(),
    price: z.number().min(0, "Price must be positive").max(999999.99),
    comparePrice: z.number().min(0).max(999999.99).optional(),
    stock: z.number().int().min(0, "Stock cannot be negative").default(0),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    categoryId: uuidSchema.optional(),
    images: z.array(z.url("Invalid image URL")).max(10).optional(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().max(2000).optional(),
    price: z.number().min(0).max(999999.99).optional(),
    comparePrice: z.number().min(0).max(999999.99).optional(),
    stock: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    categoryId: uuidSchema.optional().nullable(),
    images: z.array(z.url()).max(10).optional(),
  })
  .strict();

// Product Variant schemas
export const createProductVariantSchema = z
  .object({
    size: z.string().max(50).optional(),
    color: z.string().max(50).optional(),
    price: z.number().min(0).max(999999.99).optional(),
    stock: z.number().int().min(0).default(0),
    sku: z.string().min(1, "SKU is required").max(100),
  })
  .strict();

export const updateProductVariantSchema = z
  .object({
    size: z.string().max(50).optional().nullable(),
    color: z.string().max(50).optional().nullable(),
    price: z.number().min(0).max(999999.99).optional(),
    stock: z.number().int().min(0).optional(),
    sku: z.string().min(1).max(100).optional(),
  })
  .strict();

// Query schemas
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  sort: z.string().max(100).optional(),
});

export const userQuerySchema = paginationQuerySchema.extend({
  fields: z.string().optional(),
});

export const productQuerySchema = paginationQuerySchema.extend({
  category: uuidSchema.optional(),
  featured: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

export const categoryQuerySchema = paginationQuerySchema.extend({
  active: z.coerce.boolean().optional(),
});

// Params schemas
export const userIdParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const addressIdParamsSchema = z.object({
  addressId: z.string().min(1, "Address ID is required"),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export const slugParamsSchema = z.object({
  slug: slugSchema,
});

export const skuParamsSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
});

export const productIdParamsSchema = z.object({
  productId: uuidSchema,
});

export const categoryIdParamsSchema = z.object({
  categoryId: uuidSchema,
});

// Order Schemas
export const createOrderSchema = z
  .object({
    shippingAddress: z.object({
      deliveryOption: z.string().min(1, "Delivery option is required"),
      street: z.string().min(1, "Street address is required").max(100),
      city: z.string().min(1, "City is required").max(50),
      state: z.string().min(1, "State is required").max(50),
      zipCode: z.string().min(1, "Zip code is required").max(20),
      country: z.string().min(1, "Country is required").max(50),
    }),
    paymentMethod: z
      .object({
        type: z.enum(["pay_now", "cash_on_delivery"]),
        paymentMethodId: z.string().optional(),
      })
      .refine(
        (data) => {
          if (data.type === "pay_now" && !data.paymentMethodId) {
            return false;
          }
          return true;
        },
        {
          message: "Payment method ID is required when type is 'pay_now'",
          path: ["paymentMethodId"],
        }
      ),
    cartItems: z
      .array(
        z.object({
          itemId: z.string().min(1, "Item ID is required"),
          name: z.string().min(1, "Item name is required").max(200),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
          quantity: z.number().int().min(1, "Quantity must be at least 1"),
          sku: z.string().optional(),
        })
      )
      .min(1, "Cart must contain at least one item"),
  })
  .strict();

export const orderIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "Order ID must be a number"),
});

export const cancelOrderSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

export const paymentWebhookSchema = z
  .object({
    orderId: z.number().int().positive("Order ID must be positive"),
    paymentIntentId: z.string().min(1, "Payment intent ID is required"),
    status: z.enum(["succeeded", "failed", "processing"]),
    secret: z.string().min(1, "Webhook secret is required"),
  })
  .strict();

export const statusWebhookSchema = z
  .object({
    orderId: z.number().int().positive("Order ID must be positive"),
    status: z.enum([
      "PENDING",
      "PAID",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "REFUNDED",
    ]),
    reason: z.string().max(500).optional(),
    secret: z.string().min(1, "Webhook secret is required"),
  })
  .strict();

export const orderQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"])
    .optional(),
});
