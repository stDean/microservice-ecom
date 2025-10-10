import { Router } from "express";
import { NotificationCtrl } from "../controller/notification.c";

const router = Router();

router.get("/sendVerificationEmail", NotificationCtrl.sendVerificationEmail);

router.get("/sendPasswordResetEmail", NotificationCtrl.sendPasswordResetEmail);

export default router;
