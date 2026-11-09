import "dotenv/config";
import pool from "../config/database.js";
import { hashPassword } from "../utils/password.js";

const createTestDriver = async () => {
  const fullName = "Mg Mg";
  const phoneNumber = "09123456789";
  const password = "DriverPassword123!";
  const taxiGateId = 1;

  try {
    const passwordHash = await hashPassword(password);

    const [result] = await pool.execute(
      `INSERT INTO drivers (
        taxi_gate_id,
        full_name,
        phone_number,
        password_hash,
        registration_status,
        availability_status,
        ban_type
      ) VALUES (?, ?, ?, ?, 'approved', 'offline', 'none')`,
      [taxiGateId, fullName, phoneNumber, passwordHash],
    );

    console.log("Test Driver created successfully.");
    console.log("Driver ID:", result.insertId);
    console.log("Phone:", phoneNumber);
  } catch (error) {
    console.error("Failed to create Driver:", error.message);
  } finally {
    await pool.end();
  }
};

createTestDriver();
