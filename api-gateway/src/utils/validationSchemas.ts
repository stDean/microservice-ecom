import { optional, z } from "zod";

// Auth Schema
export const createUserSchema = z.object({
  email: z.email("Invalid email format"),
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["customer", "admin"]).default("customer"),
});

export const logInUserSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const onlyEmailSchema = z.object({
  email: z.email("Email is required"),
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

// Query schemas
export const userQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().max(100).optional(),
  sort: z.string().max(100).optional(),
  fields: z.string().optional(),
});

export const userIdParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const addressIdParamsSchema = z.object({
  addressId: z.string().min(1, "Address ID is required"),
});
