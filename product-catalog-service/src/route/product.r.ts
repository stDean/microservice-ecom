import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.m";
import { ProductCtrl } from "../controllers/product.c";
import { ProdVariantCtrl } from "../controllers/productVariants.c";

const router = Router();

router
  .route("/")
  .post(asyncHandler(ProductCtrl.create))
  .get(asyncHandler(ProductCtrl.getAll));

router.get("/search", asyncHandler(ProductCtrl.search));
router.get("/featured", asyncHandler(ProductCtrl.getFeatured));
router.get("/slug/:slug", asyncHandler(ProductCtrl.getBySlug));

router
  .route("/:productId/variants")
  .post(asyncHandler(ProdVariantCtrl.create))
  .get(asyncHandler(ProdVariantCtrl.getAll));

router
  .route("/:id")
  .get(asyncHandler(ProductCtrl.getById))
  .patch(asyncHandler(ProductCtrl.update))
  .delete(asyncHandler(ProductCtrl.delete));

export default router;
