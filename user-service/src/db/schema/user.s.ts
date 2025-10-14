import { Schema, model } from "mongoose";
import { addressSchema } from "./address.s";

const userSchema = new Schema(
  {
    // --- Linking to Auth Service ---
    userId: {
      type: String,
      required: true,
      unique: true, // Crucial for linking to the Auth Service
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // --- Profile Details ---
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },

    addresses: [addressSchema], // Embeds the address sub-schema
  },
  { timestamps: true }
);

export const User = model("User", userSchema);
