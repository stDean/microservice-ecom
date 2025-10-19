import { ZodType } from "zod";
import {
  createUserSchema,
  logInUserSchema,
  updateUserSchema,
  createAddressSchema,
  updateAddressSchema,
  userQuerySchema,
  userIdParamsSchema,
  addressIdParamsSchema,
  onlyEmailSchema,
  onlyTokenSchema,
  resetPasswordSchema,
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
  "/auth/register": { POST: { body: createUserSchema } },

  "/auth/resend-verification": { POST: { body: onlyEmailSchema } },

  "/auth/verify-email": { GET: { query: onlyTokenSchema } },

  "/auth/login": { POST: { body: logInUserSchema } },

  "/auth/forget-password": { POST: { body: logInUserSchema } },

  "/auth/resend-reset": { POST: { body: onlyEmailSchema } },

  "/auth/reset-password": {
    POST: { body: resetPasswordSchema, query: onlyTokenSchema },
  },

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
};
