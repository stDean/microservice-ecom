import { ZodType } from "zod";
import {
  addressIdParamsSchema,
  bulkDeleteSchema,
  bulkRestoreSchema,
  bulkUpdateSchema,
  categoryQuerySchema,
  createAddressSchema,
  createCategorySchema,
  createProductSchema,
  createProductVariantSchema,
  createUserSchema,
  idParamsSchema,
  logInUserSchema,
  onlyEmailSchema,
  onlyTokenSchema,
  productIdParamsSchema,
  productQuerySchema,
  resetPasswordSchema,
  skuParamsSchema,
  slugParamsSchema,
  updateAddressSchema,
  updateCategorySchema,
  updateProductSchema,
  updateProductVariantSchema,
  updateUserSchema,
  userIdParamsSchema,
  userQuerySchema,
} from "./validationSchemas";

export interface ValidationRules {
  [path: string]: {
    [method: string]: {
      body?: ZodType;
      query?: ZodType;
      params?: ZodType;
    };
  };
}

export const validationRules: ValidationRules = {
  // ==================== Auth ====================
  "/auth/register": { POST: { body: createUserSchema } },

  "/auth/resend-verification": { POST: { body: onlyEmailSchema } },

  "/auth/verify-email": { GET: { query: onlyTokenSchema } },

  "/auth/login": { POST: { body: logInUserSchema } },

  "/auth/forget-password": { POST: { body: logInUserSchema } },

  "/auth/resend-reset": { POST: { body: onlyEmailSchema } },

  "/auth/reset-password": {
    POST: { body: resetPasswordSchema, query: onlyTokenSchema },
  },

  // ==================== User ====================
  "/users": { GET: { query: userQuerySchema } },

  "/users/:userId": { GET: { params: userIdParamsSchema } },

  "/users/me": { PATCH: { body: updateUserSchema } },

  "/users/address": { POST: { body: createAddressSchema } },

  "/users/address/:addressId": {
    GET: { params: addressIdParamsSchema },
    PATCH: {
      params: addressIdParamsSchema,
      body: updateAddressSchema,
    },
    DELETE: { params: addressIdParamsSchema },
  },

  // ==================== CATEGORIES ====================
  "/productCatalog/categories": {
    GET: { query: categoryQuerySchema },
    POST: { body: createCategorySchema },
  },

  "/productCatalog/categories/:id": {
    GET: { params: idParamsSchema },
    PATCH: {
      params: idParamsSchema,
      body: updateCategorySchema,
    },
    DELETE: { params: idParamsSchema },
  },

  "/productCatalog/categories/slug/:slug": {
    GET: { params: slugParamsSchema },
  },

  "/productCatalog/categories/:id/products": {
    GET: {
      params: idParamsSchema,
      query: productQuerySchema,
    },
  },

  "/productCatalog/categories/bulk-update": {
    PATCH: { body: bulkUpdateSchema },
  },

  "/productCatalog/categories/bulk-delete": {
    POST: { body: bulkDeleteSchema },
  },

  "/productCatalog/categories/bulk-restore": {
    POST: { body: bulkRestoreSchema },
  },

  "/productCatalog/categories/:id/restore": {
    PATCH: { params: idParamsSchema },
  },

  // ==================== PRODUCTS ====================
  "/productCatalog/products": {
    GET: { query: productQuerySchema },
    POST: { body: createProductSchema },
  },

  "/productCatalog/products/:id": {
    GET: { params: idParamsSchema },
    PATCH: {
      params: idParamsSchema,
      body: updateProductSchema,
    },
    DELETE: { params: idParamsSchema },
  },

  "/productCatalog/products/slug/:slug": {
    GET: { params: slugParamsSchema },
  },

  "/productCatalog/products/featured": {
    GET: { query: productQuerySchema.pick({ limit: true }) },
  },

  // ==================== PRODUCT VARIANTS ====================
  "/productCatalog/products/:productId/variants": {
    GET: { params: productIdParamsSchema },
    POST: {
      params: productIdParamsSchema,
      body: createProductVariantSchema,
    },
  },

  "/productCatalog/variants/:id": {
    GET: { params: idParamsSchema },
    PATCH: {
      params: idParamsSchema,
      body: updateProductVariantSchema,
    },
    DELETE: { params: idParamsSchema },
  },

  "/productCatalog/variants/sku/:sku": {
    GET: { params: skuParamsSchema },
  },
};
