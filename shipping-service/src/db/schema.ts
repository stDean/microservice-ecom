// src/models/Shipping.ts
import mongoose, { Document, Schema } from "mongoose";

export enum ShippingStatus {
  PENDING = "PENDING",
  SHIPPED = "SHIPPED",
  IN_TRANSIT = "IN_TRANSIT",
  DELIVERED = "DELIVERED",
}

export interface IShipping extends Document {
  orderId: string;
  userId: string;
  trackingNumber: string;
  status: ShippingStatus;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  email: string;
  estimatedDelivery: Date;
  actualDelivery?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shippingSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    trackingNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: Object.values(ShippingStatus),
      default: ShippingStatus.PENDING,
    },
    shippingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    email: { type: String, required: true},
    estimatedDelivery: { type: Date, required: true },
    actualDelivery: { type: Date },
  },
  {
    timestamps: true,
  }
);

export const Shipping = mongoose.model<IShipping>("Shipping", shippingSchema);
