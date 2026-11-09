import { timingSafeEqual } from "node:crypto";

const CSRF_COOKIE = "mtb_csrf";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const isValidCsrfToken = (token) =>
  typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);

export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Bearer tokens are not automatically sent by browsers
  // like cookies, so this CSRF check is for cookie auth.
  const authorization = req.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers["x-csrf-token"];

  if (!isValidCsrfToken(cookieToken) || !isValidCsrfToken(headerToken)) {
    return res.status(403).json({
      success: false,
      message: "CSRF token missing or invalid.",
    });
  }

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);

  if (
    cookieBuffer.length !== headerBuffer.length ||
    !timingSafeEqual(cookieBuffer, headerBuffer)
  ) {
    return res.status(403).json({
      success: false,
      message: "Invalid CSRF token.",
    });
  }

  next();
};
