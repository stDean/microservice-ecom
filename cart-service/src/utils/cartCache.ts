import RedisService from "../redis/client";

const redis = RedisService.getInstance();

// Cache configuration
const CACHE_TTL = {
  SHORT: 60 * 5, // 5 minutes
  MEDIUM: 60 * 30, // 30 minutes
  LONG: 60 * 60, // 1 hour
  CHECKOUT: 60 * 30, // 30 minutes for checkout sessions
};

// Cache key prefixes
const CART_SUMMARY_PREFIX = "cart:summary:";
const CART_ITEM_PREFIX = "cart:item:";
const CART_TOTALS_PREFIX = "cart:totals:";
const CART_VALIDATION_PREFIX = "validation:";
const CHECKOUT_SESSION_PREFIX = "checkout:";
const ACTIVE_CHECKOUT_PREFIX = "checkout:active:";

// Cart cache helper methods
export const CartCache = {
  // ==================== CART SUMMARY CACHE ====================

  cacheCartSummary: async (userId: string, cartData: any) => {
    const cacheKey = `${CART_SUMMARY_PREFIX}${userId}`;
    await redis.set(cacheKey, cartData, CACHE_TTL.SHORT);
  },

  getCartSummaryFromCache: async (userId: string) => {
    const cacheKey = `${CART_SUMMARY_PREFIX}${userId}`;
    return await redis.get<any>(cacheKey);
  },

  invalidateCartSummary: async (userId: string) => {
    const cacheKey = `${CART_SUMMARY_PREFIX}${userId}`;
    await redis.del(cacheKey);
  },

  // ==================== CART ITEM CACHE ====================

  cacheCartItem: async (userId: string, itemId: string, itemData: any) => {
    const cacheKey = `${CART_ITEM_PREFIX}${userId}:${itemId}`;
    await redis.set(cacheKey, itemData, CACHE_TTL.LONG);
  },

  getCartItemFromCache: async (userId: string, itemId: string) => {
    const cacheKey = `${CART_ITEM_PREFIX}${userId}:${itemId}`;
    return await redis.get<any>(cacheKey);
  },

  invalidateCartItem: async (userId: string, itemId: string) => {
    const cacheKey = `${CART_ITEM_PREFIX}${userId}:${itemId}`;
    await redis.del(cacheKey);
  },

  invalidateAllUserCartItems: async (userId: string) => {
    const itemKeys = await redis.getKeys(`${CART_ITEM_PREFIX}${userId}:*`);
    if (itemKeys.length > 0) {
      await Promise.all(itemKeys.map((key) => redis.del(key)));
    }
  },

  // ==================== CART TOTALS CACHE ====================

  cacheCartTotals: async (userId: string, totalsData: any) => {
    const cacheKey = `${CART_TOTALS_PREFIX}${userId}`;
    await redis.set(cacheKey, totalsData, CACHE_TTL.MEDIUM);
  },

  getCartTotalsFromCache: async (userId: string) => {
    const cacheKey = `${CART_TOTALS_PREFIX}${userId}`;
    return await redis.get<any>(cacheKey);
  },

  invalidateCartTotals: async (userId: string) => {
    const cacheKey = `${CART_TOTALS_PREFIX}${userId}`;
    await redis.del(cacheKey);
  },

  // ==================== VALIDATION CACHE ====================

  cacheValidation: async (userId: string, validationData: any) => {
    const cacheKey = `${CART_VALIDATION_PREFIX}${userId}`;
    await redis.set(cacheKey, validationData, CACHE_TTL.SHORT);
  },

  getValidationFromCache: async (userId: string) => {
    const cacheKey = `${CART_VALIDATION_PREFIX}${userId}`;
    return await redis.get<any>(cacheKey);
  },

  invalidateValidation: async (userId: string) => {
    const cacheKey = `${CART_VALIDATION_PREFIX}${userId}`;
    await redis.del(cacheKey);
  },

  // ==================== CHECKOUT CACHE ====================

  cacheCheckoutSession: async (sessionId: string, checkoutData: any) => {
    const cacheKey = `${CHECKOUT_SESSION_PREFIX}${sessionId}`;
    await redis.set(cacheKey, checkoutData, CACHE_TTL.CHECKOUT);
  },

  getCheckoutSessionFromCache: async (sessionId: string) => {
    const cacheKey = `${CHECKOUT_SESSION_PREFIX}${sessionId}`;
    return await redis.get<any>(cacheKey);
  },

  cacheActiveCheckout: async (userId: string, checkoutData: any) => {
    const cacheKey = `${ACTIVE_CHECKOUT_PREFIX}${userId}`;
    await redis.set(cacheKey, checkoutData, CACHE_TTL.CHECKOUT);
  },

  getActiveCheckoutFromCache: async (userId: string) => {
    const cacheKey = `${ACTIVE_CHECKOUT_PREFIX}${userId}`;
    return await redis.get<any>(cacheKey);
  },

  invalidateCheckout: async (sessionId: string, userId: string) => {
    const sessionKey = `${CHECKOUT_SESSION_PREFIX}${sessionId}`;
    const activeKey = `${ACTIVE_CHECKOUT_PREFIX}${userId}`;

    await Promise.all([redis.del(sessionKey), redis.del(activeKey)]);
  },

  // ==================== BULK OPERATIONS ====================

  invalidateAllUserCartCache: async (userId: string) => {
    const keysToDelete = [
      `${CART_SUMMARY_PREFIX}${userId}`,
      `${CART_TOTALS_PREFIX}${userId}`,
      `${CART_VALIDATION_PREFIX}${userId}`,
      `${ACTIVE_CHECKOUT_PREFIX}${userId}`,
    ];

    await Promise.all(keysToDelete.map((key) => redis.del(key)));

    // Also delete all item caches for this user
    await CartCache.invalidateAllUserCartItems(userId);
  },

  invalidateAllCartCaches: async () => {
    try {
      const summaryKeys = await redis.getKeys(`${CART_SUMMARY_PREFIX}*`);
      const itemKeys = await redis.getKeys(`${CART_ITEM_PREFIX}*`);
      const totalsKeys = await redis.getKeys(`${CART_TOTALS_PREFIX}*`);
      const validationKeys = await redis.getKeys(`${CART_VALIDATION_PREFIX}*`);
      const checkoutKeys = await redis.getKeys(`${CHECKOUT_SESSION_PREFIX}*`);
      const activeCheckoutKeys = await redis.getKeys(
        `${ACTIVE_CHECKOUT_PREFIX}*`
      );

      const allKeys = [
        ...summaryKeys,
        ...itemKeys,
        ...totalsKeys,
        ...validationKeys,
        ...checkoutKeys,
        ...activeCheckoutKeys,
      ];

      if (allKeys.length > 0) {
        await Promise.all(allKeys.map((key) => redis.del(key)));
      }
    } catch (error) {
      console.error("Error invalidating all cart caches:", error);
    }
  },

  // ==================== UTILITY METHODS ====================

  getCacheStats: async (userId?: string) => {
    const prefixes = [
      CART_SUMMARY_PREFIX,
      CART_ITEM_PREFIX,
      CART_TOTALS_PREFIX,
      CART_VALIDATION_PREFIX,
      CHECKOUT_SESSION_PREFIX,
      ACTIVE_CHECKOUT_PREFIX,
    ];

    const stats: any = {};

    for (const prefix of prefixes) {
      const pattern = userId ? `${prefix}${userId}*` : `${prefix}*`;
      const keys = await redis.getKeys(pattern);
      stats[prefix] = keys.length;
    }

    return stats;
  },

  // Helper to check if cart data exists in cache
  hasCachedCart: async (userId: string) => {
    const summary = await CartCache.getCartSummaryFromCache(userId);
    const totals = await CartCache.getCartTotalsFromCache(userId);

    return !!(summary || totals);
  },
};
