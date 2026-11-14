import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";
import { cleanupOldNotifications } from "./notificationRetentionService.js";

export const reassignDriverTaxiGate = async ({
  driverId,
  newTaxiGateId,
  adminId,
}) => {
  // Validate IDs
  if (
    !Number.isSafeInteger(driverId) ||
    driverId <= 0 ||
    !Number.isSafeInteger(newTaxiGateId) ||
    newTaxiGateId <= 0 ||
    !Number.isSafeInteger(adminId) ||
    adminId <= 0
  ) {
    throw new ApiError(400, "Invalid reassignment information.");
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    // Lock Driver
    const [drivers] = await connection.execute(
      `SELECT id, taxi_gate_id, deleted_at
       FROM drivers
       WHERE id = ?
       FOR UPDATE`,
      [driverId],
    );

    if (drivers.length === 0 || drivers[0].deleted_at !== null) {
      throw new ApiError(404, "Driver not found.");
    }

    const oldTaxiGateId = drivers[0].taxi_gate_id;

    if (Number(oldTaxiGateId) === newTaxiGateId) {
      throw new ApiError(409, "Driver is already assigned to this Taxi Gate.");
    }

    // Verify Admin
    const [admins] = await connection.execute(
      `SELECT id
       FROM admins
       WHERE id = ?
         AND is_active = 1
       FOR UPDATE`,
      [adminId],
    );

    if (admins.length === 0) {
      throw new ApiError(401, "Admin account is unavailable.");
    }

    // Get new Taxi Gate details
    const [newGates] = await connection.execute(
      `SELECT
         tg.id,
         tg.name AS taxi_gate_name,
         bs.name AS bus_stop_name,
         tw.name AS township_name
       FROM taxi_gates tg
       INNER JOIN bus_stops bs
         ON tg.bus_stop_id = bs.id
       INNER JOIN townships tw
         ON bs.township_id = tw.id
       WHERE tg.id = ?
         AND tg.deleted_at IS NULL
         AND bs.deleted_at IS NULL
         AND tw.deleted_at IS NULL
       LIMIT 1`,
      [newTaxiGateId],
    );

    if (newGates.length === 0) {
      throw new ApiError(404, "New Taxi Gate not found.");
    }

    const newGate = newGates[0];

    // Save assignment history
    await connection.execute(
      `INSERT INTO driver_gate_assignment_history
       (driver_id, old_taxi_gate_id, new_taxi_gate_id, admin_id)
       VALUES (?, ?, ?, ?)`,
      [driverId, oldTaxiGateId, newTaxiGateId, adminId],
    );

    // Update Driver assignment and availability
    await connection.execute(
      `UPDATE drivers
       SET taxi_gate_id = ?,
           availability_status = 'offline',
           available_since = NULL
       WHERE id = ?`,
      [newTaxiGateId, driverId],
    );

    // Create Driver notification
    await connection.execute(
      `INSERT INTO notifications
       (
         driver_id,
         type,
         title,
         message,
         reference_type,
         reference_id
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        driverId,
        "driver_gate_reassigned",
        "Taxi Gate Assignment Updated",
        `Your new Taxi Gate is ${newGate.taxi_gate_name}, ${newGate.bus_stop_name}, ${newGate.township_name}.`,
        "taxi_gate",
        newTaxiGateId,
      ],
    );

    // Keep only the latest 30 Driver notifications
    await cleanupOldNotifications({
      recipientType: "driver",
      recipientId: driverId,
      connection,
    });

    await connection.commit();
    transactionStarted = false;

    return {
      driverId,
      oldTaxiGateId,
      newTaxiGate: {
        id: newGate.id,
        name: newGate.taxi_gate_name,
        busStop: newGate.bus_stop_name,
        township: newGate.township_name,
      },
      availabilityStatus: "offline",
    };
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
