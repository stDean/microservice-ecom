import { Router } from "express";
import { AuthCtrl } from "../controller/auth.c";
import { asyncHandler } from "../middleware/asyncHandler.m";

const router = Router();

// Define your auth routes here
router.post("/register", asyncHandler(AuthCtrl.register));
router.post(
  "/resend-verification",
  asyncHandler(AuthCtrl.resendVerificationEmail)
);
router.get("/verify-email", asyncHandler(AuthCtrl.verifyEmail));
router.post("/login", asyncHandler(AuthCtrl.login));
router.post("/logout", asyncHandler(AuthCtrl.logout));
router.post("/refresh-token", asyncHandler(AuthCtrl.refreshToken));
router.post("/forget-password", asyncHandler(AuthCtrl.forgetPassword));
router.post("/resend-reset", asyncHandler(AuthCtrl.resendResetPasswordEmail));
router.post("/reset-password", asyncHandler(AuthCtrl.resetPassword));

// Testing purpose only - In production, this should be a POST request with a body
router.get("/users", asyncHandler(AuthCtrl.getUsers));
router.get("/verificationTokens", asyncHandler(AuthCtrl.getVerificationTokens));
router.get("/sessions", asyncHandler(AuthCtrl.getSessions));
router.get(
  "/passwordResetTokens",
  asyncHandler(AuthCtrl.getPasswordResetTokens)
);
// End of testing routes

export default router;
