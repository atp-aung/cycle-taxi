import { randomBytes } from "node:crypto";

export const getCsrfToken = (req, res) => {
  const token = randomBytes(32).toString("hex");

  res.cookie("mtb_csrf", token, {
    httpOnly: false,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: process.env.COOKIE_SAME_SITE || "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    success: true,
    message: "CSRF token generated.",
    data: { csrfToken: token },
  });
};
