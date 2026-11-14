import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

export const cleanupOldNotifications = async ({
  recipientType,
  recipientId,
  connection = pool,
}) => {
  if (!["driver", "admin"].includes(recipientType)) {
    throw new ApiError(400, "Invalid notification recipient type.");
  }

  if (!Number.isSafeInteger(recipientId) || recipientId <= 0) {
    throw new ApiError(400, "Invalid recipient ID.");
  }

  // Column name is selected from a fixed allowlist.
  const recipientColumn = recipientType === "driver" ? "driver_id" : "admin_id";

  await connection.execute(
    `DELETE FROM notifications
     WHERE ${recipientColumn} = ?
       AND id NOT IN (
         SELECT id
         FROM (
           SELECT id
           FROM notifications
           WHERE ${recipientColumn} = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 30
         ) AS latest_notifications
       )`,
    [recipientId, recipientId],
  );
};
