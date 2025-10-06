import { Router } from "express";
import { AuthCtrl } from "../controller/auth.c";

const router = Router();

// Define your auth routes here
router.post("/login", AuthCtrl.login);
router.post("/register", AuthCtrl.register);
router.post("/logout", AuthCtrl.logout);
router.post("/refresh-token", AuthCtrl.refreshToken);
router.post("/access-token", AuthCtrl.accessToken);
router.post("/forget-password", AuthCtrl.forgetPassword);
router.post("/reset-password", AuthCtrl.resetPassword);

export default router;
