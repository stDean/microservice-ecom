import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { NotFoundError, UnauthenticatedError } from "../errors";
import RedisService from "../redis/client";
import { CartCache } from "../utils/cartCache";

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

export const CartCtrl = {
  /**
   * Add a new item
   * POST /carts/me/item
   */
  add: async (req: Request, res: Response) => {
    const { itemId, quantity, price, name } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthenticatedError("User not authenticated");
    }

    const redisService = RedisService.getInstance();
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
    const redisService = RedisService.getInstance();

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

    const redisService = RedisService.getInstance();
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
    const userId = req.user?.id;

    const cartKey = `cart:${userId}`;
    const redisService = RedisService.getInstance();

    // Check if item exists (try cache first)
    let itemExists = await CartCache.getCartItemFromCache(userId!, itemId);

    if (!itemExists) {
      itemExists = await redisService.hGet(cartKey, itemId);
    }

    if (!itemExists) throw new NotFoundError("Item not found in cart");

    // Remove item from cart and clear caches
    await redisService.hDel(cartKey, [itemId]);
    await CartCache.invalidateCartItem(userId!, itemId);
    await CartCache.invalidateCartSummary(userId!);
    await CartCache.invalidateCartTotals(userId!);

    return res
      .status(StatusCodes.OK)
      .json({ message: "Item removed from cart successfully" });
  },

  /**
   * Clear the entire cart.
   * PATCH /carts/me
   */
  clear: async (req: Request, res: Response) => {
    const userId = req.user?.id;

    const cartKey = `cart:${userId}`;
    const redisService = RedisService.getInstance();

    // Check if cart exists and has items
    const cartItems = await redisService.hGetAll(cartKey);

    if (!cartItems || Object.keys(cartItems).length === 0) {
      return res.status(StatusCodes.OK).json({
        message: "Cart is already empty",
      });
    }

    // Clear all cart-related data and caches
    await redisService.del(cartKey);
    await CartCache.invalidateAllUserCartCache(userId!);

    return res.status(StatusCodes.OK).json({
      message: "Cart cleared successfully",
      clearedItems: Object.keys(cartItems).length,
    });
  },

  /**
   * Used for merging an unauthenticated (guest) cart with an authenticated cart during login.
   * POST /carts/{userId}/merge
   */
  merge: async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { guestCart } = req.body; // guestCart should be an object of { itemId: cartItem }

    const userCartKey = `cart:${userId}`;
    const redisService = RedisService.getInstance();

    // Get current user cart (try cache first)
    const cachedSummary = await CartCache.getCartSummaryFromCache(userId);
    let userCart = cachedSummary?.items;

    if (!userCart) {
      userCart = (await redisService.hGetAll(userCartKey)) || {};
    }

    let mergedCount = 0;
    let updatedCount = 0;

    // Merge guest cart items into user cart
    for (const [itemId, guestItem] of Object.entries(guestCart)) {
      if (userCart[itemId]) {
        // Item exists in both carts - update quantity
        const existingItem = userCart[itemId] as any;
        const mergedQuantity =
          existingItem.quantity + (guestItem as any).quantity;

        const updatedItem = {
          ...existingItem,
          quantity: mergedQuantity,
          mergedAt: new Date().toISOString(),
        };

        await redisService.hSetField(userCartKey, itemId, updatedItem);
        await CartCache.cacheCartItem(userId, itemId, updatedItem);
        updatedCount++;
      } else {
        // New item - add to user cart
        const newItem = {
          ...(guestItem as any),
          mergedAt: new Date().toISOString(),
        };

        await redisService.hSetField(userCartKey, itemId, newItem);
        await CartCache.cacheCartItem(userId, itemId, newItem);
        mergedCount++;
      }
    }

    // Invalidate summary and totals cache after merge
    await CartCache.invalidateCartSummary(userId);
    await CartCache.invalidateCartTotals(userId);

    return res.status(StatusCodes.OK).json({
      message: "Carts merged successfully",
      mergedItems: mergedCount,
      updatedItems: updatedCount,
      totalItems: Object.keys({ ...userCart, ...guestCart }).length,
    });
  },

  /**
   * Internal validation endpoint used by the Order Service.
   * GET /carts/validate
   */
  validate: async (req: Request, res: Response) => {
    const { user_id } = req.query;
    const redisService = RedisService.getInstance();

    if (!user_id) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "user_id query parameter is required",
      });
    }

    // Try to get cached validation result first
    const cachedValidation = await CartCache.getValidationFromCache(
      user_id as string
    );

    if (cachedValidation) {
      return res.status(StatusCodes.OK).json({
        ...cachedValidation,
        cached: true,
      });
    }

    const cartKey = `cart:${user_id}`;

    // Try to get cart from summary cache first
    const cachedSummary = await CartCache.getCartSummaryFromCache(
      user_id as string
    );
    let cartItems = cachedSummary?.items;

    if (!cartItems) {
      cartItems = await redisService.hGetAll(cartKey);
    }

    if (!cartItems || Object.keys(cartItems).length === 0) {
      const emptyResult = {
        valid: false,
        message: "Cart is empty",
        userId: user_id,
        items: {},
        totalPrice: 0,
      };

      // Cache empty validation
      await CartCache.cacheValidation(user_id as string, emptyResult);

      return res.status(StatusCodes.OK).json(emptyResult);
    }

    // Calculate secure pricing structure
    const itemsArray = Object.values(cartItems);
    const subtotal = itemsArray.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity,
      0
    );

    const taxRate = 0.08; // 8% tax
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const totalPrice = Math.round((subtotal + taxAmount) * 100) / 100;

    const validationResult = {
      valid: true,
      userId: user_id,
      items: cartItems,
      pricing: {
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: taxRate,
        taxAmount,
        totalPrice,
      },
      itemCount: Object.keys(cartItems).length,
      validatedAt: new Date().toISOString(),
    };

    // Cache validation result
    await CartCache.cacheValidation(user_id as string, validationResult);

    return res.status(StatusCodes.OK).json(validationResult);
  },

  /**
   * Get cart totals (cached version for frequent access)
   * GET /carts/me/totals
   */
  getTotals: async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const redisService = RedisService.getInstance();

    // Try to get cached totals first
    const cachedTotals = await CartCache.getCartTotalsFromCache(userId!);

    if (cachedTotals) {
      return res.status(StatusCodes.OK).json({
        ...cachedTotals,
        cached: true,
      });
    }

    // Try to get from cart summary cache
    const cachedSummary = await CartCache.getCartSummaryFromCache(userId!);
    let cartItems = cachedSummary?.items;

    if (!cartItems) {
      cartItems = await redisService.hGetAll(`cart:${userId}`);
    }

    if (!cartItems || Object.keys(cartItems).length === 0) {
      const emptyTotals = {
        totalItems: 0,
        totalPrice: 0,
        message: "Cart is empty",
      };

      await CartCache.cacheCartTotals(userId!, emptyTotals);
      return res.status(StatusCodes.OK).json(emptyTotals);
    }

    // Calculate totals
    const itemsArray = Object.values(cartItems);
    const totalItems = itemsArray.reduce(
      (sum: number, item: any) => sum + item.quantity,
      0
    );
    const totalPrice = itemsArray.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity,
      0
    );

    const totals = {
      totalItems,
      totalPrice: Math.round(totalPrice * 100) / 100,
      itemCount: Object.keys(cartItems).length,
      calculatedAt: new Date().toISOString(),
    };

    // Cache totals
    await CartCache.cacheCartTotals(userId!, totals);

    return res.status(StatusCodes.OK).json(totals);
  },
};
