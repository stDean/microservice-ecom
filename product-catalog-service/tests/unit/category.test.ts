import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { CategoryCtrl } from "../../src/controllers/category.c";
import db from "../../src/db";
import { BadRequestError, NotFoundError } from "../../src/errors";
import {
  cacheCategory,
  cacheCategoryList,
  cacheCategoryProducts,
  getCategoryBySlugFromCache,
  getCategoryFromCache,
  getCategoryListFromCache,
  getCategoryProductsFromCache,
  invalidateAllCategoryCaches,
  invalidateCategoryCache,
} from "../../src/utils/categoryCache";
import { logger } from "../../src/utils/logger";

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

vi.mock("../../src/db/schema", () => ({
  categories: {
    id: "id",
    name: "name",
    slug: "slug",
    isActive: "isActive",
    sortOrder: "sortOrder",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  products: {
    id: "id",
    categoryId: "categoryId",
    name: "name",
    price: "price",
    isActive: "isActive",
    isFeatured: "isFeatured",
    createdAt: "createdAt",
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

vi.mock("../../src/utils/categoryCache", () => ({
  getCategoryListFromCache: vi.fn(),
  cacheCategoryList: vi.fn(),
  getCategoryFromCache: vi.fn(),
  getCategoryBySlugFromCache: vi.fn(),
  cacheCategory: vi.fn(),
  getCategoryProductsFromCache: vi.fn(),
  cacheCategoryProducts: vi.fn(),
  invalidateAllCategoryCaches: vi.fn(),
  invalidateCategoryCache: vi.fn(),
}));

describe("CategoryCtrl", () => {
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
    it("should create a category successfully", async () => {
      const categoryData = {
        name: "Test Category",
        slug: "test-category",
        isActive: true,
        sortOrder: 1,
      };

      mockRequest.body = categoryData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]), // No existing category
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: "1", ...categoryData }]),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.create(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Category created successfully",
        category: { id: "1", ...categoryData },
      });
      expect(invalidateAllCategoryCaches).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Category created: 1");
    });

    it("should throw BadRequestError when slug already exists", async () => {
      const categoryData = {
        name: "Test Category",
        slug: "existing-slug",
        isActive: true,
      };

      mockRequest.body = categoryData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi
            .fn()
            .mockResolvedValue([{ id: "2", slug: "existing-slug" }]), // Existing category
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        CategoryCtrl.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);

      expect(invalidateAllCategoryCaches).not.toHaveBeenCalled();
    });
  });

  describe("getAll", () => {
    it("should return categories from cache when available", async () => {
      const cachedResult = {
        message: "Categories retrieved successfully",
        categories: [{ id: "1", name: "Cached Category" }],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      vi.mocked(getCategoryListFromCache).mockResolvedValue(cachedResult);
      mockRequest.query = { page: "1", limit: "20" };

      await CategoryCtrl.getAll(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getCategoryListFromCache).toHaveBeenCalledWith({
        page: "1",
        limit: "20",
        active: undefined,
        search: undefined,
        sortBy: "name",
        sortOrder: "asc",
      });
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith(cachedResult);
      expect(logger.info).toHaveBeenCalledWith(
        "Categories list retrieved from cache"
      );
    });

    it("should fetch categories from database when cache miss", async () => {
      vi.mocked(getCategoryListFromCache).mockResolvedValue(null);

      const categoriesList = [
        { id: "1", name: "Category 1", isActive: true },
        { id: "2", name: "Category 2", isActive: true },
      ];

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          offset: vi.fn().mockResolvedValue(categoriesList),
        };

        const countResult = [{ count: 2 }];

        // Mock the transaction callback to return both categories data and count
        const result = await callback(mockTx, () => countResult);
        return result;
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      mockRequest.query = {
        page: "1",
        limit: "20",
        search: "test",
        active: "true",
      };

      await CategoryCtrl.getAll(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheCategoryList).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should handle different sort orders correctly", async () => {
      vi.mocked(getCategoryListFromCache).mockResolvedValue(null);

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          offset: vi.fn().mockResolvedValue([]),
        };

        const countResult = [{ count: 0 }];
        return await callback(mockTx, () => countResult);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      mockRequest.query = { sortBy: "sortOrder", sortOrder: "desc" };

      await CategoryCtrl.getAll(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheCategoryList).toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    it("should return category from cache when available", async () => {
      const cachedCategory = {
        id: "1",
        name: "Cached Category",
        slug: "cached-category",
      };
      vi.mocked(getCategoryFromCache).mockResolvedValue(cachedCategory);
      mockRequest.params = { id: "1" };

      await CategoryCtrl.getById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getCategoryFromCache).toHaveBeenCalledWith("1");
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Category retrieved successfully",
        category: cachedCategory,
      });
      expect(logger.info).toHaveBeenCalledWith(
        "Category 1 retrieved from cache"
      );
    });

    it("should fetch category from database and cache it when cache miss", async () => {
      vi.mocked(getCategoryFromCache).mockResolvedValue(null);

      const category = {
        id: "1",
        name: "Test Category",
        slug: "test-category",
      };

      // Mock the chained database calls
      const mockLimit = vi.fn().mockResolvedValue([category]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      vi.mocked(db.select).mockImplementation(mockSelect);

      mockRequest.params = { id: "1" };

      await CategoryCtrl.getById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheCategory).toHaveBeenCalledWith(category);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(logger.info).toHaveBeenCalledWith("Category retrieved: 1");
    });

    it("should throw NotFoundError when category does not exist", async () => {
      vi.mocked(getCategoryFromCache).mockResolvedValue(null);

      // Mock the chained database calls to return empty array
      const mockLimit = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      vi.mocked(db.select).mockImplementation(mockSelect);

      mockRequest.params = { id: "999" };

      await expect(
        CategoryCtrl.getById(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getBySlug", () => {
    it("should return category from cache when available", async () => {
      const cachedCategory = {
        id: "1",
        name: "Cached Category",
        slug: "cached-category",
      };
      vi.mocked(getCategoryBySlugFromCache).mockResolvedValue(cachedCategory);
      mockRequest.params = { slug: "cached-category" };

      await CategoryCtrl.getBySlug(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getCategoryBySlugFromCache).toHaveBeenCalledWith(
        "cached-category"
      );
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(logger.info).toHaveBeenCalledWith(
        "Category with slug cached-category retrieved from cache"
      );
    });

    it("should fetch category from database when cache miss", async () => {
      vi.mocked(getCategoryBySlugFromCache).mockResolvedValue(null);

      const category = {
        id: "1",
        name: "Test Category",
        slug: "test-category",
      };

      // Mock the chained database calls
      const mockLimit = vi.fn().mockResolvedValue([category]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      vi.mocked(db.select).mockImplementation(mockSelect);

      mockRequest.params = { slug: "test-category" };

      await CategoryCtrl.getBySlug(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheCategory).toHaveBeenCalledWith(category);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should throw NotFoundError when category does not exist", async () => {
      vi.mocked(getCategoryBySlugFromCache).mockResolvedValue(null);

      // Mock the chained database calls to return empty array
      const mockLimit = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      vi.mocked(db.select).mockImplementation(mockSelect);

      mockRequest.params = { slug: "non-existent" };

      await expect(
        CategoryCtrl.getBySlug(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getProducts", () => {
    it("should return category products from cache when available", async () => {
      const cachedResult = {
        message: "Category products retrieved successfully",
        category: { id: "1", name: "Category" },
        products: [{ id: "1", name: "Product 1" }],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      vi.mocked(getCategoryProductsFromCache).mockResolvedValue(cachedResult);
      mockRequest.params = { id: "1" };
      mockRequest.query = { page: "1", limit: "20" };

      await CategoryCtrl.getProducts(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(getCategoryProductsFromCache).toHaveBeenCalledWith("1", {
        page: "1",
        limit: "20",
        active: "true",
        featured: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith(cachedResult);
    });

    it("should fetch category products from database when cache miss", async () => {
      vi.mocked(getCategoryProductsFromCache).mockResolvedValue(null);

      const category = { id: "1", name: "Test Category" };
      const productsList = [
        { id: "1", name: "Product 1", categoryId: "1", price: 100 },
        { id: "2", name: "Product 2", categoryId: "1", price: 200 },
      ];

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            // First call: category check - this should return the category
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([category]), // Return category in array
                }),
              }),
            })
            // Second call: products query
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue(productsList),
                    }),
                  }),
                }),
              }),
            })
            // Third call: count query
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 2 }]),
              }),
            }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      mockRequest.params = { id: "1" };
      mockRequest.query = {
        featured: "true",
        minPrice: "50",
        maxPrice: "300",
        sortBy: "price",
        sortOrder: "asc",
      };

      await CategoryCtrl.getProducts(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(cacheCategoryProducts).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should throw NotFoundError when category does not exist", async () => {
      vi.mocked(getCategoryProductsFromCache).mockResolvedValue(null);

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]), // No category found
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      mockRequest.params = { id: "999" };

      await expect(
        CategoryCtrl.getProducts(
          mockRequest as Request,
          mockResponse as Response
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("update", () => {
    it("should update category successfully", async () => {
      const existingCategory = { id: "1", name: "Old Name", slug: "old-slug" };
      const updateData = { name: "New Name", slug: "new-slug" };
      const updatedCategory = { id: "1", ...updateData };

      mockRequest.params = { id: "1" };
      mockRequest.body = updateData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            // First call: existing category check - return array with category
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([existingCategory]), // Return array
                }),
              }),
            })
            // Second call: slug conflict check - return empty array (no conflict)
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // Empty array for no conflict
                }),
              }),
            }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedCategory]), // Return array
              }),
            }),
          }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.update(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should throw NotFoundError when category does not exist", async () => {
      mockRequest.params = { id: "999" };
      mockRequest.body = { name: "New Name" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]), // No category found
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        CategoryCtrl.update(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when slug already exists", async () => {
      const existingCategory = {
        id: "1",
        name: "Category 1",
        slug: "category-1",
      };
      const updateData = { slug: "existing-slug" };

      mockRequest.params = { id: "1" };
      mockRequest.body = updateData;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            // First call: existing category check
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([existingCategory]), // Return array
                }),
              }),
            })
            // Second call: slug conflict check - returns conflict
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([{ id: "2", slug: "existing-slug" }]), // Return array with conflict
                }),
              }),
            }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        CategoryCtrl.update(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("delete", () => {
    it("should soft delete category successfully", async () => {
      const existingCategory = {
        id: "1",
        name: "Test Category",
        slug: "test-category",
      };

      mockRequest.params = { id: "1" };
      mockRequest.query = { hardDelete: "false" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([existingCategory]),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.delete(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Category deleted successfully",
      });
      expect(invalidateCategoryCache).toHaveBeenCalledWith(
        "1",
        "test-category"
      );
      expect(logger.info).toHaveBeenCalledWith("Category soft deleted: 1");
    });

    it("should hard delete category successfully", async () => {
      const existingCategory = {
        id: "1",
        name: "Test Category",
        slug: "test-category",
      };

      mockRequest.params = { id: "1" };
      mockRequest.query = { hardDelete: "true" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            // First call: category exists check
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([existingCategory]), // Return array
                }),
              }),
            })
            // Second call: products count check
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 0 }]), // Return array with count
              }),
            }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.delete(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should throw BadRequestError when hard deleting category with products", async () => {
      const existingCategory = {
        id: "1",
        name: "Test Category",
        slug: "test-category",
      };

      mockRequest.params = { id: "1" };
      mockRequest.query = { hardDelete: "true" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            // First call: category exists check
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([existingCategory]), // Return array
                }),
              }),
            })
            // Second call: products count check (has products)
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 5 }]), // Return array with count > 0
              }),
            }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        CategoryCtrl.delete(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("restore", () => {
    it("should restore category successfully", async () => {
      const existingCategory = {
        id: "1",
        name: "Test Category",
        slug: "test-category",
      };
      const restoredCategory = { ...existingCategory, isActive: true };

      mockRequest.params = { id: "1" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([existingCategory]),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([restoredCategory]),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.restore(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Category restored successfully",
      });
      expect(invalidateCategoryCache).toHaveBeenCalledWith(
        "1",
        "test-category"
      );
      expect(logger.info).toHaveBeenCalledWith("Category restored: 1");
    });
  });

  describe("bulkUpdate", () => {
    it("should bulk update categories successfully", async () => {
      const ids = ["1", "2", "3"];
      const updateData = { isActive: false };
      const existingCategories = [
        { id: "1", name: "Cat 1", slug: "cat-1" },
        { id: "2", name: "Cat 2", slug: "cat-2" },
        { id: "3", name: "Cat 3", slug: "cat-3" },
      ];
      const updatedCategories = existingCategories.map((cat) => ({
        ...cat,
        ...updateData,
      }));

      mockRequest.body = { ids, data: updateData };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            // First call: check all categories exist
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(existingCategories),
              }),
            })
            // Second call: slug conflict check
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]), // No conflict
                }),
              }),
            }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue(updatedCategories),
              }),
            }),
          }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.bulkUpdate(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should throw BadRequestError when ids array is empty", async () => {
      mockRequest.body = { ids: [], data: { isActive: false } };

      await expect(
        CategoryCtrl.bulkUpdate(
          mockRequest as Request,
          mockResponse as Response
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError when one or more categories not found", async () => {
      const ids = ["1", "2", "3"];
      const existingCategories = [
        { id: "1", name: "Cat 1", slug: "cat-1" },
        { id: "2", name: "Cat 2", slug: "cat-2" },
        // Missing id: '3'
      ];

      mockRequest.body = { ids, data: { isActive: false } };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(existingCategories),
        };
        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await expect(
        CategoryCtrl.bulkUpdate(
          mockRequest as Request,
          mockResponse as Response
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("bulkDelete", () => {
    it("should soft delete multiple categories successfully", async () => {
      const ids = ["1", "2"];
      const existingCategories = [
        { id: "1", name: "Cat 1", slug: "cat-1" },
        { id: "2", name: "Cat 2", slug: "cat-2" },
      ];

      mockRequest.body = { ids, hardDelete: "false" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(existingCategories),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.bulkDelete(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    // fail
    it("should hard delete multiple categories successfully", async () => {
      const ids = ["1", "2"];
      const existingCategories = [
        { id: "1", name: "Cat 1", slug: "cat-1" },
        { id: "2", name: "Cat 2", slug: "cat-2" },
      ];

      // Fix: use "true" instead of "hard"
      mockRequest.body = { ids, hardDelete: "true" };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi
            .fn()
            // First call: check all categories exist
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(existingCategories),
              }),
            })
            // Second call: check for products (returns empty array = no products)
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockResolvedValue([]), // No products in any category
                }),
              }),
            }),
          // Use delete for hard delete (not update)
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.bulkDelete(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Successfully hard deleted 2 categories",
        deletedCount: 2,
        type: "hard",
      });
    });

    it("should throw BadRequestError when trying to bulk delete too many categories", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => i.toString());

      mockRequest.body = { ids, hardDelete: "false" };

      await expect(
        CategoryCtrl.bulkDelete(
          mockRequest as Request,
          mockResponse as Response
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("bulkRestore", () => {
    it("should restore multiple categories successfully", async () => {
      const ids = ["1", "2", "3"];
      const existingCategories = [
        { id: "1", name: "Cat 1", slug: "cat-1" },
        { id: "2", name: "Cat 2", slug: "cat-2" },
        { id: "3", name: "Cat 3", slug: "cat-3" },
      ];
      const restoredCategories = existingCategories.map((cat) => ({
        ...cat,
        isActive: true,
      }));

      mockRequest.body = { ids };

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(existingCategories),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue(restoredCategories),
              }),
            }),
          }),
        };

        return await callback(mockTx);
      });

      vi.mocked(db.transaction).mockImplementation(mockTransaction);

      await CategoryCtrl.bulkRestore(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should throw BadRequestError when ids array is empty", async () => {
      mockRequest.body = { ids: [] };

      await expect(
        CategoryCtrl.bulkRestore(
          mockRequest as Request,
          mockResponse as Response
        )
      ).rejects.toThrow(BadRequestError);
    });
  });
});
