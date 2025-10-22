import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import db from "../../src/db";
import { ProductCtrl } from "../../src/controllers/product.c";
import { BadRequestError, NotFoundError } from "../../src/errors";
import { logger } from "../../src/utils/logger";
import {
  cacheFeaturedProducts,
  cacheProduct,
  cacheProductList,
  getFeaturedProductsFromCache,
  getProductBySlugFromCache,
  getProductFromCache,
  getProductListFromCache,
  invalidateAllProductCaches,
  invalidateProductCache,
} from "../../src/utils/productCache";

vi.mock("../../src/db", () => ({
  default: {
    transaction: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
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

vi.mock("../../src/redis/client", () => ({
  default: {
    getInstance: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    })),
  },
}));

vi.mock("../../src/utils/productCache", () => ({
  cacheFeaturedProducts: vi.fn(),
  cacheProduct: vi.fn(),
  cacheProductList: vi.fn(),
  getFeaturedProductsFromCache: vi.fn(),
  getProductBySlugFromCache: vi.fn(),
  getProductFromCache: vi.fn(),
  getProductListFromCache: vi.fn(),
  invalidateAllProductCaches: vi.fn(),
  invalidateProductCache: vi.fn(),
}));

describe("ProductCtrl", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: Mock;
  let mockStatus: Mock;

  beforeEach(() => {
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnThis();

    mockRequest = {
      body: {},
      params: {},
      query: {},
    };

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("create", () => {
    it("should throw BadRequestError if product with slug already exists", async () => {
      const productData = {
        name: "Test Product",
        slug: "existing-slug",
        price: 200,
        categoryId: "cat-123",
      };

      mockRequest.body = productData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi
            .fn()
            .mockResolvedValueOnce([{ id: "existing-id" }]) // Existing product
            .mockResolvedValueOnce([]), // No category check needed since product already exists
          insert: vi.fn(),
          returning: vi.fn(),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProductCtrl.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);

      expect(invalidateAllProductCaches).not.toHaveBeenCalled();
    });

    it("should throw BadRequestError if category does not exist", async () => {
      const productData = {
        name: "Test Product",
        slug: "new-slug",
        price: 200,
        categoryId: "non-existent-cat",
      };

      mockRequest.body = productData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No existing product
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No category found
                }),
              }),
            }),
          insert: vi.fn(),
          returning: vi.fn(),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProductCtrl.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);

      expect(invalidateAllProductCaches).not.toHaveBeenCalled();
    });

    it("should successfully create product and invalidate cache", async () => {
      const productData = {
        name: "Test Product",
        slug: "new-slug",
        price: 200,
        categoryId: "cat-123",
      };

      const newProduct = {
        id: "product-123",
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isFeatured: false,
        description: null,
      };

      mockRequest.body = productData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No existing product
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([{ id: "cat-123" }]), // Category exists
                }),
              }),
            }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([newProduct]),
            }),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await ProductCtrl.create(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product created successfully",
        product: newProduct,
      });
      expect(invalidateAllProductCaches).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Product created: product-123");
    });
  });

  describe("getAll", () => {
    it("should return products from cache when available", async () => {
      const cachedResult = {
        message: "Products retrieved successfully",
        products: [{ id: "1", name: "Cached Product" }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      vi.mocked(getProductListFromCache).mockResolvedValue(cachedResult);

      await ProductCtrl.getAll(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getProductListFromCache).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith(cachedResult);
      expect(logger.info).toHaveBeenCalledWith(
        "Products list retrieved from cache"
      );
    });

    it("should fetch from database when cache miss and apply filters", async () => {
      vi.mocked(getProductListFromCache).mockResolvedValue(null);

      mockRequest.query = {
        page: "2",
        limit: "10",
        category: "cat-123",
        featured: "true",
        search: "test",
        sortBy: "price",
        sortOrder: "asc",
      };

      const mockProducts = [
        {
          product: { id: "1", name: "Test Product", categoryId: "cat-123" },
          category: { id: "cat-123", name: "Test Category" },
        },
      ];

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          offset: vi.fn().mockResolvedValue(mockProducts),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      await ProductCtrl.getAll(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheProductList).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(200);
    });
  });

  describe("getById", () => {
    it("should return product from cache when available", async () => {
      const cachedProduct = { id: "1", name: "Cached Product" };
      vi.mocked(getProductFromCache).mockResolvedValue(cachedProduct);

      mockRequest.params = { id: "1" };

      await ProductCtrl.getById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getProductFromCache).toHaveBeenCalledWith("1");
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product retrieved successfully",
        product: cachedProduct,
      });
    });

    it("should throw NotFoundError when product does not exist", async () => {
      vi.mocked(getProductFromCache).mockResolvedValue(null);
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      mockRequest.params = { id: "non-existent" };

      await expect(
        ProductCtrl.getById(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should fetch from database and cache when cache miss", async () => {
      vi.mocked(getProductFromCache).mockResolvedValue(null);

      const mockProduct = {
        product: { id: "1", name: "Test Product", categoryId: "cat-123" },
        category: { id: "cat-123", name: "Test Category" },
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockProduct]),
            }),
          }),
        }),
      });

      mockRequest.params = { id: "1" };

      await ProductCtrl.getById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheProduct).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product retrieved successfully",
        product: {
          ...mockProduct.product,
          category: mockProduct.category,
        },
      });
    });
  });

  describe("getBySlug", () => {
    it("should return product from cache when available", async () => {
      const cachedProduct = {
        id: "1",
        name: "Cached Product",
        slug: "test-product",
      };
      vi.mocked(getProductBySlugFromCache).mockResolvedValue(cachedProduct);

      mockRequest.params = { slug: "test-product" };

      await ProductCtrl.getBySlug(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getProductBySlugFromCache).toHaveBeenCalledWith("test-product");
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product retrieved successfully",
        product: cachedProduct,
      });
    });

    it("should throw NotFoundError when product does not exist", async () => {
      vi.mocked(getProductBySlugFromCache).mockResolvedValue(null);
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      mockRequest.params = { slug: "non-existent" };

      await expect(
        ProductCtrl.getBySlug(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getFeatured", () => {
    it("should return featured products from cache when available", async () => {
      const cachedResult = {
        message: "Featured products retrieved successfully",
        products: [{ id: "1", name: "Featured Product", isFeatured: true }],
      };

      vi.mocked(getFeaturedProductsFromCache).mockResolvedValue(cachedResult);

      await ProductCtrl.getFeatured(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getFeaturedProductsFromCache).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith(cachedResult);
    });

    it("should fetch from database and cache when cache miss", async () => {
      vi.mocked(getFeaturedProductsFromCache).mockResolvedValue(null);

      const mockFeaturedProducts = [
        {
          product: { id: "1", name: "Featured Product", isFeatured: true },
          category: { id: "cat-123", name: "Test Category" },
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockFeaturedProducts),
              }),
            }),
          }),
        }),
      });

      await ProductCtrl.getFeatured(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheFeaturedProducts).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        message: "Featured products retrieved successfully",
        products: mockFeaturedProducts.map((item) => ({
          ...item.product,
          category: item.category,
        })),
      });
    });
  });

  describe("update", () => {
    it("should throw NotFoundError when product does not exist", async () => {
      mockRequest.params = { id: "non-existent" };
      mockRequest.body = { name: "Updated Name" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]), // No product found
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProductCtrl.update(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when slug already exists", async () => {
      mockRequest.params = { id: "product-123" };
      mockRequest.body = { slug: "existing-slug" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { id: "product-123", slug: "old-slug" },
                    ]),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { id: "other-product", slug: "existing-slug" },
                    ]),
                }),
              }),
            }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProductCtrl.update(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should successfully update product and invalidate cache", async () => {
      mockRequest.params = { id: "product-123" };
      mockRequest.body = { name: "Updated Name", price: 300 };

      const updatedProduct = {
        id: "product-123",
        name: "Updated Name",
        price: 300,
        slug: "old-slug",
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { id: "product-123", slug: "old-slug" },
                    ]),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No slug conflict
                }),
              }),
            }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedProduct]),
              }),
            }),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      // Mock the select for getting updated product with category
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  product: updatedProduct,
                  category: { id: "cat-123", name: "Test Category" },
                },
              ]),
            }),
          }),
        }),
      });

      await ProductCtrl.update(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(invalidateProductCache).toHaveBeenCalledWith(
        "product-123",
        "old-slug"
      );
      expect(cacheProduct).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product updated successfully",
        product: {
          ...updatedProduct,
          category: { id: "cat-123", name: "Test Category" },
        },
      });
    });
  });

  describe("delete", () => {
    it("should perform soft delete by default", async () => {
      mockRequest.params = { id: "product-123" };

      const existingProduct = {
        id: "product-123",
        name: "Test Product",
        slug: "test-product",
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([existingProduct]),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue(vi.fn()),
            }),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await ProductCtrl.delete(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(invalidateProductCache).toHaveBeenCalledWith(
        "product-123",
        "test-product"
      );
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product deleted successfully",
      });
    });

    it("should perform hard delete when specified", async () => {
      mockRequest.params = { id: "product-123" };
      mockRequest.query = { hardDelete: "true" };

      const existingProduct = {
        id: "product-123",
        name: "Test Product",
        slug: "test-product",
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        // Create a more flexible mock that handles method chaining
        const mockTx = {
          // For product existence check
          select: vi
            .fn()
            .mockImplementationOnce(() => ({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([existingProduct]),
                }),
              }),
            }))
            // For variant count check - this is the critical part
            .mockImplementationOnce(() => ({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 0 }]),
              }),
            })),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue(vi.fn()),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await ProductCtrl.delete(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(invalidateProductCache).toHaveBeenCalledWith(
        "product-123",
        "test-product"
      );
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product permanently deleted successfully",
      });
    });

    it("should throw BadRequestError when hard deleting product with variants", async () => {
      mockRequest.params = { id: "product-123" };
      mockRequest.query = { hardDelete: "true" };

      const existingProduct = {
        id: "product-123",
        name: "Test Product",
        slug: "test-product",
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockImplementationOnce(() => ({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([existingProduct]),
                }),
              }),
            }))
            .mockImplementationOnce(() => ({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 5 }]), // Has variants
              }),
            })),
          // No delete mock since it should throw before reaching delete
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProductCtrl.delete(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("restore", () => {
    it("should restore soft-deleted product", async () => {
      mockRequest.params = { id: "product-123" };

      const restoredProduct = {
        id: "product-123",
        name: "Test Product",
        slug: "test-product",
        isActive: true,
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ id: "product-123" }]),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([restoredProduct]),
              }),
            }),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      // Mock the select for getting restored product with category
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  product: restoredProduct,
                  category: { id: "cat-123", name: "Test Category" },
                },
              ]),
            }),
          }),
        }),
      });

      await ProductCtrl.restore(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(invalidateProductCache).toHaveBeenCalledWith(
        "product-123",
        "test-product"
      );
      expect(cacheProduct).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product restored successfully",
        product: {
          ...restoredProduct,
          category: { id: "cat-123", name: "Test Category" },
        },
      });
    });
  });
});
