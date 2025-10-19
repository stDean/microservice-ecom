import { Request } from "express";
import { UnauthenticatedError } from "../errors";
import RedisService from "../redis/client";

const redis = RedisService.getInstance();

// Cache configuration
const CACHE_TTL = 3600; // 1 hour in seconds
const USER_CACHE_PREFIX = "user:";
export const USER_ADDRESSES_CACHE_PREFIX = "user:addresses:";

const requireAuth = (req: Request): never | void => {
  if (!req.user) {
    throw new UnauthenticatedError("User Not Authenticated");
  }
};

export const getUserFromAuth = (req: Request) => {
  requireAuth(req);
  return req.user!;
};

export const getProfileUpdateFields = (body: any) => {
  return {
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
  };
};

// Cache helper methods
export const cacheUser = async (user: any) => {
  const cacheKey = `${USER_CACHE_PREFIX}${user.userId}`;
  await redis.set(cacheKey, user, CACHE_TTL);
};

export const getUserFromCache = async (userId: string) => {
  const cacheKey = `${USER_CACHE_PREFIX}${userId}`;
  return await redis.get<any>(cacheKey);
};

export const invalidateUserCache = async (userId: string) => {
  const userCacheKey = `${USER_CACHE_PREFIX}${userId}`;
  const addressesCacheKey = `${USER_ADDRESSES_CACHE_PREFIX}${userId}`;
  await Promise.all([redis.del(userCacheKey), redis.del(addressesCacheKey)]);
};

export const cacheUserAddresses = async (userId: string, addresses: any[]) => {
  const cacheKey = `${USER_ADDRESSES_CACHE_PREFIX}${userId}`;
  await redis.set(cacheKey, addresses, CACHE_TTL);
};

export const getUserAddressesFromCache = async (userId: string) => {
  const cacheKey = `${USER_ADDRESSES_CACHE_PREFIX}${userId}`;
  return await redis.get<any[]>(cacheKey);
};
