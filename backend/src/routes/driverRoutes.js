import express from "express";

import { authenticate, authorize } from "../middleware/authMiddleware.js";

import { csrfProtection } from "../middleware/csrfMiddleware.js";

import { updateDriverAvailabilityController } from "../controllers/driverAvailabilityController.js";
import { getDriverProfileController } from "../controllers/driverProfileController.js";
import {
  getDriverNotificationsController,
  markDriverNotificationAsReadController,
} from "../controllers/driverNotificationController.js";

const router = express.Router();

// All Driver routes require Driver authentication.
router.use(authenticate);
router.use(authorize("driver"));

router.get("/me", getDriverProfileController);

// Driver Availability
router.patch(
  "/me/availability",
  csrfProtection,
  updateDriverAvailabilityController,
);

// Driver Notifications
router.get("/me/notifications", getDriverNotificationsController);

router.patch(
  "/me/notifications/:notificationId/read",
  markDriverNotificationAsReadController,
);
export default router;
