import { Router } from "express";
import { NotificationCtrl } from "../controller/notification.c";

const router = Router();

router.post("/sendVerificationEmail", NotificationCtrl.sendVerificationEmail);

router.post("/sendPasswordResetEmail", NotificationCtrl.sendPasswordResetEmail);

export default router;
