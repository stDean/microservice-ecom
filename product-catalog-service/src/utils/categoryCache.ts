import RedisService from "../redis/client";

const redis = RedisService.getInstance();

// Cache configuration
const CACHE_TTL = {
  SHORT: 60 * 5, // 5 minutes
  MEDIUM: 60 * 30, // 30 minutes
  LONG: 60 * 60, // 1 hour
};

// Cache key prefixes
const CATEGORY_CACHE_PREFIX = "category:";
const CATEGORY_LIST_CACHE_PREFIX = "categories:list:";
const CATEGORY_PRODUCTS_CACHE_PREFIX = "category:products:";
const CATEGORY_SLUG_CACHE_PREFIX = "category:slug:";

// Cache helper methods
export const cacheCategory = async (category: any) => {
  const cacheKey = `${CATEGORY_CACHE_PREFIX}${category.id}`;
  const slugCacheKey = `${CATEGORY_SLUG_CACHE_PREFIX}${category.slug}`;

  await Promise.all([
    redis.set(cacheKey, category, CACHE_TTL.LONG),
    redis.set(slugCacheKey, category, CACHE_TTL.LONG),
  ]);
};

export const getCategoryFromCache = async (categoryId: string) => {
  const cacheKey = `${CATEGORY_CACHE_PREFIX}${categoryId}`;
  return await redis.get<any>(cacheKey);
};

export const getCategoryBySlugFromCache = async (slug: string) => {
  const cacheKey = `${CATEGORY_SLUG_CACHE_PREFIX}${slug}`;
  return await redis.get<any>(cacheKey);
};

export const cacheCategoryList = async (params: any, categories: any) => {
  const cacheKey = `${CATEGORY_LIST_CACHE_PREFIX}${JSON.stringify(params)}`;
  await redis.set(cacheKey, categories, CACHE_TTL.MEDIUM);
};

export const getCategoryListFromCache = async (params: any) => {
  const cacheKey = `${CATEGORY_LIST_CACHE_PREFIX}${JSON.stringify(params)}`;
  return await redis.get<any>(cacheKey);
};

export const cacheCategoryProducts = async (
  categoryId: string,
  params: any,
  data: any
) => {
  const cacheKey = `${CATEGORY_PRODUCTS_CACHE_PREFIX}${categoryId}:${JSON.stringify(
    params
  )}`;
  await redis.set(cacheKey, data, CACHE_TTL.SHORT);
};

export const getCategoryProductsFromCache = async (
  categoryId: string,
  params: any
) => {
  const cacheKey = `${CATEGORY_PRODUCTS_CACHE_PREFIX}${categoryId}:${JSON.stringify(
    params
  )}`;
  return await redis.get<any>(cacheKey);
};

export const invalidateCategoryCache = async (
  categoryId: string,
  slug?: string
) => {
  const keysToDelete = [
    `${CATEGORY_CACHE_PREFIX}${categoryId}`,
    ...(slug ? [`${CATEGORY_SLUG_CACHE_PREFIX}${slug}`] : []),
  ];

  try {
    await Promise.all(keysToDelete.map((key) => redis.del(key)));

    // Invalidate all list caches
    const listKeys = await redis.getKeys(`${CATEGORY_LIST_CACHE_PREFIX}*`);
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => redis.del(key)));
    }

    // Invalidate all product caches for this category
    const productKeys = await redis.getKeys(
      `${CATEGORY_PRODUCTS_CACHE_PREFIX}${categoryId}:*`
    );
    if (productKeys.length > 0) {
      await Promise.all(productKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating category cache:", error);
  }
};

export const invalidateAllCategoryCaches = async () => {
  try {
    const categoryKeys = await redis.getKeys(`${CATEGORY_CACHE_PREFIX}*`);
    const slugKeys = await redis.getKeys(`${CATEGORY_SLUG_CACHE_PREFIX}*`);
    const listKeys = await redis.getKeys(`${CATEGORY_LIST_CACHE_PREFIX}*`);
    const productKeys = await redis.getKeys(
      `${CATEGORY_PRODUCTS_CACHE_PREFIX}*`
    );

    const allKeys = [...categoryKeys, ...slugKeys, ...listKeys, ...productKeys];

    if (allKeys.length > 0) {
      await Promise.all(allKeys.map((key) => redis.del(key)));
    }
  } catch (error) {
    console.error("Error invalidating all category caches:", error);
  }
};
