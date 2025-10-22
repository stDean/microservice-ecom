import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import db from "../../src/db";
import { ProdVariantCtrl } from "../../src/controllers/productVariants.c";
import { BadRequestError, NotFoundError } from "../../src/errors";
import { logger } from "../../src/utils/logger";
import {
  cacheVariant,
  cacheVariantList,
  getVariantBySkuFromCache,
  getVariantFromCache,
  getVariantListFromCache,
  invalidateProductVariantsCache,
  invalidateVariantCache,
} from "../../src/utils/variantCache";

// Mock dependencies
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

vi.mock("../../src/utils/variantCache", () => ({
  cacheVariant: vi.fn(),
  cacheVariantList: vi.fn(),
  getVariantBySkuFromCache: vi.fn(),
  getVariantFromCache: vi.fn(),
  getVariantListFromCache: vi.fn(),
  invalidateProductVariantsCache: vi.fn(),
  invalidateVariantCache: vi.fn(),
}));

describe("ProdVariantCtrl", () => {
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
    it("should throw NotFoundError if product not found or inactive", async () => {
      const variantData = {
        sku: "TEST-SKU-001",
        size: "M",
        color: "Red",
        price: "29.99",
        stock: 100,
      };

      mockRequest.params = { productId: "non-existent-product" };
      mockRequest.body = variantData;

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
        ProdVariantCtrl.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if SKU already exists", async () => {
      const variantData = {
        sku: "EXISTING-SKU",
        size: "M",
        color: "Red",
        price: "29.99",
        stock: 100,
      };

      mockRequest.params = { productId: "product-123" };
      mockRequest.body = variantData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([{ id: "product-123", isActive: true }]),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { id: "existing-variant", sku: "EXISTING-SKU" },
                    ]),
                }),
              }),
            }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProdVariantCtrl.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if duplicate variant exists", async () => {
      const variantData = {
        sku: "NEW-SKU-001",
        size: "M",
        color: "Red",
        price: "29.99",
        stock: 100,
      };

      mockRequest.params = { productId: "product-123" };
      mockRequest.body = variantData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([{ id: "product-123", isActive: true }]),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No SKU conflict
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([{ id: "duplicate-variant" }]), // Duplicate found
                }),
              }),
            }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProdVariantCtrl.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should successfully create variant and invalidate cache", async () => {
      const variantData = {
        sku: "NEW-SKU-001",
        size: "M",
        color: "Red",
        price: "29.99",
        stock: 100,
      };

      const newVariant = {
        id: "variant-123",
        ...variantData,
        productId: "product-123",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRequest.params = { productId: "product-123" };
      mockRequest.body = variantData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([{ id: "product-123", isActive: true }]),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No SKU conflict
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No duplicate
                }),
              }),
            }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([newVariant]),
            }),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await ProdVariantCtrl.create(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Product variant created successfully",
        variant: newVariant,
      });
      expect(invalidateProductVariantsCache).toHaveBeenCalledWith(
        "product-123"
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Product variant created: variant-123 for product: product-123"
      );
    });
  });

  describe("getAll", () => {
    it("should return variants from cache when available", async () => {
      const cachedResult = {
        message: "Product variants retrieved successfully",
        product: { id: "product-123", name: "Test Product" },
        variants: [{ id: "variant-1", sku: "TEST-001" }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      vi.mocked(getVariantListFromCache).mockResolvedValue(cachedResult);

      mockRequest.params = { productId: "product-123" };

      await ProdVariantCtrl.getAll(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getVariantListFromCache).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith(cachedResult);
      expect(logger.info).toHaveBeenCalledWith(
        "Product variants for product-123 retrieved from cache"
      );
    });

    it("should throw NotFoundError when product does not exist", async () => {
      vi.mocked(getVariantListFromCache).mockResolvedValue(null);

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

      mockRequest.params = { productId: "non-existent" };

      await expect(
        ProdVariantCtrl.getAll(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should fetch from database and cache when cache miss", async () => {
      vi.mocked(getVariantListFromCache).mockResolvedValue(null);

      mockRequest.params = { productId: "product-123" };
      mockRequest.query = {
        page: "2",
        limit: "10",
        search: "red",
        sortBy: "price",
        sortOrder: "asc",
      };

      const mockProduct = { id: "product-123", name: "Test Product" };
      const mockVariants = [
        {
          id: "variant-1",
          sku: "RED-001",
          color: "Red",
          size: "M",
          productId: "product-123",
        },
      ];

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([mockProduct]),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue(mockVariants),
                    }),
                  }),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([{ count: 1 }]),
                }),
              }),
            }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await ProdVariantCtrl.getAll(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheVariantList).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(200);
    });
  });

  describe("getById", () => {
    it("should return variant from cache when available", async () => {
      const cachedVariant = {
        id: "variant-123",
        sku: "TEST-001",
        product: { id: "product-123", name: "Test Product" },
      };
      vi.mocked(getVariantFromCache).mockResolvedValue(cachedVariant);

      mockRequest.params = { id: "variant-123" };

      await ProdVariantCtrl.getById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getVariantFromCache).toHaveBeenCalledWith("variant-123");
      expect(mockJson).toHaveBeenCalledWith({
        message: "Variant retrieved successfully",
        variant: cachedVariant,
      });
    });

    it("should throw NotFoundError when variant does not exist", async () => {
      vi.mocked(getVariantFromCache).mockResolvedValue(null);
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
        ProdVariantCtrl.getById(
          mockRequest as Request,
          mockResponse as Response
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("should fetch from database and cache when cache miss", async () => {
      vi.mocked(getVariantFromCache).mockResolvedValue(null);

      const mockVariant = {
        variant: {
          id: "variant-123",
          sku: "TEST-001",
          productId: "product-123",
        },
        product: { id: "product-123", name: "Test Product" },
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockVariant]),
            }),
          }),
        }),
      });

      mockRequest.params = { id: "variant-123" };

      await ProdVariantCtrl.getById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheVariant).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        message: "Variant retrieved successfully",
        variant: {
          ...mockVariant.variant,
          product: mockVariant.product,
        },
      });
    });
  });

  describe("getBySku", () => {
    it("should return variant from cache when available", async () => {
      const cachedVariant = {
        id: "variant-123",
        sku: "TEST-001",
        product: { id: "product-123", name: "Test Product" },
      };
      vi.mocked(getVariantBySkuFromCache).mockResolvedValue(cachedVariant);

      mockRequest.params = { sku: "TEST-001" };

      await ProdVariantCtrl.getBySku(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getVariantBySkuFromCache).toHaveBeenCalledWith("TEST-001");
      expect(mockJson).toHaveBeenCalledWith({
        message: "Variant retrieved successfully",
        variant: cachedVariant,
      });
    });

    it("should throw NotFoundError when variant does not exist", async () => {
      vi.mocked(getVariantBySkuFromCache).mockResolvedValue(null);
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      mockRequest.params = { sku: "NON-EXISTENT" };

      await expect(
        ProdVariantCtrl.getBySku(
          mockRequest as Request,
          mockResponse as Response
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("should fetch from database and cache when cache miss", async () => {
      vi.mocked(getVariantBySkuFromCache).mockResolvedValue(null);

      const mockVariant = {
        variant: {
          id: "variant-123",
          sku: "TEST-001",
          productId: "product-123",
        },
        product: { id: "product-123", name: "Test Product" },
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockVariant]),
            }),
          }),
        }),
      });

      mockRequest.params = { sku: "TEST-001" };

      await ProdVariantCtrl.getBySku(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheVariant).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        message: "Variant retrieved successfully",
        variant: {
          ...mockVariant.variant,
          product: mockVariant.product,
        },
      });
    });
  });

  describe("update", () => {
    it("should throw NotFoundError when variant does not exist", async () => {
      mockRequest.params = { id: "non-existent" };
      mockRequest.body = { sku: "UPDATED-SKU" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]), // No variant found
              }),
            }),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProdVariantCtrl.update(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when SKU already exists", async () => {
      mockRequest.params = { id: "variant-123" };
      mockRequest.body = { sku: "EXISTING-SKU" };

      const existingVariant = {
        id: "variant-123",
        sku: "OLD-SKU",
        productId: "product-123",
        size: "M",
        color: "Red",
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            .mockImplementationOnce(() => ({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([existingVariant]),
                }),
              }),
            }))
            .mockImplementationOnce(() => ({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { id: "other-variant", sku: "EXISTING-SKU" },
                    ]),
                }),
              }),
            })),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProdVariantCtrl.update(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should successfully update variant and invalidate cache", async () => {
      mockRequest.params = { id: "variant-123" };
      mockRequest.body = { size: "L", price: "39.99" };

      const existingVariant = {
        id: "variant-123",
        sku: "TEST-001",
        productId: "product-123",
        size: "M",
        color: "Red",
      };

      const updatedVariant = {
        ...existingVariant,
        size: "L",
        price: "39.99",
        updatedAt: new Date(),
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        let selectCallCount = 0;

        const mockTx = {
          select: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // First call: check if variant exists
              return {
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([existingVariant]),
                  }),
                }),
              };
            } else if (selectCallCount === 2) {
              // Second call: check for SKU conflict
              return {
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]), // No SKU conflict
                  }),
                }),
              };
            } else {
              // Third call: check for duplicate variant
              return {
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]), // No duplicate
                  }),
                }),
              };
            }
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedVariant]),
              }),
            }),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      // Mock the select for getting updated variant with product
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  variant: updatedVariant,
                  product: { id: "product-123", name: "Test Product" },
                },
              ]),
            }),
          }),
        }),
      });

      await ProdVariantCtrl.update(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(invalidateVariantCache).toHaveBeenCalledWith(
        updatedVariant.id,
        updatedVariant.sku,
        updatedVariant.productId
      );
      expect(cacheVariant).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        message: "Variant updated successfully",
        variant: {
          ...updatedVariant,
          product: { id: "product-123", name: "Test Product" },
        },
      });
    });
  });

  describe("delete", () => {
    it("should throw NotFoundError when variant does not exist", async () => {
      mockRequest.params = { id: "non-existent" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]), // No variant found
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        ProdVariantCtrl.delete(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should successfully delete variant and invalidate cache", async () => {
      mockRequest.params = { id: "variant-123" };

      const existingVariant = {
        id: "variant-123",
        sku: "TEST-001",
        productId: "product-123",
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([existingVariant]),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue(vi.fn()),
          }),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await ProdVariantCtrl.delete(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(invalidateVariantCache).toHaveBeenCalledWith(
        "variant-123",
        "TEST-001",
        "product-123"
      );
      expect(mockJson).toHaveBeenCalledWith({
        message: "Variant deleted successfully",
      });
      expect(logger.info).toHaveBeenCalledWith("Variant deleted: variant-123");
    });
  });
});
