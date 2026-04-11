import { Router, Request, Response } from "express";
import { adminMiddleware } from "../middleware/auth.middleware.js";
import prisma from "../config/database.js";
import { logger } from "../utils/logger.js";
import { OfframpService } from "../services/offramp.service.js";
import { PaystackService } from "../services/paystack.service.js";

const router = Router();

// Apply admin boundaries strictly over this entire router
router.use(adminMiddleware);

export default router;
