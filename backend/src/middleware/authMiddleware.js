import { findActiveSession } from "../services/authService.js";

const COOKIE_NAME = process.env.COOKIE_NAME || "mtb_session";

// Authenticate user using Cookie or Bearer Token
export const authenticate = async (req, res, next) => {
  try {
    let token = null;
    let authMethod = null;

    const authorization = req.headers.authorization;

    // Mobile App: Bearer Token
    if (authorization?.startsWith("Bearer ")) {
      token = authorization.slice(7).trim();
      authMethod = "bearer";
    } else {
      // React Web: HttpOnly Cookie
      token = req.cookies?.[COOKIE_NAME];
      authMethod = "cookie";
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const user = await findActiveSession(token, authMethod);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session.",
      });
    }

    req.user = user;
    req.authToken = token;
    req.authMethod = authMethod;

    next();
  } catch (error) {
    next(error);
  }
};

// Allow only specified roles
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
};
