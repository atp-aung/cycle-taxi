import { randomBytes } from "node:crypto";

const CSRF_COOKIE = "mtb_csrf";
const CSRF_MAX_AGE = 24 * 60 * 60 * 1000;

const isValidCsrfToken = (token) =>
  typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);

export const getCsrfToken = (req, res) => {
  let token = req.cookies?.[CSRF_COOKIE];

  // Reuse an existing valid token.
  // Generate a new one only when missing or invalid.
  if (!isValidCsrfToken(token)) {
    token = randomBytes(32).toString("hex");
  }

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: process.env.COOKIE_SAME_SITE || "lax",
    path: "/",
    maxAge: CSRF_MAX_AGE,
  });

  return res.status(200).json({
    success: true,
    message: "CSRF token generated.",
    data: {
      csrfToken: token,
    },
  });
};
