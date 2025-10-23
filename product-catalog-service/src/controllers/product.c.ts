import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import db from "../db";
import { categories, products, productVariants } from "../db/schema";
import { BadRequestError, NotFoundError } from "../errors";
import { eventPublisher } from "../redis/publisher";
import { logger } from "../utils/logger";
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
} from "../utils/productCache";

type Product = typeof products.$inferSelect;
type NewProduct = typeof products.$inferInsert;
type UpdateProduct = Partial<typeof products.$inferInsert>;

export const ProductCtrl = {
  /**
   * Create a new product
   * POST /products
   */
  create: async (req: Request, res: Response) => {
    const result = await db.transaction(async (tx) => {
      const productData: NewProduct = req.body;

      // Check if slug already exists
      const existingProduct = await tx
        .select()
        .from(products)
        .where(eq(products.slug, productData.slug))
        .limit(1);

      if (existingProduct.length > 0) {
        throw new BadRequestError("Product with this slug already exists");
      }

      // Verify category exists if provided
      if (productData.categoryId) {
        const [category] = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, productData.categoryId))
          .limit(1);

        if (!category) {
          throw new BadRequestError("Category not found");
        }
      }

      // Create the product
      const [newProduct] = await tx
        .insert(products)
        .values(productData)
        .returning();

      logger.info(`Product created: ${newProduct.id}`);
      return newProduct;
    });

    // Invalidate list caches
    await invalidateAllProductCaches();

    res.status(StatusCodes.CREATED).json({
      message: "Product created successfully",
      product: result,
    });
  },

  /**
   * Get all products with pagination and filtering
   * GET /products?page=1&limit=20&category=cat123&featured=true&minPrice=100&maxPrice=500
   */
  getAll: async (req: Request, res: Response) => {
    const {
      page = "1",
      limit = "20",
      category,
      featured,
      active = "true",
      minPrice,
      maxPrice,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const cacheParams = {
      page,
      limit,
      category,
      featured,
      active,
      minPrice,
      maxPrice,
      search,
      sortBy,
      sortOrder,
    };

    // Try to get from cache first
    const cachedResult = await getProductListFromCache(cacheParams);
    if (cachedResult) {
      logger.info(`Products list retrieved from cache`);
      return res.status(StatusCodes.OK).json(cachedResult);
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    const conditions = [];

    if (active !== undefined) {
      conditions.push(eq(products.isActive, active === "true"));
    }

    if (featured !== undefined) {
      conditions.push(eq(products.isFeatured, featured === "true"));
    }

    if (category) {
      conditions.push(eq(products.categoryId, category as string));
    }

    if (minPrice) {
      conditions.push(sql`${products.price} >= ${Number(minPrice)}`);
    }

    if (maxPrice) {
      conditions.push(sql`${products.price} <= ${Number(maxPrice)}`);
    }

    if (search) {
      conditions.push(
        or(
          like(products.name, `%${search}%`),
          like(products.description, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort order
    let sortColumn;
    switch (sortBy) {
      case "price":
        sortColumn = products.price;
        break;
      case "name":
        sortColumn = products.name;
        break;
      default:
        sortColumn = products.createdAt;
    }

    const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const [productsList, countResult] = await db.transaction(async (tx) => {
      const productsData = await tx
        .select({
          product: products,
          category: categories, // Join category data
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limitNum)
        .offset(offset);

      const count = await tx
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(whereClause);

      return [productsData, count];
    });

    const totalCount = countResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    // Transform the data to match expected response format
    const transformedProducts = productsList.map((item) => ({
      ...item.product,
      category: item.category,
    }));

    const response = {
      message: "Products retrieved successfully",
      products: transformedProducts,
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
    await cacheProductList(cacheParams, response);

    res.status(StatusCodes.OK).json(response);
  },

  /**
   * Get product by ID
   * GET /products/:id
   */
  getById: async (req: Request, res: Response) => {
    const { id } = req.params;

    const cachedProduct = await getProductFromCache(id);
    if (cachedProduct) {
      logger.info(`Product ${id} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Product retrieved successfully",
        product: cachedProduct,
      });
    }

    const [result] = await db
      .select({
        product: products,
        category: categories, // Include category data
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.id, id))
      .limit(1);

    if (!result) throw new NotFoundError("Product not found");

    const productWithCategory = {
      ...result.product,
      category: result.category,
    };

    logger.info(`Product retrieved: ${result.product.id}`);

    await cacheProduct(productWithCategory);

    return res.status(StatusCodes.OK).json({
      message: "Product retrieved successfully",
      product: productWithCategory,
    });
  },

  /**
   * Get product by slug
   * GET /products/slug/:slug
   */
  getBySlug: async (req: Request, res: Response) => {
    const { slug } = req.params;

    const cachedProduct = await getProductBySlugFromCache(slug);
    if (cachedProduct) {
      logger.info(`Product with slug ${slug} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Product retrieved successfully",
        product: cachedProduct,
      });
    }

    const [result] = await db
      .select({
        product: products,
        category: categories, // Include category data
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.slug, slug))
      .limit(1);

    if (!result) {
      throw new NotFoundError("Product not found");
    }

    const productWithCategory = {
      ...result.product,
      category: result.category,
    };

    logger.info(`Product retrieved by slug: ${result.product.slug}`);

    await cacheProduct(productWithCategory);

    return res.status(StatusCodes.OK).json({
      message: "Product retrieved successfully",
      product: productWithCategory,
    });
  },

  /**
   * Get featured products
   * GET /products/featured
   */
  getFeatured: async (req: Request, res: Response) => {
    const { limit = "10" } = req.query;

    const cacheParams = { limit };

    // Try to get from cache first
    const cachedResult = await getFeaturedProductsFromCache(cacheParams);
    if (cachedResult) {
      logger.info(`Featured products retrieved from cache`);
      return res.status(StatusCodes.OK).json(cachedResult);
    }

    const limitNum = Number(limit);

    const featuredResults = await db
      .select({
        product: products,
        category: categories,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.isFeatured, true), eq(products.isActive, true)))
      .orderBy(desc(products.createdAt))
      .limit(limitNum);

    const featuredProducts = featuredResults.map((item) => ({
      ...item.product,
      category: item.category,
    }));

    const response = {
      message: "Featured products retrieved successfully",
      products: featuredProducts,
    };

    // Cache the result
    await cacheFeaturedProducts(cacheParams, response);

    res.status(StatusCodes.OK).json(response);
  },

  /**
   * Update product
   * PATCH /products/:id
   */
  update: async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData: UpdateProduct = req.body;

    const result = await db.transaction(async (tx) => {
      // Check if product exists
      const [existingProduct] = await tx
        .select()
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (!existingProduct) {
        throw new NotFoundError("Product not found");
      }

      // Check for slug conflict if slug is being updated
      if (updateData.slug && updateData.slug !== existingProduct.slug) {
        const [slugConflict] = await tx
          .select()
          .from(products)
          .where(eq(products.slug, updateData.slug))
          .limit(1);

        if (slugConflict) {
          throw new BadRequestError("Product with this slug already exists");
        }
      }

      // Verify category exists if provided
      if (updateData.categoryId) {
        const [category] = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, updateData.categoryId))
          .limit(1);

        if (!category) {
          throw new BadRequestError("Category not found");
        }
      }

      // Update product
      const [updatedProduct] = await tx
        .update(products)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      logger.info(`Product updated: ${id}`);
      return updatedProduct;
    });

    // Invalidate relevant caches after update
    await invalidateProductCache(result.id, result.slug);

    // Get the updated product with category for caching
    const [updatedWithCategory] = await db
      .select({
        product: products,
        category: categories,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.id, id))
      .limit(1);

    const productWithCategory = {
      ...updatedWithCategory.product,
      category: updatedWithCategory.category,
    };

    // Publish specific events based on what changed
    if (updateData.price !== undefined) {
      // Only publish price change event if price was actually updated
      await eventPublisher.publishEvent({
        type: "PRODUCT_PRICE_CHANGE",
        source: "product-catalog-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {
          productId: updatedWithCategory.product.id,
          name: updatedWithCategory.product.name,
          message: "Product price updated.",
        },
      });
    }

    // For other updates, you might publish a general PRODUCT_UPDATED event
    // or create specific events for name changes, description changes, etc.

    // Cache the updated product with category
    await cacheProduct(productWithCategory);

    return res.status(StatusCodes.OK).json({
      message: "Product updated successfully",
      product: productWithCategory,
    });
  },

  /**
   * Delete product (soft delete by setting isActive to false)
   * DELETE /products/:id?hardDelete=false
   */
  delete: async (req: Request, res: Response) => {
    const { id } = req.params;
    const { hardDelete = "false" } = req.query;

    const isHardDelete = hardDelete === "true";
    let deletedProduct: any;

    if (isHardDelete) {
      // Hard delete with transaction
      await db.transaction(async (tx) => {
        // Check if product exists
        const [existingProduct] = await tx
          .select()
          .from(products)
          .where(eq(products.id, id))
          .limit(1);

        if (!existingProduct) throw new NotFoundError("Product not found");
        deletedProduct = existingProduct;

        // Check if product has variants
        const [variantCount] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(productVariants)
          .where(eq(productVariants.productId, id));

        if (variantCount.count > 0) {
          throw new BadRequestError(
            "Cannot delete product with associated variants. Please delete the variants first."
          );
        }

        // Hard delete - permanently remove from database
        const product = await tx
          .delete(products)
          .where(eq(products.id, id))
          .returning();

        await eventPublisher.publishEvent({
          type: "PRODUCT_DELETED",
          source: "product-catalog-service",
          timestamp: new Date(),
          version: "1.0.0",
          data: {
            productId: product[0].id,
            message: "Product has been deleted.",
          },
        });

        logger.info(`Product hard deleted: ${id}`);
      });
    } else {
      // Soft delete
      await db.transaction(async (tx) => {
        // Check if product exists
        const [existingProduct] = await tx
          .select()
          .from(products)
          .where(eq(products.id, id))
          .limit(1);

        if (!existingProduct) throw new NotFoundError("Product not found");
        deletedProduct = existingProduct;

        // Soft delete by setting isActive to false
        const product = await tx
          .update(products)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(products.id, id))
          .returning();

        await eventPublisher.publishEvent({
          type: "PRODUCT_STATUS_CHANGED",
          source: "product-catalog-service",
          timestamp: new Date(),
          version: "1.0.0",
          data: {
            productId: product[0].id,
            newStatus: product[0].isActive,
            name: product[0].name,
            message: "Product is not available.",
          },
        });

        logger.info(`Product soft deleted: ${id}`);
      });
    }

    // Invalidate relevant caches after deletion
    await invalidateProductCache(id, deletedProduct.slug);

    return res.status(StatusCodes.OK).json({
      message: `Product ${
        isHardDelete ? "permanently " : ""
      }deleted successfully`,
    });
  },

  /**
   * Restore soft-deleted product
   * PATCH /products/:id/restore
   */
  restore: async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await db.transaction(async (tx) => {
      // Check if product exists
      const [existingProduct] = await tx
        .select()
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (!existingProduct) throw new NotFoundError("Product not found");

      // Restore by setting isActive to true
      const [restoredProduct] = await tx
        .update(products)
        .set({
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      logger.info(`Product restored: ${id}`);
      return restoredProduct;
    });

    // Invalidate relevant caches and cache the restored product
    await invalidateProductCache(id, result.slug);

    // Get the restored product with category for caching
    const [restoredWithCategory] = await db
      .select({
        product: products,
        category: categories,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.id, id))
      .limit(1);

    const productWithCategory = {
      ...restoredWithCategory.product,
      category: restoredWithCategory.category,
    };

    await cacheProduct(productWithCategory);

    return res.status(StatusCodes.OK).json({
      message: "Product restored successfully",
      product: productWithCategory,
    });
  },
};
