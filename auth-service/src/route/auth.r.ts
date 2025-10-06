import { Router } from "express";
import { AuthCtrl } from "../controller/auth.c";
import { asyncHandler } from "../middleware/asyncHandler.m";

const router = Router();

// Define your auth routes here
router.post("/register", asyncHandler(AuthCtrl.register));
router.get("/verify-email", asyncHandler(AuthCtrl.verifyEmail));
router.get("/users", asyncHandler(AuthCtrl.getUsers));
router.get("/verificationTokens", asyncHandler(AuthCtrl.getVerificationTokens));
router.get("/sessions", asyncHandler(AuthCtrl.getSessions));
router.get(
  "/passwordResetTokens",
  asyncHandler(AuthCtrl.getPasswordResetTokens)
);
router.post("/login", asyncHandler(AuthCtrl.login));
// router.post("/logout", asyncHandler(AuthCtrl.logout));
// router.post("/refresh-token", asyncHandler(AuthCtrl.refreshToken));
// router.post("/access-token", asyncHandler(AuthCtrl.accessToken));
// router.post("/forget-password", asyncHandler(AuthCtrl.forgetPassword));
// router.post("/reset-password", asyncHandler(AuthCtrl.resetPassword));

export default router;
