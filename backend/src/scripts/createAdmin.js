import "dotenv/config";
import pool from "../config/database.js";
import { hashPassword } from "../utils/password.js";

const createAdmin = async () => {
  const username = "admin";
  const email = "admin@example.com";
  const password = "ChangeThisPassword123!";

  try {
    const passwordHash = await hashPassword(password);

    await pool.execute(
      `INSERT INTO admins
       (username, email, password_hash, is_active)
       VALUES (?, ?, ?, TRUE)`,
      [username, email, passwordHash],
    );

    console.log("Admin account created successfully.");
    console.log("Username:", username);
    console.log("Email:", email);
  } catch (error) {
    console.error("Failed to create admin:", error.message);
  } finally {
    await pool.end();
  }
};

createAdmin();
