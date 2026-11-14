import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

export const updateDriverAvailability = async ({
  driverId,
  availabilityStatus,
}) => {
  // Validate Driver ID
  if (!Number.isSafeInteger(driverId) || driverId <= 0) {
    throw new ApiError(400, "Invalid Driver ID.");
  }

  // Validate Availability Status
  if (!["available", "offline"].includes(availabilityStatus)) {
    throw new ApiError(400, "Invalid availability status.");
  }

  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    // Lock Driver row
    const [drivers] = await connection.execute(
      `SELECT
         id,
         registration_status,
         availability_status,
         ban_type,
         deleted_at
       FROM drivers
       WHERE id = ?
       FOR UPDATE`,
      [driverId],
    );

    if (drivers.length === 0 || drivers[0].deleted_at !== null) {
      throw new ApiError(404, "Driver not found.");
    }

    const driver = drivers[0];

    // Prevent banned Drivers from changing availability
    if (driver.ban_type !== "none") {
      throw new ApiError(403, "Banned Driver cannot change availability.");
    }

    // Only approved Drivers can become Available
    if (
      availabilityStatus === "available" &&
      driver.registration_status !== "approved"
    ) {
      throw new ApiError(403, "Driver account is not approved.");
    }

    // Update availability
    if (availabilityStatus === "available") {
      await connection.execute(
        `UPDATE drivers
         SET availability_status = 'available',
             available_since = CASE
               WHEN availability_status = 'available'
                    AND available_since IS NOT NULL
               THEN available_since
               ELSE NOW()
             END
         WHERE id = ?`,
        [driverId],
      );
    } else {
      await connection.execute(
        `UPDATE drivers
         SET availability_status = 'offline',
             available_since = NULL
         WHERE id = ?`,
        [driverId],
      );
    }

    // Get updated availability
    const [updatedDrivers] = await connection.execute(
      `SELECT
         availability_status,
         available_since
       FROM drivers
       WHERE id = ?`,
      [driverId],
    );

    await connection.commit();
    transactionStarted = false;

    return updatedDrivers[0];
  } catch (error) {
    try {
      if (transactionStarted) {
        await connection.rollback();
      }
    } catch (rollbackError) {
      console.error("Transaction rollback failed:", rollbackError);
    }

    throw error;
  } finally {
    connection.release();
  }
};
