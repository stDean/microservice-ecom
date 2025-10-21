import { Response, Request } from "express";
import { StatusCodes } from "http-status-codes";

export const ProductCtrl = {
  create: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Successfully Created." });
  },

  getAll: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "All Product Gotten." });
  },

  getById: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Obtained By ID." });
  },

  getBySlug: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Obtained By Slug." });
  },

  getFeatured: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Featured Products Obtained." });
  },

  update: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Updated Successfully." });
  },

  delete: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Deleted Successfully." });
  },

  search: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Search Successful." });
  },
};
