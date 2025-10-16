import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { logger } from "../utils/logger";
import { User } from "../db/schema/user.s";
import RedisService from "../redis/client";
import { UnauthenticatedError } from "../errors";

const redis = RedisService.getInstance();

// NOTE: the req.user is coming from the authenticateToken in the api-gateway
export const UserCtrl = {
  // USER MANAGEMENT PROFILE
  getAuthUser: async (req: Request, res: Response) => {
    console.log(req.user);
    if (!req.user) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "User Not Authenticated" });
    }

    const { id, email, role } = req.user;
    return res.status(StatusCodes.OK).json({ message: "Authenticated User." });
  },

  updateUser: async (req: Request, res: Response) => {
    if (!req.user) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "User Not Authenticated" });
    }

    const { id, email, role } = req.user;
    return res
      .status(StatusCodes.OK)
      .json({ message: "Authenticated User Profile Updated." });
  },

  deleteUser: async (req: Request, res: Response) => {
    if (!req.user) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "User Not Authenticated" });
    }

    const { id, email, role } = req.user;

    // Publish an event so the auth service can delete the user in the auth db

    return res
      .status(StatusCodes.OK)
      .json({ message: "Authenticated User Profile Deleted." });
  },

  // ADDRESS MANAGEMENT
  createAddress: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "User Address Created." });
  },

  getAddresses: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "Users Addresses Obtained." });
  },

  getAddress: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "User Address Obtained." });
  },

  updateAddress: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "User Address Updated." });
  },

  deleteAddress: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "User Address Deleted." });
  },

  // ADMIN ONLY
  getUsers: async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthenticatedError("User is not authenticated.");
    }

    const users = await User.find({});

    return res
      .status(StatusCodes.OK)
      .json({ users, message: "Users found", nbHits: users.length });
  },

  getUserById: async (req: Request, res: Response) => {
    //ADMIN ONLY
    if (!req.user) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "User Not Authenticated" });
    }

    const { id, email, role } = req.user;
    return res
      .status(StatusCodes.OK)
      .json({ message: "Single User By Admin." });
  },

  searchUser: async (req: Request, res: Response) => {
    return res.status(StatusCodes.OK).json({ message: "Search Complete." });
  },
};
