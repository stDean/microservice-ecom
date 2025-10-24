import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartCtrl } from "../../src/controller/cart.c";
import { CartCache } from "../../src/utils/cartCache";
import RedisService from "../../src/redis/client";
import { BadRequestError, NotFoundError } from "../../src/errors";

// Mock dependencies
vi.mock("../../src/utils/cartCache", () => ({
  CartCache: {
    cacheCartItem: vi.fn(),
    invalidateCartSummary: vi.fn(),
    invalidateCartTotals: vi.fn(),
    getCartSummaryFromCache: vi.fn(),
    cacheCartSummary: vi.fn(),
    getCartItemFromCache: vi.fn(),
    invalidateCartItem: vi.fn(),
    invalidateAllUserCartCache: vi.fn(),
    getCartTotalsFromCache: vi.fn(),
    cacheCartTotals: vi.fn(),
    cacheCheckoutSession: vi.fn(),
    cacheActiveCheckout: vi.fn(),
    getValidationFromCache: vi.fn(),
    cacheValidation: vi.fn(),
  },
}));

vi.mock("../../src/redis/client", () => ({
  default: {
    getInstance: vi.fn(),
  },
}));

vi.mock("../../src/errors", () => ({
  BadRequestError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BadRequestError";
    }
  },
  NotFoundError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NotFoundError";
    }
  },
}));

describe("CartCtrl", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: any;
  let mockStatus: any;
  let mockRedisService: any;

  beforeEach(() => {
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnThis();

    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: {
        id: "user-123",
        email: "test@example.com",
        role: "customer",
      },
    };

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    // Mock RedisService instance
    mockRedisService = {
      hSetField: vi.fn(),
      hGetAll: vi.fn(),
      hGet: vi.fn(),
      hDel: vi.fn(),
      del: vi.fn(),
      publish: vi.fn(),
    };

    vi.mocked(RedisService.getInstance).mockReturnValue(mockRedisService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("add", () => {
    // fail
    it("should add item to cart successfully", async () => {
      const itemData = {
        itemId: "item-1",
        quantity: "2",
        price: "29.99",
        name: "Test Product",
      };

      mockRequest.body = itemData;

      await CartCtrl.add(mockRequest as Request, mockResponse as Response);

      expect(mockRedisService.hSetField).toHaveBeenCalledWith(
        "cart:user-123",
        "item-1",
        {
          itemId: "item-1",
          quantity: 2,
          price: 29.99,
          name: "Test Product",
          addedAt: expect.any(String),
        }
      );

      expect(CartCache.cacheCartItem).toHaveBeenCalledWith(
        "user-123",
        "item-1",
        expect.any(Object)
      );

      expect(CartCache.invalidateCartSummary).toHaveBeenCalledWith("user-123");
      expect(CartCache.invalidateCartTotals).toHaveBeenCalledWith("user-123");

      expect(mockRedisService.publish).toHaveBeenCalledWith("cart:updates", {
        type: "ITEM_ADDED",
        userId: "user-123",
        itemId: "item-1",
        quantity: 2,
      });

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Item added to cart successfully.",
        item: expect.any(Object),
      });
    });

    it("should throw error when user is not authenticated", async () => {
      mockRequest.user = undefined;

      await expect(
        CartCtrl.add(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow();
    });
  });

  describe("get", () => {
    it("should return cart from cache when available", async () => {
      const cachedSummary = {
        message: "Cart retrieved from cache",
        items: { "item-1": { itemId: "item-1", quantity: 1, price: 29.99 } },
        totalItems: 1,
        totalPrice: 29.99,
      };

      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(
        cachedSummary
      );

      await CartCtrl.get(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        ...cachedSummary,
        cached: true,
      });
    });

    // fail
    it("should return empty cart when no items exist", async () => {
      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(null);
      mockRedisService.hGetAll.mockResolvedValue({});

      await CartCtrl.get(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Cart is empty",
        items: {},
        totalItems: 0,
        totalPrice: 0,
      });

      expect(CartCache.cacheCartSummary).toHaveBeenCalledWith("user-123", {
        message: "Cart is empty",
        items: {},
        totalItems: 0,
        totalPrice: 0,
      });
    });

    // fail
    it("should calculate totals and cache when items exist", async () => {
      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(null);

      const cartItems = {
        "item-1": { itemId: "item-1", quantity: 2, price: 10 },
        "item-2": { itemId: "item-2", quantity: 1, price: 15 },
      };

      mockRedisService.hGetAll.mockResolvedValue(cartItems);

      await CartCtrl.get(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Cart retrieved successfully",
        items: cartItems,
        totalItems: 3,
        totalPrice: 35,
      });

      expect(CartCache.cacheCartSummary).toHaveBeenCalledWith("user-123", {
        message: "Cart retrieved successfully",
        items: cartItems,
        totalItems: 3,
        totalPrice: 35,
      });
    });
  });

  describe("update", () => {
    // fail
    it("should update item quantity successfully", async () => {
      const currentItem = {
        itemId: "item-1",
        quantity: 1,
        price: 29.99,
        name: "Test Product",
      };

      mockRequest.params = { itemId: "item-1" };
      mockRequest.body = { quantity: "3" };

      vi.mocked(CartCache.getCartItemFromCache).mockResolvedValue(currentItem);

      await CartCtrl.update(mockRequest as Request, mockResponse as Response);

      expect(mockRedisService.hSetField).toHaveBeenCalledWith(
        "cart:user-123",
        "item-1",
        {
          ...currentItem,
          quantity: 3,
          updatedAt: expect.any(String),
        }
      );

      expect(CartCache.cacheCartItem).toHaveBeenCalledWith(
        "user-123",
        "item-1",
        expect.any(Object)
      );

      expect(CartCache.invalidateCartSummary).toHaveBeenCalledWith("user-123");
      expect(CartCache.invalidateCartTotals).toHaveBeenCalledWith("user-123");

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Item quantity updated successfully",
        item: expect.any(Object),
      });
    });

    //  fail
    it("should fetch from redis when cache miss", async () => {
      const currentItem = {
        itemId: "item-1",
        quantity: 1,
        price: 29.99,
      };

      mockRequest.params = { itemId: "item-1" };
      mockRequest.body = { quantity: "2" };

      vi.mocked(CartCache.getCartItemFromCache).mockResolvedValue(null);
      mockRedisService.hGet.mockResolvedValue(currentItem);

      await CartCtrl.update(mockRequest as Request, mockResponse as Response);

      expect(mockRedisService.hGet).toHaveBeenCalledWith(
        "cart:user-123",
        "item-1"
      );
    });

    // fail
    it("should throw NotFoundError when item not found", async () => {
      mockRequest.params = { itemId: "non-existent" };
      mockRequest.body = { quantity: "2" };

      vi.mocked(CartCache.getCartItemFromCache).mockResolvedValue(null);
      mockRedisService.hGet.mockResolvedValue(null);

      await expect(
        CartCtrl.update(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    //  fail
    it("should remove item from cart successfully", async () => {
      const existingItem = {
        itemId: "item-1",
        quantity: 1,
        price: 29.99,
      };

      mockRequest.params = { itemId: "item-1" };

      vi.mocked(CartCache.getCartItemFromCache).mockResolvedValue(existingItem);

      await CartCtrl.delete(mockRequest as Request, mockResponse as Response);

      expect(mockRedisService.hDel).toHaveBeenCalledWith("cart:user-123", [
        "item-1",
      ]);
      expect(CartCache.invalidateCartItem).toHaveBeenCalledWith(
        "user-123",
        "item-1"
      );
      expect(CartCache.invalidateCartSummary).toHaveBeenCalledWith("user-123");
      expect(CartCache.invalidateCartTotals).toHaveBeenCalledWith("user-123");

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Item removed from cart successfully",
      });
    });

    // fail
    it("should throw NotFoundError when item not found", async () => {
      mockRequest.params = { itemId: "non-existent" };

      vi.mocked(CartCache.getCartItemFromCache).mockResolvedValue(null);
      mockRedisService.hGet.mockResolvedValue(null);

      await expect(
        CartCtrl.delete(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("clear", () => {
    // fail
    it("should clear entire cart successfully", async () => {
      const cartItems = {
        "item-1": { itemId: "item-1", quantity: 1, price: 29.99 },
        "item-2": { itemId: "item-2", quantity: 2, price: 15 },
      };

      mockRedisService.hGetAll.mockResolvedValue(cartItems);

      await CartCtrl.clear(mockRequest as Request, mockResponse as Response);

      expect(mockRedisService.del).toHaveBeenCalledWith("cart:user-123");
      expect(CartCache.invalidateAllUserCartCache).toHaveBeenCalledWith(
        "user-123"
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Cart cleared successfully",
        clearedItems: 2,
      });
    });

    // fail
    it("should return message when cart is already empty", async () => {
      mockRedisService.hGetAll.mockResolvedValue({});

      await CartCtrl.clear(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Cart is already empty",
      });

      expect(mockRedisService.del).not.toHaveBeenCalled();
    });
  });

  describe("checkOut", () => {
    it("should initiate checkout successfully", async () => {
      const cartItems = {
        "item-1": { itemId: "item-1", quantity: 2, price: 10 },
        "item-2": { itemId: "item-2", quantity: 1, price: 15 },
      };

      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue({
        items: cartItems,
      });

      vi.mocked(CartCache.getCartTotalsFromCache).mockResolvedValue(null);

      await CartCtrl.checkOut(mockRequest as Request, mockResponse as Response);

      expect(CartCache.cacheCheckoutSession).toHaveBeenCalledWith(
        expect.stringContaining("checkout:user-123:"),
        {
          userId: "user-123",
          items: cartItems,
          totalPrice: 35,
          checkoutAt: expect.any(String),
          status: "pending",
        }
      );

      expect(CartCache.cacheActiveCheckout).toHaveBeenCalledWith(
        "user-123",
        expect.any(Object)
      );

      expect(CartCache.invalidateCartSummary).toHaveBeenCalledWith("user-123");
      expect(CartCache.invalidateCartTotals).toHaveBeenCalledWith("user-123");

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Checkout initiated successfully",
        sessionId: expect.any(String),
        totalPrice: 35,
        itemCount: 2,
        expiresIn: "30 minutes",
      });
    });

    it("should use cached totals when available", async () => {
      const cartItems = {
        "item-1": { itemId: "item-1", quantity: 2, price: 10 },
      };

      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue({
        items: cartItems,
      });

      vi.mocked(CartCache.getCartTotalsFromCache).mockResolvedValue({
        totalPrice: 25, // Different from calculated to verify cache is used
      });

      await CartCtrl.checkOut(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          totalPrice: 25, // Using cached total
        })
      );
    });

    // fail
    it("should throw BadRequestError when cart is empty", async () => {
      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(null);
      mockRedisService.hGetAll.mockResolvedValue({});

      await expect(
        CartCtrl.checkOut(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("merge", () => {
    // fail
    it("should merge guest cart with user cart successfully", async () => {
      const userId = "user-123";
      const guestCart = {
        "guest-item-1": {
          itemId: "guest-item-1",
          quantity: 1,
          price: 20,
          name: "Guest Product",
        },
      };

      const userCart = {
        "user-item-1": {
          itemId: "user-item-1",
          quantity: 2,
          price: 15,
          name: "User Product",
        },
      };

      mockRequest.params = { userId };
      mockRequest.body = { guestCart };

      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue({
        items: userCart,
      });

      await CartCtrl.merge(mockRequest as Request, mockResponse as Response);

      expect(mockRedisService.hSetField).toHaveBeenCalled();
      expect(CartCache.cacheCartItem).toHaveBeenCalled();
      expect(CartCache.invalidateCartSummary).toHaveBeenCalledWith(userId);
      expect(CartCache.invalidateCartTotals).toHaveBeenCalledWith(userId);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Carts merged successfully",
        mergedItems: expect.any(Number),
        updatedItems: expect.any(Number),
        totalItems: expect.any(Number),
      });
    });

    // fail
    it("should handle empty user cart during merge", async () => {
      const userId = "user-123";
      const guestCart = {
        "guest-item-1": {
          itemId: "guest-item-1",
          quantity: 1,
          price: 20,
          name: "Guest Product",
        },
      };

      mockRequest.params = { userId };
      mockRequest.body = { guestCart };

      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(null);
      mockRedisService.hGetAll.mockResolvedValue({});

      await CartCtrl.merge(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          mergedItems: 1,
          updatedItems: 0,
        })
      );
    });
  });

  describe("validate", () => {
    it("should return cached validation when available", async () => {
      const userId = "user-123";
      const cachedValidation = {
        valid: true,
        userId,
        items: { "item-1": { itemId: "item-1", quantity: 1, price: 29.99 } },
        pricing: {
          subtotal: 29.99,
          taxRate: 0.08,
          taxAmount: 2.4,
          totalPrice: 32.39,
        },
        itemCount: 1,
        validatedAt: expect.any(String),
      };

      mockRequest.query = { user_id: userId };
      vi.mocked(CartCache.getValidationFromCache).mockResolvedValue(
        cachedValidation
      );

      await CartCtrl.validate(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        ...cachedValidation,
        cached: true,
      });
    });

    // fail
    it("should return empty cart validation when cart is empty", async () => {
      const userId = "user-123";

      mockRequest.query = { user_id: userId };
      vi.mocked(CartCache.getValidationFromCache).mockResolvedValue(null);
      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(null);
      mockRedisService.hGetAll.mockResolvedValue({});

      await CartCtrl.validate(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        valid: false,
        message: "Cart is empty",
        userId,
        items: {},
        totalPrice: 0,
      });

      expect(CartCache.cacheValidation).toHaveBeenCalledWith(
        userId,
        expect.any(Object)
      );
    });

    it("should calculate validation with tax when cart has items", async () => {
      const userId = "user-123";
      const cartItems = {
        "item-1": { itemId: "item-1", quantity: 2, price: 10 },
      };

      mockRequest.query = { user_id: userId };
      vi.mocked(CartCache.getValidationFromCache).mockResolvedValue(null);
      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue({
        items: cartItems,
      });

      await CartCtrl.validate(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        valid: true,
        userId,
        items: cartItems,
        pricing: {
          subtotal: 20,
          taxRate: 0.08,
          taxAmount: 1.6,
          totalPrice: 21.6,
        },
        itemCount: 1,
        validatedAt: expect.any(String),
      });

      expect(CartCache.cacheValidation).toHaveBeenCalledWith(
        userId,
        expect.any(Object)
      );
    });

    it("should return bad request when user_id is missing", async () => {
      mockRequest.query = {};

      await CartCtrl.validate(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith({
        message: "user_id query parameter is required",
      });
    });
  });

  describe("getTotals", () => {
    it("should return cached totals when available", async () => {
      const cachedTotals = {
        totalItems: 3,
        totalPrice: 75.5,
        itemCount: 2,
        calculatedAt: expect.any(String),
      };

      vi.mocked(CartCache.getCartTotalsFromCache).mockResolvedValue(
        cachedTotals
      );

      await CartCtrl.getTotals(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        ...cachedTotals,
        cached: true,
      });
    });

    it("should calculate totals when cache miss", async () => {
      const cartItems = {
        "item-1": { itemId: "item-1", quantity: 2, price: 15 },
        "item-2": { itemId: "item-2", quantity: 1, price: 25 },
      };

      vi.mocked(CartCache.getCartTotalsFromCache).mockResolvedValue(null);
      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(null);
      mockRedisService.hGetAll.mockResolvedValue(cartItems);

      await CartCtrl.getTotals(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        totalItems: 3,
        totalPrice: 55,
        itemCount: 2,
        calculatedAt: expect.any(String),
      });

      expect(CartCache.cacheCartTotals).toHaveBeenCalledWith(
        "user-123",
        expect.any(Object)
      );
    });

    it("should return empty totals when cart is empty", async () => {
      vi.mocked(CartCache.getCartTotalsFromCache).mockResolvedValue(null);
      vi.mocked(CartCache.getCartSummaryFromCache).mockResolvedValue(null);
      mockRedisService.hGetAll.mockResolvedValue({});

      await CartCtrl.getTotals(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        totalItems: 0,
        totalPrice: 0,
        message: "Cart is empty",
      });
    });
  });
});
