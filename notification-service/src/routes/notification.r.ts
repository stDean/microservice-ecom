import { Router } from "express";

const router = Router();

router.get("/sendVerificationEmail", (req, res) => {
  res.status(200).send({ message: "Verification email sent." });
});

router.get("/sendPasswordResetEmail", (req, res) => {
  res.status(200).send({ message: "Password reset email sent." });
});

export default router;
