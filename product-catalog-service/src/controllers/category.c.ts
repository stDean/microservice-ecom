import { Response, Request } from "express";
import { StatusCodes } from "http-status-codes";

export const CategoryCtrl = {
  create: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Category Successfully Created." });
  },
  getAll: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "All Categories Gotten." });
  },

  getById: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Category Obtained By ID." });
  },

  getBySlug: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Category Obtained By Slug." });
  },

  getProducts: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "All Products For A Category Obtained." });
  },

  update: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Category Updated Successfully." });
  },
  
  delete: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Category Deleted Successfully." });
  },
};
