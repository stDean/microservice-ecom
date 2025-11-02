import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Shipping } from "../db/schema";
import { NotFoundError, BadRequestError } from "../errors";

export const ShippingCtrl = {
  getAll: async (req: Request, res: Response) => {
    const { userId } = req.params;
    const shipments = await Shipping.find({ userId });

    return res.status(StatusCodes.OK).json({ shipments });
  },

  getById: async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const shipment = await Shipping.findOne({ orderId });
    if (!shipment) {
      throw new NotFoundError(`Shipment with id ${orderId} not found`);
    }

    return res.status(StatusCodes.OK).json({ shipment });
  },

  getByTrackingNumber: async (req: Request, res: Response) => {
    const { trackingNumber } = req.params;
    const shipment = await Shipping.findOne({ trackingNumber });
    if (!shipment) {
      throw new NotFoundError(
        `Shipment with tracking number ${trackingNumber} not found`
      );
    }
    
    return res.status(StatusCodes.OK).json({ shipment });
  },
};
