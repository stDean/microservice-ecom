import { Router } from "express";
import { PaymentCtrl } from "../controller/payment.c";
import { userFromHeaders } from "../middleware/useFromHeaders.m";

const router = Router();

router.use(userFromHeaders);

router.post("/process", PaymentCtrl.processPayment);
router.post("/refund", PaymentCtrl.processRefund);
router.post("/payment-methods", PaymentCtrl.savePaymentMethod);
router.get("/users/:userId/payment-methods", PaymentCtrl.getPaymentMethods);
router.get("/users/:userId/transactions", PaymentCtrl.getTransactionHistory);

export default router;
