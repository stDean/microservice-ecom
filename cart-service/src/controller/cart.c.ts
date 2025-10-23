import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { CartCache } from "../utils/cartCache";
import RedisService from "../redis/client";
import { NotFoundError } from "../errors";
import { eventPublisher } from "../redis/publisher";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

const redisService = RedisService.getInstance();

export const CartCtrl = {
  /**
   * Add a new item
   * POST /carts/me/item
   */
  add: async (req: Request, res: Response) => {
    const { itemId, quantity, price, name } = req.body;
    const userId = req.user?.id;

    const cartKey = `cart:${userId}`;

    // Create cart item structure
    const cartItem = {
      itemId,
      quantity: parseInt(quantity),
      price: parseFloat(price),
      name,
      addedAt: new Date().toISOString(),
    };

    // Store item in user's cart hash
    await redisService.hSetField(cartKey, itemId, cartItem);

    // Cache the individual item
    await CartCache.cacheCartItem(userId!, itemId, cartItem);

    // Invalidate summary and totals cache
    await CartCache.invalidateCartSummary(userId!);
    await CartCache.invalidateCartTotals(userId!);

    // Publish cart update event
    await redisService.publish("cart:updates", {
      type: "ITEM_ADDED",
      userId,
      itemId,
      quantity: cartItem.quantity,
    });

    return res.status(StatusCodes.CREATED).json({
      message: "Item added to cart successfully.",
      item: cartItem,
    });
  },

  /**
   * Retrieve the user's current cart.
   * GET /carts/me
   */
  get: async (req: Request, res: Response) => {
    const userId = req.user?.id;

    const cachedSummary = await CartCache.getCartSummaryFromCache(userId!);
    if (cachedSummary) {
      return res.status(StatusCodes.OK).json({
        message: "Cart retrieved from cache",
        ...cachedSummary,
        cached: true,
      });
    }

    // Get all items from user's cart hash
    const cartItems = await redisService.hGetAll(`cart:${userId}`);
    if (!cartItems || Object.keys(cartItems).length === 0) {
      const emptyCartResponse = {
        message: "Cart is empty",
        items: {},
        totalItems: 0,
        totalPrice: 0,
      };

      // Cache empty cart
      await CartCache.cacheCartSummary(userId!, emptyCartResponse);

      return res.status(StatusCodes.OK).json(emptyCartResponse);
    }

    // Calculate totals
    const itemsArray = Object.values(cartItems);
    const totalItems = itemsArray.reduce(
      (sum, item: any) => sum + item.quantity,
      0
    );
    const totalPrice = itemsArray.reduce(
      (sum, item: any) => sum + item.price * item.quantity,
      0
    );

    const cartResponse = {
      message: "Cart retrieved successfully",
      items: cartItems,
      totalItems,
      totalPrice: Math.round(totalPrice * 100) / 100,
    };

    // Cache the cart summary
    await CartCache.cacheCartSummary(userId!, cartResponse);

    return res.status(StatusCodes.OK).json(cartResponse);
  },

  /**
   * Update the quantity of a specific item in the cart.
   * PATCH /carts/me/items/:itemId
   */
  update: async (req: Request, res: Response) => {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = req.user?.id;

    const cartKey = `cart:${userId}`;
    // Try to get from item cache first
    let currentItem = await CartCache.getCartItemFromCache(userId!, itemId);
    if (!currentItem) {
      // Get current item from main cart storage
      currentItem = await redisService.hGet(cartKey, itemId);
    }

    if (!currentItem) throw new NotFoundError("Item not found in cart.");

    // Update quantity
    const updatedItem = {
      ...currentItem,
      quantity: parseInt(quantity),
      updatedAt: new Date().toISOString(),
    };

    // Update in main storage and cache
    await redisService.hSetField(cartKey, itemId, updatedItem);
    await CartCache.cacheCartItem(userId!, itemId, updatedItem);

    // Invalidate summary and totals cache
    await CartCache.invalidateCartSummary(userId!);
    await CartCache.invalidateCartTotals(userId!);

    eventPublisher.publishEvent({
      type: "ITEM_UPDATED",
      source: "cart-service",
      timestamp: new Date(),
      version: "1.0.0",
      data: {
        userId,
        itemId,
        oldQuantity: currentItem.quantity,
        newQuantity: updatedItem.quantity,
      },
    });

    return res.status(StatusCodes.OK).json({
      message: "Item quantity updated successfully",
      item: updatedItem,
    });
  },

  /**
   * Remove a specific item
   * PATCH /carts/me/items/:itemId
   */
  delete: async (req: Request, res: Response) => {
    const { itemId } = req.params;

    return res
      .status(StatusCodes.OK)
      .json({ message: "Remove a specific item", itemId });
  },

  /**
   * Clear the entire cart.
   * PATCH /carts/me
   */
  clear: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "Clear the entire cart." });
  },

  /**
   * Initiate checkout.
   * PATCH /carts/me/check-out
   */
  checkOut: async (req: Request, res: Response) => {
    return res.status(StatusCodes.OK).json({ message: "Initiate checkout." });
  },

  /**
   * Used for merging an unauthenticated (guest) cart with an authenticated cart during login.
   * POST /carts/{userId}/merge
   */
  merge: async (req: Request, res: Response) => {
    return res.status(StatusCodes.OK).json({
      message:
        "Used for merging an unauthenticated (guest) cart with an authenticated cart during login.",
    });
  },

  /**
   * Internal validation endpoint used by the Order Service.
   * GET /carts/validate
   */
  validate: async (req: Request, res: Response) => {
    return res.status(StatusCodes.OK).json({
      message:
        "Internal validation endpoint used by the Order Service. Takes a user_id and returns a secure, final cost structure.",
    });
  },
};
