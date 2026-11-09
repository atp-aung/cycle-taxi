const getSessionTtlHours = () => {
  const hours = Number(process.env.SESSION_TTL_HOURS || 24);

  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("SESSION_TTL_HOURS must be a positive number.");
  }

  return hours;
};

export const getCookieOptions = () => {
  const sameSite = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase();

  if (!["strict", "lax", "none"].includes(sameSite)) {
    throw new Error("Invalid COOKIE_SAME_SITE value.");
  }

  const secure = process.env.COOKIE_SECURE === "true";

  if (sameSite === "none" && !secure) {
    throw new Error("SameSite=None requires COOKIE_SECURE=true.");
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: getSessionTtlHours() * 60 * 60 * 1000,
  };
};

export const getClearCookieOptions = () => {
  const options = getCookieOptions();

  delete options.maxAge;

  return options;
};
