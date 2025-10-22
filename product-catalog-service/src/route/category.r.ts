import { Router } from "express";
import { CategoryCtrl } from "../controllers/category.c";
import { asyncHandler } from "../middleware/asyncHandler.m";
import { adminOnly } from "../middleware/admin.m";

const router = Router();

router
  .route("/")
  .post(asyncHandler(CategoryCtrl.create))
  .get(asyncHandler(CategoryCtrl.getAll));

router.patch("/bulk-update", asyncHandler(CategoryCtrl.bulkUpdate));
router.post("/bulk-restore", asyncHandler(CategoryCtrl.bulkRestore));
router.delete("/bulk-delete", asyncHandler(CategoryCtrl.bulkDelete));

router.get("/slug/:slug", asyncHandler(CategoryCtrl.getBySlug));
router.get("/:id/products", asyncHandler(CategoryCtrl.getProducts));

router
  .route("/:id")
  .get(asyncHandler(CategoryCtrl.getById))
  .patch(asyncHandler(CategoryCtrl.update))
  .delete(asyncHandler(CategoryCtrl.delete));

router.post("/:id/restore", asyncHandler(CategoryCtrl.restore));

export default router;
