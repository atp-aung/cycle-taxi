export const getCookieOptions = () => ({
  httpOnly: true,

  secure: process.env.COOKIE_SECURE === "true",

  sameSite: process.env.COOKIE_SAME_SITE || "lax",

  path: "/",

  maxAge: Number(process.env.SESSION_TTL_HOURS || 24) * 60 * 60 * 1000,
});

export const getClearCookieOptions = () => {
  const options = getCookieOptions();

  delete options.maxAge;

  return options;
};
