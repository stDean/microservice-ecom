import { Router } from "express";
import { UserCtrl } from "../controller/users.c";
import { adminOnly } from "../middleware/admin.m";
import { asyncHandler } from "../middleware/asyncHandler.m";
import { userFromHeaders } from "../middleware/useFromHeaders.m";

const router = Router();

router.use(userFromHeaders);

// USER MANAGEMENT PROFILE ROUTES
router
  .route("/me")
  .get(asyncHandler(UserCtrl.getAuthUser))
  .patch(asyncHandler(UserCtrl.updateUser))
  .delete(asyncHandler(UserCtrl.deleteUser));

// ADDRESS MANAGEMENT ROUTES
router
  .route("/address")
  .get(asyncHandler(UserCtrl.getAddresses))
  .post(asyncHandler(UserCtrl.createAddress));
router
  .route("/address/:addressId")
  .get(asyncHandler(UserCtrl.getAddress))
  .patch(asyncHandler(UserCtrl.updateAddress))
  .delete(asyncHandler(UserCtrl.deleteAddress));

// ADMIN ONLY ROUTES
router.route("/").get(asyncHandler(UserCtrl.getUsers));
router.route("/:userId").get(asyncHandler(UserCtrl.getUserById));

export default router;
