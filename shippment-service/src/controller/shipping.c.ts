import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Shipping } from "../db/schema";
import { NotFoundError, BadRequestError } from "../errors";

export const ShippingCtrl = {
  getAll: async (req: Request, res: Response) => {
    const shipments = await Shipping.find({});
    res.status(StatusCodes.OK).json({ shipments });
  },

  getById: async (req: Request, res: Response) => {
    const { id } = req.params;
    const shipment = await Shipping.findById(id);
    if (!shipment) {
      throw new NotFoundError(`Shipment with id ${id} not found`);
    }
    res.status(StatusCodes.OK).json({ shipment });
  },

  getByTrackingNumber: async (req: Request, res: Response) => {
    const { trackingNumber } = req.params;
    const shipment = await Shipping.findOne({ trackingNumber });
    if (!shipment) {
      throw new NotFoundError(
        `Shipment with tracking number ${trackingNumber} not found`
      );
    }
    res.status(StatusCodes.OK).json({ shipment });
  },
};
