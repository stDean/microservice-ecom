import RedisService from "../redis/client";

const redis = RedisService.getInstance();

// Cache configuration
const CACHE_TTL = {
  SHORT: 60 * 5, // 5 minutes
  MEDIUM: 60 * 30, // 30 minutes
  LONG: 60 * 60, // 1 hour
};

// Cache key prefixes
const VARIANT_CACHE_PREFIX = "variant:";
const VARIANT_SKU_CACHE_PREFIX = "variant:sku:";
const VARIANT_LIST_CACHE_PREFIX = "variants:list:";
const PRODUCT_VARIANTS_CACHE_PREFIX = "product:variants:";

// Cache helper methods
export const cacheVariant = async (variant: any) => {
  const cacheKey = `${VARIANT_CACHE_PREFIX}${variant.id}`;
  const skuCacheKey = `${VARIANT_SKU_CACHE_PREFIX}${variant.sku}`;

  await Promise.all([
    redis.set(cacheKey, variant, CACHE_TTL.LONG),
    redis.set(skuCacheKey, variant, CACHE_TTL.LONG),
  ]);
};

export const getVariantFromCache = async (variantId: string) => {
  const cacheKey = `${VARIANT_CACHE_PREFIX}${variantId}`;
  return await redis.get<any>(cacheKey);
};

export const getVariantBySkuFromCache = async (sku: string) => {
  const cacheKey = `${VARIANT_SKU_CACHE_PREFIX}${sku}`;
  return await redis.get<any>(cacheKey);
};

export const cacheVariantList = async (
  productId: string,
  params: any,
  variants: any
) => {
  const cacheKey = `${PRODUCT_VARIANTS_CACHE_PREFIX}${productId}:${JSON.stringify(
    params
  )}`;
  await redis.set(cacheKey, variants, CACHE_TTL.MEDIUM);
};

export const getVariantListFromCache = async (
  productId: string,
  params: any
) => {
  const cacheKey = `${PRODUCT_VARIANTS_CACHE_PREFIX}${productId}:${JSON.stringify(
    params
  )}`;
  return await redis.get<any>(cacheKey);
};

export const invalidateVariantCache = async (
  variantId: string,
  sku: string,
  productId: string
) => {
  const keysToDelete = [
    `${VARIANT_CACHE_PREFIX}${variantId}`,
    `${VARIANT_SKU_CACHE_PREFIX}${sku}`,
  ];

  try {
    await Promise.all(keysToDelete.map((key) => redis.del(key)));

    // Invalidate all variant lists for this product
    const listKeys = await redis.getKeys(
      `${PRODUCT_VARIANTS_CACHE_PREFIX}${productId}:*`
    );
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating variant cache:", error);
  }
};

export const invalidateProductVariantsCache = async (productId: string) => {
  try {
    // Invalidate all variant lists for this product
    const listKeys = await redis.getKeys(
      `${PRODUCT_VARIANTS_CACHE_PREFIX}${productId}:*`
    );
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating product variants cache:", error);
  }
};

export const invalidateAllVariantCaches = async () => {
  try {
    const variantKeys = await redis.getKeys(`${VARIANT_CACHE_PREFIX}*`);
    const skuKeys = await redis.getKeys(`${VARIANT_SKU_CACHE_PREFIX}*`);
    const listKeys = await redis.getKeys(`${PRODUCT_VARIANTS_CACHE_PREFIX}*`);

    const allKeys = [...variantKeys, ...skuKeys, ...listKeys];

    if (allKeys.length > 0) {
      await Promise.all(allKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating all variant caches:", error);
  }
};
