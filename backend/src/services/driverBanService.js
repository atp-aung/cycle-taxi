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
  reason = null,
  adminId,
}) => {
  const connection = await pool.getConnection();

  try {
    // Validate ban type
    if (!["temporary", "permanent"].includes(banType)) {
      throw new Error("Invalid ban type.");
    }

    // Temporary Ban must have an expiry date
    if (banType === "temporary" && !banExpiresAt) {
      throw new Error("Temporary Ban requires an expiry date.");
    }

    // Permanent Ban must not have an expiry date
    if (banType === "permanent") {
      banExpiresAt = null;
    }

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

    // 2. Revoke all active Driver sessions
    await connection.execute(
      `UPDATE auth_sessions
       SET revoked_at = NOW()
       WHERE driver_id = ?
         AND revoked_at IS NULL`,
      [driverId],
    );

    // 3. Insert Driver Ban History
    await connection.execute(
      `INSERT INTO driver_ban_history
       (
         driver_id,
         admin_id,
         ban_type,
         reason,
         expires_at
       )
       VALUES (?, ?, ?, ?, ?)`,
      [driverId, adminId, banType, reason, banExpiresAt],
    );

    // 4. Commit all changes
    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Admin unbans a Driver
export const unbanDriver = async ({ driverId, adminId }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock and retrieve Driver
    const [drivers] = await connection.execute(
      `SELECT id, ban_type
       FROM drivers
       WHERE id = ?
         AND deleted_at IS NULL
       FOR UPDATE`,
      [driverId],
    );

    if (drivers.length === 0) {
      throw new Error("Driver not found.");
    }

    if (drivers[0].ban_type === "none") {
      throw new Error("Driver is not currently banned.");
    }

    // 2. Find the latest active Ban History record
    const [histories] = await connection.execute(
      `SELECT id
       FROM driver_ban_history
       WHERE driver_id = ?
         AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
       FOR UPDATE`,
      [driverId],
    );

    if (histories.length === 0) {
      throw new Error("Active ban history record not found.");
    }

    // 3. Update Driver status
    await connection.execute(
      `UPDATE drivers
       SET ban_type = 'none',
           ban_expires_at = NULL,
           availability_status = 'offline',
           available_since = NULL
       WHERE id = ?`,
      [driverId],
    );

    // 4. Update Ban History
    await connection.execute(
      `UPDATE driver_ban_history
       SET ended_at = NOW(),
           unbanned_by_admin_id = ?
       WHERE id = ?`,
      [adminId, histories[0].id],
    );

    // 5. Commit all changes
    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
