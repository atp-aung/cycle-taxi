import express from "express";
import rateLimit from "express-rate-limit";

import {
  loginAdmin,
  loginDriver,
  getMe,
  logout,
} from "../controllers/authController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { getCsrfToken } from "../controllers/csrfController.js";
import { csrfProtection } from "../middleware/csrfMiddleware.js";

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

router.get("/csrf-token", getCsrfToken);

router.post("/admin/login", loginLimiter, csrfProtection, loginAdmin);
router.post("/driver/login", loginLimiter, csrfProtection, loginDriver);
router.get("/me", authenticate, getMe);

router.post("/logout", authenticate, csrfProtection, logout);

export default router;
