import { Response, Request } from "express";
import { StatusCodes } from "http-status-codes";

export const ProdVariantCtrl = {
  create: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Variant Successfully Created." });
  },

  getAll: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "All Product Variant Gotten." });
  },

  getById: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Variant Obtained By ID." });
  },

  getBySku: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Variant Obtained By SKU." });
  },

  update: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Variant Updated Successfully." });
  },

  delete: async (req: Request, res: Response) => {
    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Product Variant Deleted Successfully." });
  },
};
