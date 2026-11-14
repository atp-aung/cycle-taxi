import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

// Validate positive integer IDs
const validateId = (id, fieldName) => {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ApiError(400, `Invalid ${fieldName}.`);
  }
};

// Validate optional reason
const validateReason = (reason) => {
  if (reason !== null && (typeof reason !== "string" || reason.length > 1000)) {
    throw new ApiError(
      400,
      "Reason must be a string with a maximum of 1000 characters.",
    );
  }
};

// Convert Myanmar local ISO datetime with explicit timezone
// into UTC MySQL DATETIME string.

const convertExpiryToUTC = (value) => {
  if (typeof value !== "string") {
    throw new ApiError(400, "Invalid ban expiry date.");
  }

  // Require Myanmar local ISO 8601 (+06:30)
  const isoPattern =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\+06:30$/;

  const match = value.match(isoPattern);

  if (!match) {
    throw new ApiError(
      400,
      "Ban expiry must use Myanmar local ISO 8601 format (+06:30).",
    );
  }

  const [, year, month, day, hour, minute, second, milliseconds] = match;

  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(milliseconds || 0),
    ) -
      (6 * 60 + 30) * 60 * 1000,
  );

  // Validate the original calendar date and time.
  const localDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  if (
    localDate.getUTCFullYear() !== Number(year) ||
    localDate.getUTCMonth() !== Number(month) - 1 ||
    localDate.getUTCDate() !== Number(day) ||
    localDate.getUTCHours() !== Number(hour) ||
    localDate.getUTCMinutes() !== Number(minute) ||
    localDate.getUTCSeconds() !== Number(second)
  ) {
    throw new ApiError(400, "Invalid ban expiry date.");
  }

  if (date.getTime() <= Date.now()) {
    throw new ApiError(400, "Ban expiry date must be in the future.");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
};

// Rollback without hiding the original error.
const rollbackSafely = async (connection) => {
  try {
    await connection.rollback();
  } catch {
    // Preserve the original error.
  }
};

// Clear an expired temporary ban
export const clearExpiredTemporaryBan = async (driverId, connection = null) => {
  validateId(driverId, "Driver ID");

  const executor = connection || (await pool.getConnection());
  const ownsConnection = !connection;
  let transactionStarted = false;

  try {
    if (ownsConnection) {
      await executor.beginTransaction();
      transactionStarted = true;
    }

    // Lock Driver row
    const [drivers] = await executor.execute(
      `SELECT id
       FROM drivers
       WHERE id = ?
       FOR UPDATE`,
      [driverId],
    );

    if (drivers.length === 0) {
      if (transactionStarted) {
        await executor.commit();
        transactionStarted = false;
      }

      return false;
    }

    // Clear expired temporary ban using UTC
    const [result] = await executor.execute(
      `UPDATE drivers
       SET ban_type = 'none',
           ban_expires_at = NULL,
           availability_status = 'offline',
           available_since = NULL
       WHERE id = ?
         AND ban_type = 'temporary'
         AND ban_expires_at IS NOT NULL
         AND ban_expires_at <= UTC_TIMESTAMP()`,
      [driverId],
    );

    if (result.affectedRows > 0) {
      // Close expired ban history
      await executor.execute(
        `UPDATE driver_ban_history
         SET ended_at = UTC_TIMESTAMP()
         WHERE driver_id = ?
           AND ban_type = 'temporary'
           AND ended_at IS NULL
           AND expires_at IS NOT NULL
           AND expires_at <= UTC_TIMESTAMP()`,
        [driverId],
      );
    }

    if (transactionStarted) {
      await executor.commit();
      transactionStarted = false;
    }

    return result.affectedRows > 0;
  } catch (error) {
    if (transactionStarted) {
      await rollbackSafely(executor);
    }

    throw error;
  } finally {
    if (ownsConnection) {
      executor.release();
    }
  }
};

// Admin bans a Driver
export const banDriver = async ({
  driverId,
  banType,
  banExpiresAt = null,
  reason = null,
  adminId,
}) => {
  validateId(driverId, "Driver ID");
  validateId(adminId, "Admin ID");
  validateReason(reason);

  if (!["temporary", "permanent"].includes(banType)) {
    throw new ApiError(400, "Invalid ban type.");
  }

  let expiryUTC = null;

  if (banType === "temporary") {
    expiryUTC = convertExpiryToUTC(banExpiresAt);
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

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
      throw new ApiError(404, "Driver not found.");
    }

    // 2. Prevent duplicate bans
    if (drivers[0].ban_type !== "none") {
      throw new ApiError(409, "Driver is already banned.");
    }

    // 3. Update Driver ban status
    await connection.execute(
      `UPDATE drivers
       SET ban_type = ?,
           ban_expires_at = ?,
           availability_status = 'offline',
           available_since = NULL
       WHERE id = ?`,
      [banType, expiryUTC, driverId],
    );

    // 4. Revoke all active Driver sessions
    await connection.execute(
      `UPDATE auth_sessions
       SET revoked_at = UTC_TIMESTAMP()
       WHERE driver_id = ?
         AND revoked_at IS NULL`,
      [driverId],
    );

    // 5. Insert Driver Ban History
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
      [driverId, adminId, banType, reason, expiryUTC],
    );

    // 6. Commit all changes
    await connection.commit();
    transactionStarted = false;

    return true;
  } catch (error) {
    if (transactionStarted) {
      await rollbackSafely(connection);
    }

    throw error;
  } finally {
    connection.release();
  }
};

// Admin unbans a Driver
export const unbanDriver = async ({ driverId, adminId }) => {
  validateId(driverId, "Driver ID");
  validateId(adminId, "Admin ID");

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

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
      throw new ApiError(404, "Driver not found.");
    }

    if (drivers[0].ban_type === "none") {
      throw new ApiError(409, "Driver is not currently banned.");
    }

    // 2. Find the latest active Ban History record
    const [histories] = await connection.execute(
      `SELECT id
       FROM driver_ban_history
       WHERE driver_id = ?
         AND ended_at IS NULL
       ORDER BY started_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [driverId],
    );

    if (histories.length === 0) {
      throw new ApiError(409, "Active ban history record not found.");
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
       SET ended_at = UTC_TIMESTAMP(),
           unbanned_by_admin_id = ?
       WHERE id = ?`,
      [adminId, histories[0].id],
    );

    // 5. Commit all changes
    await connection.commit();
    transactionStarted = false;

    return true;
  } catch (error) {
    if (transactionStarted) {
      await rollbackSafely(connection);
    }

    throw error;
  } finally {
    connection.release();
  }
};
