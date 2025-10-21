import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { UserCtrl } from "../../src/controller/users.c";
import { User } from "../../src/db/schema/user.s";
import { NotFoundError } from "../../src/errors";
import RedisService from "../../src/redis/client";
import * as helpers from "../../src/utils/helpers";
import { logger } from "../../src/utils/logger";
import { eventPublisher } from "../../src/redis/publisher";

// Define test-specific request type
interface TestRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  validatedQuery?: {
    page: number;
    limit: number;
    skip: number;
    fields: string;
  };
}

// Create mock objects
const mockUserModel = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
}));

const mockRedisInstance = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

const mockHelpers = vi.hoisted(() => ({
  getUserFromCache: vi.fn(),
  getUserFromAuth: vi.fn(),
  cacheUser: vi.fn(),
  getProfileUpdateFields: vi.fn(),
  invalidateUserCache: vi.fn(),
  getUserAddressesFromCache: vi.fn(),
  cacheUserAddresses: vi.fn(),
  USER_ADDRESSES_CACHE_PREFIX: "user:addresses:",
}));

const mockLogger = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockEventPublisher = vi.hoisted(() => ({
  publishEvent: vi.fn(),
}));

// Mock dependencies
vi.mock("../../src/db/schema/user.s", () => ({
  User: mockUserModel,
}));

vi.mock("../../src/redis/client", () => ({
  default: {
    getInstance: vi.fn(() => mockRedisInstance),
  },
}));

vi.mock("../../src/utils/helpers", () => mockHelpers);

vi.mock("../../src/utils/logger", () => mockLogger);

vi.mock("../../src/redis/publisher", () => ({
  eventPublisher: mockEventPublisher,
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid-123"),
}));

describe("UserCtrl", () => {
  let mockReq: Partial<TestRequest>;
  let mockRes: Partial<Response>;
  let mockJson: Mock;
  let mockStatus: Mock;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup response mocks
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnThis();

    mockRes = {
      status: mockStatus,
      json: mockJson,
    };

    // Setup request mock
    mockReq = {
      user: {
        id: "user-123",
        email: "test@example.com",
        role: "user",
      },
      params: {},
      body: {},
      query: {},
      validatedQuery: {
        page: 1,
        limit: 10,
        skip: 0,
        fields: "-password",
      },
    };

    // Setup default mock implementations
    mockRedisInstance.del.mockResolvedValue(undefined);
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.set.mockResolvedValue(undefined);

    mockHelpers.getUserFromAuth.mockReturnValue({
      id: "user-123",
      email: "test@example.com",
    });

    mockEventPublisher.publishEvent.mockResolvedValue(undefined);
    mockHelpers.cacheUser.mockResolvedValue(undefined);
    mockHelpers.cacheUserAddresses.mockResolvedValue(undefined);
    mockHelpers.invalidateUserCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getAuthUser", () => {
    it("should return user from cache when available", async () => {
      const cachedUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      };

      mockHelpers.getUserFromCache.mockResolvedValue(cachedUser);

      await UserCtrl.getAuthUser(mockReq as Request, mockRes as Response);

      expect(mockHelpers.getUserFromCache).toHaveBeenCalledWith("user-123");
      expect(mockJson).toHaveBeenCalledWith({
        message: "Authenticated User.",
        user: cachedUser,
      });
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it("should fetch from database and cache when not in cache", async () => {
      const dbUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      };

      mockHelpers.getUserFromCache.mockResolvedValue(null);

      // Mock the Mongoose chain properly
      const mockLean = vi.fn().mockResolvedValue(dbUser);
      const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
      mockUserModel.findOne.mockReturnValue({ select: mockSelect });

      await UserCtrl.getAuthUser(mockReq as Request, mockRes as Response);

      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        email: "test@example.com",
        userId: "user-123",
      });
      expect(mockSelect).toHaveBeenCalledWith("-password");
      expect(mockHelpers.cacheUser).toHaveBeenCalledWith(dbUser);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Authenticated User.",
        user: dbUser,
      });
    });

    it("should throw NotFoundError when user not found in database", async () => {
      mockHelpers.getUserFromCache.mockResolvedValue(null);

      const mockLean = vi.fn().mockResolvedValue(null);
      const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
      mockUserModel.findOne.mockReturnValue({ select: mockSelect });

      await expect(
        UserCtrl.getAuthUser(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateUser", () => {
    it("should update user profile successfully", async () => {
      const updateFields = { name: "Updated Name", phone: "1234567890" };
      const updatedUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Updated Name",
      };

      mockHelpers.getProfileUpdateFields.mockReturnValue(updateFields);

      const mockLean = vi.fn().mockResolvedValue(updatedUser);
      const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
      mockUserModel.findOneAndUpdate.mockReturnValue({ select: mockSelect });

      mockReq.body = updateFields;

      await UserCtrl.updateUser(mockReq as Request, mockRes as Response);

      expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { email: "test@example.com", userId: "user-123" },
        { $set: updateFields },
        { new: true, runValidators: true }
      );
      expect(mockHelpers.cacheUser).toHaveBeenCalledWith(updatedUser);
      expect(mockRedisInstance.del).toHaveBeenCalledWith(
        "user:addresses:user-123"
      );
      expect(mockJson).toHaveBeenCalledWith({
        message: "User profile updated successfully.",
        user: updatedUser,
      });
    });

    it("should throw NotFoundError when user to update is not found", async () => {
      mockHelpers.getProfileUpdateFields.mockReturnValue({
        name: "Updated Name",
      });

      const mockLean = vi.fn().mockResolvedValue(null);
      const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
      mockUserModel.findOneAndUpdate.mockReturnValue({ select: mockSelect });

      await expect(
        UserCtrl.updateUser(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteUser", () => {
    it("should delete user successfully and publish event", async () => {
      const deletedUser = { id: "user-123", email: "test@example.com" };

      mockUserModel.findOneAndDelete.mockResolvedValue(deletedUser);

      await UserCtrl.deleteUser(mockReq as Request, mockRes as Response);

      expect(mockUserModel.findOneAndDelete).toHaveBeenCalledWith({
        email: "test@example.com",
        userId: "user-123",
      });
      expect(mockEventPublisher.publishEvent).toHaveBeenCalledWith({
        type: "USER_DELETED",
        source: "auth-service",
        timestamp: expect.any(Date),
        version: "1.0.0",
        data: {
          email: "test@example.com",
          userId: "user-123",
        },
      });
      expect(mockHelpers.invalidateUserCache).toHaveBeenCalledWith("user-123");
      expect(mockJson).toHaveBeenCalledWith({
        message: "User profile deleted successfully.",
      });
    });

    it("should throw NotFoundError when user to delete is not found", async () => {
      mockUserModel.findOneAndDelete.mockResolvedValue(null);

      await expect(
        UserCtrl.deleteUser(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("Address Management", () => {
    describe("createAddress", () => {
      it("should create first address and set as default", async () => {
        const addressData = {
          line1: "123 Main St",
          city: "Test City",
          stateProvince: "TS",
          postalCode: "12345",
          country: "US",
          type: "Home",
        };

        // Mock for checking existing addresses
        const mockSelectFind = vi.fn().mockResolvedValue({ addresses: [] });
        mockUserModel.findOne.mockReturnValue({ select: mockSelectFind });

        // Mock for creating address
        const mockSelectUpdate = vi.fn().mockReturnValue({
          addresses: [
            {
              ...addressData,
              addressId: "mock-uuid-123",
              isDefault: true,
            },
          ],
        });
        mockUserModel.findOneAndUpdate.mockReturnValue({
          select: mockSelectUpdate,
        });

        mockReq.body = addressData;

        await UserCtrl.createAddress(mockReq as Request, mockRes as Response);

        expect(mockUserModel.findOne).toHaveBeenCalledWith({
          email: "test@example.com",
          userId: "user-123",
        });
        expect(mockSelectFind).toHaveBeenCalledWith("addresses");
        expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
          { email: "test@example.com", userId: "user-123" },
          {
            $push: {
              addresses: expect.objectContaining({
                ...addressData,
                addressId: "mock-uuid-123",
                isDefault: true,
              }),
            },
          },
          { new: true, runValidators: true }
        );
        expect(mockHelpers.invalidateUserCache).toHaveBeenCalledWith(
          "user-123"
        );
        expect(mockStatus).toHaveBeenCalledWith(StatusCodes.CREATED);
      });
      it("should create additional address without setting as default", async () => {
        const existingAddress = {
          addressId: "existing-123",
          line1: "456 Other St",
          city: "Other City",
          isDefault: true,
        };

        const mockSelectFind = vi
          .fn()
          .mockResolvedValue({ addresses: [existingAddress] });
        mockUserModel.findOne.mockReturnValue({ select: mockSelectFind });

        const newAddressData = {
          line1: "123 Main St",
          city: "Test City",
          stateProvince: "TS",
          postalCode: "12345",
          country: "US",
          type: "Home",
        };

        const mockSelectUpdate = vi.fn().mockReturnValue({
          addresses: [
            existingAddress,
            {
              ...newAddressData,
              addressId: "mock-uuid-123",
              isDefault: false, // This should be false for additional addresses
            },
          ],
        });
        mockUserModel.findOneAndUpdate.mockReturnValue({
          select: mockSelectUpdate,
        });

        mockReq.body = newAddressData;

        await UserCtrl.createAddress(mockReq as Request, mockRes as Response);

        expect(mockUserModel.findOne).toHaveBeenCalledWith({
          email: "test@example.com",
          userId: "user-123",
        });
        expect(mockSelectFind).toHaveBeenCalledWith("addresses");

        // Fix the expectation to match what the actual code does
        expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
          { email: "test@example.com", userId: "user-123" },
          {
            $push: {
              addresses: {
                ...newAddressData,
                addressId: "mock-uuid-123",
                isDefault: false, // The code should set this to false when there are existing addresses
              },
            },
          },
          { new: true, runValidators: true }
        );

        expect(mockHelpers.invalidateUserCache).toHaveBeenCalledWith(
          "user-123"
        );
        expect(mockStatus).toHaveBeenCalledWith(StatusCodes.CREATED);
      });
    });

    describe("getAddresses", () => {
      it("should return addresses from cache when available", async () => {
        const cachedAddresses = [
          { addressId: "addr-1", line1: "123 Main St" },
          { addressId: "addr-2", line1: "456 Other St" },
        ];

        mockHelpers.getUserAddressesFromCache.mockResolvedValue(
          cachedAddresses
        );

        await UserCtrl.getAddresses(mockReq as Request, mockRes as Response);

        expect(mockHelpers.getUserAddressesFromCache).toHaveBeenCalledWith(
          "user-123"
        );
        expect(mockJson).toHaveBeenCalledWith({
          message: "Addresses retrieved successfully.",
          addresses: cachedAddresses,
        });
      });

      it("should fetch from database and cache when not in cache", async () => {
        const dbAddresses = [{ addressId: "addr-1", line1: "123 Main St" }];

        mockHelpers.getUserAddressesFromCache.mockResolvedValue(null);

        const mockLean = vi.fn().mockResolvedValue({ addresses: dbAddresses });
        const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
        mockUserModel.findOne.mockReturnValue({ select: mockSelect });

        await UserCtrl.getAddresses(mockReq as Request, mockRes as Response);

        expect(mockUserModel.findOne).toHaveBeenCalledWith({
          email: "test@example.com",
          userId: "user-123",
        });
        expect(mockSelect).toHaveBeenCalledWith("addresses");
        expect(mockHelpers.cacheUserAddresses).toHaveBeenCalledWith(
          "user-123",
          dbAddresses
        );
        expect(mockJson).toHaveBeenCalledWith({
          message: "Addresses retrieved successfully.",
          addresses: dbAddresses,
        });
      });
    });

    describe("getAddress", () => {
      it("should return address from cache when available", async () => {
        const cachedAddresses = [
          { _id: "addr-1", line1: "123 Main St" },
          { _id: "addr-2", line1: "456 Other St" },
        ];
        const targetAddress = { _id: "addr-1", line1: "123 Main St" };

        mockHelpers.getUserAddressesFromCache.mockResolvedValue(
          cachedAddresses
        );
        mockReq.params = { addressId: "addr-1" };

        await UserCtrl.getAddress(mockReq as Request, mockRes as Response);

        expect(mockHelpers.getUserAddressesFromCache).toHaveBeenCalledWith(
          "user-123"
        );
        expect(mockJson).toHaveBeenCalledWith({
          message: "Address retrieved successfully.",
          address: targetAddress,
        });
      });

      it("should fetch from database when not in cache", async () => {
        const dbUser = {
          addresses: [{ addressId: "addr-1", line1: "123 Main St" }],
        };

        mockHelpers.getUserAddressesFromCache.mockResolvedValue(null);
        mockUserModel.findOne.mockReturnValue({
          lean: vi.fn().mockResolvedValue(dbUser),
        });
        mockReq.params = { addressId: "addr-1" };

        await UserCtrl.getAddress(mockReq as Request, mockRes as Response);

        expect(mockUserModel.findOne).toHaveBeenCalledWith(
          {
            email: "test@example.com",
            userId: "user-123",
            "addresses.addressId": "addr-1",
          },
          { addresses: { $elemMatch: { addressId: "addr-1" } } }
        );
        expect(mockJson).toHaveBeenCalledWith({
          message: "Address retrieved successfully.",
          address: dbUser.addresses[0],
        });
      });

      it("should throw NotFoundError when address not found", async () => {
        mockHelpers.getUserAddressesFromCache.mockResolvedValue(null);
        mockUserModel.findOne.mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        });
        mockReq.params = { addressId: "non-existent" };

        await expect(
          UserCtrl.getAddress(mockReq as Request, mockRes as Response)
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe("updateAddress", () => {
      it("should update address successfully", async () => {
        const updatedAddresses = [
          {
            addressId: "addr-1",
            line1: "Updated Address",
            city: "Updated City",
          },
        ];

        const mockSelect = vi.fn().mockReturnValue({
          addresses: updatedAddresses,
        });
        mockUserModel.findOneAndUpdate.mockReturnValue({ select: mockSelect });

        mockReq.params = { addressId: "addr-1" };
        mockReq.body = { line1: "Updated Address", city: "Updated City" };

        await UserCtrl.updateAddress(mockReq as Request, mockRes as Response);

        expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
          {
            email: "test@example.com",
            userId: "user-123",
            "addresses.addressId": "addr-1",
          },
          {
            $set: {
              "addresses.$.line1": "Updated Address",
              "addresses.$.city": "Updated City",
            },
          },
          { new: true, runValidators: true }
        );
        expect(mockRedisInstance.del).toHaveBeenCalledWith(
          "user:addresses:user-123"
        );
        expect(mockJson).toHaveBeenCalledWith({
          message: "Address updated successfully.",
          addresses: updatedAddresses,
        });
      });
    });

    describe("deleteAddress", () => {
      it("should delete address successfully", async () => {
        const remainingAddresses = [
          { addressId: "addr-2", line1: "456 Other St" },
        ];

        const mockSelect = vi.fn().mockReturnValue({
          addresses: remainingAddresses,
        });
        mockUserModel.findOneAndUpdate.mockReturnValue({ select: mockSelect });

        mockReq.params = { addressId: "addr-1" };

        await UserCtrl.deleteAddress(mockReq as Request, mockRes as Response);

        expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
          { email: "test@example.com", userId: "user-123" },
          { $pull: { addresses: { addressId: "addr-1" } } },
          { new: true }
        );
        expect(mockRedisInstance.del).toHaveBeenCalledWith(
          "user:addresses:user-123"
        );
        expect(mockJson).toHaveBeenCalledWith({
          message: "Address deleted successfully.",
          addresses: remainingAddresses,
        });
      });
    });
  });

  describe("Admin Operations", () => {
    describe("getUsers", () => {
      it("should return users from cache when available", async () => {
        const cachedUsers = {
          users: [{ id: "user-1", email: "user1@example.com" }],
          message: "Users found",
          pagination: { page: 1, limit: 10, totalUsers: 1, totalPages: 1 },
        };

        mockRedisInstance.get.mockResolvedValue(cachedUsers);

        await UserCtrl.getUsers(mockReq as Request, mockRes as Response);

        expect(mockRedisInstance.get).toHaveBeenCalledWith(
          "users:page:1:limit:10:fields:-password"
        );
        expect(mockJson).toHaveBeenCalledWith(cachedUsers);
      });

      it("should fetch from database and cache when not in cache", async () => {
        const dbUsers = [{ id: "user-1", email: "user1@example.com" }];
        const totalUsers = 1;

        mockRedisInstance.get.mockResolvedValue(null);

        // Mock the complex Mongoose chain
        const mockLean = vi.fn().mockResolvedValue(dbUsers);
        const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
        const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
        const mockSelect = vi.fn().mockReturnValue({ sort: mockSort });
        mockUserModel.find.mockReturnValue({ select: mockSelect });

        mockUserModel.countDocuments.mockResolvedValue(totalUsers);

        await UserCtrl.getUsers(mockReq as Request, mockRes as Response);

        expect(mockUserModel.find).toHaveBeenCalledWith({});
        expect(mockSelect).toHaveBeenCalledWith("-password");
        expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockSkip).toHaveBeenCalledWith(0);
        expect(mockLimit).toHaveBeenCalledWith(10);
        expect(mockRedisInstance.set).toHaveBeenCalledWith(
          "users:page:1:limit:10:fields:-password",
          expect.objectContaining({
            users: dbUsers,
            message: "Users found",
          }),
          1800
        );
      });
    });

    describe("getUserById", () => {
      it("should return user from cache when available", async () => {
        const cachedUser = { id: "user-123", email: "test@example.com" };
        mockHelpers.getUserFromCache.mockResolvedValue(cachedUser);
        mockReq.params = { id: "user-123" };

        await UserCtrl.getUserById(mockReq as Request, mockRes as Response);

        expect(mockHelpers.getUserFromCache).toHaveBeenCalledWith("user-123");
        expect(mockJson).toHaveBeenCalledWith({
          user: cachedUser,
          message: "User retrieved successfully.",
        });
      });

      it("should fetch from database and cache when not in cache", async () => {
        const dbUser = { id: "user-123", email: "test@example.com" };
        mockHelpers.getUserFromCache.mockResolvedValue(null);

        const mockLean = vi.fn().mockResolvedValue(dbUser);
        const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
        mockUserModel.findById.mockReturnValue({ select: mockSelect });

        mockReq.params = { id: "user-123" };

        await UserCtrl.getUserById(mockReq as Request, mockRes as Response);

        expect(mockUserModel.findById).toHaveBeenCalledWith("user-123");
        expect(mockSelect).toHaveBeenCalledWith("-password");
        expect(mockHelpers.cacheUser).toHaveBeenCalledWith(dbUser);
        expect(mockJson).toHaveBeenCalledWith({
          user: dbUser,
          message: "User retrieved successfully.",
        });
      });
    });

    describe("searchUser", () => {
      it("should return search results from cache when available", async () => {
        const cachedSearch = {
          users: [{ id: "user-1", email: "test@example.com" }],
          message: "Search completed successfully",
          pagination: { page: 1, limit: 10, totalUsers: 1, totalPages: 1 },
        };

        mockRedisInstance.get.mockResolvedValue(cachedSearch);
        mockReq.query = { q: "test" };

        await UserCtrl.searchUser(mockReq as Request, mockRes as Response);

        expect(mockRedisInstance.get).toHaveBeenCalledWith(
          "users:search:test:page:1:limit:10"
        );
        expect(mockJson).toHaveBeenCalledWith(cachedSearch);
      });

      it("should return bad request when search term is missing", async () => {
        mockReq.query = {};

        await UserCtrl.searchUser(mockReq as Request, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
        expect(mockJson).toHaveBeenCalledWith({
          message: "Search term is required",
        });
      });

      it("should perform search and cache results when not in cache", async () => {
        const searchResults = [{ id: "user-1", email: "test@example.com" }];
        const totalUsers = 1;

        mockRedisInstance.get.mockResolvedValue(null);

        // Mock the complex Mongoose chain
        const mockLean = vi.fn().mockResolvedValue(searchResults);
        const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
        const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
        const mockSelect = vi.fn().mockReturnValue({ sort: mockSort });
        mockUserModel.find.mockReturnValue({ select: mockSelect });

        mockUserModel.countDocuments.mockResolvedValue(totalUsers);
        mockReq.query = { q: "test" };

        await UserCtrl.searchUser(mockReq as Request, mockRes as Response);

        expect(mockUserModel.find).toHaveBeenCalledWith({
          $or: [
            { email: { $regex: "test", $options: "i" } },
            { name: { $regex: "test", $options: "i" } },
          ],
        });
        expect(mockRedisInstance.set).toHaveBeenCalledWith(
          "users:search:test:page:1:limit:10",
          expect.any(Object),
          900
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle database connection errors", async () => {
      mockHelpers.getUserFromCache.mockResolvedValue(null);

      const mockLean = vi
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));
      const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
      mockUserModel.findOne.mockReturnValue({ select: mockSelect });

      await expect(
        UserCtrl.getAuthUser(mockReq as Request, mockRes as Response)
      ).rejects.toThrow("Database connection failed");
    });
  });
});
