import { Router } from "express";
import { CartCtrl } from "../controller/cart.c";
import { asyncHandler } from "../middleware/asyncHandler.m";

const router = Router();

router.get("/validate", asyncHandler(CartCtrl.validate));

router
  .route("/me")
  .get(asyncHandler(CartCtrl.get))
  .delete(asyncHandler(CartCtrl.clear));

router.post("/me/items", asyncHandler(CartCtrl.add));
router.get("/me/totals", asyncHandler(CartCtrl.getTotals));
router.post("/me/check-out", asyncHandler(CartCtrl.checkOut));

router
  .route("/me/items/:itemId")
  .patch(asyncHandler(CartCtrl.update))
  .delete(asyncHandler(CartCtrl.delete));

router.post("/:userId/merge", asyncHandler(CartCtrl.merge));

export default router;
