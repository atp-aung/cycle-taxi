import pool from "../config/database.js";
import {
  generateSessionToken,
  hashSessionToken,
} from "../utils/sessionToken.js";
import { comparePassword } from "../utils/password.js";

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);

// Create a new authentication session
export const createSession = async ({
  role,
  userId,
  authMethod = "cookie",
}) => {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);

  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Driver can have only one active session
    if (role === "driver") {
      const [drivers] = await connection.execute(
        `SELECT id
         FROM drivers
         WHERE id = ?
         FOR UPDATE`,
        [userId],
      );

      if (drivers.length === 0) {
        throw new Error("Driver account not found.");
      }

      // Revoke previous active sessions
      await connection.execute(
        `UPDATE auth_sessions
         SET revoked_at = NOW()
         WHERE driver_id = ?
           AND revoked_at IS NULL`,
        [userId],
      );

      // Every new Driver login starts Offline
      await connection.execute(
        `UPDATE drivers
         SET availability_status = 'offline',
             available_since = NULL
         WHERE id = ?`,
        [userId],
      );
    }

    const ownerColumn = role === "admin" ? "admin_id" : "driver_id";

    await connection.execute(
      `INSERT INTO auth_sessions
       (${ownerColumn}, auth_method, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [userId, authMethod, tokenHash, expiresAt],
    );

    await connection.commit();

    return {
      token: rawToken,
      expiresAt,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Find and validate an active session
export const findActiveSession = async (rawToken) => {
  if (!rawToken || !["cookie", "bearer"].includes(authMethod)) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);

  const [rows] = await pool.execute(
    `SELECT
       s.id AS session_id,
       s.admin_id,
       s.driver_id,
       s.auth_method,
       s.expires_at,
       a.username,
       a.email,
       a.is_active AS admin_is_active,
       d.full_name,
       d.phone_number,
       d.registration_status,
       d.ban_type,
       d.ban_expires_at,
       d.deleted_at
     FROM auth_sessions s
     LEFT JOIN admins a ON a.id = s.admin_id
     LEFT JOIN drivers d ON d.id = s.driver_id
     WHERE s.token_hash = ?
       AND s.auth_method = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash, authMethod],
  );

  if (rows.length === 0) return null;

  const session = rows[0];

  if (session.admin_id !== null) {
    if (!session.admin_is_active) return null;

    return {
      sessionId: session.session_id,
      role: "admin",
      userId: session.admin_id,
      username: session.username,
      email: session.email,
    };
  }

  // Deleted drivers cannot use their sessions
  if (session.deleted_at !== null) return null;

  // A temporary ban that has expired can be cleared
  if (
    session.ban_type === "temporary" &&
    session.ban_expires_at &&
    new Date(session.ban_expires_at) <= new Date()
  ) {
    await pool.execute(
      `UPDATE drivers
       SET ban_type = 'none',
           ban_expires_at = NULL,
           availability_status = 'offline',
           available_since = NULL
       WHERE id = ?`,
      [session.driver_id],
    );
  } else if (session.ban_type !== "none") {
    return null;
  }

  // Update session activity
  await pool.execute(
    `UPDATE auth_sessions
     SET last_used_at = NOW()
     WHERE id = ?`,
    [session.session_id],
  );

  return {
    sessionId: session.session_id,
    role: "driver",
    userId: session.driver_id,
    fullName: session.full_name,
    phoneNumber: session.phone_number,
    registrationStatus: session.registration_status,
  };
};

// Revoke a session
export const revokeSession = async (rawToken) => {
  if (!rawToken) return;

  const tokenHash = hashSessionToken(rawToken);

  await pool.execute(
    `UPDATE auth_sessions
     SET revoked_at = NOW()
     WHERE token_hash = ?
       AND revoked_at IS NULL`,
    [tokenHash],
  );
};

// Admin login credential verification
export const verifyAdminCredentials = async (username, password) => {
  const [rows] = await pool.execute(
    `SELECT id, username, email, password_hash, is_active
     FROM admins
     WHERE username = ? OR email = ?
     LIMIT 1`,
    [username, username],
  );

  if (rows.length === 0) return null;

  const admin = rows[0];

  if (!admin.is_active) return null;

  const passwordIsValid = await comparePassword(password, admin.password_hash);

  if (!passwordIsValid) return null;

  return {
    id: admin.id,
    username: admin.username,
    email: admin.email,
  };
};

// Driver login credential verification
export const verifyDriverCredentials = async (phoneNumber, password) => {
  const [rows] = await pool.execute(
    `SELECT
       id,
       full_name,
       phone_number,
       password_hash,
       registration_status,
       ban_type,
       ban_expires_at,
       deleted_at
     FROM drivers
     WHERE phone_number = ?
     LIMIT 1`,
    [phoneNumber],
  );

  if (rows.length === 0) return null;

  const driver = rows[0];

  if (driver.deleted_at !== null) return null;

  // Expired temporary ban can be cleared
  if (
    driver.ban_type === "temporary" &&
    driver.ban_expires_at &&
    new Date(driver.ban_expires_at) <= new Date()
  ) {
    await pool.execute(
      `UPDATE drivers
       SET ban_type = 'none',
           ban_expires_at = NULL,
           availability_status = 'offline',
           available_since = NULL
       WHERE id = ?`,
      [driver.id],
    );
  } else if (driver.ban_type !== "none") {
    return null;
  }

  const passwordIsValid = await comparePassword(password, driver.password_hash);

  if (!passwordIsValid) return null;

  return {
    id: driver.id,
    fullName: driver.full_name,
    phoneNumber: driver.phone_number,
    registrationStatus: driver.registration_status,
  };
};
