import RedisService from "../redis/client";

const redis = RedisService.getInstance();

// Cache configuration
const CACHE_TTL = {
  SHORT: 60 * 5, // 5 minutes
  MEDIUM: 60 * 30, // 30 minutes
  LONG: 60 * 60, // 1 hour
};

// Cache key prefixes
const PRODUCT_CACHE_PREFIX = "product:";
const PRODUCT_SLUG_CACHE_PREFIX = "product:slug:";
const PRODUCT_LIST_CACHE_PREFIX = "products:list:";
const FEATURED_PRODUCTS_CACHE_PREFIX = "products:featured:";

// Cache helper methods
export const cacheProduct = async (product: any) => {
  const cacheKey = `${PRODUCT_CACHE_PREFIX}${product.id}`;
  const slugCacheKey = `${PRODUCT_SLUG_CACHE_PREFIX}${product.slug}`;

  await Promise.all([
    redis.set(cacheKey, product, CACHE_TTL.LONG),
    redis.set(slugCacheKey, product, CACHE_TTL.LONG),
  ]);
};

export const getProductFromCache = async (productId: string) => {
  const cacheKey = `${PRODUCT_CACHE_PREFIX}${productId}`;
  return await redis.get<any>(cacheKey);
};

export const getProductBySlugFromCache = async (slug: string) => {
  const cacheKey = `${PRODUCT_SLUG_CACHE_PREFIX}${slug}`;
  return await redis.get<any>(cacheKey);
};

export const cacheProductList = async (params: any, products: any) => {
  const cacheKey = `${PRODUCT_LIST_CACHE_PREFIX}${JSON.stringify(params)}`;
  await redis.set(cacheKey, products, CACHE_TTL.MEDIUM);
};

export const getProductListFromCache = async (params: any) => {
  const cacheKey = `${PRODUCT_LIST_CACHE_PREFIX}${JSON.stringify(params)}`;
  return await redis.get<any>(cacheKey);
};

export const cacheFeaturedProducts = async (params: any, products: any) => {
  const cacheKey = `${FEATURED_PRODUCTS_CACHE_PREFIX}${JSON.stringify(params)}`;
  await redis.set(cacheKey, products, CACHE_TTL.SHORT);
};

export const getFeaturedProductsFromCache = async (params: any) => {
  const cacheKey = `${FEATURED_PRODUCTS_CACHE_PREFIX}${JSON.stringify(params)}`;
  return await redis.get<any>(cacheKey);
};

export const invalidateProductCache = async (
  productId: string,
  slug?: string
) => {
  const keysToDelete = [
    `${PRODUCT_CACHE_PREFIX}${productId}`,
    ...(slug ? [`${PRODUCT_SLUG_CACHE_PREFIX}${slug}`] : []),
  ];

  try {
    await Promise.all(keysToDelete.map((key) => redis.del(key)));

    // Invalidate all list caches
    const listKeys = await redis.getKeys(`${PRODUCT_LIST_CACHE_PREFIX}*`);
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => redis.del(key)));
    }

    // Invalidate featured products cache
    const featuredKeys = await redis.getKeys(
      `${FEATURED_PRODUCTS_CACHE_PREFIX}*`
    );
    if (featuredKeys.length > 0) {
      await Promise.all(featuredKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating product cache:", error);
  }
};

export const invalidateProductListCaches = async () => {
  try {
    const listKeys = await redis.getKeys(`${PRODUCT_LIST_CACHE_PREFIX}*`);
    const featuredKeys = await redis.getKeys(
      `${FEATURED_PRODUCTS_CACHE_PREFIX}*`
    );

    const allKeys = [...listKeys, ...featuredKeys];

    if (allKeys.length > 0) {
      await Promise.all(allKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating product list caches:", error);
  }
};

export const invalidateAllProductCaches = async () => {
  try {
    const productKeys = await redis.getKeys(`${PRODUCT_CACHE_PREFIX}*`);
    const slugKeys = await redis.getKeys(`${PRODUCT_SLUG_CACHE_PREFIX}*`);
    const listKeys = await redis.getKeys(`${PRODUCT_LIST_CACHE_PREFIX}*`);
    const featuredKeys = await redis.getKeys(
      `${FEATURED_PRODUCTS_CACHE_PREFIX}*`
    );

    const allKeys = [...productKeys, ...slugKeys, ...listKeys, ...featuredKeys];

    if (allKeys.length > 0) {
      await Promise.all(allKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating all product caches:", error);
  }
};
