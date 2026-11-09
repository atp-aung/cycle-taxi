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

// Admin bans a Driver
export const banDriver = async ({
  driverId,
  banType,
  banExpiresAt = null,
  adminId,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Update Driver ban status
    const [result] = await connection.execute(
      `UPDATE drivers
       SET ban_type = ?,
           ban_expires_at = ?,
           availability_status = 'offline',
           available_since = NULL
       WHERE id = ?
         AND deleted_at IS NULL`,
      [banType, banExpiresAt, driverId],
    );

    if (result.affectedRows === 0) {
      throw new Error("Driver not found.");
    }

    // 2. Revoke all active sessions
    await connection.execute(
      `UPDATE auth_sessions
       SET revoked_at = NOW()
       WHERE driver_id = ?
         AND revoked_at IS NULL`,
      [driverId],
    );

    // 3. Add ban history
    // (ဒီအပိုင်းမှာ ban history INSERT ကို နောက်တစ်ဆင့်မှာ ထည့်နိုင်ပါတယ်)

    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
