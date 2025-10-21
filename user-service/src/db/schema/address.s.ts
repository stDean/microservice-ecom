import { Schema, model } from "mongoose";

export const addressSchema = new Schema(
  {
    addressId: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
    },
    type: {
      type: String,
      enum: ["Shipping", "Billing", "Home", "Work"],
      default: "Shipping",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    line1: {
      type: String,
      required: true,
      trim: true,
    },
    line2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      required: true,
    },
    stateProvince: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
      // Using ISO 3166-1 alpha-2 codes (e.g., 'US', 'CA', 'NG') is best practice
    },
  },
  { _id: false }
);

