import { Router } from "express";
import { OrderCtrl } from "../controller/order.c";
import { asyncHandler } from "../middleware/asyncHandler.m";
import { userFromHeaders } from "../middleware/useFromHeaders.m";

const router = Router();

router.use(userFromHeaders);

router.post("/", asyncHandler(OrderCtrl.checkOut));
router.get("/me", asyncHandler(OrderCtrl.getAll));
router.post("/status", asyncHandler(OrderCtrl.status));
router.get("/:id", asyncHandler(OrderCtrl.get));
router.patch("/:id/cancel", asyncHandler(OrderCtrl.cancel));

export default router;
