import {
  verifyAdminCredentials,
  verifyDriverCredentials,
  createSession,
} from "../services/authService.js";

import pool from "../config/database.js";
import { getCookieOptions } from "../config/cookie.js";
// import { revokeSession } from "../services/authService.js";
import { logoutSession } from "../services/authService.js";

import { getClearCookieOptions } from "../config/cookie.js";

import { sendSuccess } from "../utils/apiResponse.js";

const COOKIE_NAME = process.env.COOKIE_NAME || "mtb_session";

// Admin Login
export const loginAdmin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    const admin = await verifyAdminCredentials(username.trim(), password);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    const session = await createSession({
      role: "admin",
      userId: admin.id,
      authMethod: "cookie",
    });

    res.cookie(COOKIE_NAME, session.token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Admin login successful.",
      data: {
        user: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: "admin",
        },
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Driver Login
export const loginDriver = async (req, res, next) => {
  try {
    const { phoneNumber, password } = req.body;

    if (
      typeof phoneNumber !== "string" ||
      typeof password !== "string" ||
      !phoneNumber.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password are required.",
      });
    }

    const driver = await verifyDriverCredentials(phoneNumber.trim(), password);

    if (!driver) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password, or account unavailable.",
      });
    }

    const session = await createSession({
      role: "driver",
      userId: driver.id,
      authMethod: "cookie",
    });

    res.cookie(COOKIE_NAME, session.token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Driver login successful.",
      data: {
        user: {
          id: driver.id,
          fullName: driver.fullName,
          phoneNumber: driver.phoneNumber,
          registrationStatus: driver.registrationStatus,
          role: "driver",
        },
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get current authenticated user
export const getMe = async (req, res) => {
  return sendSuccess(res, "Current user retrieved successfully.", {
    user: req.user,
  });
};

// Logout current user
export const logout = async (req, res, next) => {
  try {
    const COOKIE_NAME = process.env.COOKIE_NAME || "mtb_session";

    await logoutSession({
      rawToken: req.authToken,
      authMethod: req.authMethod,
      role: req.user.role,
      userId: req.user.userId,
    });

    // Clear Cookie only for Cookie authentication.
    if (req.authMethod === "cookie") {
      res.clearCookie(COOKIE_NAME, getClearCookieOptions());
    }

    return sendSuccess(res, "Logout successful.", null);
  } catch (error) {
    next(error);
  }
};
