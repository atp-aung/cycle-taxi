import express from "express";

import { authenticate, authorize } from "../middleware/authMiddleware.js";

import { csrfProtection } from "../middleware/csrfMiddleware.js";

import { updateDriverAvailabilityController } from "../controllers/driverAvailabilityController.js";

const router = express.Router();

// All Driver routes require Driver authentication.
router.use(authenticate);
router.use(authorize("driver"));

// Driver Availability
router.patch(
  "/me/availability",
  csrfProtection,
  updateDriverAvailabilityController,
);

export default router;
