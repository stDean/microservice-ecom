import { Router } from "express";
import { ShippingCtrl } from "../controller/shipping.c";
import { asyncHandler } from "../middleware/asyncHandler.m";
import { userFromHeaders } from "../middleware/useFromHeaders.m";

const router = Router();

router.use(userFromHeaders);

router.get("/user/:userId", asyncHandler(ShippingCtrl.getUserShippings));

router.get("/order/:orderId", asyncHandler(ShippingCtrl.getShippingByOrderId));

router.get(
  "/tracking/:trackingNumber",
  asyncHandler(ShippingCtrl.getShippingByTrackingNumber)
);

export default router;
