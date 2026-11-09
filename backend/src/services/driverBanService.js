import pool from "../config/database.js";

// Clear an expired temporary ban
export const clearExpiredTemporaryBan = async (driverId) => {
  const [result] = await pool.execute(
    `UPDATE drivers
     SET ban_type = 'none',
         ban_expires_at = NULL,
         availability_status = 'offline',
         available_since = NULL
     WHERE id = ?
       AND ban_type = 'temporary'
       AND ban_expires_at IS NOT NULL
       AND ban_expires_at <= NOW()`,
    [driverId],
  );

  return result.affectedRows > 0;
};
