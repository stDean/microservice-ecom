import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { User } from "../db/schema/user.s";
import { NotFoundError } from "../errors";
import RedisService from "../redis/client";
import {
  cacheUser,
  cacheUserAddresses,
  getProfileUpdateFields,
  getUserAddressesFromCache,
  getUserFromAuth,
  getUserFromCache,
  invalidateUserCache,
  USER_ADDRESSES_CACHE_PREFIX,
} from "../utils/helpers";
import { logger } from "../utils/logger";
import { eventPublisher } from "../redis/publisher";

const redis = RedisService.getInstance();

export const UserCtrl = {
  // USER PROFILE MANAGEMENT
  getAuthUser: async (req: Request, res: Response) => {
    const { id, email } = getUserFromAuth(req);

    // Try to get from cache first
    const cachedUser = await getUserFromCache(id);
    if (cachedUser) {
      logger.info(`User ${id} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Authenticated User.",
        user: cachedUser,
      });
    }

    // Get fresh user data from database
    const user = await User.findOne({ email, userId: id })
      .select("-password")
      .lean();

    if (!user) throw new NotFoundError("User not found");

    // Cache the user data
    await cacheUser(user);

    return res.status(StatusCodes.OK).json({
      message: "Authenticated User.",
      user,
    });
  },

  updateUser: async (req: Request, res: Response) => {
    const { id, email: userEmail } = getUserFromAuth(req);

    const updateFields = getProfileUpdateFields(req.body);

    const updatedUser = await User.findOneAndUpdate(
      { email: userEmail, userId: id },
      { $set: updateFields },
      {
        new: true,
        runValidators: true,
      }
    )
      .select("-password")
      .lean();

    if (!updatedUser) throw new NotFoundError("User not found");

    // Update cache with new user data
    await cacheUser(updatedUser);

    // Only invalidate addresses cache if user data change might affect addresses
    await redis.del(`${USER_ADDRESSES_CACHE_PREFIX}${id}`);

    return res.status(StatusCodes.OK).json({
      message: "User profile updated successfully.",
      user: updatedUser,
    });
  },

  deleteUser: async (req: Request, res: Response) => {
    const { id, email } = getUserFromAuth(req);

    const deletedUser = await User.findOneAndDelete({
      email: email,
      userId: id,
    });

    if (!deletedUser) throw new NotFoundError("User not found");

    // Publish an event so the auth service can delete the user in the auth db
    await eventPublisher.publishEvent({
      type: "USER_DELETED",
      source: "auth-service",
      timestamp: new Date(),
      version: "1.0.0",
      data: {
        email: email,
        userId: id,
      },
    });

    // Clear all user-related cache
    await invalidateUserCache(id);

    return res.status(StatusCodes.OK).json({
      message: "User profile deleted successfully.",
    });
  },

  // ADDRESS MANAGEMENT
  createAddress: async (req: Request, res: Response) => {
    const { id, email } = getUserFromAuth(req);

    const user = await User.findOneAndUpdate(
      { email: email, userId: id },
      { $push: { addresses: req.body } },
      { new: true, runValidators: true }
    ).select("addresses");

    if (!user) throw new NotFoundError("User not found");

    // Invalidate addresses cache
    await redis.del(`${USER_ADDRESSES_CACHE_PREFIX}${id}`);

    return res.status(StatusCodes.CREATED).json({
      message: "Address created successfully.",
      addresses: user.addresses,
    });
  },

  getAddresses: async (req: Request, res: Response) => {
    const { id, email } = getUserFromAuth(req);

    // Try cache first
    const cachedAddresses = await getUserAddressesFromCache(id);
    if (cachedAddresses) {
      logger.info(`Addresses for user ${id} retrieved from cache`);
      return res.status(StatusCodes.OK).json({
        message: "Addresses retrieved successfully.",
        addresses: cachedAddresses,
      });
    }

    const user = await User.findOne({ email: email, userId: id })
      .select("addresses")
      .lean();

    if (!user) throw new NotFoundError("User not found");

    const addresses = user.addresses || [];

    // Cache the addresses
    await cacheUserAddresses(id, addresses);

    return res.status(StatusCodes.OK).json({
      message: "Addresses retrieved successfully.",
      addresses,
    });
  },

  getAddress: async (req: Request, res: Response) => {
    const { id, email } = getUserFromAuth(req);
    const { addressId } = req.params;

    // Try to get from cache first
    const cachedAddresses = await getUserAddressesFromCache(id);
    if (cachedAddresses) {
      const address = cachedAddresses.find(
        (addr: any) => addr._id === addressId
      );
      if (address) {
        logger.info(`Address ${addressId} for user ${id} retrieved from cache`);
        return res.status(StatusCodes.OK).json({
          message: "Address retrieved successfully.",
          address,
        });
      }
    }

    // If not in cache or address not found, query database
    const user = await User.findOne(
      {
        email: email,
        userId: id,
        "addresses._id": addressId,
      },
      { addresses: { $elemMatch: { _id: addressId } } }
    ).lean();

    if (!user?.addresses?.length) throw new NotFoundError("Address not found");

    return res.status(StatusCodes.OK).json({
      message: "Address retrieved successfully.",
      address: user.addresses[0],
    });
  },

  updateAddress: async (req: Request, res: Response) => {
    const { id, email } = getUserFromAuth(req);
    const { addressId } = req.params;

    // Build update object dynamically
    const updateFields: any = {};
    Object.keys(req.body).forEach((key) => {
      updateFields[`addresses.$.${key}`] = req.body[key];
    });

    const user = await User.findOneAndUpdate(
      {
        email: email,
        userId: id,
        "addresses._id": addressId,
      },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select("addresses");

    if (!user) throw new NotFoundError("Address not found");

    // Invalidate addresses cache
    await redis.del(`${USER_ADDRESSES_CACHE_PREFIX}${id}`);

    return res.status(StatusCodes.OK).json({
      message: "Address updated successfully.",
      addresses: user.addresses,
    });
  },

  deleteAddress: async (req: Request, res: Response) => {
    const { id, email } = getUserFromAuth(req);
    const { addressId } = req.params;

    const user = await User.findOneAndUpdate(
      { email: email, userId: id },
      { $pull: { addresses: { _id: addressId } } },
      { new: true }
    ).select("addresses");

    if (!user) throw new NotFoundError("User not found");

    // Invalidate addresses cache
    await redis.del(`${USER_ADDRESSES_CACHE_PREFIX}${id}`);

    return res.status(StatusCodes.OK).json({
      message: "Address deleted successfully.",
      addresses: user.addresses,
    });
  },

  // ADMIN ONLY
  getUsers: async (req: Request, res: Response) => {
    const { page, limit, skip, fields } = req.validatedQuery!;

    // Create cache key based on query parameters
    const cacheKey = `users:page:${page}:limit:${limit}:fields:${fields}`;

    // Try cache first
    const cachedUsers = await redis.get<any>(cacheKey);
    if (cachedUsers) {
      logger.info("Users list retrieved from cache");
      return res.status(StatusCodes.OK).json(cachedUsers);
    }

    const [users, totalUsers] = await Promise.all([
      User.find({})
        .select(fields)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(),
    ]);

    const response = {
      users,
      message: "Users found",
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      },
    };

    // Cache the response
    await redis.set(cacheKey, response, 1800); // 30 minutes TTL for user lists

    return res.status(StatusCodes.OK).json(response);
  },

  getUserById: async (req: Request, res: Response) => {
    const userId = req.params.id;

    // Try cache first
    const cachedUser = await getUserFromCache(userId);
    if (cachedUser) {
      logger.info(`User ${userId} retrieved from cache (admin)`);
      return res.status(StatusCodes.OK).json({
        user: cachedUser,
        message: "User retrieved successfully.",
      });
    }

    const user = await User.findById(userId).select("-password").lean();

    if (!user) throw new NotFoundError("User not found.");

    // Cache the user
    await cacheUser(user);

    return res.status(StatusCodes.OK).json({
      user,
      message: "User retrieved successfully.",
    });
  },

  searchUser: async (req: Request, res: Response) => {
    const { page, limit, skip, fields } = req.validatedQuery!;
    const { q: searchTerm } = req.query;

    if (!searchTerm || typeof searchTerm !== "string") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Search term is required",
      });
    }

    // Create cache key for search
    const cacheKey = `users:search:${searchTerm}:page:${page}:limit:${limit}`;

    // Try cache first
    const cachedSearch = await redis.get<any>(cacheKey);
    if (cachedSearch) {
      logger.info(`Search results for "${searchTerm}" retrieved from cache`);
      return res.status(StatusCodes.OK).json(cachedSearch);
    }

    const searchFilter = {
      $or: [
        { email: { $regex: searchTerm, $options: "i" } },
        { name: { $regex: searchTerm, $options: "i" } },
      ],
    };

    const [users, totalUsers] = await Promise.all([
      User.find(searchFilter)
        .select(fields)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(searchFilter),
    ]);

    const response = {
      users,
      message: "Search completed successfully",
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      },
    };

    // Cache search results with shorter TTL (15 minutes)
    await redis.set(cacheKey, response, 900);

    return res.status(StatusCodes.OK).json(response);
  },
};
