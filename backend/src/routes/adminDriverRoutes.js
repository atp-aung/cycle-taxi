import express from "express";

import {
  unbanDriverController,
  reassignDriverTaxiGateController,
  temporaryBanDriverController,
  permanentBanDriverController,
  getAdminDriversController,
  getAdminDriverDetailsController,
} from "../controllers/adminDriverController.js";

import { authenticate, authorize } from "../middleware/authMiddleware.js";

import { csrfProtection } from "../middleware/csrfMiddleware.js";

const router = express.Router();

// Admin retrieves Driver list
router.get("/", authenticate, authorize("admin"), getAdminDriversController);

router.get(
  "/:driverId",
  authenticate,
  authorize("admin"),
  getAdminDriverDetailsController,
);

// Admin Temporary Ban Driver
router.patch(
  "/:driverId/temporary-ban",
  authenticate,
  csrfProtection,
  authorize("admin"),
  temporaryBanDriverController,
);

// Admin Permanent Ban Driver
router.patch(
  "/:driverId/permanent-ban",
  authenticate,
  csrfProtection,
  authorize("admin"),
  permanentBanDriverController,
);

// Admin Unban Driver
router.patch(
  "/:driverId/unban",
  authenticate,
  csrfProtection,
  authorize("admin"),
  unbanDriverController,
);

// Admin Reassign Driver to another Taxi Gate
router.patch(
  "/:driverId/taxi-gate",
  authenticate,
  csrfProtection,
  authorize("admin"),
  reassignDriverTaxiGateController,
);

export default router;
