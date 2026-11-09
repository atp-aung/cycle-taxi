import express from "express";

import { unbanDriverController } from "../controllers/adminDriverController.js";

import { authenticate, authorize } from "../middleware/authMiddleware.js";

import { csrfProtection } from "../middleware/csrfMiddleware.js";

const router = express.Router();

// Admin Unban Driver
router.patch(
  "/:driverId/unban",
  authenticate,
  csrfProtection,
  authorize("admin"),
  unbanDriverController,
);

export default router;
