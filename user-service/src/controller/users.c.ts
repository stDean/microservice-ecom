import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

// Extend the Request interface to include the user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// NOTE: the req.user is coming from the authenticateToken in the api-gateway
export const UserCtrl = {
  // USER MANAGEMENT PROFILE
  getAuthUser: async (req: Request, res: Response) => {
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
    //ADMIN ONLY
    if (!req.user) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "User Not Authenticated" });
    }

    const { id, email, role } = req.user;
    return res.status(StatusCodes.OK).json({ message: "All Users." });
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
