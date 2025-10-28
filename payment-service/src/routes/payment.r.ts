import { Router } from "express";
import { PaymentCtrl } from "../controller/payment.c";
import { userFromHeaders } from "../middleware/useFromHeaders.m";

const router = Router();

router.use(userFromHeaders);

export default router;
