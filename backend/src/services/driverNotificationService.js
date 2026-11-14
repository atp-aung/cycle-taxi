import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

// Get the latest 30 notifications for a Driver
export const getDriverNotifications = async (driverId) => {
  if (!Number.isSafeInteger(driverId) || driverId <= 0) {
    throw new ApiError(400, "Invalid Driver ID.");
  }

  const [notifications] = await pool.execute(
    `SELECT
       id,
       type,
       title,
       message,
       reference_type,
       reference_id,
       is_read,
       read_at,
       created_at
     FROM notifications
     WHERE driver_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 30`,
    [driverId],
  );

  return notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    referenceType: notification.reference_type,
    referenceId: notification.reference_id,
    isRead: Boolean(notification.is_read),
    readAt: notification.read_at,
    createdAt: notification.created_at,
  }));
};

// Mark a Driver's notification as read
export const markDriverNotificationAsRead = async ({
  driverId,
  notificationId,
}) => {
  if (!Number.isSafeInteger(driverId) || driverId <= 0) {
    throw new ApiError(400, "Invalid Driver ID.");
  }

  if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
    throw new ApiError(400, "Invalid Notification ID.");
  }

  const [notifications] = await pool.execute(
    `SELECT id, is_read
     FROM notifications
     WHERE id = ?
       AND driver_id = ?
     LIMIT 1`,
    [notificationId, driverId],
  );

  if (notifications.length === 0) {
    throw new ApiError(404, "Notification not found.");
  }

  await pool.execute(
    `UPDATE notifications
     SET is_read = 1,
         read_at = COALESCE(read_at, NOW())
     WHERE id = ?
       AND driver_id = ?`,
    [notificationId, driverId],
  );

  return {
    id: notifications[0].id,
    isRead: true,
  };
};
