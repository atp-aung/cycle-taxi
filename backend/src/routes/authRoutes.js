import express from "express";
import rateLimit from "express-rate-limit";

import { loginAdmin, loginDriver } from "../controllers/authController.js";

const router = express.Router();

// Limit repeated login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

router.post("/admin/login", loginLimiter, loginAdmin);
router.post("/driver/login", loginLimiter, loginDriver);

export default router;
