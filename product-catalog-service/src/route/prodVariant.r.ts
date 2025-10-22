import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.m";
import { ProdVariantCtrl } from "../controllers/productVariants.c";
import { adminOnly } from "../middleware/admin.m";

const router = Router();

router.get("/sku/:sku", asyncHandler(ProdVariantCtrl.getBySku));

router
  .route("/:id")
  .get(asyncHandler(ProdVariantCtrl.getById))
  .patch(asyncHandler(ProdVariantCtrl.update))
  .delete(asyncHandler(ProdVariantCtrl.delete));

export default router;
