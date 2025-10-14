import { Router } from "express";
import { UserCtrl } from "../controller/users.c";
import { adminOnly } from "../middleware/admin.m";
import { asyncHandler } from "../middleware/asyncHandler.m";

const router = Router();

// USER MANAGEMENT PROFILE ROUTES

// ADDRESS MANAGEMENT ROUTES

// ADMIN ONLY ROUTES

export default router;
