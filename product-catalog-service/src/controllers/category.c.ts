import { Response, Request } from "express";
import { StatusCodes } from "http-status-codes";
import db from "../db";
import { categories, products } from "../db/schema";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { logger } from "../utils/logger";
import { BadRequestError, NotFoundError } from "../errors";
import RedisService from "../redis/client";
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
} from "../utils/categoryCache";

type NewCategory = typeof categories.$inferInsert;
type UpdateCategory = Partial<typeof categories.$inferInsert>;

const redis = RedisService.getInstance();

export const CategoryCtrl = {
  create: async (req: Request, res: Response) => {
    const result = await db.transaction(async (tx) => {
      const categoryData: NewCategory = req.body;

      // Check if slug already exists
      const existingCategory = await tx
        .select()
        .from(categories)
        .where(eq(categories.slug, categoryData.slug))
        .limit(1);

      if (existingCategory.length > 0) {
        throw new BadRequestError("Category with this slug already exists");
      }

      // Create the category
      const [newCategory] = await tx
        .insert(categories)
        .values(categoryData)
        .returning();

      logger.info(`Category created: ${newCategory.id}`);
      return newCategory;
    });

    // Invalidate list caches
    await invalidateAllCategoryCaches();

    res.status(StatusCodes.CREATED).json({
      message: "Category created successfully",
      category: result,
    });
  },

  getAll: async (req: Request, res: Response) => {
    const {
      page = "1",
      limit = "20",
      active,
      search,
      sortBy = "name",
      sortOrder = "asc",
    } = req.query;

    const cacheParams = {
      page,
      limit,
      active,
      search,
      sortBy,
      sortOrder,
    };

    // Try to get from cache first
    const cachedResult = await getCategoryListFromCache(cacheParams);
    if (cachedResult) {
      logger.info(`Categories list retrieved from cache`);
      return res.status(StatusCodes.OK).json(cachedResult);
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    const conditions = [];
    if (active !== undefined) {
      conditions.push(eq(categories.isActive, active === "true"));
    }

    if (search) {
      conditions.push(like(categories.name, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort order
    const sortColumn =
      sortBy === "sortOrder" ? categories.sortOrder : categories.name;
    const orderBy = sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

    const [categoriesList, countResult] = await db.transaction(async (tx) => {
      const categoriesData = await tx
        .select()
        .from(categories)
        .where(whereClause)
        .orderBy(orderBy, asc(categories.id))
        .limit(limitNum)
        .offset(offset);

      const count = await tx
        .select({ count: sql<number>`count(*)` })
        .from(categories)
        .where(whereClause);

      return [categoriesData, count];
    });

    const totalCount = countResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    const response = {
      message: "Categories retrieved successfully",
      categories: categoriesList,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };

    // Cache the result
    await cacheCategoryList(cacheParams, response);

    res.status(StatusCodes.OK).json(response);
  },

  getById: async (req: Request, res: Response) => {
    const { id } = req.params;

    const cachedCategory = await getCategoryFromCache(id);
    if (cachedCategory) {
      logger.info(`Category ${id} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Category retrieved successfully",
        category: cachedCategory,
      });
    }

    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!category) {
      throw new NotFoundError("Category not found");
    }

    logger.info(`Category retrieved: ${category.id}`);

    await cacheCategory(category);

    return res.status(StatusCodes.OK).json({
      message: "Category retrieved successfully",
      category,
    });
  },

  getBySlug: async (req: Request, res: Response) => {
    const { slug } = req.params;

    const cachedCategory = await getCategoryBySlugFromCache(slug);
    if (cachedCategory) {
      logger.info(`Category with slug ${slug} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Category retrieved successfully",
        category: cachedCategory,
      });
    }

    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    if (!category) {
      throw new NotFoundError("Category not found");
    }

    logger.info(`Category retrieved by slug: ${category.slug}`);

    await cacheCategory(category);

    return res.status(StatusCodes.OK).json({
      message: "Category retrieved successfully",
      category,
    });
  },

  getProducts: async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      page = "1",
      limit = "20",
      active = "true",
      featured,
      minPrice,
      maxPrice,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const cacheParams = {
      page,
      limit,
      active,
      featured,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder,
    };

    // Try to get from cache first
    const cachedResult = await getCategoryProductsFromCache(id, cacheParams);
    if (cachedResult) {
      logger.info(`Category products for ${id} retrieved from cache`);
      return res.status(StatusCodes.OK).json(cachedResult);
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    const [category, productsList, countResult] = await db.transaction(
      async (tx) => {
        // Verify category exists
        const categoryData = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, id))
          .limit(1);

        if (!categoryData[0]) throw new NotFoundError("Category not found");

        // Build product conditions
        const conditions = [eq(products.categoryId, id)];

        if (active !== undefined) {
          conditions.push(eq(products.isActive, active === "true"));
        }
        if (featured !== undefined) {
          conditions.push(eq(products.isFeatured, featured === "true"));
        }
        if (minPrice) {
          conditions.push(sql`${products.price} >= ${minPrice}`);
        }
        if (maxPrice) {
          conditions.push(sql`${products.price} <= ${maxPrice}`);
        }

        // Determine sort order
        const sortColumn =
          sortBy === "price" ? products.price : products.createdAt;
        const orderBy =
          sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

        // Get products
        const productsData = await tx
          .select()
          .from(products)
          .where(and(...conditions))
          .orderBy(orderBy)
          .limit(limitNum)
          .offset(offset);

        // Get total count
        const count = await tx
          .select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(...conditions));

        return [categoryData[0], productsData, count];
      }
    );

    const totalCount = countResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    const response = {
      message: "Category products retrieved successfully",
      category,
      products: productsList,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };

    // Cache the result
    await cacheCategoryProducts(id, cacheParams, response);

    res.status(StatusCodes.OK).json(response);
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData: UpdateCategory = req.body;

    const result = await db.transaction(async (tx) => {
      // Check if category exists
      const [existingCategory] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

      if (!existingCategory) throw new NotFoundError("Category not found");

      // Check for slug conflict if slug is being updated
      if (updateData.slug && updateData.slug !== existingCategory.slug) {
        const [slugConflict] = await tx
          .select()
          .from(categories)
          .where(eq(categories.slug, updateData.slug))
          .limit(1);

        if (slugConflict) {
          throw new BadRequestError("Category with this slug already exists");
        }
      }

      // Update category
      const [updatedCategory] = await tx
        .update(categories)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(categories.id, id))
        .returning();

      logger.info(`Category updated: ${id}`);
      return updatedCategory;
    });

    // Invalidate relevant caches after update
    await invalidateCategoryCache(id, result.slug);

    // Cache the updated category
    await cacheCategory(result);

    return res.status(StatusCodes.OK).json({
      message: "Category updated successfully",
      category: result,
    });
  },

  delete: async (req: Request, res: Response) => {
    const { id } = req.params;
    const { hardDelete = "false" } = req.query;

    const isHardDelete = hardDelete === "true";
    let deletedCategory: any;

    if (isHardDelete) {
      // Hard delete with transaction
      await db.transaction(async (tx) => {
        // Check if category exists
        const [existingCategory] = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, id))
          .limit(1);

        if (!existingCategory) throw new NotFoundError("Category not found");
        deletedCategory = existingCategory;

        // Check if category has products
        const [productCount] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(products)
          .where(eq(products.categoryId, id));

        if (productCount.count > 0) {
          throw new BadRequestError(
            "Cannot delete category with associated products. Please reassign or delete the products first."
          );
        }

        // Hard delete - permanently remove from database
        await tx.delete(categories).where(eq(categories.id, id));

        logger.info(`Category hard deleted: ${id}`);
      });
    } else {
      // Soft delete (original behavior)
      await db.transaction(async (tx) => {
        // Check if category exists
        const [existingCategory] = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, id))
          .limit(1);

        if (!existingCategory) throw new NotFoundError("Category not found");
        deletedCategory = existingCategory;

        // Soft delete by setting isActive to false
        await tx
          .update(categories)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(categories.id, id));

        logger.info(`Category soft deleted: ${id}`);
      });
    }

    // Invalidate relevant caches after deletion
    await invalidateCategoryCache(id, deletedCategory.slug);

    return res.status(StatusCodes.OK).json({
      message: `Category ${
        isHardDelete ? "permanently " : ""
      }deleted successfully`,
    });
  },

  restore: async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await db.transaction(async (tx) => {
      // Check if category exists
      const [existingCategory] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

      if (!existingCategory) throw new NotFoundError("Category not found");

      // Restore by setting isActive to true
      const [restoredCategory] = await tx
        .update(categories)
        .set({
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(categories.id, id))
        .returning();

      logger.info(`Category restored: ${id}`);

      return restoredCategory;
    });

    // Invalidate relevant caches after deletion
    await invalidateCategoryCache(id, result.slug);

    return res.status(StatusCodes.OK).json({
      message: "Category restored successfully",
    });
  },

  bulkUpdate: async (req: Request, res: Response) => {
    const { ids, data } = req.body; // { ids: string[], data: UpdateCategory }

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError("IDs array is required");
    }

    const result = await db.transaction(async (tx) => {
      // Check if all categories exist
      const existingCategories = await tx
        .select()
        .from(categories)
        .where(sql`${categories.id} IN (${ids.join(",")})`);

      if (existingCategories.length !== ids.length) {
        throw new NotFoundError("One or more categories not found");
      }

      // Check for slug conflicts if slug is being updated
      if (data.slug) {
        const [slugConflict] = await tx
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.slug, data.slug),
              sql`${categories.id} NOT IN (${ids.join(",")})`
            )
          )
          .limit(1);

        if (slugConflict) {
          throw new BadRequestError("Category with this slug already exists");
        }
      }

      // Bulk update
      const updatedCategories = await tx
        .update(categories)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(sql`${categories.id} IN (${ids.join(",")})`)
        .returning();

      logger.info(`Bulk updated ${updatedCategories.length} categories`);
      return updatedCategories;
    });

    // Invalidate caches for all updated categories and cache new data
    await Promise.all([
      ...result.map((category) =>
        invalidateCategoryCache(category.id, category.slug)
      ),
      ...result.map((category) => cacheCategory(category)),
    ]);
    return res.status(StatusCodes.OK).json({
      message: "Categories updated successfully",
      categories: result,
    });
  },

  bulkDelete: async (req: Request, res: Response) => {
    const { ids, hardDelete = "false" } = req.body;
    const isHardDelete = hardDelete === "true";

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError("IDs array is required and must not be empty");
    }

    if (ids.length > 100) {
      throw new BadRequestError(
        "Cannot delete more than 100 categories at once"
      );
    }

    let deletedCategories: any[] = [];

    const result = await db.transaction(async (tx) => {
      // Check if all categories exist
      const existingCategories = await tx
        .select()
        .from(categories)
        .where(sql`${categories.id} IN (${ids.join(",")})`);

      const existingIds = existingCategories.map((c) => c.id);
      const nonExistingIds = ids.filter((id) => !existingIds.includes(id));

      if (nonExistingIds.length > 0) {
        throw new NotFoundError(
          `Categories not found: ${nonExistingIds.join(", ")}`
        );
      }

      deletedCategories = existingCategories;

      if (isHardDelete) {
        // Check for products in any of the categories
        const categoriesWithProducts = await tx
          .select({
            categoryId: products.categoryId,
            productCount: sql<number>`count(*)`,
          })
          .from(products)
          .where(sql`${products.categoryId} IN (${ids.join(",")})`)
          .groupBy(products.categoryId);

        if (categoriesWithProducts.length > 0) {
          const problematicCategories = categoriesWithProducts.map(
            (c) => c.categoryId
          );
          throw new BadRequestError(
            `Cannot delete categories with associated products: ${problematicCategories.join(
              ", "
            )}`
          );
        }

        // Hard delete all categories
        await tx
          .delete(categories)
          .where(sql`${categories.id} IN (${ids.join(",")})`);

        logger.info(`Bulk hard deleted categories: ${ids.join(", ")}`);

        return {
          deletedCount: ids.length,
          type: "hard",
        };
      } else {
        // Soft delete all categories
        await tx
          .update(categories)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(sql`${categories.id} IN (${ids.join(",")})`);

        logger.info(`Bulk soft deleted categories: ${ids.join(", ")}`);

        return {
          deletedCount: ids.length,
          type: "soft",
        };
      }
    });

    // Invalidate caches for all deleted categories
    await Promise.all(
      deletedCategories.map((category) =>
        invalidateCategoryCache(category.id, category.slug)
      )
    );

    return res.status(StatusCodes.OK).json({
      message: `Successfully ${result.type} deleted ${result.deletedCount} categories`,
      deletedCount: result.deletedCount,
      type: result.type,
    });
  },

  bulkRestore: async (req: Request, res: Response) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError("IDs array is required and must not be empty");
    }

    if (ids.length > 100) {
      throw new BadRequestError(
        "Cannot restore more than 100 categories at once"
      );
    }

    const result = await db.transaction(async (tx) => {
      // Check if all categories exist
      const existingCategories = await tx
        .select()
        .from(categories)
        .where(sql`${categories.id} IN (${ids.join(",")})`);

      const existingIds = existingCategories.map((c) => c.id);
      const nonExistingIds = ids.filter((id) => !existingIds.includes(id));

      if (nonExistingIds.length > 0) {
        throw new NotFoundError(
          `Categories not found: ${nonExistingIds.join(", ")}`
        );
      }

      // Restore all categories
      const restoredCategories = await tx
        .update(categories)
        .set({
          isActive: true,
          updatedAt: new Date(),
        })
        .where(sql`${categories.id} IN (${ids.join(",")})`)
        .returning();

      logger.info(`Bulk restored categories: ${ids.join(", ")}`);
      return restoredCategories;
    });

    // Cache all restored categories
    await Promise.all(result.map((category) => cacheCategory(category)));

    return res.status(StatusCodes.OK).json({
      message: `Successfully restored ${ids.length} categories`,
      restoredCount: result,
    });
  },
};
