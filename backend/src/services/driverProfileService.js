import pool from "../config/database.js";
import ApiError from "../utils/ApiError.js";

export const getDriverProfile = async (driverId) => {
  if (!Number.isSafeInteger(driverId) || driverId <= 0) {
    throw new ApiError(400, "Invalid Driver ID.");
  }

  const [drivers] = await pool.execute(
    `SELECT
       d.id,
       d.full_name,
       d.phone_number,
       d.registration_status,
       d.rejection_reason,
       d.availability_status,
       d.available_since,
       tg.name AS taxi_gate_name,
       bs.name AS bus_stop_name,
       tw.name AS township_name
     FROM drivers d
     INNER JOIN taxi_gates tg
       ON d.taxi_gate_id = tg.id
     INNER JOIN bus_stops bs
       ON tg.bus_stop_id = bs.id
     INNER JOIN townships tw
       ON bs.township_id = tw.id
     WHERE d.id = ?
       AND d.deleted_at IS NULL
     LIMIT 1`,
    [driverId],
  );

  if (drivers.length === 0) {
    throw new ApiError(404, "Driver not found.");
  }

  const driver = drivers[0];

  return {
    id: driver.id,
    fullName: driver.full_name,
    phoneNumber: driver.phone_number,
    registrationStatus: driver.registration_status,
    rejectionReason: driver.rejection_reason,
    availabilityStatus: driver.availability_status,
    availableSince: driver.available_since,
    taxiGate: driver.taxi_gate_name,
    busStop: driver.bus_stop_name,
    township: driver.township_name,
  };
};
