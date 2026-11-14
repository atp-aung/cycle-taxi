import {
  getDriverNotifications,
  markDriverNotificationAsRead,
} from "../services/driverNotificationService.js";

import { sendSuccess } from "../utils/apiResponse.js";

// Get Driver Notifications
export const getDriverNotificationsController = async (req, res, next) => {
  try {
    const notifications = await getDriverNotifications(req.user.userId);

    return sendSuccess(
      res,
      "Driver notifications retrieved successfully.",
      notifications,
    );
  } catch (error) {
    next(error);
  }
};

// Mark Notification as Read
export const markDriverNotificationAsReadController = async (
  req,
  res,
  next,
) => {
  try {
    const notificationId = Number(req.params.notificationId);

    const result = await markDriverNotificationAsRead({
      driverId: req.user.userId,
      notificationId,
    });

    return sendSuccess(
      res,
      "Notification marked as read successfully.",
      result,
    );
  } catch (error) {
    next(error);
  }
};
