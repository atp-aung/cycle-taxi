import express from "express";

import {
  unbanDriverController,
  reassignDriverTaxiGateController,
} from "../controllers/adminDriverController.js";

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

// Admin Reassign Driver Taxi Gate
router.patch(
  "/:driverId/taxi-gate",
  authenticate,
  csrfProtection,
  authorize("admin"),
  reassignDriverTaxiGateController,
);

export default router;
