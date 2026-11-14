import pool from "../config/database.js";
import {
  generateSessionToken,
  hashSessionToken,
} from "../utils/sessionToken.js";
import { comparePassword } from "../utils/password.js";
import { clearExpiredTemporaryBan } from "./driverBanService.js";
import ApiError from "../utils/ApiError.js";

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);

// Create a new authentication session

export const createSession = async ({
  role,
  userId,
  authMethod = "cookie",
}) => {
  // Validate inputs
  if (!["admin", "driver"].includes(role)) {
    throw new ApiError(400, "Invalid session role.");
  }

  if (!["cookie", "bearer"].includes(authMethod)) {
    throw new ApiError(400, "Invalid authentication method.");
  }

  const normalizedUserId =
    typeof userId === "number"
      ? userId
      : typeof userId === "string" && /^\d+$/.test(userId)
        ? Number(userId)
        : NaN;

  if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new ApiError(400, "Invalid user ID.");
  }

  if (!Number.isFinite(SESSION_TTL_HOURS) || SESSION_TTL_HOURS <= 0) {
    throw new ApiError(500, "Invalid session expiration setting.");
  }

  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);

  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  // Validate calculated expiration date
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new ApiError(500, "Invalid session expiration date.");
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    if (role === "driver") {
      // Clear expired temporary ban using the current transaction.
      await clearExpiredTemporaryBan(normalizedUserId, connection);

      // Re-check Driver account status after clearing expired ban.
      const [drivers] = await connection.execute(
        `SELECT id, deleted_at, ban_type
     FROM drivers
     WHERE id = ?
     FOR UPDATE`,
        [normalizedUserId],
      );

      if (drivers.length === 0 || drivers[0].deleted_at !== null) {
        throw new ApiError(401, "Driver account is unavailable.");
      }

      if (drivers[0].ban_type !== "none") {
        throw new ApiError(403, "Banned Driver cannot create a session.");
      }

      // Revoke all previous active Driver sessions.
      await connection.execute(
        `UPDATE auth_sessions
     SET revoked_at = NOW()
     WHERE driver_id = ?
       AND revoked_at IS NULL`,
        [normalizedUserId],
      );

      // Every new Driver login starts Offline.
      await connection.execute(
        `UPDATE drivers
     SET availability_status = 'offline',
         available_since = NULL
     WHERE id = ?`,
        [normalizedUserId],
      );
    }

    if (role === "admin") {
      // Lock Admin row and check account status
      const [admins] = await connection.execute(
        `SELECT id, is_active
         FROM admins
         WHERE id = ?
         FOR UPDATE`,
        [normalizedUserId],
      );

      if (admins.length === 0 || !admins[0].is_active) {
        throw new ApiError(401, "Admin account is unavailable.");
      }
    }

    const ownerColumn = role === "admin" ? "admin_id" : "driver_id";

    await connection.execute(
      `INSERT INTO auth_sessions
       (${ownerColumn}, auth_method, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [normalizedUserId, authMethod, tokenHash, expiresAt],
    );

    await connection.commit();
    transactionStarted = false;
    return {
      token: rawToken,
      expiresAt,
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

const isSessionValid = (expiresAt) => {
  const expirationTime = new Date(expiresAt).getTime();

  return Number.isFinite(expirationTime) && expirationTime > Date.now();
};

// Find and validate an active session
export const findActiveSession = async (rawToken, authMethod) => {
  if (
    typeof rawToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(rawToken) ||
    !["cookie", "bearer"].includes(authMethod)
  ) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    // 1. Find session owner without locking
    const [sessionRows] = await connection.execute(
      `SELECT id, admin_id, driver_id
       FROM auth_sessions
       WHERE token_hash = ?
         AND auth_method = ?
       LIMIT 1`,
      [tokenHash, authMethod],
    );

    if (sessionRows.length === 0) {
      return null;
    }

    const initialSession = sessionRows[0];

    await connection.beginTransaction();
    transactionStarted = true;

    let user = null;

    // 2. Driver session validation
    if (initialSession.driver_id !== null) {
      // Lock Driver row first
      const [drivers] = await connection.execute(
        `SELECT
     id,
     full_name,
     phone_number,
     registration_status,
     ban_type,
     ban_expires_at,
     deleted_at,
     (
       ban_type = 'temporary'
       AND ban_expires_at IS NOT NULL
       AND ban_expires_at <= NOW()
     ) AS ban_expired
   FROM drivers
   WHERE id = ?
   FOR UPDATE`,
        [initialSession.driver_id],
      );

      if (drivers.length === 0) {
        // Driver no longer exists
        await connection.execute(
          `UPDATE auth_sessions
           SET revoked_at = NOW()
           WHERE id = ?
             AND revoked_at IS NULL`,
          [initialSession.id],
        );
      } else {
        const driver = drivers[0];

        // Clear expired temporary ban inside this transaction
        if (Boolean(driver.ban_expired)) {
          await clearExpiredTemporaryBan(driver.id, connection);

          const [updatedDrivers] = await connection.execute(
            `SELECT ban_type, ban_expires_at
     FROM drivers
     WHERE id = ?
     FOR UPDATE`,
            [driver.id],
          );

          if (updatedDrivers.length > 0) {
            driver.ban_type = updatedDrivers[0].ban_type;
            driver.ban_expires_at = updatedDrivers[0].ban_expires_at;
          }
        }

        // Lock Session row after Driver row
        const [currentSessions] = await connection.execute(
          `SELECT id, driver_id, revoked_at, expires_at
           FROM auth_sessions
           WHERE id = ?
           FOR UPDATE`,
          [initialSession.id],
        );

        const currentSession = currentSessions[0];

        if (
          currentSession &&
          String(currentSession.driver_id) === String(driver.id) &&
          currentSession.revoked_at === null &&
          isSessionValid(currentSession.expires_at) &&
          driver.deleted_at === null &&
          driver.ban_type === "none"
        ) {
          await connection.execute(
            `UPDATE auth_sessions
             SET last_used_at = NOW()
             WHERE id = ?`,
            [currentSession.id],
          );

          user = {
            sessionId: currentSession.id,
            role: "driver",
            userId: driver.id,
            fullName: driver.full_name,
            phoneNumber: driver.phone_number,
            registrationStatus: driver.registration_status,
          };
        } else if (currentSession && currentSession.revoked_at === null) {
          await connection.execute(
            `UPDATE auth_sessions
             SET revoked_at = NOW()
             WHERE id = ?
               AND revoked_at IS NULL`,
            [initialSession.id],
          );
        }
      }
    }

    // 3. Admin session validation
    else if (initialSession.admin_id !== null) {
      // Lock Admin row first
      const [admins] = await connection.execute(
        `SELECT id, username, email, is_active
         FROM admins
         WHERE id = ?
         FOR UPDATE`,
        [initialSession.admin_id],
      );

      // Lock Session row after Admin row
      const [currentSessions] = await connection.execute(
        `SELECT id, admin_id, revoked_at, expires_at
         FROM auth_sessions
         WHERE id = ?
         FOR UPDATE`,
        [initialSession.id],
      );

      const currentSession = currentSessions[0];
      const admin = admins[0];

      if (!admin) {
        await connection.execute(
          `UPDATE auth_sessions
     SET revoked_at = NOW()
     WHERE id = ?
       AND revoked_at IS NULL`,
          [initialSession.id],
        );
      }

      if (
        currentSession &&
        admin &&
        String(currentSession.admin_id) === String(admin.id) &&
        currentSession.revoked_at === null &&
        isSessionValid(currentSession.expires_at) &&
        admin.is_active
      ) {
        await connection.execute(
          `UPDATE auth_sessions
           SET last_used_at = NOW()
           WHERE id = ?`,
          [currentSession.id],
        );

        user = {
          sessionId: currentSession.id,
          role: "admin",
          userId: admin.id,
          username: admin.username,
          email: admin.email,
        };
      } else if (currentSession && currentSession.revoked_at === null) {
        await connection.execute(
          `UPDATE auth_sessions
           SET revoked_at = NOW()
           WHERE id = ?
             AND revoked_at IS NULL`,
          [initialSession.id],
        );
      }
    }

    await connection.commit();

    return user;
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

export const logoutSession = async ({ rawToken, authMethod, role, userId }) => {
  if (
    typeof rawToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(rawToken) ||
    !["cookie", "bearer"].includes(authMethod)
  ) {
    throw new ApiError(400, "Invalid logout credentials.");
  }

  const normalizedUserId =
    typeof userId === "number"
      ? userId
      : typeof userId === "string" && /^\d+$/.test(userId)
        ? Number(userId)
        : NaN;

  if (
    !["admin", "driver"].includes(role) ||
    !Number.isSafeInteger(normalizedUserId) ||
    normalizedUserId <= 0
  ) {
    throw new ApiError(400, "Invalid logout user.");
  }

  const tokenHash = hashSessionToken(rawToken);
  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    // Find the session without locking it first.
    const [sessions] = await connection.execute(
      `SELECT id, admin_id, driver_id
       FROM auth_sessions
       WHERE token_hash = ? AND auth_method = ?
       LIMIT 1`,
      [tokenHash, authMethod],
    );

    if (sessions.length === 0) {
      return false;
    }

    const session = sessions[0];

    await connection.beginTransaction();
    transactionStarted = true;

    let ownerExists = false;

    if (role === "driver") {
      // Lock Driver first to maintain consistent lock order.
      const [drivers] = await connection.execute(
        `SELECT id
         FROM drivers
         WHERE id = ?
         FOR UPDATE`,
        [normalizedUserId],
      );

      ownerExists =
        drivers.length > 0 &&
        String(session.driver_id) === String(normalizedUserId);
    } else {
      // Admin row is locked before its session.
      const [admins] = await connection.execute(
        `SELECT id
         FROM admins
         WHERE id = ?
         FOR UPDATE`,
        [normalizedUserId],
      );

      ownerExists =
        admins.length > 0 &&
        String(session.admin_id) === String(normalizedUserId);
    }

    // Lock the session after locking its owner.
    const [currentSessions] = await connection.execute(
      `SELECT id, admin_id, driver_id, revoked_at
       FROM auth_sessions
       WHERE id = ?
       FOR UPDATE`,
      [session.id],
    );

    if (currentSessions.length === 0) {
      await connection.commit();
      transactionStarted = false;
      return false;
    }

    const currentSession = currentSessions[0];
    // Do not process an already revoked session.
    if (currentSession.revoked_at !== null) {
      await connection.commit();
      transactionStarted = false;
      return false;
    }
    const correctOwner =
      role === "driver"
        ? String(currentSession.driver_id) === String(normalizedUserId)
        : String(currentSession.admin_id) === String(normalizedUserId);

    if (!ownerExists || !correctOwner) {
      await connection.commit();
      transactionStarted = false;
      return false;
    }

    // Revoke the current session.
    await connection.execute(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = ?`,
      [currentSession.id],
    );

    // Driver logout must always set the Driver Offline.
    if (role === "driver") {
      await connection.execute(
        `UPDATE drivers
         SET availability_status = 'offline',
             available_since = NULL
         WHERE id = ?`,
        [normalizedUserId],
      );
    }

    await connection.commit();
    transactionStarted = false;

    return true;
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
       deleted_at
     FROM drivers
     WHERE phone_number = ?
     LIMIT 1`,
    [phoneNumber],
  );

  if (rows.length === 0) return null;

  const driver = rows[0];

  // Deleted accounts cannot login
  if (driver.deleted_at !== null) return null;

  // Clear expired temporary ban if applicable
  await clearExpiredTemporaryBan(driver.id);

  // Always read the latest ban status from database
  const [statusRows] = await pool.execute(
    `SELECT ban_type
     FROM drivers
     WHERE id = ?
     LIMIT 1`,
    [driver.id],
  );

  if (statusRows.length === 0 || statusRows[0].ban_type !== "none") {
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
