import { and, asc, desc, eq, isNull, like, ne, or, sql } from "drizzle-orm";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import db from "../db";
import { products, productVariants } from "../db/schema";
import { BadRequestError, NotFoundError } from "../errors";
import { logger } from "../utils/logger";
import {
  cacheVariant,
  cacheVariantList,
  getVariantBySkuFromCache,
  getVariantFromCache,
  getVariantListFromCache,
  invalidateProductVariantsCache,
  invalidateVariantCache,
} from "../utils/variantCache";

type ProductVariant = typeof productVariants.$inferSelect;
type NewProductVariant = typeof productVariants.$inferInsert;
type UpdateProductVariant = Partial<typeof productVariants.$inferInsert>;

export const ProdVariantCtrl = {
  /**
   * Create a new product variant
   * POST /products/:productId/variants
   */
  create: async (req: Request, res: Response) => {
    const { productId } = req.params;
    const variantData: NewProductVariant = req.body;

    const result = await db.transaction(async (tx) => {
      // Check if product exists and is active
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.isActive, true)))
        .limit(1);

      if (!product) {
        throw new NotFoundError("Product not found or inactive");
      }

      // Check if SKU already exists
      const existingVariant = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.sku, variantData.sku))
        .limit(1);

      if (existingVariant.length > 0) {
        throw new BadRequestError("Variant with this SKU already exists");
      }

      // Check for duplicate variant (same product with same size and color)
      if (variantData.size || variantData.color) {
        const duplicateConditions = [eq(productVariants.productId, productId)];

        if (variantData.size) {
          duplicateConditions.push(eq(productVariants.size, variantData.size));
        }

        if (variantData.color) {
          duplicateConditions.push(
            eq(productVariants.color, variantData.color)
          );
        }

        const [duplicateVariant] = await tx
          .select()
          .from(productVariants)
          .where(and(...duplicateConditions))
          .limit(1);

        if (duplicateVariant) {
          throw new BadRequestError(
            "Variant with same size and color already exists for this product"
          );
        }
      }

      // Create the variant
      const [newVariant] = await tx
        .insert(productVariants)
        .values({
          ...variantData,
          productId,
        })
        .returning();

      logger.info(
        `Product variant created: ${newVariant.id} for product: ${productId}`
      );
      return newVariant;
    });

    // Invalidate variant caches for this product
    await invalidateProductVariantsCache(productId);

    res.status(StatusCodes.CREATED).json({
      message: "Product variant created successfully",
      variant: result,
    });
  },

  /**
   * Get all variants for a product
   * GET /products/:productId/variants
   */
  getAll: async (req: Request, res: Response) => {
    const { productId } = req.params;
    const {
      page = "1",
      limit = "20",
      active = "true",
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
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
    const cachedResult = await getVariantListFromCache(productId, cacheParams);
    if (cachedResult) {
      logger.info(`Product variants for ${productId} retrieved from cache`);
      return res.status(StatusCodes.OK).json(cachedResult);
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    const conditions: any[] = [eq(productVariants.productId, productId)];

    if (active !== undefined) {
      conditions.push(eq(productVariants.isActive, active === "true"));
    }

    if (search) {
      conditions.push(
        or(
          like(productVariants.sku, `%${search}%`),
          like(productVariants.color, `%${search}%`),
          like(productVariants.size, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort order
    let sortColumn;
    switch (sortBy) {
      case "price":
        sortColumn = productVariants.price;
        break;
      case "sku":
        sortColumn = productVariants.sku;
        break;
      case "size":
        sortColumn = productVariants.size;
        break;
      default:
        sortColumn = productVariants.createdAt;
    }

    const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const [variantsList, countResult, product] = await db.transaction(
      async (tx) => {
        // Verify product exists
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (!product) {
          throw new NotFoundError("Product not found");
        }

        const variantsData = await tx
          .select()
          .from(productVariants)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(limitNum)
          .offset(offset);

        const count = await tx
          .select({ count: sql<number>`count(*)` })
          .from(productVariants)
          .where(whereClause);

        return [variantsData, count, product];
      }
    );

    const totalCount = countResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    const response = {
      message: "Product variants retrieved successfully",
      product: {
        id: productId,
        name: product.name || "Product", // Product name from the third element in array
      },
      variants: variantsList, // The actual variants data
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
    await cacheVariantList(productId, cacheParams, response);

    res.status(StatusCodes.OK).json(response);
  },

  /**
   * Get variant by ID
   * GET /variants/:id
   */
  getById: async (req: Request, res: Response) => {
    const { id } = req.params;

    const cachedVariant = await getVariantFromCache(id);
    if (cachedVariant) {
      logger.info(`Variant ${id} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Variant retrieved successfully",
        variant: cachedVariant,
      });
    }

    const [variant] = await db
      .select({
        variant: productVariants,
        product: products, // Include product data
      })
      .from(productVariants)
      .leftJoin(products, eq(productVariants.productId, products.id))
      .where(eq(productVariants.id, id))
      .limit(1);

    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    const variantWithProduct = {
      ...variant.variant,
      product: variant.product,
    };

    logger.info(`Variant retrieved: ${variant.variant.id}`);

    await cacheVariant(variantWithProduct);

    return res.status(StatusCodes.OK).json({
      message: "Variant retrieved successfully",
      variant: variantWithProduct,
    });
  },

  /**
   * Get variant by SKU
   * GET /variants/sku/:sku
   */
  getBySku: async (req: Request, res: Response) => {
    const { sku } = req.params;

    const cachedVariant = await getVariantBySkuFromCache(sku);
    if (cachedVariant) {
      logger.info(`Variant with SKU ${sku} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Variant retrieved successfully",
        variant: cachedVariant,
      });
    }

    const [variant] = await db
      .select({
        variant: productVariants,
        product: products, // Include product data
      })
      .from(productVariants)
      .leftJoin(products, eq(productVariants.productId, products.id))
      .where(eq(productVariants.sku, sku))
      .limit(1);

    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    const variantWithProduct = {
      ...variant.variant,
      product: variant.product,
    };

    logger.info(`Variant retrieved by SKU: ${variant.variant.sku}`);

    await cacheVariant(variantWithProduct);

    return res.status(StatusCodes.OK).json({
      message: "Variant retrieved successfully",
      variant: variantWithProduct,
    });
  },

  /**
   * Update variant
   * PATCH /variants/:id
   */
  update: async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData: UpdateProductVariant = req.body;

    const result = await db.transaction(async (tx) => {
      // Check if variant exists
      const [existingVariant] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, id))
        .limit(1);

      if (!existingVariant) {
        throw new NotFoundError("Variant not found");
      }

      // Check for SKU conflict if SKU is being updated
      if (updateData.sku && updateData.sku !== existingVariant.sku) {
        const [skuConflict] = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.sku, updateData.sku))
          .limit(1);

        if (skuConflict) {
          throw new BadRequestError("Variant with this SKU already exists");
        }
      }

      // Check for duplicate variant (same product with same size and color) if updating
      if (
        (updateData.size !== undefined || updateData.color !== undefined) &&
        existingVariant.productId
      ) {
        const duplicateConditions = [
          eq(productVariants.productId, existingVariant.productId),
          ne(productVariants.id, id), // Exclude current variant (use ne instead of eq with not)
        ];

        // Handle size condition - properly check for null/undefined
        if (updateData.size !== undefined) {
          if (updateData.size === null) {
            duplicateConditions.push(isNull(productVariants.size));
          } else {
            duplicateConditions.push(eq(productVariants.size, updateData.size));
          }
        } else {
          if (existingVariant.size === null) {
            duplicateConditions.push(isNull(productVariants.size));
          } else {
            duplicateConditions.push(
              eq(productVariants.size, existingVariant.size)
            );
          }
        }

        // Handle color condition - properly check for null/undefined
        if (updateData.color !== undefined) {
          if (updateData.color === null) {
            duplicateConditions.push(isNull(productVariants.color));
          } else {
            duplicateConditions.push(
              eq(productVariants.color, updateData.color)
            );
          }
        } else {
          if (existingVariant.color === null) {
            duplicateConditions.push(isNull(productVariants.color));
          } else {
            duplicateConditions.push(
              eq(productVariants.color, existingVariant.color)
            );
          }
        }

        const [duplicateVariant] = await tx
          .select()
          .from(productVariants)
          .where(and(...duplicateConditions))
          .limit(1);

        if (duplicateVariant) {
          throw new BadRequestError(
            "Another variant with same size and color already exists for this product"
          );
        }
      }

      // Update variant
      const [updatedVariant] = await tx
        .update(productVariants)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, id))
        .returning();

      logger.info(`Variant updated: ${id}`);
      return updatedVariant;
    });

    // Get the updated variant with product data
    const [updatedWithProduct] = await db
      .select({
        variant: productVariants,
        product: products,
      })
      .from(productVariants)
      .leftJoin(products, eq(productVariants.productId, products.id))
      .where(eq(productVariants.id, id))
      .limit(1);

    const variantWithProduct = {
      ...updatedWithProduct.variant,
      product: updatedWithProduct.product,
    };

    // Invalidate relevant caches
    await invalidateVariantCache(result.id, result.sku, result.productId);

    // Cache the updated variant
    await cacheVariant(variantWithProduct);

    return res.status(StatusCodes.OK).json({
      message: "Variant updated successfully",
      variant: variantWithProduct,
    });
  },

  /**
   * Delete variant
   * DELETE /variants/:id
   */
  delete: async (req: Request, res: Response) => {
    const { id } = req.params;

    let deletedVariant: any;

    await db.transaction(async (tx) => {
      // Check if variant exists
      const [existingVariant] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, id))
        .limit(1);

      if (!existingVariant) throw new NotFoundError("Variant not found");

      deletedVariant = existingVariant;

      // Delete the variant
      await tx.delete(productVariants).where(eq(productVariants.id, id));

      logger.info(`Variant deleted: ${id}`);
    });

    // Invalidate relevant caches
    await invalidateVariantCache(
      id,
      deletedVariant.sku,
      deletedVariant.productId
    );

    return res.status(StatusCodes.OK).json({
      message: "Variant deleted successfully",
    });
  },
};
